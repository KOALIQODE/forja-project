import { invoke } from "@tauri-apps/api/core";
import {
  scanAll,
  syncProjectDependencies,
  type Vulnerability,
} from "$lib/stores/DepsStore";

/**
 * Legacy wrapper for security alerts.
 * Now it triggers a full dependency scan.
 */
export async function auditDependencies(projectPath: string): Promise<any> {
  return scanAll(projectPath);
}

/**
 * Starts the dependency watcher.
 */
export async function watchLockfile(projectPath: string): Promise<void> {
  await syncProjectDependencies(projectPath);
}

/**
 * Validates a dependency before installation.
 */
export async function validateDependency(
  ecosystem: string,
  pkg: string,
  version?: string,
): Promise<Vulnerability[]> {
  try {
    return await invoke<Vulnerability[]>("validate_dependency", {
      ecosystem,
      package: pkg,
      version,
    });
  } catch (e) {
    console.error("[Security] validate_dependency failed:", e);
    throw e;
  }
}
