/**
 * Source Control Utilities
 * Functions for working with git remotes and source control providers
 */

import type { DetectedRemote, SourceControlProvider } from '../types/project';
import type { GitLabInstance } from '../types/settings';

/**
 * Normalize a URL for comparison (removes trailing slashes, lowercases)
 */
function normalizeUrl(url: string): string {
  return url.toLowerCase().replace(/\/+$/, '');
}

/**
 * Match a detected GitLab remote with configured instances
 * Returns the matching GitLabInstance.id or undefined if no match
 *
 * @param detectedRemote - The detected git remote information
 * @param gitlabInstances - List of configured GitLab instances from settings
 * @returns The matching instance ID or undefined
 */
export function matchGitLabInstance(
  detectedRemote: DetectedRemote,
  gitlabInstances: GitLabInstance[] | undefined
): string | undefined {
  if (detectedRemote.provider !== 'gitlab' || !gitlabInstances?.length) {
    return undefined;
  }

  const detectedUrl = normalizeUrl(detectedRemote.instanceUrl);

  // Find the instance with matching URL
  const matchingInstance = gitlabInstances.find(
    (instance) => normalizeUrl(instance.url) === detectedUrl
  );

  return matchingInstance?.id;
}

/**
 * Check if a detected remote matches a specific provider
 */
export function isProvider(
  remote: DetectedRemote | null | undefined,
  provider: SourceControlProvider
): boolean {
  return remote?.provider === provider;
}

/**
 * Build a display string for a detected remote (e.g., "owner/repo")
 */
export function formatRemoteDisplay(remote: DetectedRemote | null | undefined): string {
  if (!remote || remote.provider === 'none') {
    return '';
  }
  return `${remote.owner}/${remote.repo}`;
}

/**
 * Get the appropriate icon name for a source control provider
 */
export function getProviderIcon(provider: SourceControlProvider): string {
  switch (provider) {
    case 'github':
      return 'github';
    case 'gitlab':
      return 'gitlab';
    default:
      return 'git-branch';
  }
}

/**
 * Get the label for pull/merge requests based on provider
 */
export function getPullRequestLabel(provider: SourceControlProvider): string {
  switch (provider) {
    case 'github':
      return 'Pull Requests';
    case 'gitlab':
      return 'Merge Requests';
    default:
      return 'Pull Requests';
  }
}

/**
 * Get the abbreviated label for PR/MR based on provider
 */
export function getPullRequestAbbr(provider: SourceControlProvider): string {
  switch (provider) {
    case 'github':
      return 'PRs';
    case 'gitlab':
      return 'MRs';
    default:
      return 'PRs';
  }
}
