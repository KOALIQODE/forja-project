import { writable } from 'svelte/store';
import { DIALOG_STATE_KEYS } from '../utils/constants.js';
import { keyboardManager } from '../utils/keyboardManager.js';

// Define dialog state type
type DialogState = {
  [key in typeof DIALOG_STATE_KEYS[keyof typeof DIALOG_STATE_KEYS]]: boolean;
};

// Global dialog state - expandable for multiple dialogs
export const dialogState = writable<DialogState>({
  [DIALOG_STATE_KEYS.RECENT_PROJECTS_OPEN]: false,
  // Future dialogs can be added here
});

// Generic dialog actions
export const dialogActions = {
  open: (dialogKey: keyof DialogState) => {
    keyboardManager.saveContext();
    dialogState.update(state => ({
      ...state,
      [dialogKey]: true
    }));
  },
  
  close: (dialogKey: keyof DialogState) => {
    dialogState.update(state => ({
      ...state,
      [dialogKey]: false
    }));
  },
  
  toggle: (dialogKey: keyof DialogState) => {
    dialogState.update(state => {
      const isOpen = state[dialogKey];
      if (!isOpen) {
        keyboardManager.saveContext();
      }
      return {
        ...state,
        [dialogKey]: !isOpen
      };
    });
  }
};

// Specific dialog functions for backwards compatibility
export function openRecentProjectsDialog() {
  dialogActions.open(DIALOG_STATE_KEYS.RECENT_PROJECTS_OPEN);
}

export function closeRecentProjectsDialog() {
  dialogActions.close(DIALOG_STATE_KEYS.RECENT_PROJECTS_OPEN);
}