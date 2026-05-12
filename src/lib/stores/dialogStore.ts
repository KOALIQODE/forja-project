import { writable } from 'svelte/store';
import type { Component } from 'svelte';

// Centralized Dialog IDs
export const DIALOG_IDS = {
  RECENT_PROJECTS: 'recent-projects',
  SHORTCUTS_HELP: 'shortcuts-help',
  FILE_SEARCH: 'file-search',
  LIVE_GREP: 'live-grep',
  COMMAND_PALETTE: 'command-palette',
  BUFFER_SEARCH: 'buffer-search',
  BUFFER_DELETE: 'buffer-delete',
  GRAMMAR_HUB: 'grammar-hub',
  PREFERENCES: 'preferences',
  EXTENSIONS: 'extensions',
  THEME_PICKER: 'theme-picker',
  CLONE_REPOSITORY: 'clone-repository',
} as const;

export type DialogId = (typeof DIALOG_IDS)[keyof typeof DIALOG_IDS];

// Global dialog state
export interface DialogState {
  activeDialog: DialogConfig | null;
}

export const dialogState = writable<DialogState>({
  activeDialog: null
});

/**
 * Registry of dialog components with lazy loading
 */
export const DIALOG_REGISTRY: Record<DialogId, () => Promise<{ default: Component<any> }>> = {
  [DIALOG_IDS.RECENT_PROJECTS]: () => import('../components/dialogs/RecentProjectsDialog.svelte'),
  [DIALOG_IDS.BUFFER_DELETE]: () => import('../components/dialogs/BufferDeleteDialog.svelte'),
  [DIALOG_IDS.BUFFER_SEARCH]: () => import('../components/dialogs/BufferSearch.svelte'),
  [DIALOG_IDS.FILE_SEARCH]: () => import('../components/dialogs/FileSearch.svelte'),
  [DIALOG_IDS.LIVE_GREP]: () => import('../components/dialogs/LiveGrep.svelte'),
  [DIALOG_IDS.GRAMMAR_HUB]: () => import('../components/dialogs/ParserManager.svelte'),
  [DIALOG_IDS.PREFERENCES]: () => import('../components/dialogs/PreferencesDialog.svelte'),
  [DIALOG_IDS.EXTENSIONS]: () => import('../components/dialogs/ExtensionsManager.svelte'),
  [DIALOG_IDS.THEME_PICKER]: () => import('../components/dialogs/ThemePicker.svelte'),
  [DIALOG_IDS.CLONE_REPOSITORY]: () => import('../components/dialogs/CloneRepositoryDialog.svelte'),
  // Add others as needed
  [DIALOG_IDS.SHORTCUTS_HELP]: () => Promise.reject('Not implemented'),
  [DIALOG_IDS.COMMAND_PALETTE]: () => Promise.reject('Not implemented'),
};

// Global functions to control dialogs
export function openDialog(id: DialogId, props?: Record<string, any>) {
  dialogState.set({
    activeDialog: { id, props }
  });
}

export function closeDialog() {
  dialogState.set({
    activeDialog: null
  });
}

export function openFileSearch() {
  openDialog(DIALOG_IDS.FILE_SEARCH);
}

export function openLiveGrep() {
  openDialog(DIALOG_IDS.LIVE_GREP);
}

export function openBufferSearch() {
  openDialog(DIALOG_IDS.BUFFER_SEARCH);
}

export function openGrammarHub() {
  openDialog(DIALOG_IDS.GRAMMAR_HUB);
}

export function openPreferencesDialog(initialSection: 'program' | 'buffer' = 'program') {
  openDialog(DIALOG_IDS.PREFERENCES, { initialSection });
}

export function openRecentProjectsDialog(previousContext?: string) {
  openDialog(DIALOG_IDS.RECENT_PROJECTS, { previousContext });
}

export function openBufferDeleteDialog() {
  openDialog(DIALOG_IDS.BUFFER_DELETE);
}

export function openExtensionsManager() {
  openDialog(DIALOG_IDS.EXTENSIONS);
}

export function openThemePicker() {
  openDialog(DIALOG_IDS.THEME_PICKER);
}

export function openCloneRepositoryDialog() {
  openDialog(DIALOG_IDS.CLONE_REPOSITORY);
}