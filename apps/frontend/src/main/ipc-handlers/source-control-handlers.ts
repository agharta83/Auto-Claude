/**
 * Source Control IPC Handlers
 * Unified handlers for GitHub and GitLab connection management
 */

import { ipcMain } from 'electron';
import { writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { IPC_CHANNELS, DEFAULT_APP_SETTINGS } from '../../shared/constants';
import type {
  IPCResult,
  GitLabInstance,
  GitHubGlobalConfig,
  ProjectSourceControl,
  SourceControlProvider,
  AppSettings
} from '../../shared/types';
import { getSettingsPath, readSettingsFile } from '../settings-utils';

const settingsPath = getSettingsPath();

// ============================================
// Types for handler responses
// ============================================

export interface GitHubConnectionResult {
  success: boolean;
  username?: string;
  error?: string;
}

export interface GitLabConnectionResult {
  success: boolean;
  username?: string;
  instanceUrl?: string;
  error?: string;
}

export interface TokenForProjectResult {
  token?: string;
  provider: SourceControlProvider;
  instanceId?: string;
  error?: string;
}

// ============================================
// Helper functions
// ============================================

/**
 * Normalize a URL for comparison and storage
 * Removes trailing slashes, ensures https prefix
 */
function normalizeInstanceUrl(url: string): string {
  let normalized = url.trim().toLowerCase();
  // Add https if no protocol
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`;
  }
  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, '');
  return normalized;
}

/**
 * Test GitHub connection using the GitHub API
 */
async function testGitHubAPI(token: string): Promise<GitHubConnectionResult> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Auto-Claude-App'
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'Invalid or expired token' };
      }
      return { success: false, error: `GitHub API error: ${response.status}` };
    }

    const data = await response.json() as { login: string };
    return { success: true, username: data.login };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to connect to GitHub'
    };
  }
}

/**
 * Test GitLab connection using the GitLab API
 */
async function testGitLabAPI(instanceUrl: string, token: string): Promise<GitLabConnectionResult> {
  const normalizedUrl = normalizeInstanceUrl(instanceUrl);

  try {
    const response = await fetch(`${normalizedUrl}/api/v4/user`, {
      headers: {
        'PRIVATE-TOKEN': token,
        Accept: 'application/json',
        'User-Agent': 'Auto-Claude-App'
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'Invalid or expired token', instanceUrl: normalizedUrl };
      }
      return { success: false, error: `GitLab API error: ${response.status}`, instanceUrl: normalizedUrl };
    }

    const data = await response.json() as { username: string };
    return { success: true, username: data.username, instanceUrl: normalizedUrl };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to connect to GitLab',
      instanceUrl: normalizedUrl
    };
  }
}

// ============================================
// IPC Handlers Registration
// ============================================

export function registerSourceControlHandlers(): void {
  /**
   * US#20: Test GitHub Connection
   * Validates token via GitHub API and returns username
   */
  ipcMain.handle(
    IPC_CHANNELS.SOURCE_CONTROL_TEST_GITHUB,
    async (_, token: string): Promise<IPCResult<GitHubConnectionResult>> => {
      try {
        if (!token || token.trim() === '') {
          return {
            success: false,
            error: 'Token is required'
          };
        }

        const result = await testGitHubAPI(token.trim());
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to test GitHub connection'
        };
      }
    }
  );

  /**
   * US#21: Test GitLab Connection
   * Validates token on given instance and returns username
   */
  ipcMain.handle(
    IPC_CHANNELS.SOURCE_CONTROL_TEST_GITLAB,
    async (_, instanceUrl: string, token: string): Promise<IPCResult<GitLabConnectionResult>> => {
      try {
        if (!instanceUrl || instanceUrl.trim() === '') {
          return {
            success: false,
            error: 'Instance URL is required'
          };
        }

        if (!token || token.trim() === '') {
          return {
            success: false,
            error: 'Token is required'
          };
        }

        const result = await testGitLabAPI(instanceUrl.trim(), token.trim());
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to test GitLab connection'
        };
      }
    }
  );

  /**
   * US#22: List GitLab Instances
   * Returns the list of configured GitLab instances from global settings
   */
  ipcMain.handle(
    IPC_CHANNELS.SOURCE_CONTROL_LIST_GITLAB_INSTANCES,
    async (): Promise<IPCResult<GitLabInstance[]>> => {
      try {
        const savedSettings = readSettingsFile();
        const settings: AppSettings = { ...DEFAULT_APP_SETTINGS, ...savedSettings };

        return {
          success: true,
          data: settings.gitlabInstances || []
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list GitLab instances'
        };
      }
    }
  );

  /**
   * US#23: Add GitLab Instance
   * Generates UUID, normalizes URL, and saves to settings
   */
  ipcMain.handle(
    IPC_CHANNELS.SOURCE_CONTROL_ADD_GITLAB_INSTANCE,
    async (_, instance: Omit<GitLabInstance, 'id'>): Promise<IPCResult<GitLabInstance>> => {
      try {
        if (!instance.name || instance.name.trim() === '') {
          return { success: false, error: 'Instance name is required' };
        }

        if (!instance.url || instance.url.trim() === '') {
          return { success: false, error: 'Instance URL is required' };
        }

        const savedSettings = readSettingsFile();
        const settings: AppSettings = { ...DEFAULT_APP_SETTINGS, ...savedSettings };
        const gitlabInstances = settings.gitlabInstances || [];

        // Normalize the URL
        const normalizedUrl = normalizeInstanceUrl(instance.url);

        // Check for duplicate URL
        const existingInstance = gitlabInstances.find(
          (i) => normalizeInstanceUrl(i.url) === normalizedUrl
        );
        if (existingInstance) {
          return {
            success: false,
            error: `An instance with URL "${normalizedUrl}" already exists`
          };
        }

        // Create new instance with generated UUID
        const newInstance: GitLabInstance = {
          id: randomUUID(),
          name: instance.name.trim(),
          url: normalizedUrl,
          token: instance.token,
          authMethod: instance.authMethod || 'pat',
          username: instance.username,
          isDefault: instance.isDefault || gitlabInstances.length === 0 // First instance is default
        };

        // If this is marked as default, unset other defaults
        if (newInstance.isDefault) {
          gitlabInstances.forEach((i) => {
            i.isDefault = false;
          });
        }

        gitlabInstances.push(newInstance);
        settings.gitlabInstances = gitlabInstances;

        writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        return { success: true, data: newInstance };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add GitLab instance'
        };
      }
    }
  );

  /**
   * US#24: Update GitLab Instance
   * Updates an existing instance by ID
   */
  ipcMain.handle(
    IPC_CHANNELS.SOURCE_CONTROL_UPDATE_GITLAB_INSTANCE,
    async (_, id: string, updates: Partial<Omit<GitLabInstance, 'id'>>): Promise<IPCResult<GitLabInstance>> => {
      try {
        if (!id) {
          return { success: false, error: 'Instance ID is required' };
        }

        const savedSettings = readSettingsFile();
        const settings: AppSettings = { ...DEFAULT_APP_SETTINGS, ...savedSettings };
        const gitlabInstances = settings.gitlabInstances || [];

        const instanceIndex = gitlabInstances.findIndex((i) => i.id === id);
        if (instanceIndex === -1) {
          return { success: false, error: `Instance with ID "${id}" not found` };
        }

        const existingInstance = gitlabInstances[instanceIndex];

        // Normalize URL if provided
        if (updates.url) {
          const normalizedUrl = normalizeInstanceUrl(updates.url);
          // Check for duplicate URL (excluding current instance)
          const duplicateInstance = gitlabInstances.find(
            (i) => i.id !== id && normalizeInstanceUrl(i.url) === normalizedUrl
          );
          if (duplicateInstance) {
            return {
              success: false,
              error: `An instance with URL "${normalizedUrl}" already exists`
            };
          }
          updates.url = normalizedUrl;
        }

        // If setting this as default, unset other defaults
        if (updates.isDefault === true) {
          gitlabInstances.forEach((i) => {
            if (i.id !== id) {
              i.isDefault = false;
            }
          });
        }

        // Apply updates
        const updatedInstance: GitLabInstance = {
          ...existingInstance,
          ...updates,
          id // Ensure ID is not changed
        };

        gitlabInstances[instanceIndex] = updatedInstance;
        settings.gitlabInstances = gitlabInstances;

        writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        return { success: true, data: updatedInstance };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update GitLab instance'
        };
      }
    }
  );

  /**
   * US#25: Remove GitLab Instance
   * Deletes an instance by ID
   * Note: Caller should handle updating project references that used this instance
   */
  ipcMain.handle(
    IPC_CHANNELS.SOURCE_CONTROL_REMOVE_GITLAB_INSTANCE,
    async (_, id: string): Promise<IPCResult<{ removedId: string; affectedProjects: string[] }>> => {
      try {
        if (!id) {
          return { success: false, error: 'Instance ID is required' };
        }

        const savedSettings = readSettingsFile();
        const settings: AppSettings = { ...DEFAULT_APP_SETTINGS, ...savedSettings };
        const gitlabInstances = settings.gitlabInstances || [];

        const instanceIndex = gitlabInstances.findIndex((i) => i.id === id);
        if (instanceIndex === -1) {
          return { success: false, error: `Instance with ID "${id}" not found` };
        }

        const removedInstance = gitlabInstances[instanceIndex];
        const wasDefault = removedInstance.isDefault;

        // Remove the instance
        gitlabInstances.splice(instanceIndex, 1);

        // If this was the default and there are other instances, make the first one default
        if (wasDefault && gitlabInstances.length > 0) {
          gitlabInstances[0].isDefault = true;
        }

        settings.gitlabInstances = gitlabInstances;
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        // Note: affectedProjects would require scanning all projects for references
        // For now, return empty array - the UI layer should handle this separately
        return {
          success: true,
          data: {
            removedId: id,
            affectedProjects: [] // TODO: Implement project scanning if needed
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to remove GitLab instance'
        };
      }
    }
  );

  /**
   * US#26: Get Token For Project
   * Resolves the appropriate token based on provider and sourceControl config
   */
  ipcMain.handle(
    IPC_CHANNELS.SOURCE_CONTROL_GET_TOKEN_FOR_PROJECT,
    async (_, sourceControl: ProjectSourceControl | undefined): Promise<IPCResult<TokenForProjectResult>> => {
      try {
        const savedSettings = readSettingsFile();
        const settings: AppSettings = { ...DEFAULT_APP_SETTINGS, ...savedSettings };

        // No source control configured
        if (!sourceControl || sourceControl.provider === 'none') {
          return {
            success: true,
            data: { provider: 'none', error: 'No source control provider configured' }
          };
        }

        // GitHub provider
        if (sourceControl.provider === 'github') {
          const githubConfig = settings.github as GitHubGlobalConfig | undefined;
          if (!githubConfig?.token) {
            return {
              success: true,
              data: { provider: 'github', error: 'No GitHub token configured in global settings' }
            };
          }
          return {
            success: true,
            data: {
              provider: 'github',
              token: githubConfig.token
            }
          };
        }

        // GitLab provider
        if (sourceControl.provider === 'gitlab') {
          const gitlabInstances = settings.gitlabInstances || [];

          // If a specific instance ID is specified, use it
          if (sourceControl.gitlabInstanceId) {
            const instance = gitlabInstances.find((i) => i.id === sourceControl.gitlabInstanceId);
            if (!instance) {
              return {
                success: true,
                data: {
                  provider: 'gitlab',
                  instanceId: sourceControl.gitlabInstanceId,
                  error: 'Configured GitLab instance not found'
                }
              };
            }
            if (!instance.token) {
              return {
                success: true,
                data: {
                  provider: 'gitlab',
                  instanceId: instance.id,
                  error: `No token configured for GitLab instance "${instance.name}"`
                }
              };
            }
            return {
              success: true,
              data: {
                provider: 'gitlab',
                token: instance.token,
                instanceId: instance.id
              }
            };
          }

          // No specific instance, try to find default
          const defaultInstance = gitlabInstances.find((i) => i.isDefault);
          if (defaultInstance?.token) {
            return {
              success: true,
              data: {
                provider: 'gitlab',
                token: defaultInstance.token,
                instanceId: defaultInstance.id
              }
            };
          }

          // Fallback to first instance with a token
          const instanceWithToken = gitlabInstances.find((i) => i.token);
          if (instanceWithToken) {
            return {
              success: true,
              data: {
                provider: 'gitlab',
                token: instanceWithToken.token,
                instanceId: instanceWithToken.id
              }
            };
          }

          return {
            success: true,
            data: {
              provider: 'gitlab',
              error: 'No GitLab instance with token configured'
            }
          };
        }

        return {
          success: true,
          data: {
            provider: sourceControl.provider,
            error: `Unknown provider: ${sourceControl.provider}`
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get token for project'
        };
      }
    }
  );
}
