import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

// Mock the Tauri API before importing the store
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

import {
  openDialog,
  closeDialog,
  openFileSearch,
  openLiveGrep,
  openBufferSearch,
  openGrammarHub,
  openPreferencesDialog,
  openRecentProjectsDialog,
  openBufferDeleteDialog,
  openExtensionsManager,
  openCloneRepositoryDialog,
  openThemePicker,
  dialogState,
  DIALOG_IDS,
} from '$lib/stores/dialogStore';

describe('dialogStore', () => {
  beforeEach(() => {
    closeDialog();
  });

  describe('DIALOG_IDS', () => {
    it('has all expected dialog IDs', () => {
      expect(DIALOG_IDS.RECENT_PROJECTS).toBe('recent-projects');
      expect(DIALOG_IDS.FILE_SEARCH).toBe('file-search');
      expect(DIALOG_IDS.LIVE_GREP).toBe('live-grep');
      expect(DIALOG_IDS.BUFFER_SEARCH).toBe('buffer-search');
      expect(DIALOG_IDS.GRAMMAR_HUB).toBe('grammar-hub');
      expect(DIALOG_IDS.PREFERENCES).toBe('preferences');
      expect(DIALOG_IDS.EXTENSIONS).toBe('extensions');
      expect(DIALOG_IDS.THEME_PICKER).toBe('theme-picker');
      expect(DIALOG_IDS.CLONE_REPOSITORY).toBe('clone-repository');
      expect(DIALOG_IDS.BUFFER_DELETE).toBe('buffer-delete');
    });

    it('all values are unique strings', () => {
      const values = Object.values(DIALOG_IDS);
      expect(new Set(values).size).toBe(values.length);
    });
  });

  describe('openDialog / closeDialog', () => {
    it('starts with no active dialog', () => {
      const state = get(dialogState);
      expect(state.activeDialog).toBeNull();
    });

    it('openDialog sets the active dialog', () => {
      openDialog(DIALOG_IDS.FILE_SEARCH, { foo: 1 });
      const state = get(dialogState);
      expect(state.activeDialog?.id).toBe(DIALOG_IDS.FILE_SEARCH);
      expect(state.activeDialog?.props?.foo).toBe(1);
    });

    it('closeDialog clears the active dialog', () => {
      openDialog(DIALOG_IDS.GRAMMAR_HUB);
      closeDialog();
      const state = get(dialogState);
      expect(state.activeDialog).toBeNull();
    });

    it('openDialog replaces the current dialog', () => {
      openDialog(DIALOG_IDS.RECENT_PROJECTS);
      openDialog(DIALOG_IDS.PREFERENCES);
      const state = get(dialogState);
      expect(state.activeDialog?.id).toBe(DIALOG_IDS.PREFERENCES);
    });
  });

  describe('Search openers', () => {
    it('openFileSearch opens the file search dialog', () => {
      openFileSearch();
      const state = get(dialogState);
      expect(state.activeDialog?.id).toBe(DIALOG_IDS.FILE_SEARCH);
    });

    it('openLiveGrep opens the live grep dialog', () => {
      openLiveGrep();
      const state = get(dialogState);
      expect(state.activeDialog?.id).toBe(DIALOG_IDS.LIVE_GREP);
    });

    it('openBufferSearch opens the buffer search dialog', () => {
      openBufferSearch();
      const state = get(dialogState);
      expect(state.activeDialog?.id).toBe(DIALOG_IDS.BUFFER_SEARCH);
    });
  });

  describe('openGrammarHub', () => {
    it('opens the GrammarHub dialog', () => {
      openGrammarHub();
      const state = get(dialogState);
      expect(state.activeDialog?.id).toBe(DIALOG_IDS.GRAMMAR_HUB);
    });
  });

  describe('openPreferencesDialog', () => {
    it('opens Preferences with default section program', () => {
      openPreferencesDialog();
      const state = get(dialogState);
      expect(state.activeDialog?.id).toBe(DIALOG_IDS.PREFERENCES);
      expect(state.activeDialog?.props?.initialSection).toBe('program');
    });

    it('opens Preferences with buffer section', () => {
      openPreferencesDialog('buffer');
      const state = get(dialogState);
      expect(state.activeDialog?.props?.initialSection).toBe('buffer');
    });
  });

  describe('openRecentProjectsDialog', () => {
    it('opens recent projects dialog', () => {
      openRecentProjectsDialog();
      const state = get(dialogState);
      expect(state.activeDialog?.id).toBe(DIALOG_IDS.RECENT_PROJECTS);
    });

    it('stores previousContext when provided', () => {
      openRecentProjectsDialog('welcome-screen');
      const state = get(dialogState);
      expect(state.activeDialog?.previousContext).toBe('welcome-screen');
    });
  });

  describe('openBufferDeleteDialog', () => {
    it('opens the buffer delete dialog', () => {
      openBufferDeleteDialog();
      const state = get(dialogState);
      expect(state.activeDialog?.id).toBe(DIALOG_IDS.BUFFER_DELETE);
    });
  });

  describe('openExtensionsManager', () => {
    it('opens the extensions manager', () => {
      openExtensionsManager();
      const state = get(dialogState);
      expect(state.activeDialog?.id).toBe(DIALOG_IDS.EXTENSIONS);
    });
  });

  describe('openThemePicker', () => {
    it('opens the theme picker', () => {
      openThemePicker();
      const state = get(dialogState);
      expect(state.activeDialog?.id).toBe(DIALOG_IDS.THEME_PICKER);
    });
  });

  describe('openCloneRepositoryDialog', () => {
    it('opens the clone repository dialog', () => {
      openCloneRepositoryDialog();
      const state = get(dialogState);
      expect(state.activeDialog?.id).toBe(DIALOG_IDS.CLONE_REPOSITORY);
    });
  });
});
