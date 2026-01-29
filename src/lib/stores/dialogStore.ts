import { writable } from 'svelte/store';
import { DIALOG_STATE_KEYS } from '../utils/constants.js';

// Global dialog state
export const dialogState = writable({
  [DIALOG_STATE_KEYS.RECENT_PROJECTS_OPEN]: false,
});

// Global functions to control dialogs
export function openRecentProjectsDialog() {
  dialogState.update(state => ({
    ...state,
    [DIALOG_STATE_KEYS.RECENT_PROJECTS_OPEN]: true
  }));
}

export function closeRecentProjectsDialog() {
  dialogState.update(state => ({
    ...state,
    [DIALOG_STATE_KEYS.RECENT_PROJECTS_OPEN]: false
  }));
}