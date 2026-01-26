/**
 * File Explorer Buffer Strategy
 */

import { FILE_EXPLORER_CONTENT, BUFFER_IDS, NVIM_MODES, type NvimMode } from '../../../nvim/contentIds';
import { sendNvimCommand } from '$lib/stores/nvimStore';
import type { BufferStrategy, NvimBuffer } from './baseBuffer';

export class FileExplorerBufferStrategy implements BufferStrategy {
  private files: string[];

  constructor(files: string[] = []) {
    this.files = files;
  }

  createBuffer(): NvimBuffer {
    return {
      id: BUFFER_IDS.FILE_EXPLORER,
      content: this.files.length > 0 ? this.files : [FILE_EXPLORER_CONTENT.NO_FILES_FOUND],
      mode: NVIM_MODES.NORMAL,
      cursorPosition: { line: 1, col: 0 },
      maxLines: this.files.length || 1
    };
  }

  getBufferId(): string {
    return BUFFER_IDS.FILE_EXPLORER;
  }

  getDefaultMode(): NvimMode {
    return NVIM_MODES.NORMAL;
  }

  getMaxLines(): number {
    return this.files.length || 1;
  }

  /**
   * Handle navigation specific to file explorer
   */
  handleNavigation(onNavigateDown?: () => void, onNavigateUp?: () => void, onSelect?: () => void): () => void {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Skip if input is focused
      if (document.activeElement?.tagName === 'INPUT' || 
          document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      if (e.key === 'j') {
        e.preventDefault();
        await sendNvimCommand('j', 'input');
        onNavigateDown?.();
      } else if (e.key === 'k') {
        e.preventDefault();
        await sendNvimCommand('k', 'input');
        onNavigateUp?.();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onSelect?.();
      }
      // File explorer could have additional keys like 'o' to open, 'd' to delete, etc.
    };

    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }
}