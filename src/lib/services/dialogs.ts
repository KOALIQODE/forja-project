import { useShortcuts } from '../hooks/useShortcuts';

export const dialogs = {
  /**
   * Initializes the dialog system and shortcuts
   * @returns Cleanup function
   */
  initialize() {
    console.log('[dialogs] Initializing shortcut system...');
    return useShortcuts();
  }
};
