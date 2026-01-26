/**
 * Client-side Navigation Strategies with Builder Pattern
 * 
 * ## Usage Examples:
 * 
 * ### Option 1: Use predefined strategy (recommended)
 * ```typescript
 * function setupNavigation() {
 *   const navigation = NavigationFactory.createNavigation(BUFFER_IDS.WELCOME_SCREEN);
 *   const cleanup = navigation.handleNavigation(
 *     () => {}, // onNavigateDown - nvim handles cursor movement
 *     () => {}, // onNavigateUp - nvim handles cursor movement  
 *     selectCurrent // onSelect - trigger action when Enter is pressed
 *   );
 *   return cleanup;
 * }
 * ```
 * 
 * ### Option 2: Use custom builder for more control
 * ```typescript
 * function setupCustomNavigation() {
 *   const cleanup = NavigationFactory.createCustomNavigation()
 *     .withVertical(true)        // Allow j/k
 *     .withHorizontal(false)     // No h/l needed
 *     .withEnter(true)           // Allow Enter
 *     .withEscape(false)         // No Escape needed
 *     .withCustomKey('?', () => console.log('Show help'))
 *     .withCustomKeys({
 *       'g': () => console.log('Go to top'),
 *       'G': () => console.log('Go to bottom')
 *     })
 *     .withCallbacks({
 *       onNavigateDown: () => console.log('Moving down'),
 *       onNavigateUp: () => console.log('Moving up'),
 *       onSelect: selectCurrent,
 *       onCancel: () => console.log('Cancel action')
 *     })
 *     .build();
 *   return cleanup;
 * }
 * ```
 * 
 * ### Option 3: Minimal configuration
 * ```typescript
 * function setupMinimalNavigation() {
 *   const cleanup = NavigationFactory.createCustomNavigation()
 *     .withVertical(true)
 *     .withCallbacks({ onSelect: handleEnter })
 *     .build();
 *   return cleanup;
 * }
 * ```
 */

import { BUFFER_IDS } from './contentIds';
import { sendNvimCommand } from '$lib/stores/nvimStore';

export interface NavigationOptions {
  allowVertical?: boolean;      // j/k keys
  allowHorizontal?: boolean;    // h/l keys  
  allowEnter?: boolean;         // Enter key
  allowEscape?: boolean;        // Escape key
  customKeys?: Record<string, () => void | Promise<void>>;
  onNavigateUp?: () => void | Promise<void>;
  onNavigateDown?: () => void | Promise<void>;
  onNavigateLeft?: () => void | Promise<void>;
  onNavigateRight?: () => void | Promise<void>;
  onSelect?: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
}

/**
 * Navigation Builder - Fluent interface for configuring navigation
 */
export class NavigationBuilder {
  private options: NavigationOptions = {
    allowVertical: true,
    allowHorizontal: false,
    allowEnter: true,
    allowEscape: false,
    customKeys: {}
  };

  static create(): NavigationBuilder {
    return new NavigationBuilder();
  }

  /**
   * Allow vertical navigation (j/k keys)
   */
  withVertical(enabled: boolean = true): NavigationBuilder {
    this.options.allowVertical = enabled;
    return this;
  }

  /**
   * Allow horizontal navigation (h/l keys)
   */
  withHorizontal(enabled: boolean = true): NavigationBuilder {
    this.options.allowHorizontal = enabled;
    return this;
  }

  /**
   * Allow Enter key
   */
  withEnter(enabled: boolean = true): NavigationBuilder {
    this.options.allowEnter = enabled;
    return this;
  }

  /**
   * Allow Escape key
   */
  withEscape(enabled: boolean = true): NavigationBuilder {
    this.options.allowEscape = enabled;
    return this;
  }

  /**
   * Add custom key handlers
   */
  withCustomKeys(keys: Record<string, () => void | Promise<void>>): NavigationBuilder {
    this.options.customKeys = { ...this.options.customKeys, ...keys };
    return this;
  }

  /**
   * Add single custom key handler
   */
  withCustomKey(key: string, handler: () => void | Promise<void>): NavigationBuilder {
    if (!this.options.customKeys) this.options.customKeys = {};
    this.options.customKeys[key] = handler;
    return this;
  }

  /**
   * Set navigation callbacks
   */
  withCallbacks(callbacks: {
    onNavigateUp?: () => void | Promise<void>;
    onNavigateDown?: () => void | Promise<void>;
    onNavigateLeft?: () => void | Promise<void>;
    onNavigateRight?: () => void | Promise<void>;
    onSelect?: () => void | Promise<void>;
    onCancel?: () => void | Promise<void>;
  }): NavigationBuilder {
    Object.assign(this.options, callbacks);
    return this;
  }

  /**
   * Build and return cleanup function
   */
  build(): () => void {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Skip if input is focused
      if (document.activeElement?.tagName === 'INPUT' || 
          document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      let handled = false;

      // Handle vertical navigation
      if (this.options.allowVertical) {
        if (e.key === 'j') {
          e.preventDefault();
          await sendNvimCommand('j', 'input');
          await this.options.onNavigateDown?.();
          handled = true;
        } else if (e.key === 'k') {
          e.preventDefault();
          await sendNvimCommand('k', 'input');
          await this.options.onNavigateUp?.();
          handled = true;
        }
      }

      // Handle horizontal navigation
      if (this.options.allowHorizontal) {
        if (e.key === 'h') {
          e.preventDefault();
          await sendNvimCommand('h', 'input');
          await this.options.onNavigateLeft?.();
          handled = true;
        } else if (e.key === 'l') {
          e.preventDefault();
          await sendNvimCommand('l', 'input');
          await this.options.onNavigateRight?.();
          handled = true;
        }
      }

      // Handle Enter
      if (this.options.allowEnter && e.key === 'Enter') {
        e.preventDefault();
        await this.options.onSelect?.();
        handled = true;
      }

      // Handle Escape
      if (this.options.allowEscape && e.key === 'Escape') {
        e.preventDefault();
        await this.options.onCancel?.();
        handled = true;
      }

      // Handle custom keys
      if (this.options.customKeys && e.key in this.options.customKeys) {
        e.preventDefault();
        await this.options.customKeys[e.key]();
        handled = true;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    // Return cleanup function
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }
}

/**
 * Legacy Navigation Strategy Interface (for backward compatibility)
 */
export interface NavigationStrategy {
  handleNavigation(onNavigateDown?: () => void, onNavigateUp?: () => void, onSelect?: () => void): () => void;
}

/**
 * Welcome Screen Navigation Strategy
 */
export class WelcomeScreenNavigation implements NavigationStrategy {
  handleNavigation(onNavigateDown?: () => void, onNavigateUp?: () => void, onSelect?: () => void): () => void {
    return NavigationBuilder
      .create()
      .withVertical(true)      // Allow j/k
      .withHorizontal(false)   // No h/l
      .withEnter(true)         // Allow Enter
      .withEscape(false)       // No Escape needed
      .withCallbacks({
        onNavigateDown,
        onNavigateUp,
        onSelect
      })
      .build();
  }
}

/**
 * File Explorer Navigation Strategy
 */
export class FileExplorerNavigation implements NavigationStrategy {
  handleNavigation(onNavigateDown?: () => void, onNavigateUp?: () => void, onSelect?: () => void): () => void {
    return NavigationBuilder
      .create()
      .withVertical(true)      // Allow j/k
      .withHorizontal(true)    // Allow h/l for folder navigation
      .withEnter(true)         // Allow Enter to open
      .withEscape(true)        // Allow Escape to go back
      .withCustomKeys({
        'o': async () => onSelect?.(),      // 'o' to open (vim-like)
        'x': async () => console.log('Delete file'), // 'd' to delete
        'r': async () => console.log('Rename file'), // 'r' to rename
        'c': async () => console.log('Copy file'),   // 'c' to copy
      })
      .withCallbacks({
        onNavigateDown,
        onNavigateUp,
        onSelect,
        onCancel: () => console.log('Go back')
      })
      .build();
  }
}

/**
 * Navigation Factory - Creates navigation strategies for client-side
 */
export class NavigationFactory {
  static createNavigation(bufferType: string): NavigationStrategy {
    switch (bufferType) {
      case BUFFER_IDS.WELCOME_SCREEN:
        return new WelcomeScreenNavigation();
      case BUFFER_IDS.FILE_EXPLORER:
        return new FileExplorerNavigation();
      default:
        return new WelcomeScreenNavigation(); // default fallback
    }
  }

  /**
   * Create custom navigation with builder
   */
  static createCustomNavigation(): NavigationBuilder {
    return NavigationBuilder.create();
  }
}