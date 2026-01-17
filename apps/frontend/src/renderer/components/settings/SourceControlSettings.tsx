/**
 * Source Control Global Settings Component
 * Manages GitHub global configuration and GitLab instances
 * US#30-37: Global source control settings for the application
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Github,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  Star,
  ExternalLink,
  RefreshCw,
  Server
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Separator } from '../ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { SettingsSection } from './SettingsSection';
import { useToast } from '../../hooks/use-toast';
import { cn } from '../../lib/utils';
import type { AppSettings, GitLabInstance, GitHubGlobalConfig } from '../../../shared/types';

// GitLab icon component (lucide-react doesn't have one)
function GitLabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" role="img" aria-labelledby="gitlab-icon-title">
      <title id="gitlab-icon-title">GitLab</title>
      <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"/>
    </svg>
  );
}

// GitHub connection status type
type GitHubStatus = 'not_configured' | 'testing' | 'connected' | 'invalid';

interface SourceControlSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  isOpen: boolean;
}

/**
 * Source Control settings for GitHub and GitLab global configuration
 */
export function SourceControlSettings({ settings, onSettingsChange, isOpen }: SourceControlSettingsProps) {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { toast } = useToast();

  // GitHub state
  const [showGitHubToken, setShowGitHubToken] = useState(false);
  const [githubStatus, setGithubStatus] = useState<GitHubStatus>('not_configured');
  const [githubUsername, setGithubUsername] = useState<string | undefined>(settings.github?.username);
  const [isTestingGitHub, setIsTestingGitHub] = useState(false);
  const [pendingGitHubToken, setPendingGitHubToken] = useState(settings.github?.token || '');

  // GitLab state
  const [gitlabInstances, setGitlabInstances] = useState<GitLabInstance[]>([]);
  const [isLoadingInstances, setIsLoadingInstances] = useState(false);
  const [instanceModalOpen, setInstanceModalOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<GitLabInstance | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [instanceToDelete, setInstanceToDelete] = useState<GitLabInstance | null>(null);
  const [isDeletingInstance, setIsDeletingInstance] = useState(false);

  // Modal form state
  const [modalName, setModalName] = useState('');
  const [modalUrl, setModalUrl] = useState('');
  const [modalToken, setModalToken] = useState('');
  const [modalAuthMethod, setModalAuthMethod] = useState<'oauth' | 'pat'>('pat');
  const [showModalToken, setShowModalToken] = useState(false);
  const [isTestingModal, setIsTestingModal] = useState(false);
  const [modalTestResult, setModalTestResult] = useState<{ success: boolean; username?: string; error?: string } | null>(null);
  const [isSavingModal, setIsSavingModal] = useState(false);

  // Load GitLab instances on mount
  useEffect(() => {
    if (isOpen) {
      loadGitLabInstances();
      updateGitHubStatus();
    }
  }, [isOpen]);

  // Update GitHub status when settings change
  useEffect(() => {
    updateGitHubStatus();
    setPendingGitHubToken(settings.github?.token || '');
    setGithubUsername(settings.github?.username);
  }, [settings.github]);

  const updateGitHubStatus = useCallback(() => {
    if (!settings.github?.token) {
      setGithubStatus('not_configured');
    } else if (settings.github?.username) {
      setGithubStatus('connected');
    } else {
      setGithubStatus('invalid');
    }
  }, [settings.github]);

  const loadGitLabInstances = async () => {
    setIsLoadingInstances(true);
    try {
      const result = await window.electronAPI.listGitLabInstances();
      if (result.success && result.data) {
        let instances = result.data;

        // US#37: Add gitlab.com as default instance if no instances exist
        if (instances.length === 0) {
          const addResult = await window.electronAPI.addGitLabInstance({
            name: 'GitLab.com',
            url: 'https://gitlab.com',
            authMethod: 'pat',
            isDefault: true
          });
          if (addResult.success && addResult.data) {
            instances = [addResult.data];
          }
        }

        setGitlabInstances(instances);
      }
    } catch (err) {
      console.error('[SourceControlSettings] Failed to load GitLab instances:', err);
    } finally {
      setIsLoadingInstances(false);
    }
  };

  // US#31-32: GitHub token management and connection test
  const handleTestGitHubConnection = async () => {
    if (!pendingGitHubToken.trim()) return;

    setIsTestingGitHub(true);
    setGithubStatus('testing');

    try {
      const result = await window.electronAPI.testGitHubConnection(pendingGitHubToken.trim());

      if (result.success && result.data) {
        if (result.data.success && result.data.username) {
          setGithubStatus('connected');
          setGithubUsername(result.data.username);

          // Save to settings
          const newGithubConfig: GitHubGlobalConfig = {
            token: pendingGitHubToken.trim(),
            authMethod: 'pat',
            username: result.data.username
          };
          onSettingsChange({ ...settings, github: newGithubConfig });

          toast({
            title: t('sourceControl.github.toast.connected'),
            description: t('sourceControl.github.toast.connectedAs', { username: result.data.username }),
          });
        } else {
          setGithubStatus('invalid');
          toast({
            variant: 'destructive',
            title: t('sourceControl.github.toast.failed'),
            description: result.data.error || t('sourceControl.github.toast.invalidToken'),
          });
        }
      } else {
        setGithubStatus('invalid');
        toast({
          variant: 'destructive',
          title: t('sourceControl.github.toast.failed'),
          description: result.error || t('sourceControl.github.toast.invalidToken'),
        });
      }
    } catch (err) {
      setGithubStatus('invalid');
      toast({
        variant: 'destructive',
        title: t('sourceControl.github.toast.failed'),
        description: t('sourceControl.github.toast.error'),
      });
    } finally {
      setIsTestingGitHub(false);
    }
  };

  const handleClearGitHub = () => {
    setPendingGitHubToken('');
    setGithubStatus('not_configured');
    setGithubUsername(undefined);
    onSettingsChange({ ...settings, github: undefined });
  };

  // US#34-35: GitLab instance modal
  const openAddInstanceModal = () => {
    setEditingInstance(null);
    setModalName('');
    setModalUrl('');
    setModalToken('');
    setModalAuthMethod('pat');
    setModalTestResult(null);
    setInstanceModalOpen(true);
  };

  const openEditInstanceModal = (instance: GitLabInstance) => {
    setEditingInstance(instance);
    setModalName(instance.name);
    setModalUrl(instance.url);
    setModalToken(instance.token || '');
    setModalAuthMethod(instance.authMethod);
    setModalTestResult(null);
    setInstanceModalOpen(true);
  };

  const closeInstanceModal = () => {
    setInstanceModalOpen(false);
    setEditingInstance(null);
    setModalTestResult(null);
  };

  const handleTestInstanceConnection = async () => {
    if (!modalUrl.trim() || !modalToken.trim()) return;

    setIsTestingModal(true);
    setModalTestResult(null);

    try {
      const result = await window.electronAPI.testGitLabConnection(modalUrl.trim(), modalToken.trim());

      if (result.success && result.data) {
        setModalTestResult({
          success: result.data.success,
          username: result.data.username,
          error: result.data.error
        });
      } else {
        setModalTestResult({
          success: false,
          error: result.error || t('sourceControl.gitlab.toast.error')
        });
      }
    } catch (err) {
      setModalTestResult({
        success: false,
        error: t('sourceControl.gitlab.toast.error')
      });
    } finally {
      setIsTestingModal(false);
    }
  };

  const handleSaveInstance = async () => {
    if (!modalName.trim() || !modalUrl.trim()) return;

    setIsSavingModal(true);

    try {
      if (editingInstance) {
        // Update existing instance
        const result = await window.electronAPI.updateGitLabInstance(editingInstance.id, {
          name: modalName.trim(),
          url: modalUrl.trim(),
          token: modalToken.trim() || undefined,
          authMethod: modalAuthMethod,
          username: modalTestResult?.success ? modalTestResult.username : editingInstance.username
        });

        if (result.success) {
          toast({
            title: t('sourceControl.gitlab.toast.updated'),
            description: t('sourceControl.gitlab.toast.updatedDescription', { name: modalName.trim() }),
          });
          await loadGitLabInstances();
          closeInstanceModal();
        } else {
          toast({
            variant: 'destructive',
            title: t('sourceControl.gitlab.toast.updateFailed'),
            description: result.error || t('sourceControl.gitlab.toast.error'),
          });
        }
      } else {
        // Add new instance
        const result = await window.electronAPI.addGitLabInstance({
          name: modalName.trim(),
          url: modalUrl.trim(),
          token: modalToken.trim() || undefined,
          authMethod: modalAuthMethod,
          username: modalTestResult?.success ? modalTestResult.username : undefined,
          isDefault: gitlabInstances.length === 0
        });

        if (result.success) {
          toast({
            title: t('sourceControl.gitlab.toast.added'),
            description: t('sourceControl.gitlab.toast.addedDescription', { name: modalName.trim() }),
          });
          await loadGitLabInstances();
          closeInstanceModal();
        } else {
          toast({
            variant: 'destructive',
            title: t('sourceControl.gitlab.toast.addFailed'),
            description: result.error || t('sourceControl.gitlab.toast.error'),
          });
        }
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('sourceControl.gitlab.toast.error'),
        description: String(err),
      });
    } finally {
      setIsSavingModal(false);
    }
  };

  // US#36: Delete GitLab instance
  const handleDeleteInstance = async () => {
    if (!instanceToDelete) return;

    setIsDeletingInstance(true);

    try {
      const result = await window.electronAPI.removeGitLabInstance(instanceToDelete.id);

      if (result.success) {
        toast({
          title: t('sourceControl.gitlab.toast.deleted'),
          description: t('sourceControl.gitlab.toast.deletedDescription', { name: instanceToDelete.name }),
        });
        await loadGitLabInstances();
      } else {
        toast({
          variant: 'destructive',
          title: t('sourceControl.gitlab.toast.deleteFailed'),
          description: result.error || t('sourceControl.gitlab.toast.error'),
        });
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('sourceControl.gitlab.toast.error'),
        description: String(err),
      });
    } finally {
      setIsDeletingInstance(false);
      setDeleteConfirmOpen(false);
      setInstanceToDelete(null);
    }
  };

  const handleSetDefaultInstance = async (instanceId: string) => {
    try {
      const result = await window.electronAPI.updateGitLabInstance(instanceId, { isDefault: true });
      if (result.success) {
        await loadGitLabInstances();
      }
    } catch (err) {
      console.error('[SourceControlSettings] Failed to set default instance:', err);
    }
  };

  // Render GitHub status indicator
  const renderGitHubStatus = () => {
    switch (githubStatus) {
      case 'testing':
        return (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{t('sourceControl.github.status.testing')}</span>
          </div>
        );
      case 'connected':
        return (
          <div className="flex items-center gap-2 text-success">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm">
              {t('sourceControl.github.status.connected', { username: githubUsername })}
            </span>
          </div>
        );
      case 'invalid':
        return (
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{t('sourceControl.github.status.invalid')}</span>
          </div>
        );
      case 'not_configured':
      default:
        return (
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{t('sourceControl.github.status.notConfigured')}</span>
          </div>
        );
    }
  };

  return (
    <SettingsSection
      title={t('sourceControl.title')}
      description={t('sourceControl.description')}
    >
      <div className="space-y-6">
        {/* GitHub Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Github className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold text-foreground">{t('sourceControl.github.title')}</h4>
          </div>

          <div className="rounded-lg bg-muted/30 border border-border p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('sourceControl.github.description')}
            </p>

            {/* Token input */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">
                {t('sourceControl.github.tokenLabel')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('sourceControl.github.tokenHint')}{' '}
                <a
                  href="https://github.com/settings/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-info hover:underline inline-flex items-center gap-1"
                >
                  GitHub Settings
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showGitHubToken ? 'text' : 'password'}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    value={pendingGitHubToken}
                    onChange={(e) => setPendingGitHubToken(e.target.value)}
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGitHubToken(!showGitHubToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showGitHubToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  onClick={handleTestGitHubConnection}
                  disabled={!pendingGitHubToken.trim() || isTestingGitHub}
                  variant="outline"
                  className="shrink-0"
                >
                  {isTestingGitHub ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {t('sourceControl.github.testConnection')}
                </Button>
              </div>
            </div>

            {/* Connection status */}
            <div className="flex items-center justify-between">
              {renderGitHubStatus()}
              {githubStatus === 'connected' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearGitHub}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  {t('sourceControl.github.disconnect')}
                </Button>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* GitLab Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitLabIcon className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-semibold text-foreground">{t('sourceControl.gitlab.title')}</h4>
            </div>
            <Button onClick={openAddInstanceModal} size="sm" className="gap-1">
              <Plus className="h-3 w-3" />
              {t('sourceControl.gitlab.addInstance')}
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            {t('sourceControl.gitlab.description')}
          </p>

          {/* Instances list */}
          {isLoadingInstances ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : gitlabInstances.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <Server className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">{t('sourceControl.gitlab.noInstances')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {gitlabInstances.map((instance) => (
                <div
                  key={instance.id}
                  className={cn(
                    "rounded-lg border transition-colors p-3",
                    instance.isDefault
                      ? "border-primary bg-primary/5"
                      : "border-border bg-muted/30"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <GitLabIcon className="h-5 w-5 text-orange-500 shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{instance.name}</span>
                          {instance.isDefault && (
                            <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded flex items-center gap-1">
                              <Star className="h-3 w-3" />
                              {t('sourceControl.gitlab.default')}
                            </span>
                          )}
                          {instance.token ? (
                            instance.username ? (
                              <span className="text-xs bg-success/20 text-success px-1.5 py-0.5 rounded flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                {instance.username}
                              </span>
                            ) : (
                              <span className="text-xs bg-success/20 text-success px-1.5 py-0.5 rounded">
                                {t('sourceControl.gitlab.hasToken')}
                              </span>
                            )
                          ) : (
                            <span className="text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded">
                              {t('sourceControl.gitlab.noToken')}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground truncate block">{instance.url}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!instance.isDefault && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSetDefaultInstance(instance.id)}
                          className="h-7 text-xs"
                        >
                          {t('sourceControl.gitlab.setDefault')}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditInstanceModal(instance)}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setInstanceToDelete(instance);
                          setDeleteConfirmOpen(true);
                        }}
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit GitLab Instance Modal */}
      <Dialog open={instanceModalOpen} onOpenChange={setInstanceModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingInstance
                ? t('sourceControl.gitlab.modal.editTitle')
                : t('sourceControl.gitlab.modal.addTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('sourceControl.gitlab.modal.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="instance-name">{t('sourceControl.gitlab.modal.name')}</Label>
              <Input
                id="instance-name"
                placeholder={t('sourceControl.gitlab.modal.namePlaceholder')}
                value={modalName}
                onChange={(e) => setModalName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instance-url">{t('sourceControl.gitlab.modal.url')}</Label>
              <Input
                id="instance-url"
                placeholder="https://gitlab.com"
                value={modalUrl}
                onChange={(e) => setModalUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('sourceControl.gitlab.modal.urlHint')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="instance-token">{t('sourceControl.gitlab.modal.token')}</Label>
              <div className="relative">
                <Input
                  id="instance-token"
                  type={showModalToken ? 'text' : 'password'}
                  placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
                  value={modalToken}
                  onChange={(e) => {
                    setModalToken(e.target.value);
                    setModalTestResult(null);
                  }}
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowModalToken(!showModalToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showModalToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('sourceControl.gitlab.modal.tokenHint')}
              </p>
            </div>

            {/* Test connection result */}
            {modalTestResult && (
              <div className={cn(
                "rounded-lg border p-3",
                modalTestResult.success
                  ? "border-success/30 bg-success/5"
                  : "border-destructive/30 bg-destructive/5"
              )}>
                <div className="flex items-center gap-2">
                  {modalTestResult.success ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span className="text-sm text-success">
                        {t('sourceControl.gitlab.modal.testSuccess', { username: modalTestResult.username })}
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <span className="text-sm text-destructive">
                        {modalTestResult.error || t('sourceControl.gitlab.modal.testFailed')}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={handleTestInstanceConnection}
              disabled={!modalUrl.trim() || !modalToken.trim() || isTestingModal}
            >
              {isTestingModal ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {t('sourceControl.gitlab.modal.test')}
            </Button>
            <Button
              onClick={handleSaveInstance}
              disabled={!modalName.trim() || !modalUrl.trim() || isSavingModal}
            >
              {isSavingModal && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingInstance ? tCommon('buttons.save') : tCommon('buttons.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sourceControl.gitlab.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('sourceControl.gitlab.delete.description', { name: instanceToDelete?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingInstance}>
              {tCommon('buttons.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteInstance}
              disabled={isDeletingInstance}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingInstance && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {tCommon('buttons.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
