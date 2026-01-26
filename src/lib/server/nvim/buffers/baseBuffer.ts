/**
 * Buffer Strategy Interfaces and Types
 */

import type { NvimMode } from '../../../nvim/contentIds';

export interface NvimBuffer {
  id: string;
  content: string[];
  mode: NvimMode;
  cursorPosition: { line: number; col: number };
  maxLines: number;
}

export interface BufferStrategy {
  createBuffer(): NvimBuffer;
  getBufferId(): string;
  getDefaultMode(): NvimMode;
  getMaxLines(): number;
  handleNavigation(onNavigateDown?: () => void, onNavigateUp?: () => void, onSelect?: () => void): () => void;
}