import { writable } from 'svelte/store';
import { DIALOG_IDS } from '../nvim/contentIds';

// Dialog types
export interface DialogConfig {
  id: string;
  component: any;
  props?: any;
  previousContext?: string;
}

// Global dialog state
export interface DialogState {
  activeDialog: DialogConfig | null;
}

export const dialogState = writable<DialogState>({
  activeDialog: null
});

// Global functions to control dialogs
export function openDialog(config: DialogConfig) {
  dialogState.update(state => ({
    ...state,
    activeDialog: config
  }));
}

export function closeDialog() {
  dialogState.update(state => ({
    ...state,
    activeDialog: null
  }));
}

// Legacy support for RecentProjectsDialog
export function openRecentProjectsDialog(previousContext?: string) {
  openDialog({
    id: DIALOG_IDS.RECENT_PROJECTS,
    component: 'RecentProjectsDialog',
    previousContext
  });
}

export function closeRecentProjectsDialog() {
  closeDialog();
}