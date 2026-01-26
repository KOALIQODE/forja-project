/**
 * Nvim Navigator - Frontend navigation handler
 */

import { keyboardManager } from '$lib/utils/keyboardManager';
import { sendNvimCommand, nvimNavEnabled, nvimMode } from '$lib/stores/nvimStore';
import type { KeyboardAction } from '$lib/utils/keyboardManager';

export class NvimNavigator {
  private isActive = false;
  private currentMode: 'normal' | 'insert' | 'visual' = 'normal';

  constructor() {
    // Subscribe to navigation mode changes
    nvimNavEnabled.subscribe((enabled) => {
      if (enabled) {
        this.activate();
      } else {
        this.deactivate();
      }
    });

    // Subscribe to mode changes
    nvimMode.subscribe((mode) => {
      this.currentMode = mode;
    });
  }

  /**
   * Activate Nvim navigation
   */
  activate() {
    if (this.isActive) return;

    this.isActive = true;
    
    // Register nvim navigation context
    const nvimActions = this.createNvimActions();
    keyboardManager.registerContext('nvim-navigation', nvimActions);
    keyboardManager.setActiveContext('nvim-navigation');

    console.log('Nvim navigation activated');
  }

  /**
   * Deactivate Nvim navigation
   */
  deactivate() {
    if (!this.isActive) return;

    this.isActive = false;
    
    // Return to previous context (like welcome-screen)
    keyboardManager.setActiveContext('welcome-screen');
    
    console.log('Nvim navigation deactivated');
  }

  /**
   * Create Nvim keyboard actions based on current mode
   */
  private createNvimActions(): KeyboardAction[] {
    const actions: KeyboardAction[] = [];

    if (this.currentMode === 'normal') {
      // Normal mode navigation
      actions.push(
        // Basic navigation
        { key: 'h', handler: () => this.sendNavInput('h'), description: 'Move left' },
        { key: 'j', handler: () => this.sendNavInput('j'), description: 'Move down' },
        { key: 'k', handler: () => this.sendNavInput('k'), description: 'Move up' },
        { key: 'l', handler: () => this.sendNavInput('l'), description: 'Move right' },
        
        // Word navigation
        { key: 'w', handler: () => this.sendNavInput('w'), description: 'Word forward' },
        { key: 'b', handler: () => this.sendNavInput('b'), description: 'Word back' },
        { key: 'e', handler: () => this.sendNavInput('e'), description: 'End of word' },
        
        // Line navigation
        { key: '0', handler: () => this.sendNavInput('0'), description: 'Beginning of line' },
        { key: '$', handler: () => this.sendNavInput('$'), description: 'End of line' },
        { key: '^', handler: () => this.sendNavInput('^'), description: 'First non-blank character' },
        
        // File navigation
        { key: 'g', handler: (e) => this.handleGCommand(e), description: 'Go commands' },
        
        // Mode switching
        { key: 'i', handler: () => this.enterInsertMode(), description: 'Insert mode' },
        { key: 'v', handler: () => this.enterVisualMode(), description: 'Visual mode' },
        
        // Toggle back to normal navigation
        { key: 'escape', handler: () => this.toggleNavigation(), description: 'Toggle navigation' }
      );
    }

    return actions;
  }

  /**
   * Send navigation input to Nvim
   */
  private async sendNavInput(keys: string) {
    const success = await sendNvimCommand(keys, 'input');
    if (!success) {
      console.warn(`Failed to send nvim input: ${keys}`);
    }
  }

  /**
   * Handle G command (gg, G, etc.)
   */
  private handleGCommand(event: KeyboardEvent) {
    // This would need more sophisticated handling for multi-key commands
    this.sendNavInput('G');
  }

  /**
   * Enter insert mode
   */
  private enterInsertMode() {
    nvimMode.set('insert');
    this.sendNavInput('i');
  }

  /**
   * Enter visual mode
   */
  private enterVisualMode() {
    nvimMode.set('visual');
    this.sendNavInput('v');
  }

  /**
   * Toggle navigation back to normal
   */
  private toggleNavigation() {
    nvimNavEnabled.set(false);
  }

  /**
   * Get current mode
   */
  getMode(): 'normal' | 'insert' | 'visual' {
    return this.currentMode;
  }
}

// Export singleton instance
export const nvimNavigator = new NvimNavigator();