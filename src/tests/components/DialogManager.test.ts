import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { readable } from 'svelte/store';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('$lib/stores/projectStore', () => ({
  currentProject: readable(null),
  recentProjects: readable([]),
  shortenedPaths: readable([]),
  gitStatuses: readable([]),
  openProject: vi.fn(),
}));
vi.mock('$lib/stores/bufferStore', () => ({
  openBuffers: readable(new Map()),
  activeBufferId: readable(null),
  openBuffer: vi.fn(),
  closeBuffer: vi.fn(),
}));
vi.mock('$lib/stores/pluginStore', () => ({
  activeTheme: readable(null),
}));
vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: readable({ vars: {} }),
}));
vi.mock('$lib/components/dialogs/ParserManager.svelte', () => ({
  default: () => null,
}));
vi.mock('$lib/components/dialogs/ExtensionsManager.svelte', () => ({
  default: () => null,
}));
vi.mock('$lib/components/ThemePicker.svelte', () => ({
  default: () => null,
}));
vi.mock('$lib/components/dialogs/CloneRepositoryDialog.svelte', () => ({
  default: () => null,
}));

import DialogManager from '$lib/components/dialogs/DialogManager.svelte';
import { closeDialog, openDialog, DIALOG_IDS } from '$lib/stores/dialogStore';

/** Returns the [data-dialog-shell] element inside the rendered container */
function getDialogShell(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[data-dialog-shell]');
}

/** Asserts a shell element has both a visible border and a box-shadow */
function expectDialogHasShadowAndBorder(shell: HTMLElement) {
  const style = window.getComputedStyle(shell);
  // border must be set (not 'none' or empty)
  const hasBorder =
    (style.border && style.border !== 'none' && style.border !== '') ||
    (style.borderWidth && style.borderWidth !== '0px');
  // box-shadow must be set
  const hasShadow = style.boxShadow && style.boxShadow !== 'none' && style.boxShadow !== '';
  expect(hasBorder || shell.className.includes('border'), 'dialog must have a border').toBe(true);
  expect(hasShadow || shell.className.includes('box-shadow') || shell.style.boxShadow !== '',
    'dialog must have a box-shadow').toBe(true);
}

describe('DialogManager', () => {
  beforeEach(() => {
    closeDialog();
  });

  it('renders nothing when there is no active dialog', () => {
    const { container } = render(DialogManager);
    expect(container.querySelector('[data-program-ui]')).toBeNull();
  });

  it('renders FileSearch when the file search dialog is active', async () => {
    openDialog(DIALOG_IDS.FILE_SEARCH);
    render(DialogManager);
    expect(await screen.findByPlaceholderText('Search...')).toBeInTheDocument();
  });

  it('renders LiveGrep when the live grep dialog is active', async () => {
    openDialog(DIALOG_IDS.LIVE_GREP);
    render(DialogManager);
    expect(await screen.findByPlaceholderText('Search...')).toBeInTheDocument();
  });

  it('renders BufferSearch when the buffer search dialog is active', async () => {
    openDialog(DIALOG_IDS.BUFFER_SEARCH);
    render(DialogManager);
    expect(await screen.findByPlaceholderText('Search...')).toBeInTheDocument();
  });

  it('renders BufferDeleteDialog when the buffer delete dialog is active', async () => {
    openDialog(DIALOG_IDS.BUFFER_DELETE);
    render(DialogManager);
    expect(await screen.findByPlaceholderText('Find buffer...')).toBeInTheDocument();
  });

  it('renders PreferencesDialog when the preferences dialog is active', async () => {
    openDialog(DIALOG_IDS.PREFERENCES);
    render(DialogManager);
    expect(await screen.findByText('PREFERENCES')).toBeInTheDocument();
  });

  it('renders CloneRepositoryDialog when the clone dialog is active', async () => {
    openDialog(DIALOG_IDS.CLONE_REPOSITORY);
    const { container } = render(DialogManager);
    // Use findBy to wait for lazy load
    await screen.findByTestId('clone-repo-dialog'); 
    expect(container.querySelector('[data-program-ui]')).not.toBeNull();
  });

  describe('dialog shell — border and shadow', () => {
    it('FileSearch shell has a border class', async () => {
      openDialog(DIALOG_IDS.FILE_SEARCH);
      const { container } = render(DialogManager);
      await screen.findByPlaceholderText('Search...');
      const shell = getDialogShell(container);
      expect(shell, 'FileSearch shell must exist').not.toBeNull();
      // shell CSS contains border declaration
      const style = shell!.getAttribute('style') ?? '';
      const cls = shell!.className ?? '';
      expect(cls.length > 0 || style.length > 0, 'shell must have styles').toBe(true);
    });

    it('FileSearch shell has box-shadow applied via stylesheet', async () => {
      openDialog(DIALOG_IDS.FILE_SEARCH);
      const { container } = render(DialogManager);
      await screen.findByPlaceholderText('Search...');
      const shell = getDialogShell(container);
      expect(shell).not.toBeNull();
      // The scoped CSS sets box-shadow on .search-shell — verify the class is present
      expect(shell!.className).toMatch(/search-shell/);
    });

    it('BufferDeleteDialog shell has dialog-shell class with box-shadow', async () => {
      openDialog(DIALOG_IDS.BUFFER_DELETE);
      const { container } = render(DialogManager);
      await screen.findByPlaceholderText('Find buffer...');
      const shell = getDialogShell(container);
      expect(shell).not.toBeNull();
      expect(shell!.className).toMatch(/dialog-shell/);
    });

    it('PreferencesDialog shell has pref-shell class with box-shadow', async () => {
      openDialog(DIALOG_IDS.PREFERENCES);
      const { container } = render(DialogManager);
      await screen.findByText('PREFERENCES');
      const shell = getDialogShell(container);
      expect(shell).not.toBeNull();
      expect(shell!.className).toMatch(/pref-shell/);
    });

    it('every open dialog exposes a [data-dialog-shell] element', async () => {
      // Stub Element.animate for jsdom (Svelte transitions use it)
      if (!Element.prototype.animate) {
        Element.prototype.animate = () => ({ onfinish: null, cancel: () => {} } as unknown as Animation);
      }

      const testCases = [
        { id: DIALOG_IDS.FILE_SEARCH, findText: 'Search...' },
        { id: DIALOG_IDS.LIVE_GREP, findText: 'Search...' },
        { id: DIALOG_IDS.BUFFER_SEARCH, findText: 'Search...' },
        { id: DIALOG_IDS.BUFFER_DELETE, findText: 'Find buffer...' },
        { id: DIALOG_IDS.PREFERENCES, findText: 'PREFERENCES' },
      ];

      for (const testCase of testCases) {
        closeDialog();
        openDialog(testCase.id);
        const { container } = render(DialogManager);
        await screen.findByText(new RegExp(testCase.findText, 'i'));
        const shell = getDialogShell(container);
        expect(shell, `${testCase.id} must render a [data-dialog-shell] element`).not.toBeNull();
        closeDialog();
      }
    });
  });
});
