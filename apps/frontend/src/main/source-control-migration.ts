/**
 * Source Control Migration Script (US#60-67)
 *
 * Migrates from per-project GitHub/GitLab tokens to:
 * - Global GitHub configuration (AppSettings.github)
 * - GitLab instances array (AppSettings.gitlabInstances)
 * - Per-project sourceControl configuration
 *
 * This migration runs once at startup and is tracked by:
 * AppSettings.migrationCompleted.sourceControlV2
 */

import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
  AppSettings,
  GitHubGlobalConfig,
  GitLabInstance,
  ProjectSourceControl,
  SourceControlProvider
} from '../shared/types';
import { projectStore } from './project-store';
import { parseEnvFile } from './ipc-handlers/utils';

// ============================================
// Types
// ============================================

interface MigrationLog {
  timestamp: string;
  version: string;
  actions: string[];
  warnings: string[];
  errors: string[];
}

interface ProjectMigrationData {
  projectId: string;
  projectName: string;
  projectPath: string;
  githubToken?: string;
  githubRepo?: string;
  gitlabToken?: string;
  gitlabInstanceUrl?: string;
  gitlabProject?: string;
}

interface MigrationResult {
  success: boolean;
  migrated: boolean;
  log: MigrationLog;
}

// ============================================
// Constants
// ============================================

const MIGRATION_VERSION = 'sourceControlV2';
const BACKUP_DIR_NAME = 'migration-backups';
const DEFAULT_GITLAB_URL = 'https://gitlab.com';

// ============================================
// Utility Functions (US#67 - Logging)
// ============================================

function createMigrationLog(): MigrationLog {
  return {
    timestamp: new Date().toISOString(),
    version: MIGRATION_VERSION,
    actions: [],
    warnings: [],
    errors: []
  };
}

function logAction(log: MigrationLog, message: string): void {
  log.actions.push(message);
  console.log(`[Migration] ${message}`);
}

function logWarning(log: MigrationLog, message: string): void {
  log.warnings.push(message);
  console.warn(`[Migration] WARNING: ${message}`);
}

function logError(log: MigrationLog, message: string): void {
  log.errors.push(message);
  console.error(`[Migration] ERROR: ${message}`);
}

// ============================================
// US#61 - Backup Before Migration
// ============================================

function getBackupDir(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, BACKUP_DIR_NAME);
}

function createBackup(log: MigrationLog): boolean {
  const backupDir = getBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupSubDir = path.join(backupDir, `${MIGRATION_VERSION}-${timestamp}`);

  try {
    // Create backup directory
    if (!existsSync(backupSubDir)) {
      mkdirSync(backupSubDir, { recursive: true });
    }

    // Backup settings.json
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    if (existsSync(settingsPath)) {
      copyFileSync(settingsPath, path.join(backupSubDir, 'settings.json'));
      logAction(log, `Backed up settings.json to ${backupSubDir}`);
    }

    // Backup projects.json
    const projectsPath = path.join(app.getPath('userData'), 'store', 'projects.json');
    if (existsSync(projectsPath)) {
      copyFileSync(projectsPath, path.join(backupSubDir, 'projects.json'));
      logAction(log, `Backed up projects.json to ${backupSubDir}`);
    }

    // Save migration log
    const logPath = path.join(backupSubDir, 'migration-log.json');
    writeFileSync(logPath, JSON.stringify(log, null, 2));

    return true;
  } catch (error) {
    logError(log, `Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}

// ============================================
// Data Collection from Projects
// ============================================

function collectProjectData(log: MigrationLog): ProjectMigrationData[] {
  const projects = projectStore.getProjects();
  const projectData: ProjectMigrationData[] = [];

  for (const project of projects) {
    if (!project.autoBuildPath) {
      logWarning(log, `Project "${project.name}" has no autoBuildPath, skipping`);
      continue;
    }

    const envPath = path.join(project.path, project.autoBuildPath, '.env');
    if (!existsSync(envPath)) {
      logAction(log, `Project "${project.name}" has no .env file, skipping`);
      continue;
    }

    try {
      const content = readFileSync(envPath, 'utf-8');
      const vars = parseEnvFile(content);

      const data: ProjectMigrationData = {
        projectId: project.id,
        projectName: project.name,
        projectPath: project.path
      };

      // Collect GitHub data
      if (vars['GITHUB_TOKEN']) {
        data.githubToken = vars['GITHUB_TOKEN'];
        data.githubRepo = vars['GITHUB_REPO'];
        logAction(log, `Found GitHub token in project "${project.name}"`);
      }

      // Collect GitLab data
      if (vars['GITLAB_TOKEN']) {
        data.gitlabToken = vars['GITLAB_TOKEN'];
        data.gitlabInstanceUrl = vars['GITLAB_INSTANCE_URL'] || DEFAULT_GITLAB_URL;
        data.gitlabProject = vars['GITLAB_PROJECT'];
        logAction(log, `Found GitLab token in project "${project.name}" for ${data.gitlabInstanceUrl}`);
      }

      projectData.push(data);
    } catch (error) {
      logError(log, `Failed to read .env for project "${project.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return projectData;
}

// ============================================
// US#62 - Migrate GitHub Tokens to Global Settings
// ============================================

function migrateGitHubTokens(
  settings: AppSettings,
  projectData: ProjectMigrationData[],
  log: MigrationLog
): void {
  // Collect unique GitHub tokens
  const githubTokens = new Map<string, string[]>(); // token -> project names

  for (const data of projectData) {
    if (data.githubToken) {
      const projectNames = githubTokens.get(data.githubToken) || [];
      projectNames.push(data.projectName);
      githubTokens.set(data.githubToken, projectNames);
    }
  }

  if (githubTokens.size === 0) {
    logAction(log, 'No GitHub tokens found in projects');
    return;
  }

  // Warn if multiple different tokens found
  if (githubTokens.size > 1) {
    logWarning(log, `Found ${githubTokens.size} different GitHub tokens across projects. Using the most common one.`);
    for (const [token, projects] of githubTokens) {
      logWarning(log, `  Token ending in ...${token.slice(-4)} used by: ${projects.join(', ')}`);
    }
  }

  // Use the token with the most projects, or the first one
  let selectedToken = '';
  let maxProjects = 0;
  for (const [token, projects] of githubTokens) {
    if (projects.length > maxProjects) {
      selectedToken = token;
      maxProjects = projects.length;
    }
  }

  // Only set if not already configured
  if (!settings.github?.token) {
    settings.github = {
      token: selectedToken,
      authMethod: 'pat', // Migrated tokens are PATs
      username: undefined // Will be populated on first connection test
    };
    logAction(log, `Migrated GitHub token to global settings (used by ${maxProjects} project(s))`);
  } else {
    logAction(log, 'GitHub global config already exists, skipping token migration');
  }
}

// ============================================
// US#63 - Migrate GitLab Tokens to Instances
// ============================================

function normalizeGitLabUrl(url: string): string {
  // Remove trailing slashes and normalize to lowercase
  return url.replace(/\/+$/, '').toLowerCase();
}

function migrateGitLabTokens(
  settings: AppSettings,
  projectData: ProjectMigrationData[],
  log: MigrationLog
): Map<string, string> {
  // Map from normalized URL to instance ID (for project migration)
  const urlToInstanceId = new Map<string, string>();

  // Group tokens by instance URL
  const instanceTokens = new Map<string, { token: string; projects: string[] }[]>();

  for (const data of projectData) {
    if (data.gitlabToken && data.gitlabInstanceUrl) {
      const normalizedUrl = normalizeGitLabUrl(data.gitlabInstanceUrl);
      const tokens = instanceTokens.get(normalizedUrl) || [];

      // Check if this exact token already exists
      const existingEntry = tokens.find(t => t.token === data.gitlabToken);
      if (existingEntry) {
        existingEntry.projects.push(data.projectName);
      } else {
        tokens.push({ token: data.gitlabToken, projects: [data.projectName] });
      }

      instanceTokens.set(normalizedUrl, tokens);
    }
  }

  if (instanceTokens.size === 0) {
    logAction(log, 'No GitLab tokens found in projects');
    return urlToInstanceId;
  }

  // Initialize gitlabInstances if not exists
  if (!settings.gitlabInstances) {
    settings.gitlabInstances = [];
  }

  // Process each instance URL
  for (const [normalizedUrl, tokens] of instanceTokens) {
    // Check if instance already exists
    const existingInstance = settings.gitlabInstances.find(
      inst => normalizeGitLabUrl(inst.url) === normalizedUrl
    );

    if (existingInstance) {
      urlToInstanceId.set(normalizedUrl, existingInstance.id);
      logAction(log, `GitLab instance for ${normalizedUrl} already exists (id: ${existingInstance.id})`);
      continue;
    }

    // Warn if multiple different tokens for same instance
    if (tokens.length > 1) {
      logWarning(log, `Found ${tokens.length} different GitLab tokens for ${normalizedUrl}. Using the most common one.`);
      for (const tokenEntry of tokens) {
        logWarning(log, `  Token ending in ...${tokenEntry.token.slice(-4)} used by: ${tokenEntry.projects.join(', ')}`);
      }
    }

    // Use the token with the most projects
    let selectedToken = tokens[0];
    for (const tokenEntry of tokens) {
      if (tokenEntry.projects.length > selectedToken.projects.length) {
        selectedToken = tokenEntry;
      }
    }

    // Create new instance
    const instanceId = uuidv4();
    const isGitLabCom = normalizedUrl === normalizeGitLabUrl(DEFAULT_GITLAB_URL);

    const newInstance: GitLabInstance = {
      id: instanceId,
      name: isGitLabCom ? 'GitLab.com' : `GitLab (${new URL(normalizedUrl).hostname})`,
      url: normalizedUrl.startsWith('https://') ? normalizedUrl : `https://${normalizedUrl}`,
      token: selectedToken.token,
      authMethod: 'pat',
      username: undefined,
      isDefault: isGitLabCom && settings.gitlabInstances.length === 0
    };

    settings.gitlabInstances.push(newInstance);
    urlToInstanceId.set(normalizedUrl, instanceId);

    logAction(log, `Created GitLab instance "${newInstance.name}" (id: ${instanceId}) with token from ${selectedToken.projects.length} project(s)`);
  }

  return urlToInstanceId;
}

// ============================================
// US#64 - Create sourceControl for Each Project
// ============================================

function createProjectSourceControl(
  projectData: ProjectMigrationData[],
  settings: AppSettings,
  gitlabUrlToInstanceId: Map<string, string>,
  log: MigrationLog
): Map<string, ProjectSourceControl> {
  const projectSourceControls = new Map<string, ProjectSourceControl>();

  for (const data of projectData) {
    // Determine provider
    let provider: SourceControlProvider = 'none';
    let gitlabInstanceId: string | undefined;

    if (data.githubToken && data.githubRepo) {
      provider = 'github';
    } else if (data.gitlabToken && data.gitlabProject) {
      provider = 'gitlab';
      if (data.gitlabInstanceUrl) {
        const normalizedUrl = normalizeGitLabUrl(data.gitlabInstanceUrl);
        gitlabInstanceId = gitlabUrlToInstanceId.get(normalizedUrl);
      }
    }

    if (provider === 'none') {
      logAction(log, `Project "${data.projectName}" has no valid source control config, skipping`);
      continue;
    }

    // Parse owner/repo from the stored format
    let owner: string | undefined;
    let repo: string | undefined;

    if (provider === 'github' && data.githubRepo) {
      const parts = data.githubRepo.split('/');
      if (parts.length >= 2) {
        owner = parts[0];
        repo = parts.slice(1).join('/'); // Handle nested paths
      }
    } else if (provider === 'gitlab' && data.gitlabProject) {
      const parts = data.gitlabProject.split('/');
      if (parts.length >= 2) {
        // For GitLab, owner can be group/subgroup
        repo = parts[parts.length - 1];
        owner = parts.slice(0, -1).join('/');
      } else {
        // Numeric ID or single-level path
        repo = data.gitlabProject;
      }
    }

    const sourceControl: ProjectSourceControl = {
      provider,
      owner,
      repo,
      gitlabInstanceId,
      syncIssues: true, // Enable by default for migrated projects
      syncPullRequests: true, // Enable by default for migrated projects
      autoDetectedAt: new Date().toISOString()
    };

    projectSourceControls.set(data.projectId, sourceControl);
    logAction(log, `Created sourceControl for project "${data.projectName}": ${provider} ${owner}/${repo}`);
  }

  return projectSourceControls;
}

// ============================================
// US#65 - Migration Flag
// ============================================

interface MigrationFlags {
  sourceControlV2?: boolean;
}

function checkMigrationCompleted(settings: Record<string, unknown>): boolean {
  const migrationCompleted = settings.migrationCompleted as MigrationFlags | undefined;
  return migrationCompleted?.sourceControlV2 === true;
}

function setMigrationCompleted(settings: Record<string, unknown>): void {
  if (!settings.migrationCompleted) {
    settings.migrationCompleted = {};
  }
  (settings.migrationCompleted as MigrationFlags).sourceControlV2 = true;
}

// ============================================
// Save Project sourceControl to .env files
// ============================================

function saveProjectSourceControls(
  projectSourceControls: Map<string, ProjectSourceControl>,
  log: MigrationLog
): void {
  const projects = projectStore.getProjects();

  for (const project of projects) {
    const sourceControl = projectSourceControls.get(project.id);
    if (!sourceControl || !project.autoBuildPath) continue;

    const envPath = path.join(project.path, project.autoBuildPath, '.env');

    try {
      let content = '';
      if (existsSync(envPath)) {
        content = readFileSync(envPath, 'utf-8');
      }

      // Parse existing vars
      const vars = parseEnvFile(content);

      // Add sourceControl as JSON (for persistence)
      vars['SOURCE_CONTROL_CONFIG'] = JSON.stringify(sourceControl);

      // Regenerate .env content with new SOURCE_CONTROL_CONFIG
      // We'll append it if not already in template
      if (!content.includes('SOURCE_CONTROL_CONFIG')) {
        content += `
# =============================================================================
# SOURCE CONTROL (V2 - Unified Configuration)
# =============================================================================
SOURCE_CONTROL_CONFIG=${vars['SOURCE_CONTROL_CONFIG']}
`;
        writeFileSync(envPath, content);
        logAction(log, `Saved sourceControl to .env for project "${project.name}"`);
      }
    } catch (error) {
      logError(log, `Failed to save sourceControl for project "${project.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// ============================================
// Main Migration Function (US#60)
// ============================================

export async function runSourceControlMigration(
  currentSettings: Record<string, unknown>
): Promise<MigrationResult> {
  const log = createMigrationLog();

  // Check if migration already completed (US#65)
  if (checkMigrationCompleted(currentSettings)) {
    logAction(log, 'Migration already completed, skipping');
    return { success: true, migrated: false, log };
  }

  logAction(log, 'Starting source control migration (V2)');

  // US#61 - Create backup before migration
  const backupSuccess = createBackup(log);
  if (!backupSuccess) {
    logError(log, 'Backup failed, aborting migration');
    return { success: false, migrated: false, log };
  }

  try {
    // Collect data from all projects
    const projectData = collectProjectData(log);

    if (projectData.length === 0) {
      logAction(log, 'No projects with source control data found');
      setMigrationCompleted(currentSettings);
      return { success: true, migrated: true, log };
    }

    // Cast to AppSettings for type safety
    const settings = currentSettings as unknown as AppSettings;

    // US#62 - Migrate GitHub tokens
    migrateGitHubTokens(settings, projectData, log);

    // US#63 - Migrate GitLab tokens to instances
    const gitlabUrlToInstanceId = migrateGitLabTokens(settings, projectData, log);

    // US#64 - Create sourceControl for each project
    const projectSourceControls = createProjectSourceControl(
      projectData,
      settings,
      gitlabUrlToInstanceId,
      log
    );

    // Save sourceControl to project .env files
    saveProjectSourceControls(projectSourceControls, log);

    // US#65 - Set migration flag
    setMigrationCompleted(currentSettings);

    logAction(log, 'Migration completed successfully');

    // Save final migration log
    const backupDir = getBackupDir();
    const logPath = path.join(backupDir, `${MIGRATION_VERSION}-final-log.json`);
    try {
      if (!existsSync(backupDir)) {
        mkdirSync(backupDir, { recursive: true });
      }
      writeFileSync(logPath, JSON.stringify(log, null, 2));
    } catch {
      // Non-critical, just log
      console.warn('[Migration] Could not save final migration log');
    }

    return { success: true, migrated: true, log };
  } catch (error) {
    logError(log, `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { success: false, migrated: false, log };
  }
}

// ============================================
// US#66 - Compatibility Getters
// ============================================

/**
 * Get GitHub token for a project.
 * First checks global settings, then falls back to project .env
 */
export function getGitHubTokenForProject(
  globalSettings: AppSettings,
  projectEnvVars: Record<string, string>
): string | undefined {
  // New: Global GitHub token
  if (globalSettings.github?.token) {
    return globalSettings.github.token;
  }
  // Legacy: Project-specific token
  return projectEnvVars['GITHUB_TOKEN'];
}

/**
 * Get GitLab token for a project.
 * Looks up the appropriate instance token, then falls back to project .env
 */
export function getGitLabTokenForProject(
  globalSettings: AppSettings,
  projectEnvVars: Record<string, string>,
  instanceUrl?: string
): string | undefined {
  // Try to find matching instance
  if (globalSettings.gitlabInstances && instanceUrl) {
    const normalizedUrl = normalizeGitLabUrl(instanceUrl);
    const instance = globalSettings.gitlabInstances.find(
      inst => normalizeGitLabUrl(inst.url) === normalizedUrl
    );
    if (instance?.token) {
      return instance.token;
    }
  }

  // Try default instance
  if (globalSettings.gitlabInstances) {
    const defaultInstance = globalSettings.gitlabInstances.find(inst => inst.isDefault);
    if (defaultInstance?.token) {
      return defaultInstance.token;
    }
  }

  // Legacy: Project-specific token
  return projectEnvVars['GITLAB_TOKEN'];
}

/**
 * Get sourceControl config for a project.
 * Parses from .env SOURCE_CONTROL_CONFIG or builds from legacy fields
 */
export function getSourceControlForProject(
  projectEnvVars: Record<string, string>
): ProjectSourceControl | undefined {
  // New: Parse from SOURCE_CONTROL_CONFIG
  if (projectEnvVars['SOURCE_CONTROL_CONFIG']) {
    try {
      return JSON.parse(projectEnvVars['SOURCE_CONTROL_CONFIG']) as ProjectSourceControl;
    } catch {
      // Invalid JSON, fall through to legacy
    }
  }

  // Legacy: Build from old fields
  const hasGitHub = !!projectEnvVars['GITHUB_TOKEN'] && !!projectEnvVars['GITHUB_REPO'];
  const hasGitLab = !!projectEnvVars['GITLAB_TOKEN'] && !!projectEnvVars['GITLAB_PROJECT'];

  if (!hasGitHub && !hasGitLab) {
    return undefined;
  }

  if (hasGitHub) {
    const parts = (projectEnvVars['GITHUB_REPO'] || '').split('/');
    return {
      provider: 'github',
      owner: parts[0],
      repo: parts.slice(1).join('/'),
      syncIssues: projectEnvVars['GITHUB_AUTO_SYNC']?.toLowerCase() === 'true',
      syncPullRequests: projectEnvVars['GITHUB_AUTO_SYNC']?.toLowerCase() === 'true'
    };
  }

  if (hasGitLab) {
    const project = projectEnvVars['GITLAB_PROJECT'] || '';
    const parts = project.split('/');
    return {
      provider: 'gitlab',
      owner: parts.slice(0, -1).join('/'),
      repo: parts[parts.length - 1] || project,
      syncIssues: projectEnvVars['GITLAB_AUTO_SYNC']?.toLowerCase() === 'true',
      syncPullRequests: projectEnvVars['GITLAB_AUTO_SYNC']?.toLowerCase() === 'true'
    };
  }

  return undefined;
}
