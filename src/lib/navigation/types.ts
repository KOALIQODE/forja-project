/**
 * Frontend types for Nvim integration
 */

export interface CursorPosition {
  line: number;
  col: number;
}

export interface NvimStatus {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  ready: boolean;
}

export interface NvimCommand {
  command: string;
  type: 'command' | 'input';
}