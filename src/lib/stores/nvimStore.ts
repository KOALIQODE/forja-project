/**
 * Nvim Store - Reactive state for Neovim integration
 * Refactored to use direct API calls for lower latency
 */

import { writable, derived } from 'svelte/store';
import type { CursorPosition } from '$lib/navigation/types';
import { BUFFER_IDS, NVIM_MODES, type NvimMode } from '$lib/nvim/contentIds';

// Connection state
export const nvimConnected = writable<boolean>(false);
export const nvimConnecting = writable<boolean>(false);
export const nvimError = writable<string | null>(null);

// Buffer state
export const currentBufferId = writable<string | null>(null);
export const maxLines = writable<number>(1);
export const bufferContent = writable<string[]>([]);

// Cursor position
export const cursorPosition = writable<CursorPosition>({ line: 1, col: 1 });

// Navigation mode
export const nvimMode = writable<NvimMode>(NVIM_MODES.NORMAL);

// Navigation enabled
export const nvimNavEnabled = writable<boolean>(false);

// Derived stores
export const nvimStatus = derived(
  [nvimConnected, nvimConnecting, nvimError],
  ([$connected, $connecting, $error]) => ({
    connected: $connected,
    connecting: $connecting,
    error: $error,
    ready: $connected && !$connecting
  })
);

export const cursorCSS = derived(cursorPosition, ($cursor) => ({
  top: `${($cursor.line - 1) * 24}px`,    // Line height: 24px (standardized)
  left: `${$cursor.col * 10}px`           // Char width: 10px  
}));

// Selected index mapping (cursor line -> array index)
export const selectedIndex = derived(cursorPosition, ($cursor) => $cursor.line - 1);

// Actions
export async function connectNvimForComponent(componentType: string, options?: any): Promise<boolean> {
  nvimConnecting.set(true);
  nvimError.set(null);

  try {
    const response = await fetch('/api/nvim/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ componentType, options })
    });

    const result = await response.json();

    if (result.success) {
      nvimConnected.set(true);
      cursorPosition.set(result.cursor);
      currentBufferId.set(result.bufferId);
      if (result.maxLines) {
        maxLines.set(result.maxLines);
      }
      
      // Obtener contenido inicial
      const contentResponse = await fetch('/api/nvim/status');
      const contentResult = await contentResponse.json();
      if (contentResult.content) {
        bufferContent.set(contentResult.content);
      }
      
      return true;
    } else {
      nvimError.set(result.error || 'Connection failed');
      return false;
    }
  } catch (error) {
    nvimError.set(error instanceof Error ? error.message : 'Unknown error');
    return false;
  } finally {
    nvimConnecting.set(false);
  }
}

export async function sendNvimCommand(command: string, type: 'command' | 'input' = 'command'): Promise<boolean> {
  try {
    const response = await fetch('/api/nvim/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, type })
    });

    const result = await response.json();

    if (result.success) {
      if (result.cursor) {
        cursorPosition.set(result.cursor);
      }
      
      // Actualizar contenido después de cada movimiento/comando
      const contentResponse = await fetch('/api/nvim/status');
      const contentResult = await contentResponse.json();
      if (contentResult.content) {
        bufferContent.set(contentResult.content);
      }
      
      return true;
    } else {
      nvimError.set(result.error || 'Command failed');
      return false;
    }
  } catch (error) {
    console.error('Command failed:', error);
    return false;
  }
}

export async function getNvimStatus(): Promise<void> {
  try {
    const response = await fetch('/api/nvim/status');
    const result = await response.json();
    nvimConnected.set(result.connected);
    if (result.cursor) {
      cursorPosition.set(result.cursor);
    }
  } catch (error) {
    // Silently fail status check
  }
}
