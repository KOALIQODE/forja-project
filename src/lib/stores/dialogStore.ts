import { writable } from 'svelte/store';

// Centralized Dialog IDs
export const DIALOG_IDS = {
  RECENT_PROJECTS: 'recent-projects',
  SHORTCUTS_HELP: 'shortcuts-help',
  FILE_SEARCH: 'file-search',
  COMMAND_PALETTE: 'command-palette',
  BUFFER_DELETE: 'buffer-delete'
} as const;

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

// Support for RecentProjectsDialog
export function openRecentProjectsDialog(previousContext?: string) {
  openDialog({
    id: DIALOG_IDS.RECENT_PROJECTS,
    component: 'RecentProjectsDialog',
    previousContext
  });
}

/**
 * Abre el diálogo de eliminación/gestión de buffers (estilo Telescope)
 */
export function openBufferDeleteDialog() {
  openDialog({
    id: DIALOG_IDS.BUFFER_DELETE,
    component: 'BufferDeleteDialog'
  });
}

export function closeRecentProjectsDialog() {
  closeDialog();
}