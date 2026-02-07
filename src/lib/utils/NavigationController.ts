/**
 * NavigationController - Scalable Navigation Pattern
 * Centralized system for managing keyboard navigation across components
 */

import { keyboardManager, type KeyboardAction } from './keyboardManager.js';
import type { KeyboardContexts } from './constants.js';

export interface NavigationConfig {
  contextName: KeyboardContexts;
  items: any[];
  selectedIndex: number;
  onSelect: (index: number, item: any) => void;
  onCancel?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  additionalActions?: KeyboardAction[];
  autoFocus?: boolean;
  element?: HTMLElement;
}

export interface NavigationCallbacks {
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onSelect: () => void;
  onCancel?: () => void;
}

export class NavigationController {
  private config: NavigationConfig;
  private currentIndex: number;
  private isActive: boolean = false;

  constructor(config: NavigationConfig) {
    this.config = config;
    this.currentIndex = config.selectedIndex;
    this.setupNavigation();
  }

  private setupNavigation(): void {
    const callbacks = this.createNavigationCallbacks();
    const navigationActions = this.createNavigationActions(callbacks);
    
    // Combine navigation actions with additional actions
    const allActions = [
      ...navigationActions,
      ...(this.config.additionalActions || [])
    ];

    keyboardManager.registerContext(this.config.contextName, allActions);
  }

  private createNavigationCallbacks(): NavigationCallbacks {
    return {
      onMoveUp: () => this.moveUp(),
      onMoveDown: () => this.moveDown(),
      onMoveLeft: this.config.onMoveLeft, // Default to up
      onMoveRight: this.config.onMoveRight, // Default to down
      onSelect: () => this.selectCurrent(),
      onCancel: this.config.onCancel || undefined,
    };
  }

  private createNavigationActions(callbacks: NavigationCallbacks): KeyboardAction[] {
    const actions: KeyboardAction[] = [
      // Vertical navigation (Vim style)
      {
        key: ['j', 'arrowdown'],
        handler: callbacks.onMoveDown,
        description: 'Move down',
      },
      {
        key: ['k', 'arrowup'], 
        handler: callbacks.onMoveUp,
        description: 'Move up',
      },
      // Horizontal navigation (Vim style)
      {
        key: ['h', 'arrowleft'],
        handler: callbacks.onMoveLeft!,
        description: 'Move left',
      },
      {
        key: ['l', 'arrowright'],
        handler: callbacks.onMoveRight!,
        description: 'Move right',
      },
      // Selection
      {
        key: 'enter',
        handler: callbacks.onSelect,
        description: 'Select item',
      },
    ];

    if (callbacks.onCancel) {
      actions.push({
        key: 'escape',
        handler: callbacks.onCancel,
        description: 'Cancel',
      });
    }

    return actions;
  }

  // Navigation methods
  private moveUp(): void {
    if (this.config.items.length === 0) return;
    this.currentIndex = this.currentIndex > 0 
      ? this.currentIndex - 1 
      : this.config.items.length - 1;
    this.updateSelection();
  }

  private moveDown(): void {
    if (this.config.items.length === 0) return;
    this.currentIndex = this.currentIndex < this.config.items.length - 1 
      ? this.currentIndex + 1 
      : 0;
    this.updateSelection();
  }

  private selectCurrent(): void {
    if (this.config.items.length === 0) return;
    const selectedItem = this.config.items[this.currentIndex];
    this.config.onSelect(this.currentIndex, selectedItem);
  }

  private updateSelection(): void {
    // Update the config's selectedIndex reference
    this.config.selectedIndex = this.currentIndex;
    
    // Trigger any visual updates needed
    this.notifySelectionChange();
  }

  private notifySelectionChange(): void {
    // Dispatch a custom event for components to listen to
    if (this.config.element) {
      this.config.element.dispatchEvent(new CustomEvent('navigation-change', {
        detail: { 
          selectedIndex: this.currentIndex,
          selectedItem: this.config.items[this.currentIndex] 
        }
      }));
    }
  }

  // Public API
  activate(): void {
    if (this.isActive) return;
    this.isActive = true;
    keyboardManager.setActiveContext(this.config.contextName);
    
    if (this.config.autoFocus && this.config.element) {
      this.config.element.focus();
    }
  }

  deactivate(): void {
    if (!this.isActive) return;
    this.isActive = false;
    // Context will be managed by parent controller
  }

  updateItems(newItems: any[]): void {
    this.config.items = newItems;
    // Reset selection if current index is out of bounds
    if (this.currentIndex >= newItems.length) {
      this.currentIndex = Math.max(0, newItems.length - 1);
      this.updateSelection();
    }
  }

  updateSelectedIndex(newIndex: number): void {
    if (newIndex >= 0 && newIndex < this.config.items.length) {
      this.currentIndex = newIndex;
      this.config.selectedIndex = newIndex;
    }
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  getCurrentItem(): any {
    return this.config.items[this.currentIndex];
  }

  destroy(): void {
    this.deactivate();
    // The context will be cleaned up by keyboardManager when component unmounts
  }
}

/**
 * Factory function to create navigation controllers easily
 */
export function createNavigationController(config: NavigationConfig): NavigationController {
  return new NavigationController(config);
}

/**
 * Hook-style function for Svelte components
 */
export function useNavigation(config: NavigationConfig) {
  const controller = createNavigationController(config);
  
  return {
    controller,
    activate: () => controller.activate(),
    deactivate: () => controller.deactivate(), 
    updateItems: (items: any[]) => controller.updateItems(items),
    updateSelectedIndex: (index: number) => controller.updateSelectedIndex(index),
    getCurrentIndex: () => controller.getCurrentIndex(),
    getCurrentItem: () => controller.getCurrentItem(),
    destroy: () => controller.destroy(),
  };
}