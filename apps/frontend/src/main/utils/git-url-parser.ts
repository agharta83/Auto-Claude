/**
 * Git URL Parsing Utilities
 * Pure functions for parsing git remote URLs (GitHub, GitLab)
 *
 * These functions are extracted for testability and can be used
 * both in main process and shared contexts.
 */

import type { SourceControlProvider } from '../../shared/types/project';

/**
 * Result of parsing a GitHub URL
 */
export interface GitHubUrlParseResult {
  owner: string;
  repo: string;
}

/**
 * Result of parsing a GitLab URL
 */
export interface GitLabUrlParseResult {
  owner: string;
  repo: string;
  instanceUrl: string;
}

/**
 * Parse a GitHub URL (SSH or HTTPS) and extract owner/repo
 *
 * Supported formats:
 * - SSH: git@github.com:owner/repo.git
 * - HTTPS: https://github.com/owner/repo.git
 * - HTTPS without .git: https://github.com/owner/repo
 *
 * @param url - The git remote URL to parse
 * @returns Parsed owner and repo, or null if not a valid GitHub URL
 */
export function parseGitHubUrl(url: string): GitHubUrlParseResult | null {
  // SSH format: git@github.com:owner/repo.git
  const sshMatch = url.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  // HTTPS format: https://github.com/owner/repo.git or https://github.com/owner/repo
  const httpsMatch = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  return null;
}

/**
 * Parse a GitLab URL (SSH or HTTPS) and extract group/project
 * Supports nested groups (e.g., group/subgroup/project)
 * Works for both gitlab.com and self-hosted instances
 *
 * Supported formats:
 * - SSH: git@gitlab.com:group/project.git
 * - SSH nested: git@gitlab.com:group/subgroup/project.git
 * - SSH self-hosted: git@gitlab.company.com:group/project.git
 * - HTTPS: https://gitlab.com/group/project.git
 * - HTTPS nested: https://gitlab.com/group/subgroup/project.git
 * - HTTPS self-hosted: https://gitlab.company.com/group/project.git
 *
 * @param url - The git remote URL to parse
 * @returns Parsed owner, repo, and instanceUrl, or null if not a valid GitLab-style URL
 */
export function parseGitLabUrl(url: string): GitLabUrlParseResult | null {
  // SSH format: git@<host>:<path>.git
  const sshMatch = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch) {
    const host = sshMatch[1];
    const pathParts = sshMatch[2].split('/');
    if (pathParts.length < 2) return null;

    const repo = pathParts.pop()!;
    const owner = pathParts.join('/'); // Supports nested groups
    const instanceUrl = `https://${host}`;

    return { owner, repo, instanceUrl };
  }

  // HTTPS format: https://<host>/<path>.git or https://<host>/<path>
  const httpsMatch = url.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    const host = httpsMatch[1];
    const pathParts = httpsMatch[2].split('/');
    if (pathParts.length < 2) return null;

    const repo = pathParts.pop()!;
    const owner = pathParts.join('/'); // Supports nested groups
    const instanceUrl = `https://${host}`;

    return { owner, repo, instanceUrl };
  }

  return null;
}

/**
 * Determine the source control provider from a remote URL
 *
 * @param url - The git remote URL
 * @returns The detected provider ('github', 'gitlab', or 'none')
 */
export function detectProvider(url: string): SourceControlProvider {
  // Check for GitHub
  if (url.includes('github.com')) {
    return 'github';
  }

  // Check for GitLab (gitlab.com or any URL that looks like GitLab)
  // Self-hosted GitLab instances are harder to detect, so we check for gitlab in the host
  // or fall back to gitlab if it's not GitHub
  if (url.includes('gitlab')) {
    return 'gitlab';
  }

  // For other Git hosting (Bitbucket, self-hosted GitLab without gitlab in name, etc.)
  // Try to parse as GitLab format since it's more generic
  const parsed = parseGitLabUrl(url);
  if (parsed) {
    // If it parses and has a recognizable structure, treat as gitlab (generic)
    return 'gitlab';
  }

  return 'none';
}

/**
 * Build a normalized HTTPS URL for display
 *
 * @param provider - The source control provider
 * @param instanceUrl - The base URL of the instance
 * @param owner - The owner/group name
 * @param repo - The repository name
 * @returns The normalized HTTPS URL
 */
export function buildNormalizedUrl(
  provider: SourceControlProvider,
  instanceUrl: string,
  owner: string,
  repo: string
): string {
  if (provider === 'none') return '';
  return `${instanceUrl}/${owner}/${repo}`;
}

/**
 * Parse any git remote URL and return structured information
 *
 * @param url - The git remote URL to parse
 * @returns Structured information about the remote, or null if unparseable
 */
export function parseGitRemoteUrl(url: string): {
  provider: SourceControlProvider;
  owner: string;
  repo: string;
  instanceUrl: string;
  normalizedUrl: string;
} | null {
  const provider = detectProvider(url);

  if (provider === 'github') {
    const parsed = parseGitHubUrl(url);
    if (!parsed) return null;

    const instanceUrl = 'https://github.com';
    return {
      provider,
      owner: parsed.owner,
      repo: parsed.repo,
      instanceUrl,
      normalizedUrl: buildNormalizedUrl(provider, instanceUrl, parsed.owner, parsed.repo)
    };
  }

  if (provider === 'gitlab') {
    const parsed = parseGitLabUrl(url);
    if (!parsed) return null;

    return {
      provider,
      owner: parsed.owner,
      repo: parsed.repo,
      instanceUrl: parsed.instanceUrl,
      normalizedUrl: buildNormalizedUrl(provider, parsed.instanceUrl, parsed.owner, parsed.repo)
    };
  }

  return null;
}
