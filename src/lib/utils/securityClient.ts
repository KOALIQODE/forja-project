/**
 * Security client — bridges Tauri security commands and the securityStore.
 *
 * Usage:
 *   import { initSecurityListeners, auditDependencies, watchLockfile } from '$lib/utils/securityClient';
 *
 *   - Call initSecurityListeners() once to wire up the `security-audit-result` event.
 *   - Call watchLockfile(projectPath) when a project opens — it auto-audits on lockfile changes.
 *   - Call auditDependencies(projectPath) to trigger a manual scan.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { upsertNestedReport, type AuditReport } from '$lib/stores/securityStore';

let _listenersInitialized = false;

/** Register the `security-audit-result` Tauri event listener. Idempotent. */
export async function initSecurityListeners(): Promise<void> {
  if (_listenersInitialized) return;
  _listenersInitialized = true;

  await listen<AuditReport>('security-audit-result', (event) => {
    // receive per-project audit results and upsert into nested reports so the UI shows nested/aggregated data in real-time
    upsertNestedReport(event.payload);
  });
}

/** Manually trigger an `npm audit` for the given project path. */
export async function auditDependencies(projectPath: string): Promise<AuditReport | null> {
  try {
    const r = await invoke<AuditReport>('audit_dependencies', { projectPath });
    // Upsert the returned report immediately so UI updates without waiting for the event
    if (r) upsertNestedReport(r);
    return r;
  } catch (e) {
    console.warn('[Security] audit_dependencies failed:', e);
    return null;
  }
}

/**
 * Start watching the lockfile (package-lock.json / yarn.lock / pnpm-lock.yaml)
 * in the given project. Automatically re-audits and emits `security-audit-result`
 * whenever the lockfile changes (i.e. after `npm install`).
 */
export async function watchLockfile(projectPath: string): Promise<void> {
  await initSecurityListeners();
  try {
    await invoke('watch_lockfile', { projectPath });
    // Run an initial audit so results are available immediately on project open
    await auditDependencies(projectPath);
  } catch (e) {
    console.warn('[Security] watch_lockfile failed:', e);
  }
}
