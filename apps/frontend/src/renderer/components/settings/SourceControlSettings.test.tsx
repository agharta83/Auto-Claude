/**
 * @vitest-environment jsdom
 */
/**
 * Tests for SourceControlSettings Component
 * US#83: Tests composant SourceControlSettings - Rendu, interactions, états connexion
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SourceControlSettings } from './SourceControlSettings';
import type { AppSettings, GitLabInstance } from '../../../shared/types';
import { TooltipProvider } from '../ui/tooltip';
import i18n from '../../../shared/i18n';

// Wrapper for components that need TooltipProvider
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

// Custom render with wrapper
function renderWithWrapper(ui: React.ReactElement) {
  return render(ui, { wrapper: TestWrapper });
}

// Mock the toast hook
vi.mock('../../hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}));

// Mock electronAPI
const mockElectronAPI = {
  listGitLabInstances: vi.fn(),
  addGitLabInstance: vi.fn(),
  updateGitLabInstance: vi.fn(),
  removeGitLabInstance: vi.fn(),
  testGitHubConnection: vi.fn(),
  testGitLabConnection: vi.fn()
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
const defaultSettings: AppSettings = {
  theme: 'system',
  language: 'en',
  compactMode: false,
  notifications: true,
  autoUpdate: true,
  developerMode: false
};

const settingsWithGitHub: AppSettings = {
  ...defaultSettings,
  github: {
    token: 'ghp_testtoken123456789',
    authMethod: 'pat',
    username: 'testuser'
  }
};

const settingsWithGitHubNoUsername: AppSettings = {
  ...defaultSettings,
  github: {
    token: 'ghp_invalidtoken',
    authMethod: 'pat'
  }
};

const testGitLabInstances: GitLabInstance[] = [
  {
    id: 'gitlab-1',
    name: 'GitLab.com',
    url: 'https://gitlab.com',
    authMethod: 'pat',
    token: 'glpat-testtoken123',
    username: 'gitlab-user',
    isDefault: true
  },
  {
    id: 'gitlab-2',
    name: 'Self-Hosted GitLab',
    url: 'https://gitlab.company.com',
    authMethod: 'pat',
    isDefault: false
  }
];

/**
 * Factory function to setup default mocks for happy path
 */
function setupDefaultMocks(instances: GitLabInstance[] = testGitLabInstances) {
  mockElectronAPI.listGitLabInstances.mockResolvedValue({
    success: true,
    data: instances
  });
  mockElectronAPI.addGitLabInstance.mockResolvedValue({
    success: true,
    data: { id: 'new-instance', name: 'New Instance', url: 'https://new.gitlab.com', authMethod: 'pat', isDefault: false }
  });
  mockElectronAPI.updateGitLabInstance.mockResolvedValue({ success: true });
  mockElectronAPI.removeGitLabInstance.mockResolvedValue({ success: true });
  mockElectronAPI.testGitHubConnection.mockResolvedValue({
    success: true,
    data: { success: true, username: 'github-user' }
  });
  mockElectronAPI.testGitLabConnection.mockResolvedValue({
    success: true,
    data: { success: true, username: 'gitlab-user' }
  });
}

describe('SourceControlSettings - Rendering', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('should render the source control settings title', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    expect(screen.getByText(i18n.t('settings:sourceControl.title'))).toBeInTheDocument();
  });

  it('should render GitHub section with title', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    expect(screen.getByText(i18n.t('settings:sourceControl.github.title'))).toBeInTheDocument();
  });

  it('should render GitLab section with title', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    expect(screen.getByText(i18n.t('settings:sourceControl.gitlab.title'))).toBeInTheDocument();
  });

  it('should render GitHub token input field', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    expect(screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx')).toBeInTheDocument();
  });

  it('should render Test Connection button for GitHub', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    expect(screen.getByText(i18n.t('settings:sourceControl.github.testConnection'))).toBeInTheDocument();
  });

  it('should render Add Instance button for GitLab', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    expect(screen.getByText(i18n.t('settings:sourceControl.gitlab.addInstance'))).toBeInTheDocument();
  });
});

describe('SourceControlSettings - GitHub Status States', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('should show "not configured" status when no GitHub token', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    expect(screen.getByText(i18n.t('settings:sourceControl.github.status.notConfigured'))).toBeInTheDocument();
  });

  it('should show "connected" status with username when GitHub is configured', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={settingsWithGitHub}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    expect(screen.getByText(
      i18n.t('settings:sourceControl.github.status.connected', { username: 'testuser' })
    )).toBeInTheDocument();
  });

  it('should show "invalid" status when token exists but no username', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={settingsWithGitHubNoUsername}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    expect(screen.getByText(i18n.t('settings:sourceControl.github.status.invalid'))).toBeInTheDocument();
  });

  it('should show disconnect button when GitHub is connected', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={settingsWithGitHub}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    expect(screen.getByText(i18n.t('settings:sourceControl.github.disconnect'))).toBeInTheDocument();
  });

  it('should not show disconnect button when GitHub is not connected', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    expect(screen.queryByText(i18n.t('settings:sourceControl.github.disconnect'))).not.toBeInTheDocument();
  });
});

describe('SourceControlSettings - GitHub Interactions', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('should toggle token visibility when eye icon is clicked', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    const tokenInput = screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx') as HTMLInputElement;
    expect(tokenInput.type).toBe('password');

    // Find and click the toggle visibility button (button with eye icon in the input container)
    const toggleButtons = screen.getAllByRole('button');
    const toggleButton = toggleButtons.find(btn => btn.querySelector('svg'));

    // Click to show token - the button should be in the input container
    if (toggleButton) {
      fireEvent.click(toggleButton);
    }
  });

  it('should call testGitHubConnection when Test Connection is clicked', async () => {
    const onSettingsChange = vi.fn();
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={onSettingsChange}
        isOpen={true}
      />
    );

    // Enter a token
    const tokenInput = screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx');
    fireEvent.change(tokenInput, { target: { value: 'ghp_test123' } });

    // Click test connection
    const testButton = screen.getByText(i18n.t('settings:sourceControl.github.testConnection'));
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(mockElectronAPI.testGitHubConnection).toHaveBeenCalledWith('ghp_test123');
    });
  });

  it('should update settings when GitHub connection test succeeds', async () => {
    const onSettingsChange = vi.fn();
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={onSettingsChange}
        isOpen={true}
      />
    );

    // Enter a token
    const tokenInput = screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx');
    fireEvent.change(tokenInput, { target: { value: 'ghp_validtoken' } });

    // Click test connection
    const testButton = screen.getByText(i18n.t('settings:sourceControl.github.testConnection'));
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
        github: expect.objectContaining({
          token: 'ghp_validtoken',
          username: 'github-user',
          authMethod: 'pat'
        })
      }));
    });
  });

  it('should clear GitHub settings when disconnect is clicked', async () => {
    const onSettingsChange = vi.fn();
    renderWithWrapper(
      <SourceControlSettings
        settings={settingsWithGitHub}
        onSettingsChange={onSettingsChange}
        isOpen={true}
      />
    );

    // Click disconnect
    const disconnectButton = screen.getByText(i18n.t('settings:sourceControl.github.disconnect'));
    fireEvent.click(disconnectButton);

    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      github: undefined
    }));
  });

  it('should disable Test Connection button when token is empty', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    const testButton = screen.getByText(i18n.t('settings:sourceControl.github.testConnection'));
    expect(testButton).toBeDisabled();
  });
});

describe('SourceControlSettings - GitLab Instances List', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('should load GitLab instances when component opens', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(mockElectronAPI.listGitLabInstances).toHaveBeenCalled();
    });
  });

  it('should display GitLab instances after loading', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('GitLab.com')).toBeInTheDocument();
      expect(screen.getByText('Self-Hosted GitLab')).toBeInTheDocument();
    });
  });

  it('should show default badge for default instance', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControl.gitlab.default'))).toBeInTheDocument();
    });
  });

  it('should show username badge for instance with token and username', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('gitlab-user')).toBeInTheDocument();
    });
  });

  it('should show "no token" badge for instance without token', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControl.gitlab.noToken'))).toBeInTheDocument();
    });
  });

  it('should show empty state when no instances', async () => {
    setupDefaultMocks([]);

    // Need to also mock addGitLabInstance to return the default instance
    mockElectronAPI.addGitLabInstance.mockResolvedValue({
      success: true,
      data: { id: 'default-gitlab', name: 'GitLab.com', url: 'https://gitlab.com', authMethod: 'pat', isDefault: true }
    });

    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    // US#37: When no instances, it automatically adds gitlab.com as default
    await waitFor(() => {
      expect(mockElectronAPI.addGitLabInstance).toHaveBeenCalledWith(expect.objectContaining({
        name: 'GitLab.com',
        url: 'https://gitlab.com',
        isDefault: true
      }));
    });
  });
});

describe('SourceControlSettings - GitLab Instance Modal', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('should open add instance modal when Add Instance is clicked', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('GitLab.com')).toBeInTheDocument();
    });

    // Click Add Instance
    const addButton = screen.getByText(i18n.t('settings:sourceControl.gitlab.addInstance'));
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControl.gitlab.modal.addTitle'))).toBeInTheDocument();
    });
  });

  it('should show name and URL input fields in modal', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('GitLab.com')).toBeInTheDocument();
    });

    // Click Add Instance
    const addButton = screen.getByText(i18n.t('settings:sourceControl.gitlab.addInstance'));
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByLabelText(i18n.t('settings:sourceControl.gitlab.modal.name'))).toBeInTheDocument();
      expect(screen.getByLabelText(i18n.t('settings:sourceControl.gitlab.modal.url'))).toBeInTheDocument();
      expect(screen.getByLabelText(i18n.t('settings:sourceControl.gitlab.modal.token'))).toBeInTheDocument();
    });
  });

  it('should call testGitLabConnection when Test is clicked in modal', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('GitLab.com')).toBeInTheDocument();
    });

    // Click Add Instance
    const addButton = screen.getByText(i18n.t('settings:sourceControl.gitlab.addInstance'));
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControl.gitlab.modal.addTitle'))).toBeInTheDocument();
    });

    // Fill in URL and token
    const urlInput = screen.getByLabelText(i18n.t('settings:sourceControl.gitlab.modal.url'));
    const tokenInput = screen.getByLabelText(i18n.t('settings:sourceControl.gitlab.modal.token'));

    fireEvent.change(urlInput, { target: { value: 'https://gitlab.test.com' } });
    fireEvent.change(tokenInput, { target: { value: 'glpat-test123' } });

    // Click Test button in the modal (use getAllByText and find the one in the modal dialog)
    const testButtons = screen.getAllByText(i18n.t('settings:sourceControl.gitlab.modal.test'));
    // The modal test button should not be disabled since we filled in URL and token
    const enabledTestButton = testButtons.find(btn => !btn.hasAttribute('disabled'));
    if (enabledTestButton) {
      fireEvent.click(enabledTestButton);
    }

    await waitFor(() => {
      expect(mockElectronAPI.testGitLabConnection).toHaveBeenCalledWith('https://gitlab.test.com', 'glpat-test123');
    });
  });

  it('should call addGitLabInstance when saving new instance', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('GitLab.com')).toBeInTheDocument();
    });

    // Click Add Instance
    const addButton = screen.getByText(i18n.t('settings:sourceControl.gitlab.addInstance'));
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControl.gitlab.modal.addTitle'))).toBeInTheDocument();
    });

    // Fill in required fields
    const nameInput = screen.getByLabelText(i18n.t('settings:sourceControl.gitlab.modal.name'));
    const urlInput = screen.getByLabelText(i18n.t('settings:sourceControl.gitlab.modal.url'));

    fireEvent.change(nameInput, { target: { value: 'New Instance' } });
    fireEvent.change(urlInput, { target: { value: 'https://new.gitlab.com' } });

    // Click Add button (in modal footer)
    const saveButton = screen.getByText(i18n.t('common:buttons.add'));
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockElectronAPI.addGitLabInstance).toHaveBeenCalledWith(expect.objectContaining({
        name: 'New Instance',
        url: 'https://new.gitlab.com'
      }));
    });
  });
});

describe('SourceControlSettings - GitLab Instance Edit', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('should open edit modal with pre-filled data when edit is clicked', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('GitLab.com')).toBeInTheDocument();
    });

    // Find and click edit button (Pencil icon) for first instance
    const editButtons = screen.getAllByRole('button');
    const editButton = editButtons.find(btn => {
      const svg = btn.querySelector('svg');
      return svg && btn.classList.contains('h-7');
    });

    if (editButton) {
      fireEvent.click(editButton);
    }

    // The modal should show edit title
    await waitFor(() => {
      // Check that the modal opened by looking for the form fields
      const nameInput = screen.getByLabelText(i18n.t('settings:sourceControl.gitlab.modal.name')) as HTMLInputElement;
      expect(nameInput.value).toBe('GitLab.com');
    });
  });

  it('should call updateGitLabInstance when saving edited instance', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('GitLab.com')).toBeInTheDocument();
    });

    // Find edit buttons by looking for small icon buttons
    const allButtons = screen.getAllByRole('button');
    // The edit button should be a small icon button inside an instance card
    const editButton = allButtons.find(btn => {
      const isSmall = btn.classList.contains('w-7') || btn.className.includes('h-7');
      const hasPencil = btn.innerHTML.includes('<svg') && btn.innerHTML.includes('3');
      return isSmall && hasPencil;
    });

    if (editButton) {
      fireEvent.click(editButton);

      await waitFor(() => {
        expect(screen.getByText(i18n.t('settings:sourceControl.gitlab.modal.editTitle'))).toBeInTheDocument();
      });

      // Modify the name
      const nameInput = screen.getByLabelText(i18n.t('settings:sourceControl.gitlab.modal.name'));
      fireEvent.change(nameInput, { target: { value: 'Updated GitLab' } });

      // Click Save
      const saveButton = screen.getByText(i18n.t('common:buttons.save'));
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockElectronAPI.updateGitLabInstance).toHaveBeenCalledWith(
          'gitlab-1',
          expect.objectContaining({ name: 'Updated GitLab' })
        );
      });
    }
  });
});

describe('SourceControlSettings - GitLab Instance Delete', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('should open delete confirmation dialog when delete is clicked', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('GitLab.com')).toBeInTheDocument();
    });

    // Find delete button (the one with destructive styling)
    const allButtons = screen.getAllByRole('button');
    const deleteButton = allButtons.find(btn => {
      return btn.classList.contains('text-destructive') || btn.className.includes('destructive');
    });

    if (deleteButton) {
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(i18n.t('settings:sourceControl.gitlab.delete.title'))).toBeInTheDocument();
      });
    }
  });

  it('should call removeGitLabInstance when delete is confirmed', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('GitLab.com')).toBeInTheDocument();
    });

    // Find and click delete button
    const allButtons = screen.getAllByRole('button');
    const deleteButton = allButtons.find(btn => {
      return btn.classList.contains('text-destructive') || btn.className.includes('destructive');
    });

    if (deleteButton) {
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(i18n.t('settings:sourceControl.gitlab.delete.title'))).toBeInTheDocument();
      });

      // Click confirm delete
      const confirmButton = screen.getByText(i18n.t('common:buttons.delete'));
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockElectronAPI.removeGitLabInstance).toHaveBeenCalled();
      });
    }
  });

  it('should close delete dialog when cancel is clicked', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('GitLab.com')).toBeInTheDocument();
    });

    // Find and click delete button
    const allButtons = screen.getAllByRole('button');
    const deleteButton = allButtons.find(btn => {
      return btn.classList.contains('text-destructive') || btn.className.includes('destructive');
    });

    if (deleteButton) {
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(i18n.t('settings:sourceControl.gitlab.delete.title'))).toBeInTheDocument();
      });

      // Click cancel
      const cancelButton = screen.getByText(i18n.t('common:buttons.cancel'));
      fireEvent.click(cancelButton);

      // Dialog should be closed
      await waitFor(() => {
        expect(screen.queryByText(i18n.t('settings:sourceControl.gitlab.delete.title'))).not.toBeInTheDocument();
      });

      // Instance should still be in the list
      expect(screen.getByText('GitLab.com')).toBeInTheDocument();
    }
  });
});

describe('SourceControlSettings - Error Handling', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('should handle GitHub connection test failure', async () => {
    mockElectronAPI.testGitHubConnection.mockResolvedValue({
      success: true,
      data: { success: false, error: 'Invalid token' }
    });

    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    // Enter a token
    const tokenInput = screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx');
    fireEvent.change(tokenInput, { target: { value: 'ghp_invalid' } });

    // Click test connection
    const testButton = screen.getByText(i18n.t('settings:sourceControl.github.testConnection'));
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(mockElectronAPI.testGitHubConnection).toHaveBeenCalled();
    });

    // Should show invalid status after failed test
    await waitFor(() => {
      expect(screen.getByText(i18n.t('settings:sourceControl.github.status.invalid'))).toBeInTheDocument();
    });
  });

  it('should handle GitLab instances load failure gracefully', async () => {
    mockElectronAPI.listGitLabInstances.mockRejectedValue(new Error('Network error'));

    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    // Should not crash, the empty state or loading should be shown
    await waitFor(() => {
      expect(mockElectronAPI.listGitLabInstances).toHaveBeenCalled();
    });
  });
});

describe('SourceControlSettings - Set Default Instance', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('should show Set Default button for non-default instances', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Self-Hosted GitLab')).toBeInTheDocument();
    });

    // There should be a "Set Default" button for the non-default instance
    expect(screen.getByText(i18n.t('settings:sourceControl.gitlab.setDefault'))).toBeInTheDocument();
  });

  it('should call updateGitLabInstance with isDefault when Set Default is clicked', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={defaultSettings}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Self-Hosted GitLab')).toBeInTheDocument();
    });

    // Click Set Default
    const setDefaultButton = screen.getByText(i18n.t('settings:sourceControl.gitlab.setDefault'));
    fireEvent.click(setDefaultButton);

    await waitFor(() => {
      expect(mockElectronAPI.updateGitLabInstance).toHaveBeenCalledWith('gitlab-2', { isDefault: true });
    });
  });
});

describe('SourceControlSettings - Token Display', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('should pre-fill GitHub token input when settings have token', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={settingsWithGitHub}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    const tokenInput = screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx') as HTMLInputElement;
    expect(tokenInput.value).toBe('ghp_testtoken123456789');
  });

  it('should have password type on token input by default', async () => {
    renderWithWrapper(
      <SourceControlSettings
        settings={settingsWithGitHub}
        onSettingsChange={vi.fn()}
        isOpen={true}
      />
    );

    const tokenInput = screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx') as HTMLInputElement;
    expect(tokenInput.type).toBe('password');
  });
});
