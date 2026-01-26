/**
 * Types for Nvim integration
 */

export interface CursorPosition {
  line: number;
  col: number;
}

export interface NvimResponse {
  success: boolean;
  result?: any;
  cursor: CursorPosition;
  error?: string;
}

export interface NvimCommand {
  type: 'input' | 'command' | 'cursor';
  data: string;
}

export interface WebSocketMessage {
  type: 'navigation' | 'command' | 'cursor_request';
  key?: string;
  command?: string;
}

export interface WebSocketResponse {
  type: 'cursor_update' | 'command_result' | 'error';
  cursor?: CursorPosition;
  result?: any;
  error?: string;
}