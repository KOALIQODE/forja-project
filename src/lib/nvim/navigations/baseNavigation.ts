/**
 * Base Navigation Interfaces and Builder
 */

import { sendNvimCommand } from "$lib/stores/nvimStore";

export interface NavigationStrategy {
  handleNavigation(
    onNavigateDown?: () => void,
    onNavigateUp?: () => void,
    onSelect?: () => void,
  ): () => void;
}

export interface NavigationOptions {
  allowVertical?: boolean; // j/k keys
  allowHorizontal?: boolean; // h/l keys
  allowEnter?: boolean; // Enter key
  allowEscape?: boolean; // Escape key
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
    customKeys: {},
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
  withCustomKeys(
    keys: Record<string, () => void | Promise<void>>,
  ): NavigationBuilder {
    this.options.customKeys = { ...this.options.customKeys, ...keys };
    return this;
  }

  /**
   * Add single custom key handler
   */
  withCustomKey(
    key: string,
    handler: () => void | Promise<void>,
  ): NavigationBuilder {
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
    let pendingSpaceCommand = false;
    let spaceTimeout: number | null = null;

    const handleKeyDown = async (e: KeyboardEvent) => {
      // Skip if input is focused
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      let handled = false;

      // Handle Space + key combinations
      if (e.key === " " && !pendingSpaceCommand) {
        e.preventDefault();
        pendingSpaceCommand = true;

        // Set timeout to cancel space command after 2 seconds
        spaceTimeout = window.setTimeout(() => {
          pendingSpaceCommand = false;
          spaceTimeout = null;
        }, 2000);

        handled = true;
        return;
      }

      // Handle second key after Space
      if (pendingSpaceCommand) {
        if (spaceTimeout) {
          clearTimeout(spaceTimeout);
          spaceTimeout = null;
        }
        pendingSpaceCommand = false;

        const spaceKey = ` ${e.key}`;
        if (this.options.customKeys && spaceKey in this.options.customKeys) {
          e.preventDefault();
          await this.options.customKeys[spaceKey]();
          handled = true;
          return;
        }
      }

      // Handle Escape
      if (e.key === "Escape") {
        e.preventDefault();
        await sendNvimCommand("Escape", "input");
        await this.options.onCancel?.();
        return;
      }

      // Handle vertical navigation (only if not handled by custom keys)
      if (this.options.allowVertical) {
        if (e.key === "j" || e.key === "k") {
          e.preventDefault();
          await sendNvimCommand(e.key, "input");
          if (e.key === "j") await this.options.onNavigateDown?.();
          else await this.options.onNavigateUp?.();
          return;
        }
      }

      // Handle horizontal navigation
      if (this.options.allowHorizontal) {
        if (e.key === "h" || e.key === "l" || e.key === "w" || e.key === "b" || e.key === "e") {
          e.preventDefault();
          await sendNvimCommand(e.key, "input");
          return;
        }
      }

      // Pass-through for code editing (any single character or common motion)
      if (this.options.allowHorizontal && this.options.allowVertical) {
        // Si permitimos ambos ejes, asumimos que es un editor real
        // Enviamos la tecla a Neovim para que él decida qué hacer
        if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          await sendNvimCommand(e.key, "input");
        }
      }

      // Handle custom keys (single keys only)
      if (this.options.customKeys && e.key in this.options.customKeys) {
        e.preventDefault();
        await this.options.customKeys[e.key]();
        handled = true;
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // Return cleanup function
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (spaceTimeout) {
        clearTimeout(spaceTimeout);
      }
    };
  }
}
