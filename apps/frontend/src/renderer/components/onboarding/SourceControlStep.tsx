import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GitBranch,
  Github,
  GitlabIcon,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface SourceControlStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

type ConnectionStatus = 'not_configured' | 'testing' | 'connected' | 'invalid';

/**
 * Onboarding step for GitHub/GitLab configuration.
 * Optional step that allows users to configure their source control tokens.
 * US#55: Step optionnel et skippable
 * US#56: Configuration GitHub avec test connexion
 * US#57: Configuration GitLab avec ajout première instance
 */
export function SourceControlStep({ onNext, onBack, onSkip }: SourceControlStepProps) {
  const { t } = useTranslation(['onboarding', 'common']);

  // GitHub state
  const [githubToken, setGithubToken] = useState('');
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [githubStatus, setGithubStatus] = useState<ConnectionStatus>('not_configured');
  const [githubUsername, setGithubUsername] = useState<string | null>(null);

  // GitLab state
  const [gitlabName, setGitlabName] = useState('GitLab.com');
  const [gitlabUrl, setGitlabUrl] = useState('https://gitlab.com');
  const [gitlabToken, setGitlabToken] = useState('');
  const [showGitlabToken, setShowGitlabToken] = useState(false);
  const [gitlabStatus, setGitlabStatus] = useState<ConnectionStatus>('not_configured');
  const [gitlabUsername, setGitlabUsername] = useState<string | null>(null);

  // General state
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing config
  useEffect(() => {
    const loadExistingConfig = async () => {
      try {
        const result = await window.electronAPI.getSettings();
        if (result?.success && result.data) {
          // GitHub
          if (result.data.github?.token) {
            setGithubToken(result.data.github.token);
            if (result.data.github.username) {
              setGithubStatus('connected');
              setGithubUsername(result.data.github.username);
            }
          }
          // GitLab - check for existing instances
          if (result.data.gitlabInstances && result.data.gitlabInstances.length > 0) {
            const defaultInstance = result.data.gitlabInstances.find(i => i.isDefault) || result.data.gitlabInstances[0];
            setGitlabName(defaultInstance.name);
            setGitlabUrl(defaultInstance.url);
            if (defaultInstance.token) {
              setGitlabToken(defaultInstance.token);
              if (defaultInstance.username) {
                setGitlabStatus('connected');
                setGitlabUsername(defaultInstance.username);
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to load existing config:', err);
      }
    };
    loadExistingConfig();
  }, []);

  // Test GitHub connection
  const handleTestGitHub = async () => {
    if (!githubToken.trim()) return;

    setGithubStatus('testing');
    setGithubUsername(null);
    setError(null);

    try {
      const result = await window.electronAPI.testGitHubConnection(githubToken.trim());

      if (result.success && result.data) {
        if (result.data.success && result.data.username) {
          setGithubStatus('connected');
          setGithubUsername(result.data.username);
        } else {
          setGithubStatus('invalid');
        }
      } else {
        setGithubStatus('invalid');
      }
    } catch (err) {
      setGithubStatus('invalid');
    }
  };

  // Test GitLab connection
  const handleTestGitLab = async () => {
    if (!gitlabToken.trim() || !gitlabUrl.trim()) return;

    setGitlabStatus('testing');
    setGitlabUsername(null);
    setError(null);

    try {
      const result = await window.electronAPI.testGitLabConnection(gitlabUrl.trim(), gitlabToken.trim());

      if (result.success && result.data) {
        if (result.data.success && result.data.username) {
          setGitlabStatus('connected');
          setGitlabUsername(result.data.username);
        } else {
          setGitlabStatus('invalid');
        }
      } else {
        setGitlabStatus('invalid');
      }
    } catch (err) {
      setGitlabStatus('invalid');
    }
  };

  // Save configuration and continue
  const handleSaveAndContinue = async () => {
    setIsSaving(true);
    setError(null);

    try {
      // Save GitHub config if token is provided
      if (githubToken.trim()) {
        const saveGithubResult = await window.electronAPI.saveSettings({
          github: {
            token: githubToken.trim(),
            authMethod: 'pat',
            username: githubUsername || undefined
          }
        });
        if (!saveGithubResult?.success) {
          setError(t('onboarding:sourceControl.errors.saveFailed'));
          setIsSaving(false);
          return;
        }
      }

      // Save GitLab config if token is provided
      if (gitlabToken.trim() && gitlabUrl.trim()) {
        // Check if instance already exists
        const instancesResult = await window.electronAPI.listGitLabInstances();
        const existingInstances = instancesResult.success ? instancesResult.data || [] : [];

        // Normalize URL for comparison
        const normalizedUrl = gitlabUrl.trim().replace(/\/+$/, '').toLowerCase();
        const existingInstance = existingInstances.find(
          i => i.url.replace(/\/+$/, '').toLowerCase() === normalizedUrl
        );

        if (existingInstance) {
          // Update existing instance
          await window.electronAPI.updateGitLabInstance(existingInstance.id, {
            name: gitlabName.trim(),
            token: gitlabToken.trim(),
            username: gitlabUsername || undefined
          });
        } else {
          // Add new instance
          await window.electronAPI.addGitLabInstance({
            name: gitlabName.trim(),
            url: gitlabUrl.trim(),
            token: gitlabToken.trim(),
            authMethod: 'pat',
            username: gitlabUsername || undefined,
            isDefault: true
          });
        }
      }

      onNext();
    } catch (err) {
      setError(t('onboarding:sourceControl.errors.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  // Render status indicator
  const renderStatus = (status: ConnectionStatus, username: string | null) => {
    switch (status) {
      case 'testing':
        return (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{t('onboarding:sourceControl.status.testing')}</span>
          </div>
        );
      case 'connected':
        return (
          <div className="flex items-center gap-2 text-success">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm">
              {t('onboarding:sourceControl.status.connected', { username: username || '' })}
            </span>
          </div>
        );
      case 'invalid':
        return (
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{t('onboarding:sourceControl.status.invalid')}</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <GitBranch className="h-7 w-7" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {t('onboarding:sourceControl.title')}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {t('onboarding:sourceControl.subtitle')}
          </p>
        </div>

        <div className="space-y-6">
          {/* GitHub Section - US#56 */}
          <Card className="border border-border">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <Github className="h-5 w-5" />
                <h3 className="font-medium">{t('onboarding:sourceControl.github.title')}</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="github-token" className="text-sm">
                    {t('onboarding:sourceControl.github.tokenLabel')}
                  </Label>
                  <div className="flex gap-2 mt-1.5">
                    <div className="relative flex-1">
                      <Input
                        id="github-token"
                        type={showGithubToken ? 'text' : 'password'}
                        value={githubToken}
                        onChange={(e) => {
                          setGithubToken(e.target.value);
                          if (githubStatus !== 'not_configured') {
                            setGithubStatus('not_configured');
                            setGithubUsername(null);
                          }
                        }}
                        placeholder={t('onboarding:sourceControl.github.tokenPlaceholder')}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGithubToken(!showGithubToken)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showGithubToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleTestGitHub}
                      disabled={!githubToken.trim() || githubStatus === 'testing'}
                    >
                      {t('onboarding:sourceControl.buttons.testConnection')}
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    {renderStatus(githubStatus, githubUsername)}
                    <a
                      href="https://github.com/settings/tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      {t('onboarding:sourceControl.github.getToken')}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* GitLab Section - US#57 */}
          <Card className="border border-border">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <GitlabIcon className="h-5 w-5" />
                <h3 className="font-medium">{t('onboarding:sourceControl.gitlab.title')}</h3>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="gitlab-name" className="text-sm">
                      {t('onboarding:sourceControl.gitlab.nameLabel')}
                    </Label>
                    <Input
                      id="gitlab-name"
                      value={gitlabName}
                      onChange={(e) => setGitlabName(e.target.value)}
                      placeholder="GitLab.com"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="gitlab-url" className="text-sm">
                      {t('onboarding:sourceControl.gitlab.urlLabel')}
                    </Label>
                    <Input
                      id="gitlab-url"
                      value={gitlabUrl}
                      onChange={(e) => {
                        setGitlabUrl(e.target.value);
                        if (gitlabStatus !== 'not_configured') {
                          setGitlabStatus('not_configured');
                          setGitlabUsername(null);
                        }
                      }}
                      placeholder="https://gitlab.com"
                      className="mt-1.5"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="gitlab-token" className="text-sm">
                    {t('onboarding:sourceControl.gitlab.tokenLabel')}
                  </Label>
                  <div className="flex gap-2 mt-1.5">
                    <div className="relative flex-1">
                      <Input
                        id="gitlab-token"
                        type={showGitlabToken ? 'text' : 'password'}
                        value={gitlabToken}
                        onChange={(e) => {
                          setGitlabToken(e.target.value);
                          if (gitlabStatus !== 'not_configured') {
                            setGitlabStatus('not_configured');
                            setGitlabUsername(null);
                          }
                        }}
                        placeholder={t('onboarding:sourceControl.gitlab.tokenPlaceholder')}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGitlabToken(!showGitlabToken)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showGitlabToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleTestGitLab}
                      disabled={!gitlabToken.trim() || !gitlabUrl.trim() || gitlabStatus === 'testing'}
                    >
                      {t('onboarding:sourceControl.buttons.testConnection')}
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    {renderStatus(gitlabStatus, gitlabUsername)}
                    <a
                      href="https://gitlab.com/-/user_settings/personal_access_tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      {t('onboarding:sourceControl.gitlab.getToken')}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Info card */}
          <Card className="border border-info/30 bg-info/10">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                {t('onboarding:sourceControl.info')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Error Display */}
        {error && (
          <div className="flex items-start gap-2 p-3 mt-6 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-between items-center mt-10 pt-6 border-t border-border">
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onBack}>
              {t('common:back')}
            </Button>
            <Button variant="ghost" onClick={onSkip}>
              {t('common:skip')}
            </Button>
          </div>
          <Button onClick={handleSaveAndContinue} disabled={isSaving}>
            {isSaving ? t('common:saving') : t('common:continue')}
          </Button>
        </div>
      </div>
    </div>
  );
}
