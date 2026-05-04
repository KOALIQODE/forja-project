import { writable } from 'svelte/store';

// Centralized Dialog IDs
export const DIALOG_IDS = {
  RECENT_PROJECTS: 'recent-projects',
  SHORTCUTS_HELP: 'shortcuts-help',
  FILE_SEARCH: 'file-search',
  COMMAND_PALETTE: 'command-palette',
  BUFFER_DELETE: 'buffer-delete',
  TELESCOPE: 'telescope',
  GRAMMAR_HUB: 'grammar-hub',
  PREFERENCES: 'preferences',
  EXTENSIONS: 'extensions'
} as const;

// Dialog types
export type TelescopeMode = 'files' | 'grep' | 'buffers';

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

export function openTelescope(mode: TelescopeMode = 'files') {
  openDialog({
    id: DIALOG_IDS.TELESCOPE,
    component: 'Telescope',
    props: { mode }
  });
}

export function openGrammarHub() {
  openDialog({
    id: DIALOG_IDS.GRAMMAR_HUB,
    component: 'ParserManager'
  });
}

export function openPreferencesDialog(initialSection: 'program' | 'buffer' = 'program') {
  openDialog({
    id: DIALOG_IDS.PREFERENCES,
    component: 'PreferencesDialog',
    props: { initialSection }
  });
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

export function openExtensionsManager() {
  openDialog({
    id: DIALOG_IDS.EXTENSIONS,
    component: 'ExtensionsManager'
  });
}
