import { writable } from 'svelte/store';

// Global dialog state
export const dialogState = writable({
  recentProjectsOpen: false,
});

// Global functions to control dialogs
export function openRecentProjectsDialog() {
  dialogState.update(state => ({
    ...state,
    recentProjectsOpen: true
  }));
}

export function closeRecentProjectsDialog() {
  dialogState.update(state => ({
    ...state,
    recentProjectsOpen: false
  }));
}