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

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
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
      this.isListening = true;
    }
  }

  /**
   * Stop listening for keyboard events
   */
  stopListening(): void {
    if (this.isListening) {
      document.removeEventListener('keydown', this.handleKeyDown);
      this.isListening = false;
    }
  }

  /**
   * Handle keydown events
   */
  private handleKeyDown(event: KeyboardEvent): void {
    const pressedKey = event.key.toLowerCase();
    
    // Check global actions first
    if (this.executeActions(this.globalActions, event, pressedKey)) {
      return;
    }

    // Check active context actions
    if (this.activeContext) {
      const context = this.contexts.get(this.activeContext);
      if (context && context.enabled) {
        this.executeActions(context.actions, event, pressedKey);
      }
    }
  }

  /**
   * Execute matching actions for a key press
   */
  private executeActions(actions: KeyboardAction[], event: KeyboardEvent, pressedKey: string): boolean {
    for (const action of actions) {
      const keys = Array.isArray(action.key) ? action.key : [action.key];
      const matchesKey = keys.some(key => key.toLowerCase() === pressedKey);

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
    this.contexts.clear();
    this.globalActions = [];
    this.activeContext = null;
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