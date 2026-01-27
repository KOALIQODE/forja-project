/**
 * Nvim Store - Reactive state for Neovim integration with WebSocket connection
 */

import { writable, derived } from 'svelte/store';
import type { CursorPosition } from '$lib/navigation/types';
import { BUFFER_IDS, NVIM_MODES, type NvimMode } from '$lib/nvim/contentIds';
import type { WebSocketMessage, WebSocketResponse } from '$lib/server/nvim/types';

// WebSocket connection
let nvimWebSocket: WebSocket | null = null;
let wsConnected = false;
const WS_URL = 'ws://localhost:8081';

// Connection state
export const nvimConnected = writable<boolean>(false);
export const nvimConnecting = writable<boolean>(false);
export const nvimError = writable<string | null>(null);

// Buffer state
export const currentBufferId = writable<string | null>(null);
export const maxLines = writable<number>(1);

// Cursor position
export const cursorPosition = writable<CursorPosition>({ line: 1, col: 1 });

// Navigation mode
export const nvimMode = writable<NvimMode>(NVIM_MODES.NORMAL);

// Navigation enabled
export const nvimNavEnabled = writable<boolean>(false);

// WebSocket connection management
async function initWebSocketConnection(): Promise<void> {
  if (nvimWebSocket && wsConnected) return;
  
  return new Promise((resolve, reject) => {
    try {
      nvimWebSocket = new WebSocket(WS_URL);
      
      nvimWebSocket.onopen = () => {
        wsConnected = true;
        // console.log('Neovim WebSocket connected');
        resolve();
      };
      
      nvimWebSocket.onmessage = (event) => {
        try {
          const response: WebSocketResponse = JSON.parse(event.data);
          
          switch (response.type) {
            case 'cursor_update':
              if (response.cursor) {
                cursorPosition.set(response.cursor);
              }
              break;
              
            case 'command_result':
              if (response.cursor) {
                cursorPosition.set(response.cursor);
              }
              break;
              
            case 'error':
              if (response.error) {
                nvimError.set(response.error);
              }
              break;
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
      
      nvimWebSocket.onclose = () => {
        wsConnected = false;
        nvimWebSocket = null;
        console.log('Neovim WebSocket disconnected');
      };
      
      nvimWebSocket.onerror = (error) => {
        wsConnected = false;
        console.error('WebSocket error:', error);
        reject(error);
      };
      
    } catch (error) {
      reject(error);
    }
  });
}

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
  top: `${($cursor.line - 1) * 20}px`,    // Line height: 20px
  left: `${$cursor.col * 10}px`           // Char width: 10px  
}));

// Selected index mapping (cursor line -> array index)
export const selectedIndex = derived(cursorPosition, ($cursor) => $cursor.line - 1);

// Actions
export async function connectNvimForComponent(componentType: string, options?: any): Promise<boolean> {
  nvimConnecting.set(true);
  nvimError.set(null);

  try {
    // Initialize WebSocket connection first
    await initWebSocketConnection();
    
    // Then connect to Nvim via HTTP for initial setup
    const response = await fetch('/api/nvim/connect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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

// Backward compatibility
export async function connectNvim(): Promise<boolean> {
  return connectNvimForComponent(BUFFER_IDS.DEFAULT);
}

export async function sendNvimCommand(command: string, type: 'command' | 'input' = 'command'): Promise<boolean> {
  try {
    // Ensure WebSocket connection
    if (!wsConnected) {
      await initWebSocketConnection();
    }
    
    if (nvimWebSocket && wsConnected) {
      // Send via WebSocket for instant response
      const message: WebSocketMessage = {
        type: type === 'input' ? 'navigation' : 'command',
        key: type === 'input' ? command : undefined,
        command: type === 'command' ? command : undefined
      };
      
      nvimWebSocket.send(JSON.stringify(message));
      return true;
    } else {
      // Fallback to HTTP if WebSocket is not available
      console.warn('WebSocket not connected, falling back to HTTP');
      return sendHTTPCommand(command, type);
    }
    
  } catch (error) {
    // Fallback to HTTP if WebSocket fails
    console.warn('WebSocket failed, falling back to HTTP:', error);
    return sendHTTPCommand(command, type);
  }
}

// // Fallback HTTP implementation
// async function sendHTTPCommand(command: string, type: 'command' | 'input'): Promise<boolean> {
//   try {
// Fallback HTTP implementation
async function sendHTTPCommand(command: string, type: 'command' | 'input'): Promise<boolean> {
  try {
    const response = await fetch('/api/nvim/command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ command, type })
    });

    const result = await response.json();

    if (result.success) {
      cursorPosition.set(result.cursor);
      return true;
    } else {
      nvimError.set(result.error || 'Command failed');
      return false;
    }

  } catch (error) {
    nvimError.set(error instanceof Error ? error.message : 'Command error');
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
    nvimError.set('Failed to get status');
  }
}