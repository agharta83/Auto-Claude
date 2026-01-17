/**
 * Source Control Preload API
 * Exposes source control management functions to the renderer process
 */

import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  IPCResult,
  GitLabInstance,
  ProjectSourceControl
} from '../../shared/types';

// ============================================
// Result types (matching handler types)
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
  provider: 'github' | 'gitlab' | 'none';
  instanceId?: string;
  error?: string;
}

// ============================================
// API Interface
// ============================================

export interface SourceControlAPI {
  /**
   * US#20: Test GitHub connection
   * Validates a GitHub token and returns the associated username
   */
  testGitHubConnection: (token: string) => Promise<IPCResult<GitHubConnectionResult>>;

  /**
   * US#21: Test GitLab connection
   * Validates a GitLab token on a specific instance
   */
  testGitLabConnection: (instanceUrl: string, token: string) => Promise<IPCResult<GitLabConnectionResult>>;

  /**
   * US#22: List GitLab instances
   * Returns all configured GitLab instances from global settings
   */
  listGitLabInstances: () => Promise<IPCResult<GitLabInstance[]>>;

  /**
   * US#23: Add GitLab instance
   * Creates a new GitLab instance configuration
   */
  addGitLabInstance: (instance: Omit<GitLabInstance, 'id'>) => Promise<IPCResult<GitLabInstance>>;

  /**
   * US#24: Update GitLab instance
   * Updates an existing GitLab instance by ID
   */
  updateGitLabInstance: (id: string, updates: Partial<Omit<GitLabInstance, 'id'>>) => Promise<IPCResult<GitLabInstance>>;

  /**
   * US#25: Remove GitLab instance
   * Deletes a GitLab instance by ID
   */
  removeGitLabInstance: (id: string) => Promise<IPCResult<{ removedId: string; affectedProjects: string[] }>>;

  /**
   * US#26: Get token for project
   * Resolves the appropriate token based on project's source control configuration
   */
  getTokenForProject: (sourceControl: ProjectSourceControl | undefined) => Promise<IPCResult<TokenForProjectResult>>;
}

// ============================================
// API Implementation
// ============================================

export const createSourceControlAPI = (): SourceControlAPI => ({
  testGitHubConnection: (token: string): Promise<IPCResult<GitHubConnectionResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SOURCE_CONTROL_TEST_GITHUB, token),

  testGitLabConnection: (instanceUrl: string, token: string): Promise<IPCResult<GitLabConnectionResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SOURCE_CONTROL_TEST_GITLAB, instanceUrl, token),

  listGitLabInstances: (): Promise<IPCResult<GitLabInstance[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SOURCE_CONTROL_LIST_GITLAB_INSTANCES),

  addGitLabInstance: (instance: Omit<GitLabInstance, 'id'>): Promise<IPCResult<GitLabInstance>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SOURCE_CONTROL_ADD_GITLAB_INSTANCE, instance),

  updateGitLabInstance: (id: string, updates: Partial<Omit<GitLabInstance, 'id'>>): Promise<IPCResult<GitLabInstance>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SOURCE_CONTROL_UPDATE_GITLAB_INSTANCE, id, updates),

  removeGitLabInstance: (id: string): Promise<IPCResult<{ removedId: string; affectedProjects: string[] }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SOURCE_CONTROL_REMOVE_GITLAB_INSTANCE, id),

  getTokenForProject: (sourceControl: ProjectSourceControl | undefined): Promise<IPCResult<TokenForProjectResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SOURCE_CONTROL_GET_TOKEN_FOR_PROJECT, sourceControl)
});
