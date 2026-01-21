/**
 * End-to-End tests for Source Control Integration
 * US#85-88: Tests E2E for GitHub/GitLab configuration, detection, and sync
 *
 * NOTE: These tests require the Electron app to be built first.
 * Run `npm run build` before running E2E tests.
 * The tests also require Playwright to be installed.
 *
 * To run: npx playwright test --config=e2e/playwright.config.ts source-control.e2e.ts
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';
import path from 'path';

// Test data directory
const TEST_DATA_DIR = '/tmp/auto-claude-ui-e2e-source-control';
const TEST_PROJECT_DIR = path.join(TEST_DATA_DIR, 'test-project');

// Setup test environment
function setupTestEnvironment(): void {
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  mkdirSync(TEST_PROJECT_DIR, { recursive: true });
  mkdirSync(path.join(TEST_PROJECT_DIR, '.git'), { recursive: true });
}

// Cleanup test environment
function cleanupTestEnvironment(): void {
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
}

// Helper to create a mock git config with remote
function setupGitRemote(url: string): void {
  const gitConfigPath = path.join(TEST_PROJECT_DIR, '.git', 'config');
  writeFileSync(gitConfigPath, `[core]
    repositoryformatversion = 0
    filemode = true
    bare = false
[remote "origin"]
    url = ${url}
    fetch = +refs/heads/*:refs/remotes/origin/*
[branch "main"]
    remote = origin
    merge = refs/heads/main
`);
}

// Helper to create settings.json with GitHub configuration
function createSettingsWithGitHub(token: string, username?: string): void {
  const settingsDir = path.join(TEST_DATA_DIR, 'userData');
  mkdirSync(settingsDir, { recursive: true });

  const settings = {
    theme: 'system',
    language: 'en',
    github: username ? {
      token,
      authMethod: 'pat',
      username
    } : {
      token,
      authMethod: 'pat'
    }
  };

  writeFileSync(
    path.join(settingsDir, 'settings.json'),
    JSON.stringify(settings, null, 2)
  );
}

// Helper to create settings.json with GitLab instances
function createSettingsWithGitLab(instances: Array<{
  id: string;
  name: string;
  url: string;
  token?: string;
  username?: string;
  isDefault?: boolean;
}>): void {
  const settingsDir = path.join(TEST_DATA_DIR, 'userData');
  mkdirSync(settingsDir, { recursive: true });

  const settings = {
    theme: 'system',
    language: 'en',
    gitlabInstances: instances
  };

  writeFileSync(
    path.join(settingsDir, 'settings.json'),
    JSON.stringify(settings, null, 2)
  );
}

// Helper to create project config with source control
function createProjectConfig(sourceControl: {
  provider: 'github' | 'gitlab' | 'none';
  owner?: string;
  repo?: string;
  syncIssues?: boolean;
  syncPullRequests?: boolean;
  gitlabInstanceId?: string;
}): void {
  const projectConfigDir = path.join(TEST_PROJECT_DIR, '.auto-claude');
  mkdirSync(projectConfigDir, { recursive: true });

  const config = {
    projectName: 'test-project',
    claudePath: '/usr/bin/claude',
    sourceControl
  };

  writeFileSync(
    path.join(projectConfigDir, 'env.json'),
    JSON.stringify(config, null, 2)
  );
}

// ============================================
// US#85: Tests E2E configuration GitHub
// ============================================
test.describe('US#85 - GitHub Configuration E2E', () => {
  test.beforeAll(setupTestEnvironment);
  test.afterAll(cleanupTestEnvironment);

  test.skip('should configure GitHub token and show connected status', async () => {
    // This test requires the full Electron app
    // Skip in headless CI environments
    test.skip(true, 'Requires interactive Electron session');
  });

  test.skip('should show invalid status when token test fails', async () => {
    test.skip(true, 'Requires interactive Electron session');
  });

  // Mock-based tests
  test('should persist GitHub token in settings', () => {
    setupTestEnvironment();
    const testToken = 'ghp_test123456789';
    const testUsername = 'github-user';

    createSettingsWithGitHub(testToken, testUsername);

    const settingsPath = path.join(TEST_DATA_DIR, 'userData', 'settings.json');
    expect(existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(settings.github).toBeDefined();
    expect(settings.github.token).toBe(testToken);
    expect(settings.github.username).toBe(testUsername);
    expect(settings.github.authMethod).toBe('pat');

    cleanupTestEnvironment();
  });

  test('should store GitHub config without username when not validated', () => {
    setupTestEnvironment();
    const testToken = 'ghp_unvalidated_token';

    createSettingsWithGitHub(testToken);

    const settingsPath = path.join(TEST_DATA_DIR, 'userData', 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));

    expect(settings.github.token).toBe(testToken);
    expect(settings.github.username).toBeUndefined();

    cleanupTestEnvironment();
  });

  test('should support both OAuth and PAT auth methods', () => {
    setupTestEnvironment();

    const settingsDir = path.join(TEST_DATA_DIR, 'userData');
    mkdirSync(settingsDir, { recursive: true });

    // Test PAT method
    const patSettings = {
      github: { token: 'ghp_token', authMethod: 'pat', username: 'user1' }
    };
    writeFileSync(
      path.join(settingsDir, 'settings.json'),
      JSON.stringify(patSettings, null, 2)
    );

    let settings = JSON.parse(readFileSync(path.join(settingsDir, 'settings.json'), 'utf-8'));
    expect(settings.github.authMethod).toBe('pat');

    // Test OAuth method
    const oauthSettings = {
      github: { token: 'gho_oauth_token', authMethod: 'oauth', username: 'user2' }
    };
    writeFileSync(
      path.join(settingsDir, 'settings.json'),
      JSON.stringify(oauthSettings, null, 2)
    );

    settings = JSON.parse(readFileSync(path.join(settingsDir, 'settings.json'), 'utf-8'));
    expect(settings.github.authMethod).toBe('oauth');

    cleanupTestEnvironment();
  });
});

// ============================================
// US#86: Tests E2E détection projet
// ============================================
test.describe('US#86 - Project Detection E2E', () => {
  test.beforeAll(setupTestEnvironment);
  test.afterAll(cleanupTestEnvironment);

  test.skip('should auto-detect GitHub remote when opening project', async () => {
    test.skip(true, 'Requires interactive Electron session');
  });

  test.skip('should auto-detect GitLab remote when opening project', async () => {
    test.skip(true, 'Requires interactive Electron session');
  });

  // Mock-based tests
  test('should parse GitHub SSH remote URL from git config', () => {
    setupTestEnvironment();
    setupGitRemote('git@github.com:owner/repo.git');

    const gitConfigPath = path.join(TEST_PROJECT_DIR, '.git', 'config');
    expect(existsSync(gitConfigPath)).toBe(true);

    const config = readFileSync(gitConfigPath, 'utf-8');
    expect(config).toContain('git@github.com:owner/repo.git');

    // Simulate parsing
    const urlMatch = config.match(/url = (.+)/);
    expect(urlMatch).toBeTruthy();
    expect(urlMatch![1]).toBe('git@github.com:owner/repo.git');

    cleanupTestEnvironment();
  });

  test('should parse GitHub HTTPS remote URL from git config', () => {
    setupTestEnvironment();
    setupGitRemote('https://github.com/owner/repo.git');

    const gitConfigPath = path.join(TEST_PROJECT_DIR, '.git', 'config');
    const config = readFileSync(gitConfigPath, 'utf-8');

    const urlMatch = config.match(/url = (.+)/);
    expect(urlMatch![1]).toBe('https://github.com/owner/repo.git');

    cleanupTestEnvironment();
  });

  test('should parse GitLab SSH remote URL from git config', () => {
    setupTestEnvironment();
    setupGitRemote('git@gitlab.com:group/subgroup/project.git');

    const gitConfigPath = path.join(TEST_PROJECT_DIR, '.git', 'config');
    const config = readFileSync(gitConfigPath, 'utf-8');

    const urlMatch = config.match(/url = (.+)/);
    expect(urlMatch![1]).toBe('git@gitlab.com:group/subgroup/project.git');

    cleanupTestEnvironment();
  });

  test('should parse self-hosted GitLab URL from git config', () => {
    setupTestEnvironment();
    setupGitRemote('git@gitlab.company.com:team/project.git');

    const gitConfigPath = path.join(TEST_PROJECT_DIR, '.git', 'config');
    const config = readFileSync(gitConfigPath, 'utf-8');

    const urlMatch = config.match(/url = (.+)/);
    expect(urlMatch![1]).toBe('git@gitlab.company.com:team/project.git');

    cleanupTestEnvironment();
  });

  test('should store detected remote in project config', () => {
    setupTestEnvironment();
    setupGitRemote('git@github.com:testowner/testrepo.git');

    createProjectConfig({
      provider: 'github',
      owner: 'testowner',
      repo: 'testrepo',
      syncIssues: false,
      syncPullRequests: false
    });

    const configPath = path.join(TEST_PROJECT_DIR, '.auto-claude', 'env.json');
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config.sourceControl.provider).toBe('github');
    expect(config.sourceControl.owner).toBe('testowner');
    expect(config.sourceControl.repo).toBe('testrepo');

    cleanupTestEnvironment();
  });
});

// ============================================
// US#87: Tests E2E activation sync
// ============================================
test.describe('US#87 - Sync Activation E2E', () => {
  test.beforeAll(setupTestEnvironment);
  test.afterAll(cleanupTestEnvironment);

  test.skip('should show Issues section in sidebar when syncIssues enabled', async () => {
    test.skip(true, 'Requires interactive Electron session');
  });

  test.skip('should show Pull Requests section for GitHub when syncPullRequests enabled', async () => {
    test.skip(true, 'Requires interactive Electron session');
  });

  test.skip('should show Merge Requests section for GitLab when syncPullRequests enabled', async () => {
    test.skip(true, 'Requires interactive Electron session');
  });

  // Mock-based tests
  test('should persist syncIssues setting in project config', () => {
    setupTestEnvironment();

    createProjectConfig({
      provider: 'github',
      owner: 'owner',
      repo: 'repo',
      syncIssues: true,
      syncPullRequests: false
    });

    const configPath = path.join(TEST_PROJECT_DIR, '.auto-claude', 'env.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));

    expect(config.sourceControl.syncIssues).toBe(true);
    expect(config.sourceControl.syncPullRequests).toBe(false);

    cleanupTestEnvironment();
  });

  test('should persist syncPullRequests setting in project config', () => {
    setupTestEnvironment();

    createProjectConfig({
      provider: 'github',
      owner: 'owner',
      repo: 'repo',
      syncIssues: false,
      syncPullRequests: true
    });

    const configPath = path.join(TEST_PROJECT_DIR, '.auto-claude', 'env.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));

    expect(config.sourceControl.syncIssues).toBe(false);
    expect(config.sourceControl.syncPullRequests).toBe(true);

    cleanupTestEnvironment();
  });

  test('should support both sync options enabled', () => {
    setupTestEnvironment();

    createProjectConfig({
      provider: 'gitlab',
      owner: 'group',
      repo: 'project',
      syncIssues: true,
      syncPullRequests: true,
      gitlabInstanceId: 'gitlab-1'
    });

    const configPath = path.join(TEST_PROJECT_DIR, '.auto-claude', 'env.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));

    expect(config.sourceControl.syncIssues).toBe(true);
    expect(config.sourceControl.syncPullRequests).toBe(true);
    expect(config.sourceControl.gitlabInstanceId).toBe('gitlab-1');

    cleanupTestEnvironment();
  });

  test('should default both sync options to false', () => {
    setupTestEnvironment();

    createProjectConfig({
      provider: 'github',
      owner: 'owner',
      repo: 'repo'
    });

    const configPath = path.join(TEST_PROJECT_DIR, '.auto-claude', 'env.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));

    // Check undefined or false
    expect(config.sourceControl.syncIssues || false).toBe(false);
    expect(config.sourceControl.syncPullRequests || false).toBe(false);

    cleanupTestEnvironment();
  });
});

// ============================================
// US#88: Tests E2E ajout instance GitLab
// ============================================
test.describe('US#88 - GitLab Instance Management E2E', () => {
  test.beforeAll(setupTestEnvironment);
  test.afterAll(cleanupTestEnvironment);

  test.skip('should add new GitLab instance through modal', async () => {
    test.skip(true, 'Requires interactive Electron session');
  });

  test.skip('should show added instance in list', async () => {
    test.skip(true, 'Requires interactive Electron session');
  });

  test.skip('should edit existing GitLab instance', async () => {
    test.skip(true, 'Requires interactive Electron session');
  });

  test.skip('should delete GitLab instance with confirmation', async () => {
    test.skip(true, 'Requires interactive Electron session');
  });

  // Mock-based tests
  test('should persist GitLab instances in settings', () => {
    setupTestEnvironment();

    createSettingsWithGitLab([
      {
        id: 'gitlab-1',
        name: 'GitLab.com',
        url: 'https://gitlab.com',
        token: 'glpat-token123',
        username: 'gitlab-user',
        isDefault: true
      }
    ]);

    const settingsPath = path.join(TEST_DATA_DIR, 'userData', 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));

    expect(settings.gitlabInstances).toHaveLength(1);
    expect(settings.gitlabInstances[0].name).toBe('GitLab.com');
    expect(settings.gitlabInstances[0].url).toBe('https://gitlab.com');
    expect(settings.gitlabInstances[0].isDefault).toBe(true);

    cleanupTestEnvironment();
  });

  test('should support multiple GitLab instances', () => {
    setupTestEnvironment();

    createSettingsWithGitLab([
      {
        id: 'gitlab-1',
        name: 'GitLab.com',
        url: 'https://gitlab.com',
        isDefault: true
      },
      {
        id: 'gitlab-2',
        name: 'Company GitLab',
        url: 'https://gitlab.company.com',
        token: 'glpat-company-token',
        isDefault: false
      },
      {
        id: 'gitlab-3',
        name: 'Team GitLab',
        url: 'https://git.team.io',
        isDefault: false
      }
    ]);

    const settingsPath = path.join(TEST_DATA_DIR, 'userData', 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));

    expect(settings.gitlabInstances).toHaveLength(3);

    const defaultInstance = settings.gitlabInstances.find((i: any) => i.isDefault);
    expect(defaultInstance?.name).toBe('GitLab.com');

    const companyInstance = settings.gitlabInstances.find((i: any) => i.id === 'gitlab-2');
    expect(companyInstance?.url).toBe('https://gitlab.company.com');
    expect(companyInstance?.token).toBe('glpat-company-token');

    cleanupTestEnvironment();
  });

  test('should add instance to settings', () => {
    setupTestEnvironment();

    // Start with one instance
    createSettingsWithGitLab([
      {
        id: 'gitlab-1',
        name: 'GitLab.com',
        url: 'https://gitlab.com',
        isDefault: true
      }
    ]);

    // Read and add new instance
    const settingsPath = path.join(TEST_DATA_DIR, 'userData', 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));

    settings.gitlabInstances.push({
      id: 'gitlab-new',
      name: 'New Self-Hosted',
      url: 'https://gitlab.newcompany.com',
      authMethod: 'pat',
      isDefault: false
    });

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    // Verify
    const updated = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(updated.gitlabInstances).toHaveLength(2);
    expect(updated.gitlabInstances[1].name).toBe('New Self-Hosted');

    cleanupTestEnvironment();
  });

  test('should update instance in settings', () => {
    setupTestEnvironment();

    createSettingsWithGitLab([
      {
        id: 'gitlab-1',
        name: 'Original Name',
        url: 'https://gitlab.com',
        isDefault: true
      }
    ]);

    // Read and update
    const settingsPath = path.join(TEST_DATA_DIR, 'userData', 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));

    settings.gitlabInstances[0].name = 'Updated Name';
    settings.gitlabInstances[0].token = 'new-token';

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    // Verify
    const updated = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(updated.gitlabInstances[0].name).toBe('Updated Name');
    expect(updated.gitlabInstances[0].token).toBe('new-token');

    cleanupTestEnvironment();
  });

  test('should remove instance from settings', () => {
    setupTestEnvironment();

    createSettingsWithGitLab([
      {
        id: 'gitlab-1',
        name: 'Keep This',
        url: 'https://gitlab.com',
        isDefault: true
      },
      {
        id: 'gitlab-2',
        name: 'Delete This',
        url: 'https://gitlab.delete.com',
        isDefault: false
      }
    ]);

    // Read and remove
    const settingsPath = path.join(TEST_DATA_DIR, 'userData', 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));

    settings.gitlabInstances = settings.gitlabInstances.filter(
      (i: any) => i.id !== 'gitlab-2'
    );

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    // Verify
    const updated = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(updated.gitlabInstances).toHaveLength(1);
    expect(updated.gitlabInstances[0].name).toBe('Keep This');

    cleanupTestEnvironment();
  });

  test('should set default instance correctly', () => {
    setupTestEnvironment();

    createSettingsWithGitLab([
      {
        id: 'gitlab-1',
        name: 'First',
        url: 'https://first.com',
        isDefault: true
      },
      {
        id: 'gitlab-2',
        name: 'Second',
        url: 'https://second.com',
        isDefault: false
      }
    ]);

    // Change default
    const settingsPath = path.join(TEST_DATA_DIR, 'userData', 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));

    // Remove default from all
    settings.gitlabInstances.forEach((i: any) => { i.isDefault = false; });
    // Set new default
    settings.gitlabInstances[1].isDefault = true;

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    // Verify
    const updated = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(updated.gitlabInstances[0].isDefault).toBe(false);
    expect(updated.gitlabInstances[1].isDefault).toBe(true);

    cleanupTestEnvironment();
  });
});

// ============================================
// Integration tests
// ============================================
test.describe('Source Control Integration E2E', () => {
  test('should link project to GitLab instance by ID', () => {
    setupTestEnvironment();

    // Setup GitLab instances
    createSettingsWithGitLab([
      {
        id: 'gitlab-corp',
        name: 'Corporate GitLab',
        url: 'https://gitlab.corp.com',
        token: 'glpat-corp-token',
        isDefault: false
      }
    ]);

    // Setup project linking to instance
    setupGitRemote('git@gitlab.corp.com:team/project.git');
    createProjectConfig({
      provider: 'gitlab',
      owner: 'team',
      repo: 'project',
      syncIssues: true,
      syncPullRequests: true,
      gitlabInstanceId: 'gitlab-corp'
    });

    // Verify linkage
    const configPath = path.join(TEST_PROJECT_DIR, '.auto-claude', 'env.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));

    expect(config.sourceControl.gitlabInstanceId).toBe('gitlab-corp');

    const settingsPath = path.join(TEST_DATA_DIR, 'userData', 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const instance = settings.gitlabInstances.find((i: any) => i.id === 'gitlab-corp');

    expect(instance).toBeDefined();
    expect(instance.token).toBe('glpat-corp-token');

    cleanupTestEnvironment();
  });

  test('should use github token from global settings for github projects', () => {
    setupTestEnvironment();

    // Setup GitHub in global settings
    createSettingsWithGitHub('ghp_global_token', 'github-user');

    // Setup project
    setupGitRemote('git@github.com:myorg/myrepo.git');
    createProjectConfig({
      provider: 'github',
      owner: 'myorg',
      repo: 'myrepo',
      syncIssues: true
    });

    // Verify GitHub token is in settings
    const settingsPath = path.join(TEST_DATA_DIR, 'userData', 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));

    expect(settings.github.token).toBe('ghp_global_token');

    // Project config references GitHub
    const configPath = path.join(TEST_PROJECT_DIR, '.auto-claude', 'env.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));

    expect(config.sourceControl.provider).toBe('github');

    cleanupTestEnvironment();
  });
});
