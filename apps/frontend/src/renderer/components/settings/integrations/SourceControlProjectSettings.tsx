/**
 * SourceControlProjectSettings - Unified source control settings for projects
 *
 * This component replaces the separate GitHubIntegration and GitLabIntegration components
 * with a unified approach that:
 * - Auto-detects the git remote and displays provider info
 * - Uses global tokens from AppSettings
 * - Provides toggles for sync options (Issues, PRs/MRs)
 * - Shows alerts when tokens are missing
 * - Supports manual configuration as fallback
 */
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Github,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  GitBranch,
  ChevronDown,
  ExternalLink,
  Settings,
  Link as LinkIcon,
  Unlink
} from 'lucide-react';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { Separator } from '../../ui/separator';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import type {
  ProjectEnvConfig,
  ProjectSettings,
  DetectedRemote,
  ProjectSourceControl,
  SourceControlProvider
} from '../../../../shared/types';

// Debug logging
const DEBUG = process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true';
function debugLog(message: string, data?: unknown) {
  if (DEBUG) {
    if (data !== undefined) {
      console.warn(`[SourceControlProjectSettings] ${message}`, data);
    } else {
      console.warn(`[SourceControlProjectSettings] ${message}`);
    }
  }
}

// GitLab icon component (lucide-react doesn't have one)
function GitLabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" role="img" aria-labelledby="gitlab-icon-sc-title">
      <title id="gitlab-icon-sc-title">GitLab</title>
      <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"/>
    </svg>
  );
}

interface SourceControlProjectSettingsProps {
  envConfig: ProjectEnvConfig | null;
  updateEnvConfig: (updates: Partial<ProjectEnvConfig>) => void;
  projectPath?: string;
  settings?: ProjectSettings;
  setSettings?: React.Dispatch<React.SetStateAction<ProjectSettings>>;
  isOpen?: boolean; // Dialog open state to trigger detection
}

type DetectionStatus = 'idle' | 'detecting' | 'detected' | 'no_remote' | 'error';
type TokenStatus = 'available' | 'missing' | 'checking';

/**
 * Main component for unified source control settings at project level.
 * Auto-detects git remote and provides toggles for sync options.
 */
export function SourceControlProjectSettings({
  envConfig,
  updateEnvConfig,
  projectPath,
  settings,
  setSettings,
  isOpen
}: SourceControlProjectSettingsProps) {
  const { t } = useTranslation('settings');

  // Detection state
  const [detectedRemote, setDetectedRemote] = useState<DetectedRemote | null>(null);
  const [detectionStatus, setDetectionStatus] = useState<DetectionStatus>('idle');
  const [detectionError, setDetectionError] = useState<string | null>(null);

  // Token state
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>('checking');
  const [tokenUsername, setTokenUsername] = useState<string | null>(null);

  // Branch selection state
  const [branches, setBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [branchesError, setBranchesError] = useState<string | null>(null);

  // Manual mode state
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualProvider, setManualProvider] = useState<SourceControlProvider>('github');
  const [manualOwner, setManualOwner] = useState('');
  const [manualRepo, setManualRepo] = useState('');

  // Get current source control config
  const sourceControl = envConfig?.sourceControl;

  debugLog('Render', {
    projectPath,
    sourceControl,
    detectionStatus,
    tokenStatus,
    isManualMode
  });

  // Auto-detect git remote when dialog opens or project changes
  useEffect(() => {
    if (isOpen && projectPath && detectionStatus === 'idle') {
      detectRemote();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, projectPath]);

  // Check token when provider is detected/selected
  useEffect(() => {
    const provider = sourceControl?.provider || detectedRemote?.provider;
    if (provider && provider !== 'none') {
      checkToken(provider);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceControl?.provider, detectedRemote?.provider]);

  // Fetch branches when source control is configured
  useEffect(() => {
    if (projectPath && (sourceControl?.provider !== 'none' || detectedRemote)) {
      fetchBranches();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, sourceControl?.provider, detectedRemote]);

  /**
   * Detect git remote for the project
   */
  const detectRemote = useCallback(async () => {
    if (!projectPath) return;

    debugLog('Detecting git remote...');
    setDetectionStatus('detecting');
    setDetectionError(null);

    try {
      const result = await window.electronAPI.detectGitRemote(projectPath);
      debugLog('detectGitRemote result:', result);

      if (result.success && result.data) {
        setDetectedRemote(result.data);
        setDetectionStatus('detected');

        // Auto-configure source control if not already configured
        if (!sourceControl || sourceControl.provider === 'none') {
          const newSourceControl: ProjectSourceControl = {
            provider: result.data.provider,
            detectedRemoteUrl: result.data.url,
            owner: result.data.owner,
            repo: result.data.repo,
            syncIssues: false,
            syncPullRequests: false,
            autoDetectedAt: new Date().toISOString()
          };

          // For GitLab, try to match instance
          if (result.data.provider === 'gitlab') {
            const matchedInstance = await matchGitLabInstance(result.data.instanceUrl);
            if (matchedInstance) {
              newSourceControl.gitlabInstanceId = matchedInstance;
            }
          }

          updateEnvConfig({ sourceControl: newSourceControl });
        }
      } else if (result.success && !result.data) {
        setDetectionStatus('no_remote');
        setDetectedRemote(null);
      } else {
        setDetectionStatus('error');
        setDetectionError(result.error || t('sourceControlProject.errors.detectionFailed'));
      }
    } catch (err) {
      debugLog('Detection error:', err);
      setDetectionStatus('error');
      setDetectionError(err instanceof Error ? err.message : t('sourceControlProject.errors.detectionFailed'));
    }
  }, [projectPath, sourceControl, updateEnvConfig, t]);

  /**
   * Match GitLab instance URL with configured instances
   */
  const matchGitLabInstance = async (instanceUrl: string): Promise<string | undefined> => {
    try {
      const result = await window.electronAPI.listGitLabInstances();
      if (result.success && result.data) {
        // Normalize URLs for comparison
        const normalizedUrl = instanceUrl.toLowerCase().replace(/\/$/, '');
        const match = result.data.find(instance =>
          instance.url.toLowerCase().replace(/\/$/, '') === normalizedUrl
        );
        return match?.id;
      }
    } catch (err) {
      debugLog('Error matching GitLab instance:', err);
    }
    return undefined;
  };

  /**
   * Check if token is available for the provider
   */
  const checkToken = useCallback(async (provider: SourceControlProvider) => {
    if (provider === 'none') {
      setTokenStatus('missing');
      return;
    }

    setTokenStatus('checking');

    try {
      const result = await window.electronAPI.getTokenForProject(sourceControl);
      debugLog('getTokenForProject result:', result);

      if (result.success && result.data?.token) {
        setTokenStatus('available');
        // Test connection to get username
        if (provider === 'github') {
          const testResult = await window.electronAPI.testGitHubConnection(result.data.token);
          if (testResult.success && testResult.data?.success) {
            setTokenUsername(testResult.data.username || null);
          }
        } else if (provider === 'gitlab' && result.data.instanceId) {
          const instances = await window.electronAPI.listGitLabInstances();
          const instance = instances.data?.find(i => i.id === result.data?.instanceId);
          if (instance?.username) {
            setTokenUsername(instance.username);
          }
        }
      } else {
        setTokenStatus('missing');
        setTokenUsername(null);
      }
    } catch (err) {
      debugLog('Token check error:', err);
      setTokenStatus('missing');
      setTokenUsername(null);
    }
  }, [sourceControl]);

  /**
   * Fetch git branches for the project
   */
  const fetchBranches = async () => {
    if (!projectPath) return;

    debugLog('Fetching branches...');
    setIsLoadingBranches(true);
    setBranchesError(null);

    try {
      const result = await window.electronAPI.getGitBranches(projectPath);
      debugLog('getGitBranches result:', result);

      if (result.success && result.data) {
        setBranches(result.data);

        // Auto-detect default branch if not set
        if (!settings?.mainBranch && !sourceControl?.branch) {
          const detectResult = await window.electronAPI.detectMainBranch(projectPath);
          if (detectResult.success && detectResult.data) {
            handleBranchChange(detectResult.data);
          }
        }
      } else {
        setBranchesError(result.error || t('sourceControlProject.errors.branchesFailed'));
      }
    } catch (err) {
      debugLog('Branches error:', err);
      setBranchesError(err instanceof Error ? err.message : t('sourceControlProject.errors.branchesFailed'));
    } finally {
      setIsLoadingBranches(false);
    }
  };

  /**
   * Handle branch selection change
   */
  const handleBranchChange = (branch: string) => {
    debugLog('Branch change:', branch);

    // Update project settings
    if (setSettings) {
      setSettings(prev => ({ ...prev, mainBranch: branch }));
    }

    // Update source control config
    if (sourceControl) {
      updateEnvConfig({
        sourceControl: { ...sourceControl, branch }
      });
    }

    // Legacy support
    updateEnvConfig({ defaultBranch: branch });
  };

  /**
   * Toggle sync issues
   */
  const handleToggleSyncIssues = (enabled: boolean) => {
    if (sourceControl) {
      updateEnvConfig({
        sourceControl: { ...sourceControl, syncIssues: enabled }
      });
    }
  };

  /**
   * Toggle sync PRs/MRs
   */
  const handleToggleSyncPRs = (enabled: boolean) => {
    if (sourceControl) {
      updateEnvConfig({
        sourceControl: { ...sourceControl, syncPullRequests: enabled }
      });
    }
  };

  /**
   * Enter manual configuration mode
   */
  const handleEnterManualMode = () => {
    setIsManualMode(true);
    // Pre-fill with detected values if available
    if (detectedRemote) {
      setManualProvider(detectedRemote.provider);
      setManualOwner(detectedRemote.owner);
      setManualRepo(detectedRemote.repo);
    }
  };

  /**
   * Save manual configuration
   */
  const handleSaveManualConfig = async () => {
    if (!manualOwner || !manualRepo) return;

    const newSourceControl: ProjectSourceControl = {
      provider: manualProvider,
      owner: manualOwner,
      repo: manualRepo,
      syncIssues: false,
      syncPullRequests: false
    };

    // For GitLab, try to find matching instance
    if (manualProvider === 'gitlab') {
      const instances = await window.electronAPI.listGitLabInstances();
      const defaultInstance = instances.data?.find(i => i.isDefault) || instances.data?.[0];
      if (defaultInstance) {
        newSourceControl.gitlabInstanceId = defaultInstance.id;
      }
    }

    updateEnvConfig({ sourceControl: newSourceControl });
    setIsManualMode(false);
  };

  /**
   * Cancel manual mode
   */
  const handleCancelManualMode = () => {
    setIsManualMode(false);
    setManualOwner('');
    setManualRepo('');
  };

  /**
   * Disconnect source control
   */
  const handleDisconnect = () => {
    updateEnvConfig({
      sourceControl: {
        provider: 'none',
        syncIssues: false,
        syncPullRequests: false
      }
    });
    setDetectedRemote(null);
    setDetectionStatus('idle');
  };

  if (!envConfig) {
    return null;
  }

  const currentProvider = sourceControl?.provider || detectedRemote?.provider || 'none';
  const currentOwner = sourceControl?.owner || detectedRemote?.owner;
  const currentRepo = sourceControl?.repo || detectedRemote?.repo;
  const repoUrl = currentProvider === 'github'
    ? `https://github.com/${currentOwner}/${currentRepo}`
    : currentProvider === 'gitlab' && detectedRemote?.instanceUrl
      ? `${detectedRemote.instanceUrl}/${currentOwner}/${currentRepo}`
      : null;

  return (
    <div className="space-y-6">
      {/* Detection Status / Detected Remote */}
      <DetectedRemoteSection
        detectionStatus={detectionStatus}
        detectedRemote={detectedRemote}
        detectionError={detectionError}
        currentProvider={currentProvider}
        currentOwner={currentOwner}
        currentRepo={currentRepo}
        repoUrl={repoUrl}
        onRefresh={detectRemote}
        onManualConfig={handleEnterManualMode}
        onDisconnect={handleDisconnect}
        t={t}
      />

      {/* Manual Configuration Mode */}
      {isManualMode && (
        <ManualConfigSection
          provider={manualProvider}
          owner={manualOwner}
          repo={manualRepo}
          onProviderChange={setManualProvider}
          onOwnerChange={setManualOwner}
          onRepoChange={setManualRepo}
          onSave={handleSaveManualConfig}
          onCancel={handleCancelManualMode}
          t={t}
        />
      )}

      {/* Token Status Alert */}
      {currentProvider !== 'none' && !isManualMode && (
        <TokenStatusAlert
          provider={currentProvider}
          tokenStatus={tokenStatus}
          username={tokenUsername}
          t={t}
        />
      )}

      {/* Sync Options */}
      {currentProvider !== 'none' && tokenStatus === 'available' && !isManualMode && (
        <>
          <Separator />

          <SyncOptions
            provider={currentProvider}
            syncIssues={sourceControl?.syncIssues || false}
            syncPullRequests={sourceControl?.syncPullRequests || false}
            onToggleSyncIssues={handleToggleSyncIssues}
            onToggleSyncPRs={handleToggleSyncPRs}
            tokenAvailable={tokenStatus === 'available'}
            t={t}
          />

          <Separator />

          {/* Branch Selector */}
          {projectPath && (
            <BranchSelector
              branches={branches}
              selectedBranch={settings?.mainBranch || sourceControl?.branch || ''}
              isLoading={isLoadingBranches}
              error={branchesError}
              onSelect={handleBranchChange}
              onRefresh={fetchBranches}
              t={t}
            />
          )}
        </>
      )}
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

interface DetectedRemoteSectionProps {
  detectionStatus: DetectionStatus;
  detectedRemote: DetectedRemote | null;
  detectionError: string | null;
  currentProvider: SourceControlProvider;
  currentOwner?: string;
  currentRepo?: string;
  repoUrl: string | null;
  onRefresh: () => void;
  onManualConfig: () => void;
  onDisconnect: () => void;
  t: (key: string) => string;
}

function DetectedRemoteSection({
  detectionStatus,
  detectedRemote,
  detectionError,
  currentProvider,
  currentOwner,
  currentRepo,
  repoUrl,
  onRefresh,
  onManualConfig,
  onDisconnect,
  t
}: DetectedRemoteSectionProps) {
  // Detecting state
  if (detectionStatus === 'detecting') {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
          <div>
            <p className="text-sm font-medium text-foreground">{t('sourceControlProject.detecting')}</p>
            <p className="text-xs text-muted-foreground">{t('sourceControlProject.detectingHint')}</p>
          </div>
        </div>
      </div>
    );
  }

  // No remote detected
  if (detectionStatus === 'no_remote') {
    return (
      <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">{t('sourceControlProject.noRemote.title')}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('sourceControlProject.noRemote.description')}
              </p>
            </div>
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2 font-mono">
              git remote add origin https://github.com/owner/repo.git
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onRefresh} className="gap-2">
                <RefreshCw className="h-3 w-3" />
                {t('sourceControlProject.noRemote.retry')}
              </Button>
              <Button variant="ghost" size="sm" onClick={onManualConfig} className="gap-2">
                <Settings className="h-3 w-3" />
                {t('sourceControlProject.noRemote.manual')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (detectionStatus === 'error') {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-foreground">{t('sourceControlProject.error.title')}</p>
            <p className="text-xs text-muted-foreground">{detectionError}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onRefresh} className="gap-2">
                <RefreshCw className="h-3 w-3" />
                {t('sourceControlProject.error.retry')}
              </Button>
              <Button variant="ghost" size="sm" onClick={onManualConfig} className="gap-2">
                <Settings className="h-3 w-3" />
                {t('sourceControlProject.noRemote.manual')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Detected/configured state
  if (currentProvider !== 'none' && currentOwner && currentRepo) {
    const ProviderIcon = currentProvider === 'github' ? Github : GitLabIcon;

    return (
      <div className="rounded-lg border border-success/30 bg-success/10 p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <ProviderIcon className="h-5 w-5 text-success mt-0.5" />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">
                  {currentProvider === 'github' ? 'GitHub' : 'GitLab'}
                </p>
                <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded">
                  {t('sourceControlProject.detected')}
                </span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                {repoUrl ? (
                  <a
                    href={repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-info hover:underline flex items-center gap-1"
                  >
                    {currentOwner}/{currentRepo}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-sm text-muted-foreground">{currentOwner}/{currentRepo}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onRefresh} className="h-8 w-8 p-0">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onDisconnect} className="h-8 gap-2 text-muted-foreground hover:text-destructive">
              <Unlink className="h-4 w-4" />
              {t('sourceControlProject.disconnect')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Idle state - prompt to detect
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LinkIcon className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">{t('sourceControlProject.notConfigured')}</p>
            <p className="text-xs text-muted-foreground">{t('sourceControlProject.notConfiguredHint')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} className="gap-2">
            <RefreshCw className="h-3 w-3" />
            {t('sourceControlProject.detect')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onManualConfig} className="gap-2">
            <Settings className="h-3 w-3" />
            {t('sourceControlProject.noRemote.manual')}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ManualConfigSectionProps {
  provider: SourceControlProvider;
  owner: string;
  repo: string;
  onProviderChange: (provider: SourceControlProvider) => void;
  onOwnerChange: (owner: string) => void;
  onRepoChange: (repo: string) => void;
  onSave: () => void;
  onCancel: () => void;
  t: (key: string) => string;
}

function ManualConfigSection({
  provider,
  owner,
  repo,
  onProviderChange,
  onOwnerChange,
  onRepoChange,
  onSave,
  onCancel,
  t
}: ManualConfigSectionProps) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{t('sourceControlProject.manual.title')}</p>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t('sourceControlProject.manual.cancel')}
        </Button>
      </div>

      {/* Provider selection */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">{t('sourceControlProject.manual.provider')}</Label>
        <div className="flex gap-2">
          <Button
            variant={provider === 'github' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onProviderChange('github')}
            className="gap-2"
          >
            <Github className="h-4 w-4" />
            GitHub
          </Button>
          <Button
            variant={provider === 'gitlab' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onProviderChange('gitlab')}
            className="gap-2"
          >
            <GitLabIcon className="h-4 w-4" />
            GitLab
          </Button>
        </div>
      </div>

      {/* Owner input */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          {provider === 'github'
            ? t('sourceControlProject.manual.owner')
            : t('sourceControlProject.manual.group')}
        </Label>
        <Input
          placeholder={provider === 'github' ? 'owner' : 'group/subgroup'}
          value={owner}
          onChange={(e) => onOwnerChange(e.target.value)}
        />
      </div>

      {/* Repo input */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          {provider === 'github'
            ? t('sourceControlProject.manual.repo')
            : t('sourceControlProject.manual.project')}
        </Label>
        <Input
          placeholder="repository"
          value={repo}
          onChange={(e) => onRepoChange(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t('sourceControlProject.manual.cancel')}
        </Button>
        <Button onClick={onSave} disabled={!owner || !repo}>
          {t('sourceControlProject.manual.save')}
        </Button>
      </div>
    </div>
  );
}

interface TokenStatusAlertProps {
  provider: SourceControlProvider;
  tokenStatus: TokenStatus;
  username: string | null;
  t: (key: string) => string;
}

function TokenStatusAlert({ provider, tokenStatus, username, t }: TokenStatusAlertProps) {
  if (tokenStatus === 'checking') {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
          <span className="text-sm text-muted-foreground">{t('sourceControlProject.token.checking')}</span>
        </div>
      </div>
    );
  }

  if (tokenStatus === 'available') {
    return (
      <div className="rounded-lg border border-success/30 bg-success/10 p-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span className="text-sm text-success">
            {username
              ? t('sourceControlProject.token.connectedAs').replace('{{username}}', username)
              : t('sourceControlProject.token.connected')}
          </span>
        </div>
      </div>
    );
  }

  // Token missing
  const providerName = provider === 'github' ? 'GitHub' : 'GitLab';
  const settingsPath = provider === 'github' ? 'sourceControl' : 'sourceControl';

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium text-foreground">
            {t('sourceControlProject.token.missing.title').replace('{{provider}}', providerName)}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('sourceControlProject.token.missing.description').replace('{{provider}}', providerName)}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              // Navigate to source control settings
              // This should trigger the settings dialog to open at sourceControl section
              window.dispatchEvent(new CustomEvent('open-settings', {
                detail: { section: settingsPath }
              }));
            }}
          >
            <Settings className="h-3 w-3" />
            {t('sourceControlProject.token.missing.configure').replace('{{provider}}', providerName)}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface SyncOptionsProps {
  provider: SourceControlProvider;
  syncIssues: boolean;
  syncPullRequests: boolean;
  onToggleSyncIssues: (enabled: boolean) => void;
  onToggleSyncPRs: (enabled: boolean) => void;
  tokenAvailable: boolean;
  t: (key: string) => string;
}

function SyncOptions({
  provider,
  syncIssues,
  syncPullRequests,
  onToggleSyncIssues,
  onToggleSyncPRs,
  tokenAvailable,
  t
}: SyncOptionsProps) {
  const prLabel = provider === 'github'
    ? t('sourceControlProject.sync.pullRequests')
    : t('sourceControlProject.sync.mergeRequests');

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-foreground">{t('sourceControlProject.sync.title')}</p>
        <p className="text-xs text-muted-foreground">{t('sourceControlProject.sync.description')}</p>
      </div>

      {/* Sync Issues Toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="font-normal text-foreground">{t('sourceControlProject.sync.issues')}</Label>
          <p className="text-xs text-muted-foreground">
            {t('sourceControlProject.sync.issuesDescription')}
          </p>
        </div>
        <Switch
          checked={syncIssues}
          onCheckedChange={onToggleSyncIssues}
          disabled={!tokenAvailable}
        />
      </div>

      {/* Sync PRs/MRs Toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="font-normal text-foreground">{prLabel}</Label>
          <p className="text-xs text-muted-foreground">
            {provider === 'github'
              ? t('sourceControlProject.sync.pullRequestsDescription')
              : t('sourceControlProject.sync.mergeRequestsDescription')}
          </p>
        </div>
        <Switch
          checked={syncPullRequests}
          onCheckedChange={onToggleSyncPRs}
          disabled={!tokenAvailable}
        />
      </div>
    </div>
  );
}

interface BranchSelectorProps {
  branches: string[];
  selectedBranch: string;
  isLoading: boolean;
  error: string | null;
  onSelect: (branch: string) => void;
  onRefresh: () => void;
  t: (key: string) => string;
}

function BranchSelector({
  branches,
  selectedBranch,
  isLoading,
  error,
  onSelect,
  onRefresh,
  t
}: BranchSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const filteredBranches = branches.filter(branch =>
    branch.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-info" />
            <Label className="text-sm font-medium text-foreground">{t('sourceControlProject.branch.title')}</Label>
          </div>
          <p className="text-xs text-muted-foreground pl-6">
            {t('sourceControlProject.branch.description')}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="h-7 px-2"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive pl-6">
          <AlertCircle className="h-3 w-3" />
          {error}
        </div>
      )}

      <div className="relative pl-6">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoading}
          className="w-full flex items-center justify-between px-3 py-2 text-sm border border-input rounded-md bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          {isLoading ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('sourceControlProject.branch.loading')}
            </span>
          ) : selectedBranch ? (
            <span className="flex items-center gap-2">
              <GitBranch className="h-3 w-3 text-muted-foreground" />
              {selectedBranch}
            </span>
          ) : (
            <span className="text-muted-foreground">{t('sourceControlProject.branch.autoDetect')}</span>
          )}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && !isLoading && (
          <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-hidden">
            <div className="p-2 border-b border-border">
              <Input
                placeholder={t('sourceControlProject.branch.search')}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
            </div>

            <button
              type="button"
              onClick={() => {
                onSelect('');
                setIsOpen(false);
                setFilter('');
              }}
              className={`w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2 ${
                !selectedBranch ? 'bg-accent' : ''
              }`}
            >
              <span className="text-sm text-muted-foreground italic">{t('sourceControlProject.branch.autoDetect')}</span>
            </button>

            <div className="max-h-40 overflow-y-auto border-t border-border">
              {filteredBranches.length === 0 ? (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  {filter ? t('sourceControlProject.branch.noMatch') : t('sourceControlProject.branch.noBranches')}
                </div>
              ) : (
                filteredBranches.map((branch) => (
                  <button
                    key={branch}
                    type="button"
                    onClick={() => {
                      onSelect(branch);
                      setIsOpen(false);
                      setFilter('');
                    }}
                    className={`w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2 ${
                      branch === selectedBranch ? 'bg-accent' : ''
                    }`}
                  >
                    <GitBranch className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm">{branch}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {selectedBranch && (
        <p className="text-xs text-muted-foreground pl-6">
          {t('sourceControlProject.branch.selectedNote').replace('{{branch}}', selectedBranch)}
        </p>
      )}
    </div>
  );
}
