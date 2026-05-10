import { writable, derived, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface GitFileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | null;
}

export interface GitRepoStatus {
  path: string;
  isRepo: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  hasUpstream: boolean;
}

// Central git file statuses cache
export const gitFileStatuses = writable<Map<string, GitFileStatus>>(new Map());

// Git repo statuses for projects
export const gitRepoStatuses = writable<Map<string, GitRepoStatus>>(new Map());

// Track which project root we're monitoring for file changes
export const monitoredProjectRoot = writable<string | null>(null);

// Timestamp of last status refresh (for triggering re-scans)
export const lastGitStatusRefresh = writable<number>(0);

// Debounce handle for batching file change events
let gitStatusDebounceHandle: ReturnType<typeof setTimeout> | null = null;
const GIT_STATUS_DEBOUNCE_MS = 500;

/**
 * Normalize path for consistent comparison
 */
function normalizePath(p?: string): string {
  if (!p) return '';
  return p.replace(/\\/g, '/').replace(/\/+/g, '/');
}

/**
 * Get all git statuses for a directory (calls backend once per batch)
 */
export async function refreshGitStatuses(projectPath: string): Promise<void> {
  if (!projectPath) return;

  try {
    const statuses = await invoke<Record<string, string>>('get_git_statuses_map', {
      path: projectPath,
    });

    const normalized: Map<string, GitFileStatus> = new Map();
    for (const [path, status] of Object.entries(statuses)) {
      normalized.set(
        normalizePath(path),
        {
          path: normalizePath(path),
          status: status as any || null,
        }
      );
    }

    gitFileStatuses.set(normalized);
    lastGitStatusRefresh.set(Date.now());
  } catch (e) {
    console.error('[gitStatusStore] refreshGitStatuses failed:', e);
  }
}

/**
 * Batch file changes and trigger a refresh after debounce
 */
export function onFileChanged(filePath: string): void {
  if (gitStatusDebounceHandle !== null) {
    clearTimeout(gitStatusDebounceHandle);
  }

  gitStatusDebounceHandle = setTimeout(() => {
    const project = get(monitoredProjectRoot);
    if (project) {
      void refreshGitStatuses(project);
    }
    gitStatusDebounceHandle = null;
  }, GIT_STATUS_DEBOUNCE_MS);
}

/**
 * Get git status for a specific file (from cache)
 */
export function getFileGitStatus(filePath: string): GitFileStatus | null {
  const statuses = get(gitFileStatuses);
  return statuses.get(normalizePath(filePath)) || null;
}

/**
 * Listen to window events and batch updates
 */
let windowEventUnlisten: (() => void) | null = null;

export async function startGitStatusMonitoring(projectRoot: string): Promise<void> {
  if (!projectRoot) return;

  // Update monitored root
  monitoredProjectRoot.set(projectRoot);

  // Initial scan
  await refreshGitStatuses(projectRoot);

  // Setup window event listener for batching
  if (windowEventUnlisten) {
    windowEventUnlisten();
  }

  windowEventUnlisten = () => {
    window.removeEventListener('forja:file-changed', handleFileChanged);
    window.removeEventListener('forja:file-saved', handleFileSaved);
  };

  const handleFileChanged = () => onFileChanged(projectRoot);
  const handleFileSaved = () => onFileChanged(projectRoot);

  window.addEventListener('forja:file-changed', handleFileChanged);
  window.addEventListener('forja:file-saved', handleFileSaved);
}

export async function stopGitStatusMonitoring(): Promise<void> {
  if (windowEventUnlisten) {
    windowEventUnlisten();
    windowEventUnlisten = null;
  }
  if (gitStatusDebounceHandle !== null) {
    clearTimeout(gitStatusDebounceHandle);
  }
  monitoredProjectRoot.set(null);
  gitFileStatuses.set(new Map());
}

/**
 * Refresh git repo status (branch, ahead/behind)
 */
export async function refreshGitRepoStatus(projectPath: string): Promise<GitRepoStatus | null> {
  if (!projectPath) return null;

  try {
    const status = await invoke<any>('git_ahead_behind', { path: projectPath });
    const repoStatus: GitRepoStatus = {
      path: projectPath,
      isRepo: status.is_repo,
      branch: status.branch,
      ahead: status.ahead,
      behind: status.behind,
      hasUpstream: status.has_upstream,
    };

    gitRepoStatuses.update((statuses) => {
      statuses.set(projectPath, repoStatus);
      return statuses;
    });

    return repoStatus;
  } catch (e) {
    console.error('[gitStatusStore] refreshGitRepoStatus failed:', e);
    return null;
  }
}

/**
 * Derived store: get git status for a specific file as a reactive store
 */
export function getFileGitStatusStore(filePath: string) {
  return derived(gitFileStatuses, ($statuses) => {
    return $statuses.get(normalizePath(filePath)) || null;
  });
}

/**
 * Derived store: get all modified/added files in the monitored project
 */
export const modifiedFiles = derived(gitFileStatuses, ($statuses) => {
  const modified: GitFileStatus[] = [];
  for (const entry of $statuses.values()) {
    if (['modified', 'added', 'deleted', 'renamed'].includes(entry.status ?? '')) {
      modified.push(entry);
    }
  }
  return modified;
});

/**
 * Derived store: count of modified files
 */
export const modifiedCount = derived(modifiedFiles, ($modified) => $modified.length);
