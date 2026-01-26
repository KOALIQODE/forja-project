/**
 * Welcome Screen Buffer Strategy
 */

import { WELCOME_CONTENT, BUFFER_IDS, NVIM_MODES, type NvimMode } from '../../../nvim/contentIds';
import { sendNvimCommand } from '$lib/stores/nvimStore';
import type { BufferStrategy, NvimBuffer } from './baseBuffer';

export class WelcomeScreenBufferStrategy implements BufferStrategy {
  createBuffer(): NvimBuffer {
    return {
      id: BUFFER_IDS.WELCOME_SCREEN,
      content: [
        WELCOME_CONTENT.OPEN_PROJECT,
        WELCOME_CONTENT.NEW_PROJECT, 
        WELCOME_CONTENT.RECENT_PROJECTS
      ],
      mode: NVIM_MODES.NORMAL,
      cursorPosition: { line: 1, col: 0 },
      maxLines: 3
    };
  }

  getBufferId(): string {
    return BUFFER_IDS.WELCOME_SCREEN;
  }

  getDefaultMode(): NvimMode {
    return NVIM_MODES.NORMAL;
  }

  getMaxLines(): number {
    return 3;
  }

  /**
   * Handle navigation specific to welcome screen
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
    };

    document.addEventListener('keydown', handleKeyDown);
    
    // Return cleanup function
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }
}