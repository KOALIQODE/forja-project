import { 
  openRecentProjectsDialog, 
  openThemePicker, 
  openFileSearch,
  openLiveGrep,
  openBufferSearch,
  openBufferDeleteDialog, 
  openGrammarHub, 
  openPreferencesDialog,
  closeDialog
} from '../stores/dialogStore';

/**
 * Factory for shortcut actions
 * Centralizes all available actions that can be triggered by shortcuts
 */
export const SHORTCUT_ACTIONS = {
  'open-recent': () => openRecentProjectsDialog(),
  'open-themes': () => openThemePicker(),
  'search-files': () => openFileSearch(),
  'live-grep': () => openLiveGrep(),
  'search-buffers': () => openBufferSearch(),
  'open-buffers': () => openBufferDeleteDialog(),
  'open-grammar': () => openGrammarHub(),
  'open-preferences': () => openPreferencesDialog('program'),
  'close-dialog': () => closeDialog(),
} as const;

export type ShortcutActionId = keyof typeof SHORTCUT_ACTIONS;

export function executeAction(id: ShortcutActionId) {
  const action = SHORTCUT_ACTIONS[id];
  if (action) {
    action();
  } else {
    console.warn(`[ShortcutService] Action not found: ${id}`);
  }
}
