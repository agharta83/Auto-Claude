/**
 * Tests for Source Control Migration
 * US#81: Tests unitaires migration - Cas nominal + cas edge
 * US#82: Tests unitaires getTokenForProject - GitHub, GitLab, fallback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AppSettings, GitLabInstance, ProjectSourceControl } from '../../shared/types';

// Mock electron and fs before importing the module
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData')
  }
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn()
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-12345')
}));

vi.mock('../project-store', () => ({
  projectStore: {
    getProjects: vi.fn(() => [])
  }
}));

vi.mock('../ipc-handlers/utils', () => ({
  parseEnvFile: vi.fn((content: string) => {
    const result: Record<string, string> = {};
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          result[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
    return result;
  })
}));

// Import fs and project-store AFTER mocks are set up (hoisted)
import * as fs from 'fs';
import { projectStore } from '../project-store';
// Import the module under test - mocks will be applied
import {
  runSourceControlMigration,
  getGitHubTokenForProject,
  getGitLabTokenForProject,
  getSourceControlForProject
} from '../source-control-migration';

describe('Source Control Migration - Compatibility Getters (US#66/82)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getGitHubTokenForProject', () => {
    it('returns global GitHub token when available', () => {
      const settings: AppSettings = {
        theme: 'dark',
        defaultModel: 'claude-3',
        agentFramework: 'auto-claude',
        autoUpdateAutoBuild: false,
        autoNameTerminals: false,
        notifications: { enabled: true, desktop: true, sound: false },
        github: {
          token: 'global-gh-token',
          authMethod: 'pat',
          username: 'testuser'
        }
      };
      const envVars = { GITHUB_TOKEN: 'project-gh-token' };

      const result = getGitHubTokenForProject(settings, envVars);
      expect(result).toBe('global-gh-token');
    });

    it('falls back to project env var when no global token', () => {
      const settings: AppSettings = {
        theme: 'dark',
        defaultModel: 'claude-3',
        agentFramework: 'auto-claude',
        autoUpdateAutoBuild: false,
        autoNameTerminals: false,
        notifications: { enabled: true, desktop: true, sound: false }
      };
      const envVars = { GITHUB_TOKEN: 'project-gh-token' };

      const result = getGitHubTokenForProject(settings, envVars);
      expect(result).toBe('project-gh-token');
    });

    it('returns undefined when no token available', () => {
      const settings: AppSettings = {
        theme: 'dark',
        defaultModel: 'claude-3',
        agentFramework: 'auto-claude',
        autoUpdateAutoBuild: false,
        autoNameTerminals: false,
        notifications: { enabled: true, desktop: true, sound: false }
      };
      const envVars = {};

      const result = getGitHubTokenForProject(settings, envVars);
      expect(result).toBeUndefined();
    });

    it('prefers global token over project token', () => {
      const settings: AppSettings = {
        theme: 'dark',
        defaultModel: 'claude-3',
        agentFramework: 'auto-claude',
        autoUpdateAutoBuild: false,
        autoNameTerminals: false,
        notifications: { enabled: true, desktop: true, sound: false },
        github: {
          token: 'global-token',
          authMethod: 'pat'
        }
      };
      const envVars = { GITHUB_TOKEN: 'project-token' };

      const result = getGitHubTokenForProject(settings, envVars);
      expect(result).toBe('global-token');
    });
  });

  describe('getGitLabTokenForProject', () => {
    const createSettings = (instances: GitLabInstance[] = []): AppSettings => ({
      theme: 'dark',
      defaultModel: 'claude-3',
      agentFramework: 'auto-claude',
      autoUpdateAutoBuild: false,
      autoNameTerminals: false,
      notifications: { enabled: true, desktop: true, sound: false },
      gitlabInstances: instances
    });

    it('returns token from matching instance by URL', () => {
      const settings = createSettings([
        {
          id: 'instance-1',
          name: 'GitLab.com',
          url: 'https://gitlab.com',
          token: 'gitlab-com-token',
          authMethod: 'pat',
          isDefault: true
        },
        {
          id: 'instance-2',
          name: 'Company GitLab',
          url: 'https://gitlab.company.com',
          token: 'company-gitlab-token',
          authMethod: 'pat'
        }
      ]);
      const envVars = { GITLAB_TOKEN: 'project-token' };

      const result = getGitLabTokenForProject(settings, envVars, 'https://gitlab.company.com');
      expect(result).toBe('company-gitlab-token');
    });

    it('normalizes URL for matching (trailing slash, case)', () => {
      const settings = createSettings([
        {
          id: 'instance-1',
          name: 'GitLab.com',
          url: 'https://gitlab.com/',
          token: 'gitlab-token',
          authMethod: 'pat',
          isDefault: true
        }
      ]);
      const envVars = {};

      const result = getGitLabTokenForProject(settings, envVars, 'HTTPS://GITLAB.COM');
      expect(result).toBe('gitlab-token');
    });

    it('falls back to default instance when no URL match', () => {
      const settings = createSettings([
        {
          id: 'instance-1',
          name: 'GitLab.com',
          url: 'https://gitlab.com',
          token: 'default-token',
          authMethod: 'pat',
          isDefault: true
        }
      ]);
      const envVars = { GITLAB_TOKEN: 'project-token' };

      // No instanceUrl provided, should use default
      const result = getGitLabTokenForProject(settings, envVars);
      expect(result).toBe('default-token');
    });

    it('falls back to project env var when no instances configured', () => {
      const settings = createSettings([]);
      const envVars = { GITLAB_TOKEN: 'project-gitlab-token' };

      const result = getGitLabTokenForProject(settings, envVars, 'https://gitlab.com');
      expect(result).toBe('project-gitlab-token');
    });

    it('returns undefined when no token available', () => {
      const settings = createSettings([]);
      const envVars = {};

      const result = getGitLabTokenForProject(settings, envVars);
      expect(result).toBeUndefined();
    });

    it('handles instance without token', () => {
      const settings = createSettings([
        {
          id: 'instance-1',
          name: 'GitLab.com',
          url: 'https://gitlab.com',
          authMethod: 'pat',
          isDefault: true
          // No token
        }
      ]);
      const envVars = { GITLAB_TOKEN: 'fallback-token' };

      const result = getGitLabTokenForProject(settings, envVars, 'https://gitlab.com');
      expect(result).toBe('fallback-token');
    });
  });

  describe('getSourceControlForProject', () => {
    it('parses SOURCE_CONTROL_CONFIG JSON when available', () => {
      const sourceControl: ProjectSourceControl = {
        provider: 'github',
        owner: 'testowner',
        repo: 'testrepo',
        syncIssues: true,
        syncPullRequests: false
      };
      const envVars = {
        SOURCE_CONTROL_CONFIG: JSON.stringify(sourceControl)
      };

      const result = getSourceControlForProject(envVars);
      expect(result).toEqual(sourceControl);
    });

    it('handles invalid JSON in SOURCE_CONTROL_CONFIG gracefully', () => {
      const envVars = {
        SOURCE_CONTROL_CONFIG: 'not-valid-json',
        GITHUB_TOKEN: 'token',
        GITHUB_REPO: 'owner/repo'
      };

      const result = getSourceControlForProject(envVars);
      // Should fall back to legacy parsing
      expect(result?.provider).toBe('github');
      expect(result?.owner).toBe('owner');
      expect(result?.repo).toBe('repo');
    });

    it('builds GitHub config from legacy fields', () => {
      const envVars = {
        GITHUB_TOKEN: 'gh-token',
        GITHUB_REPO: 'myorg/myrepo',
        GITHUB_AUTO_SYNC: 'true'
      };

      const result = getSourceControlForProject(envVars);
      expect(result).toEqual({
        provider: 'github',
        owner: 'myorg',
        repo: 'myrepo',
        syncIssues: true,
        syncPullRequests: true
      });
    });

    it('builds GitLab config from legacy fields', () => {
      const envVars = {
        GITLAB_TOKEN: 'gl-token',
        GITLAB_PROJECT: 'group/subgroup/project',
        GITLAB_AUTO_SYNC: 'true'
      };

      const result = getSourceControlForProject(envVars);
      expect(result).toEqual({
        provider: 'gitlab',
        owner: 'group/subgroup',
        repo: 'project',
        syncIssues: true,
        syncPullRequests: true
      });
    });

    it('handles single-level GitLab project', () => {
      const envVars = {
        GITLAB_TOKEN: 'gl-token',
        GITLAB_PROJECT: 'simple-project'
      };

      const result = getSourceControlForProject(envVars);
      expect(result).toEqual({
        provider: 'gitlab',
        owner: '',
        repo: 'simple-project',
        syncIssues: false,
        syncPullRequests: false
      });
    });

    it('prefers GitHub when both configured', () => {
      const envVars = {
        GITHUB_TOKEN: 'gh-token',
        GITHUB_REPO: 'owner/repo',
        GITLAB_TOKEN: 'gl-token',
        GITLAB_PROJECT: 'group/project'
      };

      const result = getSourceControlForProject(envVars);
      expect(result?.provider).toBe('github');
    });

    it('returns undefined when no source control configured', () => {
      const envVars = {
        SOME_OTHER_VAR: 'value'
      };

      const result = getSourceControlForProject(envVars);
      expect(result).toBeUndefined();
    });

    it('returns undefined when token but no repo configured', () => {
      const envVars = {
        GITHUB_TOKEN: 'token-without-repo'
      };

      const result = getSourceControlForProject(envVars);
      expect(result).toBeUndefined();
    });

    it('handles auto_sync false correctly', () => {
      const envVars = {
        GITHUB_TOKEN: 'token',
        GITHUB_REPO: 'owner/repo',
        GITHUB_AUTO_SYNC: 'false'
      };

      const result = getSourceControlForProject(envVars);
      expect(result?.syncIssues).toBe(false);
      expect(result?.syncPullRequests).toBe(false);
    });

    it('defaults sync to false when auto_sync not specified', () => {
      const envVars = {
        GITHUB_TOKEN: 'token',
        GITHUB_REPO: 'owner/repo'
      };

      const result = getSourceControlForProject(envVars);
      expect(result?.syncIssues).toBe(false);
      expect(result?.syncPullRequests).toBe(false);
    });
  });
});

describe('Source Control Migration - Edge Cases (US#81)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mocks to default implementations
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('');
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.copyFileSync).mockImplementation(() => {});
    vi.mocked(projectStore.getProjects).mockReturnValue([]);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('skips migration if already completed', async () => {
    const settings = {
      migrationCompleted: {
        sourceControlV2: true
      }
    };

    const result = await runSourceControlMigration(settings);

    expect(result.success).toBe(true);
    expect(result.migrated).toBe(false);
    expect(result.log.actions).toContain('Migration already completed, skipping');
  });

  it('creates backup before migration', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(projectStore.getProjects).mockReturnValue([]);

    const settings = {};

    const result = await runSourceControlMigration(settings);

    // Verify backup was created via log messages
    expect(result.success).toBe(true);
    expect(result.log.actions).toContainEqual(
      expect.stringContaining('Backed up settings.json')
    );
    expect(result.log.actions).toContainEqual(
      expect.stringContaining('Backed up projects.json')
    );
  });

  it('handles no projects gracefully', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(projectStore.getProjects).mockReturnValue([]);

    const settings: Record<string, unknown> = {};

    const result = await runSourceControlMigration(settings);

    expect(result.success).toBe(true);
    expect(result.migrated).toBe(true);
    expect(result.log.actions).toContain('No projects with source control data found');
    expect(settings.migrationCompleted).toEqual({ sourceControlV2: true });
  });

  it('sets migration flag on completion', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(projectStore.getProjects).mockReturnValue([]);

    const settings: Record<string, unknown> = {};

    await runSourceControlMigration(settings);

    expect(settings.migrationCompleted).toEqual({ sourceControlV2: true });
  });

  it('handles projects without autoBuildPath', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(projectStore.getProjects).mockReturnValue([
      { id: '1', name: 'Project1', path: '/path/to/project1' } as ReturnType<typeof projectStore.projectStore.getProjects>[0]
    ]);

    const settings: Record<string, unknown> = {};

    const result = await runSourceControlMigration(settings);

    expect(result.success).toBe(true);
    expect(result.log.warnings).toContainEqual(
      expect.stringContaining('has no autoBuildPath')
    );
  });

  it('handles projects without .env file', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      // Return false for project .env files
      if (String(p).includes('.env')) return false;
      return true;
    });
    vi.mocked(projectStore.getProjects).mockReturnValue([
      { id: '1', name: 'Project1', path: '/path/to/project1', autoBuildPath: '.auto-claude' } as ReturnType<typeof projectStore.projectStore.getProjects>[0]
    ]);

    const settings: Record<string, unknown> = {};

    const result = await runSourceControlMigration(settings);

    expect(result.success).toBe(true);
    expect(result.log.actions).toContainEqual(
      expect.stringContaining('has no .env file')
    );
  });

  it('handles multiple different GitHub tokens with warning', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(projectStore.getProjects).mockReturnValue([
      { id: '1', name: 'Project1', path: '/path1', autoBuildPath: '.auto-claude' } as ReturnType<typeof projectStore.projectStore.getProjects>[0],
      { id: '2', name: 'Project2', path: '/path2', autoBuildPath: '.auto-claude' } as ReturnType<typeof projectStore.projectStore.getProjects>[0]
    ]);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).includes('path1')) {
        return 'GITHUB_TOKEN=token-1\nGITHUB_REPO=owner1/repo1';
      }
      if (String(p).includes('path2')) {
        return 'GITHUB_TOKEN=token-2\nGITHUB_REPO=owner2/repo2';
      }
      return '';
    });

    const settings: Record<string, unknown> = {};

    const result = await runSourceControlMigration(settings);

    expect(result.success).toBe(true);
    expect(result.log.warnings).toContainEqual(
      expect.stringContaining('different GitHub tokens')
    );
  });

  it('handles multiple different GitLab tokens for same instance with warning', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(projectStore.getProjects).mockReturnValue([
      { id: '1', name: 'Project1', path: '/path1', autoBuildPath: '.auto-claude' } as ReturnType<typeof projectStore.projectStore.getProjects>[0],
      { id: '2', name: 'Project2', path: '/path2', autoBuildPath: '.auto-claude' } as ReturnType<typeof projectStore.projectStore.getProjects>[0]
    ]);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).includes('path1')) {
        return 'GITLAB_TOKEN=token-1\nGITLAB_INSTANCE_URL=https://gitlab.com\nGITLAB_PROJECT=group1/project1';
      }
      if (String(p).includes('path2')) {
        return 'GITLAB_TOKEN=token-2\nGITLAB_INSTANCE_URL=https://gitlab.com\nGITLAB_PROJECT=group2/project2';
      }
      return '';
    });

    const settings: Record<string, unknown> = {};

    const result = await runSourceControlMigration(settings);

    expect(result.success).toBe(true);
    expect(result.log.warnings).toContainEqual(
      expect.stringContaining('different GitLab tokens')
    );
  });

  it('does not overwrite existing global GitHub config', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(projectStore.getProjects).mockReturnValue([
      { id: '1', name: 'Project1', path: '/path1', autoBuildPath: '.auto-claude' } as ReturnType<typeof projectStore.projectStore.getProjects>[0]
    ]);
    vi.mocked(fs.readFileSync).mockReturnValue('GITHUB_TOKEN=project-token\nGITHUB_REPO=owner/repo');

    const settings: Record<string, unknown> = {
      github: {
        token: 'existing-global-token',
        authMethod: 'pat',
        username: 'existinguser'
      }
    };

    const result = await runSourceControlMigration(settings);

    expect(result.success).toBe(true);
    expect((settings.github as { token: string }).token).toBe('existing-global-token');
    expect(result.log.actions).toContainEqual(
      expect.stringContaining('already exists, skipping token migration')
    );
  });

  it('does not duplicate existing GitLab instances', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(projectStore.getProjects).mockReturnValue([
      { id: '1', name: 'Project1', path: '/path1', autoBuildPath: '.auto-claude' } as ReturnType<typeof projectStore.projectStore.getProjects>[0]
    ]);
    vi.mocked(fs.readFileSync).mockReturnValue(
      'GITLAB_TOKEN=project-token\nGITLAB_INSTANCE_URL=https://gitlab.com\nGITLAB_PROJECT=group/project'
    );

    const settings: Record<string, unknown> = {
      gitlabInstances: [
        {
          id: 'existing-instance',
          name: 'GitLab.com',
          url: 'https://gitlab.com',
          token: 'existing-token',
          authMethod: 'pat',
          isDefault: true
        }
      ]
    };

    const result = await runSourceControlMigration(settings);

    expect(result.success).toBe(true);
    expect((settings.gitlabInstances as { id: string }[]).length).toBe(1);
    expect((settings.gitlabInstances as { id: string }[])[0].id).toBe('existing-instance');
  });

  it('aborts migration if backup fails', async () => {
    // Configure existsSync to return false for backup dir (to trigger mkdirSync)
    // but true for settings.json and projects.json
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const path = String(p);
      // Return false for backup directories to force mkdirSync call
      if (path.includes('migration-backups') && path.includes('sourceControlV2')) {
        return false;
      }
      // Return true for settings.json and projects.json
      return true;
    });

    // Make copyFileSync throw an error (this is called after mkdirSync)
    vi.mocked(fs.copyFileSync).mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const settings: Record<string, unknown> = {};

    const result = await runSourceControlMigration(settings);

    expect(result.success).toBe(false);
    expect(result.migrated).toBe(false);
    expect(result.log.errors).toContainEqual(
      expect.stringContaining('Failed to create backup')
    );
  });
});
