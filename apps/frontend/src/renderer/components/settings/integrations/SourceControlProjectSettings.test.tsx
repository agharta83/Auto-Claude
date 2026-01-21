/**
 * @vitest-environment jsdom
 */
/**
 * Tests for SourceControlProjectSettings Component
 * US#84: Tests composant SourceControlProjectSettings - Détection, toggles, alerte token
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SourceControlProjectSettings } from './SourceControlProjectSettings';
import type { ProjectEnvConfig, ProjectSettings, DetectedRemote } from '../../../../shared/types';
import i18n from '../../../../shared/i18n';

// Mock the toast hook
vi.mock('../../../hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}));

// Mock electronAPI
const mockElectronAPI = {
  detectGitRemote: vi.fn(),
  listGitLabInstances: vi.fn(),
  getTokenForProject: vi.fn(),
  testGitHubConnection: vi.fn(),
  getGitBranches: vi.fn(),
  detectMainBranch: vi.fn()
};

// Setup window.electronAPI mock
beforeEach(() => {
  vi.clearAllMocks();
  (window as any).electronAPI = mockElectronAPI;
});

afterEach(() => {
  delete (window as any).electronAPI;
});

// Test data
const defaultEnvConfig: ProjectEnvConfig = {
  claudePath: '/usr/bin/claude',
  projectName: 'Test Project'
};

const envConfigWithGitHub: ProjectEnvConfig = {
  ...defaultEnvConfig,
  sourceControl: {
    provider: 'github',
    owner: 'testowner',
    repo: 'testrepo',
    syncIssues: false,
    syncPullRequests: false
  }
};

const envConfigWithGitLab: ProjectEnvConfig = {
  ...defaultEnvConfig,
  sourceControl: {
    provider: 'gitlab',
    owner: 'testgroup/subgroup',
    repo: 'testproject',
    syncIssues: true,
    syncPullRequests: false,
    gitlabInstanceId: 'gitlab-1'
  }
};

const githubDetectedRemote: DetectedRemote = {
  provider: 'github',
  url: 'git@github.com:owner/repo.git',
  normalizedUrl: 'https://github.com/owner/repo',
  owner: 'owner',
  repo: 'repo',
  instanceUrl: 'https://github.com'
};

const gitlabDetectedRemote: DetectedRemote = {
  provider: 'gitlab',
  url: 'git@gitlab.com:group/project.git',
  normalizedUrl: 'https://gitlab.com/group/project',
  owner: 'group',
  repo: 'project',
  instanceUrl: 'https://gitlab.com'
};

const testBranches = ['main', 'develop', 'feature/new-feature', 'bugfix/fix-123'];

/**
 * Setup default mocks for happy path scenarios
 */
function setupDefaultMocks(remote: DetectedRemote | null = githubDetectedRemote) {
  mockElectronAPI.detectGitRemote.mockResolvedValue({
    success: true,
    data: remote
  });
  mockElectronAPI.listGitLabInstances.mockResolvedValue({
    success: true,
    data: [
      { id: 'gitlab-1', name: 'GitLab.com', url: 'https://gitlab.com', authMethod: 'pat', isDefault: true }
    ]
  });
  mockElectronAPI.getTokenForProject.mockResolvedValue({
    success: true,
    data: { token: 'test-token', instanceId: 'gitlab-1' }
  });
  mockElectronAPI.testGitHubConnection.mockResolvedValue({
    success: true,
    data: { success: true, username: 'testuser' }
  });
  mockElectronAPI.getGitBranches.mockResolvedValue({
    success: true,
    data: testBranches
  });
  mockElectronAPI.detectMainBranch.mockResolvedValue({
    success: true,
    data: 'main'
  });
}

describe('SourceControlProjectSettings - Rendering', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('should return null when envConfig is null', () => {
    const { container } = render(
      <SourceControlProjectSettings
        envConfig={null}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should trigger detection when dialog opens', async () => {
    render(
      <SourceControlProjectSettings
        envConfig={defaultEnvConfig}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(mockElectronAPI.detectGitRemote).toHaveBeenCalledWith('/test/project');
    });
  });
});

describe('SourceControlProjectSettings - Detection States', () => {
  it('should show detecting state with spinner', async () => {
    mockElectronAPI.detectGitRemote.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(
      <SourceControlProjectSettings
        envConfig={defaultEnvConfig}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.detecting'))).toBeInTheDocument();
    });
  });

  it('should show no_remote state when no remote is detected', async () => {
    mockElectronAPI.detectGitRemote.mockResolvedValue({
      success: true,
      data: null
    });

    render(
      <SourceControlProjectSettings
        envConfig={defaultEnvConfig}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.noRemote.title'))).toBeInTheDocument();
    });

    // Should show git remote add instruction
    expect(screen.getByText(/git remote add origin/)).toBeInTheDocument();
  });

  it('should show error state when detection fails', async () => {
    mockElectronAPI.detectGitRemote.mockResolvedValue({
      success: false,
      error: 'Git not found'
    });

    render(
      <SourceControlProjectSettings
        envConfig={defaultEnvConfig}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.error.title'))).toBeInTheDocument();
    });

    expect(screen.getByText('Git not found')).toBeInTheDocument();
  });

  it('should show detected GitHub repo with link', async () => {
    setupDefaultMocks(githubDetectedRemote);

    render(
      <SourceControlProjectSettings
        envConfig={defaultEnvConfig}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
      expect(screen.getByText(i18n.t('settings:sourceControlProject.detected'))).toBeInTheDocument();
    });

    // Should show owner/repo link
    const repoLink = screen.getByRole('link', { name: /owner\/repo/ });
    expect(repoLink).toHaveAttribute('href', 'https://github.com/owner/repo');
  });

  it('should show detected GitLab repo', async () => {
    setupDefaultMocks(gitlabDetectedRemote);

    render(
      <SourceControlProjectSettings
        envConfig={defaultEnvConfig}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      // Use getAllByText since GitLab appears in both icon title and text
      const gitlabElements = screen.getAllByText('GitLab');
      expect(gitlabElements.length).toBeGreaterThan(0);
      expect(screen.getByText(i18n.t('settings:sourceControlProject.detected'))).toBeInTheDocument();
    });

    // Should show group/project link
    const repoLink = screen.getByRole('link', { name: /group\/project/ });
    expect(repoLink).toHaveAttribute('href', 'https://gitlab.com/group/project');
  });
});

describe('SourceControlProjectSettings - Token Status', () => {
  it('should show token available status with username', async () => {
    setupDefaultMocks();
    mockElectronAPI.getTokenForProject.mockResolvedValue({
      success: true,
      data: { token: 'ghp_test123' }
    });
    mockElectronAPI.testGitHubConnection.mockResolvedValue({
      success: true,
      data: { success: true, username: 'github-user' }
    });

    render(
      <SourceControlProjectSettings
        envConfig={envConfigWithGitHub}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(
        i18n.t('settings:sourceControlProject.token.connectedAs').replace('{{username}}', 'github-user')
      )).toBeInTheDocument();
    });
  });

  it('should show token missing alert for GitHub', async () => {
    setupDefaultMocks();
    mockElectronAPI.getTokenForProject.mockResolvedValue({
      success: false,
      data: null
    });

    render(
      <SourceControlProjectSettings
        envConfig={envConfigWithGitHub}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(
        i18n.t('settings:sourceControlProject.token.missing.title').replace('{{provider}}', 'GitHub')
      )).toBeInTheDocument();
    });

    // Should show configure button
    expect(screen.getByText(
      i18n.t('settings:sourceControlProject.token.missing.configure').replace('{{provider}}', 'GitHub')
    )).toBeInTheDocument();
  });

  it('should show token missing alert for GitLab', async () => {
    setupDefaultMocks(gitlabDetectedRemote);
    mockElectronAPI.getTokenForProject.mockResolvedValue({
      success: false,
      data: null
    });

    render(
      <SourceControlProjectSettings
        envConfig={envConfigWithGitLab}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(
        i18n.t('settings:sourceControlProject.token.missing.title').replace('{{provider}}', 'GitLab')
      )).toBeInTheDocument();
    });
  });
});

describe('SourceControlProjectSettings - Sync Toggles', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('should show sync options when token is available', async () => {
    render(
      <SourceControlProjectSettings
        envConfig={envConfigWithGitHub}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.sync.title'))).toBeInTheDocument();
    });

    // Should show Issues toggle
    expect(screen.getByText(i18n.t('settings:sourceControlProject.sync.issues'))).toBeInTheDocument();

    // Should show Pull Requests toggle for GitHub
    expect(screen.getByText(i18n.t('settings:sourceControlProject.sync.pullRequests'))).toBeInTheDocument();
  });

  it('should show Merge Requests label for GitLab', async () => {
    setupDefaultMocks(gitlabDetectedRemote);

    render(
      <SourceControlProjectSettings
        envConfig={envConfigWithGitLab}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.sync.mergeRequests'))).toBeInTheDocument();
    });
  });

  it('should call updateEnvConfig when sync issues toggle is clicked', async () => {
    const updateEnvConfig = vi.fn();

    render(
      <SourceControlProjectSettings
        envConfig={envConfigWithGitHub}
        updateEnvConfig={updateEnvConfig}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.sync.issues'))).toBeInTheDocument();
    });

    // Find and click the Issues toggle switch
    const switches = screen.getAllByRole('switch');
    // First switch should be for Issues
    fireEvent.click(switches[0]);

    await waitFor(() => {
      expect(updateEnvConfig).toHaveBeenCalledWith({
        sourceControl: expect.objectContaining({
          syncIssues: true
        })
      });
    });
  });

  it('should call updateEnvConfig when sync PRs toggle is clicked', async () => {
    const updateEnvConfig = vi.fn();

    render(
      <SourceControlProjectSettings
        envConfig={envConfigWithGitHub}
        updateEnvConfig={updateEnvConfig}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.sync.pullRequests'))).toBeInTheDocument();
    });

    // Find and click the PRs toggle switch (second switch)
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[1]);

    await waitFor(() => {
      expect(updateEnvConfig).toHaveBeenCalledWith({
        sourceControl: expect.objectContaining({
          syncPullRequests: true
        })
      });
    });
  });
});

describe('SourceControlProjectSettings - Branch Selector', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('should show branch selector when configured', async () => {
    render(
      <SourceControlProjectSettings
        envConfig={envConfigWithGitHub}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.branch.title'))).toBeInTheDocument();
    });
  });

  it('should load branches from API', async () => {
    render(
      <SourceControlProjectSettings
        envConfig={envConfigWithGitHub}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(mockElectronAPI.getGitBranches).toHaveBeenCalledWith('/test/project');
    });
  });

  it('should show auto-detect option by default', async () => {
    render(
      <SourceControlProjectSettings
        envConfig={envConfigWithGitHub}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.branch.autoDetect'))).toBeInTheDocument();
    });
  });
});

describe('SourceControlProjectSettings - Manual Configuration', () => {
  it('should show manual configuration option when no remote detected', async () => {
    mockElectronAPI.detectGitRemote.mockResolvedValue({
      success: true,
      data: null
    });

    render(
      <SourceControlProjectSettings
        envConfig={defaultEnvConfig}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.noRemote.manual'))).toBeInTheDocument();
    });
  });

  it('should open manual config form when button is clicked', async () => {
    mockElectronAPI.detectGitRemote.mockResolvedValue({
      success: true,
      data: null
    });

    render(
      <SourceControlProjectSettings
        envConfig={defaultEnvConfig}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.noRemote.manual'))).toBeInTheDocument();
    });

    // Click manual config button
    const manualButton = screen.getByText(i18n.t('settings:sourceControlProject.noRemote.manual'));
    fireEvent.click(manualButton);

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.manual.title'))).toBeInTheDocument();
    });

    // Should show provider selection (use getAllByText since GitLab appears in icon title too)
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    const gitlabElements = screen.getAllByText('GitLab');
    expect(gitlabElements.length).toBeGreaterThan(0);
  });

  it('should allow selecting provider in manual mode', async () => {
    mockElectronAPI.detectGitRemote.mockResolvedValue({
      success: true,
      data: null
    });

    render(
      <SourceControlProjectSettings
        envConfig={defaultEnvConfig}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.noRemote.manual'))).toBeInTheDocument();
    });

    // Open manual config
    fireEvent.click(screen.getByText(i18n.t('settings:sourceControlProject.noRemote.manual')));

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.manual.title'))).toBeInTheDocument();
    });

    // Click GitLab button
    const gitlabButtons = screen.getAllByText('GitLab');
    // The button in manual config section
    const gitlabButton = gitlabButtons.find(btn => btn.closest('button'));
    if (gitlabButton) {
      fireEvent.click(gitlabButton);
    }

    // Label should change to Group (GitLab) instead of Owner (GitHub)
    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.manual.group'))).toBeInTheDocument();
    });
  });

  it('should save manual configuration when form is submitted', async () => {
    mockElectronAPI.detectGitRemote.mockResolvedValue({
      success: true,
      data: null
    });
    mockElectronAPI.listGitLabInstances.mockResolvedValue({
      success: true,
      data: []
    });

    const updateEnvConfig = vi.fn();

    render(
      <SourceControlProjectSettings
        envConfig={defaultEnvConfig}
        updateEnvConfig={updateEnvConfig}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.noRemote.manual'))).toBeInTheDocument();
    });

    // Open manual config
    fireEvent.click(screen.getByText(i18n.t('settings:sourceControlProject.noRemote.manual')));

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.manual.title'))).toBeInTheDocument();
    });

    // Fill in owner and repo
    const ownerInput = screen.getByPlaceholderText('owner');
    const repoInput = screen.getByPlaceholderText('repository');

    fireEvent.change(ownerInput, { target: { value: 'myowner' } });
    fireEvent.change(repoInput, { target: { value: 'myrepo' } });

    // Click save
    const saveButton = screen.getByText(i18n.t('settings:sourceControlProject.manual.save'));
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateEnvConfig).toHaveBeenCalledWith({
        sourceControl: expect.objectContaining({
          provider: 'github',
          owner: 'myowner',
          repo: 'myrepo'
        })
      });
    });
  });

  it('should cancel manual configuration', async () => {
    mockElectronAPI.detectGitRemote.mockResolvedValue({
      success: true,
      data: null
    });

    render(
      <SourceControlProjectSettings
        envConfig={defaultEnvConfig}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.noRemote.manual'))).toBeInTheDocument();
    });

    // Open manual config
    fireEvent.click(screen.getByText(i18n.t('settings:sourceControlProject.noRemote.manual')));

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.manual.title'))).toBeInTheDocument();
    });

    // Click cancel
    const cancelButtons = screen.getAllByText(i18n.t('settings:sourceControlProject.manual.cancel'));
    fireEvent.click(cancelButtons[0]);

    // Manual config form should be closed
    await waitFor(() => {
      expect(screen.queryByText(i18n.t('settings:sourceControlProject.manual.title'))).not.toBeInTheDocument();
    });
  });
});

describe('SourceControlProjectSettings - Disconnect', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('should show disconnect button when connected', async () => {
    render(
      <SourceControlProjectSettings
        envConfig={envConfigWithGitHub}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.disconnect'))).toBeInTheDocument();
    });
  });

  it('should disconnect when button is clicked', async () => {
    const updateEnvConfig = vi.fn();

    render(
      <SourceControlProjectSettings
        envConfig={envConfigWithGitHub}
        updateEnvConfig={updateEnvConfig}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.disconnect'))).toBeInTheDocument();
    });

    // Click disconnect
    fireEvent.click(screen.getByText(i18n.t('settings:sourceControlProject.disconnect')));

    expect(updateEnvConfig).toHaveBeenCalledWith({
      sourceControl: {
        provider: 'none',
        syncIssues: false,
        syncPullRequests: false
      }
    });
  });
});

describe('SourceControlProjectSettings - Refresh Detection', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('should have refresh button when detected', async () => {
    render(
      <SourceControlProjectSettings
        envConfig={envConfigWithGitHub}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });

    // Should have a refresh button (icon button)
    const refreshButtons = screen.getAllByRole('button');
    const refreshButton = refreshButtons.find(btn => btn.querySelector('.lucide-refresh-cw'));
    expect(refreshButton).toBeTruthy();
  });

  it('should have retry button when detection fails', async () => {
    mockElectronAPI.detectGitRemote.mockResolvedValue({
      success: false,
      error: 'Failed'
    });

    render(
      <SourceControlProjectSettings
        envConfig={defaultEnvConfig}
        updateEnvConfig={vi.fn()}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControlProject.error.retry'))).toBeInTheDocument();
    });
  });
});

describe('SourceControlProjectSettings - Auto-configure on detection', () => {
  it('should auto-configure source control when remote is detected', async () => {
    setupDefaultMocks(githubDetectedRemote);
    const updateEnvConfig = vi.fn();

    render(
      <SourceControlProjectSettings
        envConfig={defaultEnvConfig}
        updateEnvConfig={updateEnvConfig}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(updateEnvConfig).toHaveBeenCalledWith({
        sourceControl: expect.objectContaining({
          provider: 'github',
          owner: 'owner',
          repo: 'repo',
          detectedRemoteUrl: 'git@github.com:owner/repo.git'
        })
      });
    });
  });

  it('should match GitLab instance when detecting GitLab remote', async () => {
    setupDefaultMocks(gitlabDetectedRemote);
    const updateEnvConfig = vi.fn();

    render(
      <SourceControlProjectSettings
        envConfig={defaultEnvConfig}
        updateEnvConfig={updateEnvConfig}
        projectPath="/test/project"
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(mockElectronAPI.listGitLabInstances).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(updateEnvConfig).toHaveBeenCalledWith({
        sourceControl: expect.objectContaining({
          provider: 'gitlab',
          gitlabInstanceId: 'gitlab-1'
        })
      });
    });
  });
});
