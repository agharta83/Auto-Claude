/**
 * Tests for Git URL Parsing Utilities
 * US#80: Tests unitaires detectGitRemote - Tous les patterns URL GitHub/GitLab
 */

import { describe, it, expect } from 'vitest';
import {
  parseGitHubUrl,
  parseGitLabUrl,
  detectProvider,
  buildNormalizedUrl,
  parseGitRemoteUrl
} from '../git-url-parser';

describe('parseGitHubUrl', () => {
  describe('SSH format', () => {
    it('parses standard SSH URL with .git suffix', () => {
      const result = parseGitHubUrl('git@github.com:owner/repo.git');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('parses SSH URL without .git suffix', () => {
      const result = parseGitHubUrl('git@github.com:owner/repo');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('parses SSH URL with hyphenated owner/repo', () => {
      const result = parseGitHubUrl('git@github.com:my-org/my-project.git');
      expect(result).toEqual({ owner: 'my-org', repo: 'my-project' });
    });

    it('parses SSH URL with underscored owner/repo', () => {
      const result = parseGitHubUrl('git@github.com:my_org/my_project.git');
      expect(result).toEqual({ owner: 'my_org', repo: 'my_project' });
    });

    it('parses SSH URL with numeric characters', () => {
      const result = parseGitHubUrl('git@github.com:org123/project456.git');
      expect(result).toEqual({ owner: 'org123', repo: 'project456' });
    });
  });

  describe('HTTPS format', () => {
    it('parses standard HTTPS URL with .git suffix', () => {
      const result = parseGitHubUrl('https://github.com/owner/repo.git');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('parses HTTPS URL without .git suffix', () => {
      const result = parseGitHubUrl('https://github.com/owner/repo');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('parses HTTP URL (non-secure)', () => {
      const result = parseGitHubUrl('http://github.com/owner/repo.git');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('parses HTTPS URL with hyphenated owner/repo', () => {
      const result = parseGitHubUrl('https://github.com/my-org/my-project');
      expect(result).toEqual({ owner: 'my-org', repo: 'my-project' });
    });
  });

  describe('invalid URLs', () => {
    it('returns null for non-GitHub URLs', () => {
      expect(parseGitHubUrl('git@gitlab.com:owner/repo.git')).toBeNull();
      expect(parseGitHubUrl('https://gitlab.com/owner/repo')).toBeNull();
    });

    it('returns null for malformed URLs', () => {
      expect(parseGitHubUrl('github.com/owner/repo')).toBeNull();
      expect(parseGitHubUrl('git@github.com:owner')).toBeNull();
      expect(parseGitHubUrl('https://github.com/owner')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseGitHubUrl('')).toBeNull();
    });
  });
});

describe('parseGitLabUrl', () => {
  describe('SSH format - gitlab.com', () => {
    it('parses standard SSH URL with .git suffix', () => {
      const result = parseGitLabUrl('git@gitlab.com:group/project.git');
      expect(result).toEqual({
        owner: 'group',
        repo: 'project',
        instanceUrl: 'https://gitlab.com'
      });
    });

    it('parses SSH URL without .git suffix', () => {
      const result = parseGitLabUrl('git@gitlab.com:group/project');
      expect(result).toEqual({
        owner: 'group',
        repo: 'project',
        instanceUrl: 'https://gitlab.com'
      });
    });
  });

  describe('SSH format - nested groups', () => {
    it('parses SSH URL with one level of nesting', () => {
      const result = parseGitLabUrl('git@gitlab.com:group/subgroup/project.git');
      expect(result).toEqual({
        owner: 'group/subgroup',
        repo: 'project',
        instanceUrl: 'https://gitlab.com'
      });
    });

    it('parses SSH URL with multiple levels of nesting', () => {
      const result = parseGitLabUrl('git@gitlab.com:org/team/subteam/project.git');
      expect(result).toEqual({
        owner: 'org/team/subteam',
        repo: 'project',
        instanceUrl: 'https://gitlab.com'
      });
    });
  });

  describe('SSH format - self-hosted', () => {
    it('parses self-hosted GitLab SSH URL', () => {
      const result = parseGitLabUrl('git@gitlab.company.com:group/project.git');
      expect(result).toEqual({
        owner: 'group',
        repo: 'project',
        instanceUrl: 'https://gitlab.company.com'
      });
    });

    it('parses self-hosted GitLab SSH URL with subdomain', () => {
      const result = parseGitLabUrl('git@git.internal.company.io:team/project.git');
      expect(result).toEqual({
        owner: 'team',
        repo: 'project',
        instanceUrl: 'https://git.internal.company.io'
      });
    });

    it('parses self-hosted GitLab SSH URL with nested groups', () => {
      const result = parseGitLabUrl('git@gitlab.corp.net:dept/team/subteam/project.git');
      expect(result).toEqual({
        owner: 'dept/team/subteam',
        repo: 'project',
        instanceUrl: 'https://gitlab.corp.net'
      });
    });
  });

  describe('HTTPS format - gitlab.com', () => {
    it('parses standard HTTPS URL with .git suffix', () => {
      const result = parseGitLabUrl('https://gitlab.com/group/project.git');
      expect(result).toEqual({
        owner: 'group',
        repo: 'project',
        instanceUrl: 'https://gitlab.com'
      });
    });

    it('parses HTTPS URL without .git suffix', () => {
      const result = parseGitLabUrl('https://gitlab.com/group/project');
      expect(result).toEqual({
        owner: 'group',
        repo: 'project',
        instanceUrl: 'https://gitlab.com'
      });
    });
  });

  describe('HTTPS format - nested groups', () => {
    it('parses HTTPS URL with nested groups', () => {
      const result = parseGitLabUrl('https://gitlab.com/org/team/project.git');
      expect(result).toEqual({
        owner: 'org/team',
        repo: 'project',
        instanceUrl: 'https://gitlab.com'
      });
    });

    it('parses HTTPS URL with deeply nested groups', () => {
      const result = parseGitLabUrl('https://gitlab.com/company/division/team/project');
      expect(result).toEqual({
        owner: 'company/division/team',
        repo: 'project',
        instanceUrl: 'https://gitlab.com'
      });
    });
  });

  describe('HTTPS format - self-hosted', () => {
    it('parses self-hosted HTTPS URL', () => {
      const result = parseGitLabUrl('https://gitlab.company.com/group/project.git');
      expect(result).toEqual({
        owner: 'group',
        repo: 'project',
        instanceUrl: 'https://gitlab.company.com'
      });
    });

    it('parses HTTP URL (non-secure)', () => {
      const result = parseGitLabUrl('http://gitlab.internal.net/team/project');
      expect(result).toEqual({
        owner: 'team',
        repo: 'project',
        instanceUrl: 'https://gitlab.internal.net'
      });
    });

    it('parses self-hosted HTTPS URL with port (should include in instanceUrl)', () => {
      const result = parseGitLabUrl('https://gitlab.local:8443/group/project.git');
      expect(result).toEqual({
        owner: 'group',
        repo: 'project',
        instanceUrl: 'https://gitlab.local:8443'
      });
    });
  });

  describe('invalid URLs', () => {
    it('returns null for URL with only one path segment', () => {
      expect(parseGitLabUrl('git@gitlab.com:project.git')).toBeNull();
      expect(parseGitLabUrl('https://gitlab.com/project')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseGitLabUrl('')).toBeNull();
    });

    it('returns null for malformed URLs', () => {
      expect(parseGitLabUrl('gitlab.com/group/project')).toBeNull();
    });
  });
});

describe('detectProvider', () => {
  describe('GitHub detection', () => {
    it('detects GitHub from SSH URL', () => {
      expect(detectProvider('git@github.com:owner/repo.git')).toBe('github');
    });

    it('detects GitHub from HTTPS URL', () => {
      expect(detectProvider('https://github.com/owner/repo')).toBe('github');
    });

    it('detects GitHub from HTTP URL', () => {
      expect(detectProvider('http://github.com/owner/repo')).toBe('github');
    });
  });

  describe('GitLab detection', () => {
    it('detects GitLab from SSH URL', () => {
      expect(detectProvider('git@gitlab.com:group/project.git')).toBe('gitlab');
    });

    it('detects GitLab from HTTPS URL', () => {
      expect(detectProvider('https://gitlab.com/group/project')).toBe('gitlab');
    });

    it('detects GitLab from self-hosted URL with gitlab in name', () => {
      expect(detectProvider('https://gitlab.company.com/team/project')).toBe('gitlab');
    });
  });

  describe('Generic git hosting (treated as GitLab)', () => {
    it('detects generic git hosting as gitlab', () => {
      // Any parseable URL without github.com is treated as gitlab
      expect(detectProvider('git@git.company.com:team/project.git')).toBe('gitlab');
    });

    it('detects Bitbucket-style URL as gitlab (generic)', () => {
      expect(detectProvider('git@bitbucket.org:team/project.git')).toBe('gitlab');
    });
  });

  describe('Unknown/unparseable', () => {
    it('returns none for unparseable URLs', () => {
      expect(detectProvider('not-a-git-url')).toBe('none');
      expect(detectProvider('')).toBe('none');
    });
  });
});

describe('buildNormalizedUrl', () => {
  it('builds correct URL for GitHub', () => {
    const result = buildNormalizedUrl('github', 'https://github.com', 'owner', 'repo');
    expect(result).toBe('https://github.com/owner/repo');
  });

  it('builds correct URL for GitLab', () => {
    const result = buildNormalizedUrl('gitlab', 'https://gitlab.com', 'group', 'project');
    expect(result).toBe('https://gitlab.com/group/project');
  });

  it('builds correct URL for self-hosted GitLab', () => {
    const result = buildNormalizedUrl('gitlab', 'https://gitlab.company.com', 'team', 'project');
    expect(result).toBe('https://gitlab.company.com/team/project');
  });

  it('builds correct URL for nested groups', () => {
    const result = buildNormalizedUrl('gitlab', 'https://gitlab.com', 'org/team/subteam', 'project');
    expect(result).toBe('https://gitlab.com/org/team/subteam/project');
  });

  it('returns empty string for none provider', () => {
    const result = buildNormalizedUrl('none', '', '', '');
    expect(result).toBe('');
  });
});

describe('parseGitRemoteUrl', () => {
  describe('GitHub URLs', () => {
    it('parses GitHub SSH URL', () => {
      const result = parseGitRemoteUrl('git@github.com:owner/repo.git');
      expect(result).toEqual({
        provider: 'github',
        owner: 'owner',
        repo: 'repo',
        instanceUrl: 'https://github.com',
        normalizedUrl: 'https://github.com/owner/repo'
      });
    });

    it('parses GitHub HTTPS URL', () => {
      const result = parseGitRemoteUrl('https://github.com/my-org/my-project');
      expect(result).toEqual({
        provider: 'github',
        owner: 'my-org',
        repo: 'my-project',
        instanceUrl: 'https://github.com',
        normalizedUrl: 'https://github.com/my-org/my-project'
      });
    });
  });

  describe('GitLab URLs', () => {
    it('parses GitLab SSH URL', () => {
      const result = parseGitRemoteUrl('git@gitlab.com:group/project.git');
      expect(result).toEqual({
        provider: 'gitlab',
        owner: 'group',
        repo: 'project',
        instanceUrl: 'https://gitlab.com',
        normalizedUrl: 'https://gitlab.com/group/project'
      });
    });

    it('parses GitLab HTTPS URL with nested groups', () => {
      const result = parseGitRemoteUrl('https://gitlab.com/org/team/project');
      expect(result).toEqual({
        provider: 'gitlab',
        owner: 'org/team',
        repo: 'project',
        instanceUrl: 'https://gitlab.com',
        normalizedUrl: 'https://gitlab.com/org/team/project'
      });
    });

    it('parses self-hosted GitLab URL', () => {
      const result = parseGitRemoteUrl('https://gitlab.company.com/dept/project.git');
      expect(result).toEqual({
        provider: 'gitlab',
        owner: 'dept',
        repo: 'project',
        instanceUrl: 'https://gitlab.company.com',
        normalizedUrl: 'https://gitlab.company.com/dept/project'
      });
    });
  });

  describe('Invalid URLs', () => {
    it('returns null for unparseable URLs', () => {
      expect(parseGitRemoteUrl('not-a-url')).toBeNull();
      expect(parseGitRemoteUrl('')).toBeNull();
    });

    it('returns null for URLs without enough path segments', () => {
      expect(parseGitRemoteUrl('https://github.com/owner')).toBeNull();
    });
  });
});

describe('Real-world URL examples', () => {
  const testCases = [
    {
      name: 'Popular GitHub repo (SSH)',
      url: 'git@github.com:facebook/react.git',
      expected: { provider: 'github', owner: 'facebook', repo: 'react' }
    },
    {
      name: 'Popular GitHub repo (HTTPS)',
      url: 'https://github.com/microsoft/vscode.git',
      expected: { provider: 'github', owner: 'microsoft', repo: 'vscode' }
    },
    {
      name: 'GitLab public project',
      url: 'https://gitlab.com/gitlab-org/gitlab.git',
      expected: { provider: 'gitlab', owner: 'gitlab-org', repo: 'gitlab' }
    },
    {
      name: 'GitLab nested group project',
      url: 'git@gitlab.com:gitlab-org/security-products/analyzers/semgrep.git',
      expected: { provider: 'gitlab', owner: 'gitlab-org/security-products/analyzers', repo: 'semgrep' }
    },
    {
      name: 'GitHub user repo with numbers',
      url: 'https://github.com/user123/project-2024',
      expected: { provider: 'github', owner: 'user123', repo: 'project-2024' }
    }
  ];

  testCases.forEach(({ name, url, expected }) => {
    it(`parses ${name}`, () => {
      const result = parseGitRemoteUrl(url);
      expect(result).not.toBeNull();
      expect(result?.provider).toBe(expected.provider);
      expect(result?.owner).toBe(expected.owner);
      expect(result?.repo).toBe(expected.repo);
    });
  });
});
