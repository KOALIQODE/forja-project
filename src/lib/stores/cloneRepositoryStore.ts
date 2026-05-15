import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { derived, get, writable } from 'svelte/store';
import { closeDialog } from './dialogStore';

import type { ScanResult } from '$lib/DepsStore';

export interface CloneProgress {
  session_id: string;
  status: string;
  message: string;
  progress: number;
  temp_path?: string;
  project_name?: string;
}

export interface CloneValidationResult {
  success: boolean;
  session_id: string;
  temp_path: string;
  project_name: string;
  scans: ScanResult[];
  total_vulnerabilities: number;
  critical_vulns: number;
  high_vulns: number;
  can_save: boolean;
  can_safe_install: boolean;
  confidence: string;
  message: string;
}

export interface ProjectSaveResult {
  success: boolean;
  session_id: string;
  final_path: string;
  project_name: string;
  message: string;
}

export interface InstallTarget {
  ecosystem: string;
  manifest_rel_path: string;
}

export interface InstallProgress {
  session_id: string;
  ecosystem: string;
  manifest_rel_path: string;
  status: string;
  message: string;
  progress: number;
}

export interface InstallDepsResult {
  success: boolean;
  ecosystem: string;
  manifest_rel_path: string;
  mode: string;
  output: string;
  message: string;
}

let listenersReady = false;

export const cloneProgress = writable<CloneProgress | null>(null);
export const installProgress = writable<InstallProgress | null>(null);
export const validationResult = writable<CloneValidationResult | null>(null);
export const lastSaveResult = writable<ProjectSaveResult | null>(null);
export const installResults = writable<InstallDepsResult[]>([]);
export const cloneError = writable<string | null>(null);
export const isCloning = writable(false);
export const isSaving = writable(false);
export const isInstalling = writable(false);

export const activeCloneSessionId = derived(
  [validationResult, cloneProgress, installProgress],
  ([$validationResult, $cloneProgress, $installProgress]) =>
    $validationResult?.session_id ?? $cloneProgress?.session_id ?? $installProgress?.session_id ?? null
);

export const cloneWorkflowActive = derived(
  [isCloning, isSaving, isInstalling],
  ([$isCloning, $isSaving, $isInstalling]) => $isCloning || $isSaving || $isInstalling
);

async function ensureListeners() {
  if (listenersReady) {
    return;
  }

  await listen<CloneProgress>('clone:progress', (event) => {
    cloneProgress.set(event.payload);
  });

  await listen<CloneValidationResult>('clone:scan_results', (event) => {
    validationResult.set(event.payload);
  });

  await listen<InstallProgress>('install:progress', (event) => {
    installProgress.set(event.payload);
  });

  listenersReady = true;
}

export function resetCloneRepositoryFlow() {
  cloneProgress.set(null);
  installProgress.set(null);
  validationResult.set(null);
  lastSaveResult.set(null);
  installResults.set([]);
  cloneError.set(null);
  isCloning.set(false);
  isSaving.set(false);
  isInstalling.set(false);
}

export async function startCloneAndValidate(gitUrl: string, projectName?: string, autofix: boolean = false) {
  await ensureListeners();
  resetCloneRepositoryFlow();
  isCloning.set(true);

  try {
    const result = await invoke<CloneValidationResult>('clone_and_validate', {
      req: {
        git_url: gitUrl,
        project_name: projectName?.trim() ? projectName.trim() : null,
        autofix,
      },
    });

    validationResult.set(result);
    return result;
  } catch (value: unknown) {
    const message = value instanceof Error ? value.message : String(value);
    cloneError.set(message);
    throw value;
  } finally {
    isCloning.set(false);
  }
}

export async function saveValidatedProject(
  sessionId: string,
  destinationRoot: string,
  projectName?: string
) {
  await ensureListeners();
  isSaving.set(true);

  try {
    const result = await invoke<ProjectSaveResult>('save_validated_project', {
      req: {
        session_id: sessionId,
        destination_root: destinationRoot,
        project_name: projectName?.trim() ? projectName.trim() : null,
      },
    });

    lastSaveResult.set(result);
    return result;
  } catch (value: unknown) {
    const message = value instanceof Error ? value.message : String(value);
    cloneError.set(message);
    throw value;
  } finally {
    isSaving.set(false);
  }
}

export async function installValidatedTargets(
  sessionId: string,
  projectPath: string,
  targets: InstallTarget[],
  mode: 'safe' | 'full' = 'safe'
) {
  await ensureListeners();
  isInstalling.set(true);
  installResults.set([]);

  try {
    const results = await invoke<InstallDepsResult[]>('install_project_deps', {
      req: {
        session_id: sessionId,
        project_path: projectPath,
        targets,
        mode,
      },
    });

    installResults.set(results);
    return results;
  } catch (value: unknown) {
    const message = value instanceof Error ? value.message : String(value);
    cloneError.set(message);
    throw value;
  } finally {
    isInstalling.set(false);
  }
}

export async function cleanupCloneSession(sessionId: string | null | undefined) {
  if (!sessionId) {
    resetCloneRepositoryFlow();
    return;
  }

  try {
    await invoke('cleanup_clone_session', { sessionId });
  } finally {
    resetCloneRepositoryFlow();
  }
}

/**
 * Centrally managed close for Clone Repository dialog.
 * Handles active session cleanup and state reset before closing.
 */
export async function closeCloneRepository() {
  const cloning = get(isCloning);
  const saving = get(isSaving);
  const installing = get(isInstalling);

  if (cloning || saving || installing) {
    return;
  }

  const sessionId = get(activeCloneSessionId);
  if (sessionId) {
    await cleanupCloneSession(sessionId);
  } else {
    resetCloneRepositoryFlow();
  }

  closeDialog();
}
