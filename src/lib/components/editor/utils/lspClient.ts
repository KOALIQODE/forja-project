/**
 * Frontend LSP client — bridges Tauri LSP commands and the diagnostics store.
 *
 * Usage:
 *   import { lspOpenDocument, lspChangeDocument, lspCloseDocument } from '$lib/utils/lspClient';
 *
 *   - Call initLspListeners() once (idempotent) to wire up the event listener.
 *   - Call lspOpenDocument / lspChangeDocument / lspCloseDocument from EditorBuffer.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { setDiagnostics, clearDiagnostics, type Diagnostic, type DiagnosticSeverity } from '$lib/stores/diagnosticsStore';

/** Languages with a configured LSP server on the backend. */
const LSP_LANGUAGES = new Set(['json']);

let _listenersInitialized = false;

/** Register the `lsp-diagnostics` Tauri event listener. Idempotent. */
export async function initLspListeners(): Promise<void> {
  if (_listenersInitialized) return;
  _listenersInitialized = true;

  await listen<{ uri: string; diagnostics: LspDiagnostic[] }>('lsp-diagnostics', (event) => {
    const { uri, diagnostics } = event.payload;
    // Convert file:// URI → absolute path
    const filePath = decodeURIComponent(uri.replace(/^file:\/\//, ''));
    const mapped: Diagnostic[] = diagnostics.map(mapDiagnostic);
    setDiagnostics(filePath, mapped);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function lspOpenDocument(
  language: string,
  filePath: string,
  content: string
): Promise<void> {
  if (!LSP_LANGUAGES.has(language)) return;
  await initLspListeners();
  try {
    await invoke('lsp_open_document', {
      language,
      uri: pathToUri(filePath),
      content,
    });
  } catch (e) {
    console.warn('[LSP] lsp_open_document failed:', e);
  }
}

export async function lspChangeDocument(
  language: string,
  filePath: string,
  version: number,
  content: string
): Promise<void> {
  if (!LSP_LANGUAGES.has(language)) return;
  try {
    await invoke('lsp_change_document', {
      language,
      uri: pathToUri(filePath),
      version,
      content,
    });
  } catch (e) {
    console.warn('[LSP] lsp_change_document failed:', e);
  }
}

export async function lspCloseDocument(
  language: string,
  filePath: string
): Promise<void> {
  if (!LSP_LANGUAGES.has(language)) return;
  clearDiagnostics(filePath);
  try {
    await invoke('lsp_close_document', {
      language,
      uri: pathToUri(filePath),
    });
  } catch (e) {
    console.warn('[LSP] lsp_close_document failed:', e);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pathToUri(filePath: string): string {
  // Ensure proper file:// URI (Linux/macOS absolute paths start with /)
  if (filePath.startsWith('/')) return `file://${filePath}`;
  // Windows: C:\... → file:///C:/...
  return `file:///${filePath.replace(/\\/g, '/')}`;
}

interface LspDiagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity?: number;
  message: string;
  source?: string;
  code?: string | number;
}

function mapDiagnostic(d: LspDiagnostic): Diagnostic {
  return {
    line: d.range.start.line,
    col: d.range.start.character,
    endLine: d.range.end.line,
    endCol: d.range.end.character,
    message: d.message,
    severity: lspSeverity(d.severity),
    source: d.source,
    code: d.code,
  };
}

function lspSeverity(code: number | undefined): DiagnosticSeverity {
  switch (code) {
    case 1: return 'error';
    case 2: return 'warning';
    case 3: return 'info';
    case 4: return 'hint';
    default: return 'hint';
  }
}
