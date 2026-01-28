/**
 * Keyboard Handler - Design Pattern for Key Events
 * Optimized system for managing keyboard shortcuts and navigation
 */

export interface KeyboardAction {
  key: string | string[];
  handler: (event: KeyboardEvent) => void;
  description?: string;
  preventDefault?: boolean;
  stopPropagation?: boolean;
}

export interface KeyboardContext {
  name: string;
  actions: KeyboardAction[];
  enabled: boolean;
}

export class KeyboardManager {
  private contexts: Map<string, KeyboardContext> = new Map();
  private activeContext: string | null = null;
  private globalActions: KeyboardAction[] = [];
  private isListening = false;
  private leaderKey = ' '; // Space as leader key
  private isLeaderPressed = false;
  private leaderTimeout: number | null = null;
  private leaderTimeoutDuration = 1000; // 1 second
  private onShowShortcuts?: () => void;
  private onHideShortcuts?: () => void;

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
  }

  /**
   * Register a keyboard context (e.g., 'welcome-screen', 'editor', 'modal')
   */
  registerContext(name: string, actions: KeyboardAction[]): void {
    this.contexts.set(name, {
      name,
      actions,
      enabled: true
    });
  }

  /**
   * Add global actions that work in any context
   */
  addGlobalActions(actions: KeyboardAction[]): void {
    this.globalActions.push(...actions);
  }

  /**
   * Set the active context
   */
  setActiveContext(contextName: string): void {
    this.activeContext = contextName;
  }

  /**
   * Get the current active context
   */
  getActiveContext(): string | null {
    return this.activeContext;
  }

  /**
   * Enable/disable a specific context
   */
  toggleContext(contextName: string, enabled: boolean): void {
    const context = this.contexts.get(contextName);
    if (context) {
      context.enabled = enabled;
    }
  }

  /**
   * Start listening for keyboard events
   */
  startListening(): void {
    if (!this.isListening) {
      document.addEventListener('keydown', this.handleKeyDown);
      document.addEventListener('keyup', this.handleKeyUp);
      this.isListening = true;
    }
  }

  /**
   * Stop listening for keyboard events
   */
  stopListening(): void {
    if (this.isListening) {
      document.removeEventListener('keydown', this.handleKeyDown);
      document.removeEventListener('keyup', this.handleKeyUp);
      this.isListening = false;
    }
  }

  /**
   * Handle keydown events
   */
  private handleKeyDown(event: KeyboardEvent): void {
    const pressedKey = event.key;
    
    // Note: Help key (?) is now handled by navigation strategies
    // to ensure nvim gets the input first
    
    const normalizedKey = pressedKey.toLowerCase();
    
    // Handle leader key activation
    if (normalizedKey === this.leaderKey && !this.isLeaderPressed) {
      event.preventDefault();
      this.isLeaderPressed = true;
      this.startLeaderTimeout();
      console.log('Leader key activated - waiting for next key...');
      return;
    }

    // If leader is pressed, only handle leader combinations
    if (this.isLeaderPressed) {
      this.clearLeaderTimeout();
      this.isLeaderPressed = false;
      
      // Look for leader combinations in active context
      if (this.activeContext) {
        const context = this.contexts.get(this.activeContext);
        if (context && context.enabled) {
          const leaderActions = context.actions.filter(action => {
            const keys = Array.isArray(action.key) ? action.key : [action.key];
            return keys.some(key => key.toLowerCase() === `${this.leaderKey}${normalizedKey}`);
          });
          
          if (leaderActions.length > 0) {
            event.preventDefault();
            leaderActions[0].handler(event);
            return;
          }
        }
      }
      
      console.log('No leader combination found for:', `${this.leaderKey}${normalizedKey}`);
      return;
    }
    
    // Handle normal key presses
    // Check global actions first
    if (this.executeActions(this.globalActions, event, normalizedKey)) {
      return;
    }

    // Check active context actions  
    if (this.activeContext) {
      const context = this.contexts.get(this.activeContext);
      if (context && context.enabled) {
        this.executeActions(context.actions, event, normalizedKey);
      }
    }
  }

  /**
   * Handle keyup events
   */
  private handleKeyUp(event: KeyboardEvent): void {
    // Leader key handling is done in keydown
  }

  /**
   * Start leader key timeout
   */
  private startLeaderTimeout(): void {
    this.clearLeaderTimeout();
    this.leaderTimeout = window.setTimeout(() => {
      this.isLeaderPressed = false;
      // Don't hide shortcuts panel on timeout - let user close with 'q'
      console.log('Leader key timeout - returning to normal mode');
    }, this.leaderTimeoutDuration);
  }

  /**
   * Clear leader key timeout
   */
  private clearLeaderTimeout(): void {
    if (this.leaderTimeout) {
      clearTimeout(this.leaderTimeout);
      this.leaderTimeout = null;
    }
  }

  /**
   * Execute matching actions for a key press
   */
  private executeActions(actions: KeyboardAction[], event: KeyboardEvent, pressedKey: string): boolean {
    for (const action of actions) {
      const keys = Array.isArray(action.key) ? action.key : [action.key];
      const matchesKey = keys.some(key => {
        const normalizedKey = key.toLowerCase();
        // Skip leader combinations in normal execution
        if (normalizedKey.startsWith(this.leaderKey)) {
          return false;
        }
        return normalizedKey === pressedKey;
      });

      if (matchesKey) {
        if (action.preventDefault !== false) {
          event.preventDefault();
        }
        if (action.stopPropagation !== false) {
          event.stopPropagation();
        }

        action.handler(event);
        return true;
      }
    }
    return false;
  }

  /**
   * Get help text for current context
   */
  getContextHelp(contextName?: string): string[] {
    const context = contextName 
      ? this.contexts.get(contextName)
      : this.activeContext ? this.contexts.get(this.activeContext) : null;

    if (!context) return [];

    return context.actions
      .filter(action => action.description)
      .map(action => {
        const keys = Array.isArray(action.key) ? action.key.join(' or ') : action.key;
        return `${keys}: ${action.description}`;
      });
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopListening();
    this.clearLeaderTimeout();
    this.contexts.clear();
    this.globalActions = [];
    this.activeContext = null;
  }

  /**
   * Check if leader key is currently active
   */
  isLeaderActive(): boolean {
    return this.isLeaderPressed;
  }

  /**
   * Get current leader key
   */
  getLeaderKey(): string {
    return this.leaderKey;
  }

  /**
   * Set leader key
   */
  setLeaderKey(key: string): void {
    this.leaderKey = key;
  }

  /**
   * Set callbacks for shortcuts panel
   */
  setShortcutsCallbacks(onShow: () => void, onHide: () => void): void {
    this.onShowShortcuts = onShow;
    this.onHideShortcuts = onHide;
  }

  /**
   * Manually hide shortcuts panel
   */
  hideShortcutsPanel(): void {
    this.isLeaderPressed = false;
    this.clearLeaderTimeout();
    this.onHideShortcuts?.();
  }

  /**
   * Manually show shortcuts panel
   */
  showShortcutsPanel(): void {
    this.onShowShortcuts?.();
  }

  /**
   * Get leader shortcuts for current context
   */
  getLeaderShortcuts(): Array<{key: string, description: string}> {
    if (!this.activeContext) return [];
    
    const context = this.contexts.get(this.activeContext);
    if (!context) return [];
    
    return context.actions
      .filter(action => {
        const keys = Array.isArray(action.key) ? action.key : [action.key];
        return keys.some(key => key.toLowerCase().startsWith(this.leaderKey));
      })
      .map(action => {
        const keys = Array.isArray(action.key) ? action.key : [action.key];
        const leaderKey = keys.find(key => key.toLowerCase().startsWith(this.leaderKey));
        return {
          key: leaderKey?.replace(' ', 'Space+') || '',
          description: action.description || 'No description'
        };
      });
  }
}

// Singleton instance
export const keyboardManager = new KeyboardManager();

// Helper function to create navigation actions
export function createNavigationActions(options: {
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSelect: () => void;
  onCancel?: () => void;
}): KeyboardAction[] {
  return [
    {
      key: ['j', 'arrowdown'],
      handler: options.onMoveDown,
      description: 'Move down',
    },
    {
      key: ['k', 'arrowup'],
      handler: options.onMoveUp,
      description: 'Move up',
    },
    {
      key: 'enter',
      handler: options.onSelect,
      description: 'Select item',
    },
    ...(options.onCancel ? [{
      key: 'escape',
      handler: options.onCancel,
      description: 'Cancel',
    }] : []),
  ];
}