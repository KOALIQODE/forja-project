/**
 * Keyboard Handler - Design Pattern for Key Events
 * Optimized system for managing keyboard shortcuts and navigation
 */

import { KEYBOARD_CONFIG } from './constants.js';

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

/**
 * Helper function to format leader key for display
 */
function formatLeaderKeyForDisplay(leaderKey: string): string {
  if (leaderKey === ' ') return 'Space+';
  if (leaderKey === 'AltLeft' || leaderKey === 'AltRight') return 'Alt+';
  if (leaderKey === 'ControlLeft' || leaderKey === 'ControlRight') return 'Ctrl+';
  if (leaderKey === 'ShiftLeft' || leaderKey === 'ShiftRight') return 'Shift+';
  if (leaderKey === 'MetaLeft' || leaderKey === 'MetaRight') return 'Meta+';
  return `${leaderKey}+`;
}

export class KeyboardManager {
  private contexts: Map<string, KeyboardContext> = new Map();
  private activeContext: string | null = null;
  private previousContext: string | null = null;
  private globalActions: KeyboardAction[] = [];
  private isListening = false;
  private leaderKey: string = KEYBOARD_CONFIG.LEADER_KEY; // Configurable leader key
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
    if (this.activeContext !== contextName) {
      this.previousContext = this.activeContext;
      this.activeContext = contextName;
    }
  }

  /**
   * Restore to the previous context
   */
  restorePreviousContext(): void {
    if (this.previousContext) {
      const temp = this.previousContext;
      this.previousContext = this.activeContext;
      this.activeContext = temp;
    }
  }

  /**
   * Save the current context as previous context
   */
  saveContext(): void {
    this.previousContext = this.activeContext;
  }

  /**
   * Get the current active context
   */
  getActiveContext(): string | null {
    return this.activeContext;
  }

  /**
   * Get the previous context
   */
  getPreviousContext(): string | null {
    return this.previousContext;
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
    const pressedKey = this.getKeyIdentifier(event);
    
    // Handle help key (?) for showing shortcuts panel
    if (pressedKey === '?') {
      event.preventDefault();
      this.onShowShortcuts?.();
      return;
    }

    const normalizedKey = pressedKey.toLowerCase();
    
    // Handle leader key activation
    if (pressedKey === this.leaderKey && !this.isLeaderPressed) {
      event.preventDefault();
      this.isLeaderPressed = true;
      this.startLeaderTimeout();
      return;
    }

    // If leader is pressed, only handle leader combinations
    if (this.isLeaderPressed) {
      this.clearLeaderTimeout();
      this.isLeaderPressed = false;
      
      // Look for leader combinations in global actions first
      const globalLeaderActions = this.globalActions.filter(action => {
        const keys = Array.isArray(action.key) ? action.key : [action.key];
        return keys.some(key => {
          // Handle concatenated leader combinations like "AltLefto"
          const keyLower = key.toLowerCase();
          const leaderLower = this.leaderKey.toLowerCase();
          return keyLower === `${leaderLower}${normalizedKey}` || 
                 keyLower === `${leaderLower}+${normalizedKey}`;
        });
      });
      
      if (globalLeaderActions.length > 0) {
        event.preventDefault();
        globalLeaderActions[0].handler(event);
        return;
      }
      
      // Look for leader combinations in active context
      if (this.activeContext) {
        const context = this.contexts.get(this.activeContext);
        if (context && context.enabled) {
          const leaderActions = context.actions.filter(action => {
            const keys = Array.isArray(action.key) ? action.key : [action.key];
            return keys.some(key => {
              // Handle concatenated leader combinations like "AltLefto"
              const keyLower = key.toLowerCase();
              const leaderLower = this.leaderKey.toLowerCase();
              return keyLower === `${leaderLower}${normalizedKey}` || 
                     keyLower === `${leaderLower}+${normalizedKey}`;
            });
          });
          
          if (leaderActions.length > 0) {
            event.preventDefault();
            leaderActions[0].handler(event);
            return;
          }
        }
      }
      
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
        if (normalizedKey.startsWith(this.leaderKey.toLowerCase()) || normalizedKey.includes('+')) {
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
   * Get the correct key identifier from event, handling non-printable keys
   */
  private getKeyIdentifier(event: KeyboardEvent): string {
    // Special case for Space - always use the character, not the code
    if (event.code === 'Space') {
      return ' ';
    }
    
    // For non-printable keys (modifier keys, function keys, etc.), use event.code
    // event.code provides consistent physical key location regardless of keyboard layout
    if (event.code && this.isNonPrintableKey(event.code)) {
      // Map common non-printable key codes to consistent identifiers
      switch (event.code) {
        case 'AltLeft': return 'AltLeft';
        case 'AltRight': return 'AltRight';
        case 'ControlLeft': return 'ControlLeft';
        case 'ControlRight': return 'ControlRight';
        case 'ShiftLeft': return 'ShiftLeft';
        case 'ShiftRight': return 'ShiftRight';
        case 'MetaLeft': return 'MetaLeft';
        case 'MetaRight': return 'MetaRight';
        case 'CapsLock': return 'CapsLock';
        case 'Tab': return 'Tab';
        case 'Escape': return 'Escape';
        case 'Enter': return 'Enter';
        case 'Backspace': return 'Backspace';
        case 'Delete': return 'Delete';
        case 'ArrowUp': return 'ArrowUp';
        case 'ArrowDown': return 'ArrowDown';
        case 'ArrowLeft': return 'ArrowLeft';
        case 'ArrowRight': return 'ArrowRight';
        case 'Home': return 'Home';
        case 'End': return 'End';
        case 'PageUp': return 'PageUp';
        case 'PageDown': return 'PageDown';
        case 'Insert': return 'Insert';
        // Function keys
        case 'F1': case 'F2': case 'F3': case 'F4': case 'F5': case 'F6':
        case 'F7': case 'F8': case 'F9': case 'F10': case 'F11': case 'F12':
          return event.code;
        // For other non-printable keys, fall back to event.key
        default:
          return event.key;
      }
    }
    
    // For printable keys (letters, numbers, symbols), use event.key
    // This provides the actual character that would be typed
    return event.key;
  }

  /**
   * Check if a key code represents a non-printable key
   */
  private isNonPrintableKey(code: string): boolean {
    // List of non-printable key prefixes and exact matches
    const nonPrintablePrefixes = ['Alt', 'Control', 'Shift', 'Meta', 'Caps', 'F'];
    const nonPrintableKeys = [
      'Tab', 'Escape', 'Enter', 'Space', 'Backspace', 'Delete',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'Home', 'End', 'PageUp', 'PageDown', 'Insert',
      'NumLock', 'ScrollLock', 'Pause', 'ContextMenu'
    ];
    
    return nonPrintablePrefixes.some(prefix => code.startsWith(prefix)) ||
           nonPrintableKeys.includes(code);
  }

  /**
   * Get leader shortcuts for current context and global actions
   */
  getLeaderShortcuts(): Array<{key: string, description: string}> {
    const shortcuts: Array<{key: string, description: string}> = [];
    
    // Add global leader shortcuts first
    const globalLeaderShortcuts = this.globalActions
      .filter(action => {
        const keys = Array.isArray(action.key) ? action.key : [action.key];
        return keys.some(key => key.toLowerCase().startsWith(this.leaderKey));
      })
      .map(action => {
        const keys = Array.isArray(action.key) ? action.key : [action.key];
        const leaderKey = keys.find(key => key.toLowerCase().startsWith(this.leaderKey));
        return {
          key: leaderKey ? leaderKey.replace(this.leaderKey, formatLeaderKeyForDisplay(this.leaderKey)) : '',
          description: action.description || 'No description'
        };
      });
    
    shortcuts.push(...globalLeaderShortcuts);
    
    // Add context-specific leader shortcuts
    if (this.activeContext) {
      const context = this.contexts.get(this.activeContext);
      if (context) {
        const contextLeaderShortcuts = context.actions
          .filter(action => {
            const keys = Array.isArray(action.key) ? action.key : [action.key];
            return keys.some(key => key.toLowerCase().startsWith(this.leaderKey));
          })
          .map(action => {
            const keys = Array.isArray(action.key) ? action.key : [action.key];
            const leaderKey = keys.find(key => key.toLowerCase().startsWith(this.leaderKey));
            return {
              key: leaderKey ? leaderKey.replace(this.leaderKey, formatLeaderKeyForDisplay(this.leaderKey)) : '',
              description: action.description || 'No description'
            };
          });
        
        shortcuts.push(...contextLeaderShortcuts);
      }
    }
    
    return shortcuts;
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