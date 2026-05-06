import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';

const currentProjectStore = vi.hoisted(() => {
  type Sub = (value: string | null) => void;
  let value: string | null = null;
  const subs = new Set<Sub>();
  return {
    subscribe(fn: Sub) { fn(value); subs.add(fn); return () => subs.delete(fn); },
    set(next: string | null) { value = next; subs.forEach((fn) => fn(value)); },
  };
});

const dialogStateStore = vi.hoisted(() => {
  type State = { activeDialog: unknown | null };
  type Sub = (value: State) => void;
  let value: State = { activeDialog: null };
  const subs = new Set<Sub>();
  return {
    subscribe(fn: Sub) { fn(value); subs.add(fn); return () => subs.delete(fn); },
    set(next: State) { value = next; subs.forEach((fn) => fn(value)); },
  };
});

const mockOpenBufferDeleteDialog = vi.hoisted(() => vi.fn());
const mockOpenRecentProjectsDialog = vi.hoisted(() => vi.fn());
const mockCloseDialog = vi.hoisted(() => vi.fn());
const mockInitPlugins = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: {
    subscribe: (fn: any) => {
      fn({ vars: {}, bgGradient: { steps: 2, angle: '180deg', from: '#111', to: '#222' } });
      return () => {};
    },
  },
}));
vi.mock('$lib/stores/projectStore', () => ({
  currentProject: currentProjectStore,
}));
vi.mock('$lib/stores/dialogStore', () => ({
  openTelescope: vi.fn(),
  openGrammarHub: vi.fn(),
  openPreferencesDialog: vi.fn(),
  openThemePicker: vi.fn(),
  openBufferDeleteDialog: mockOpenBufferDeleteDialog,
  openRecentProjectsDialog: mockOpenRecentProjectsDialog,
  closeDialog: mockCloseDialog,
  dialogState: dialogStateStore,
}));
vi.mock('$lib/stores/pluginStore', () => ({
  initPlugins: mockInitPlugins,
}));
vi.mock('../../lib/utils/backgroundLayer', () => ({
  steppedGradient: vi.fn(() => 'linear-gradient(#111, #222)'),
}));
vi.mock('$lib/components/TitleBar.svelte', async () => {
  const mod = await import('../stubs/TitleBarStub.svelte');
  return { default: mod.default };
});
vi.mock('$lib/components/StatusBar.svelte', async () => {
  const mod = await import('../stubs/StatusBarStub.svelte');
  return { default: mod.default };
});
vi.mock('$lib/components/dialogs/DialogManager.svelte', async () => {
  const mod = await import('../stubs/DialogManagerStub.svelte');
  return { default: mod.default };
});
vi.mock('$lib/components/ParserPrompt.svelte', async () => {
  const mod = await import('../stubs/ParserPromptStub.svelte');
  return { default: mod.default };
});

import Layout from '../../routes/+layout.svelte';

const childSnippet = createRawSnippet(() => ({
  render: () => '<div data-testid="layout-child">Child slot</div>',
}));

describe('+layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentProjectStore.set(null);
    dialogStateStore.set({ activeDialog: null });
  });

  it('renders TitleBar and children slot content', () => {
    render(Layout, { children: childSnippet });

    expect(screen.getByTestId('title-bar-stub')).toBeInTheDocument();
    expect(screen.getByTestId('layout-child')).toBeInTheDocument();
  });

  it('shows StatusBar when currentProject is set', () => {
    currentProjectStore.set('/project');
    render(Layout, { children: childSnippet });

    expect(screen.getByTestId('status-bar-stub')).toBeInTheDocument();
  });

  it('Ctrl+B calls openBufferDeleteDialog', async () => {
    render(Layout, { children: childSnippet });

    await fireEvent.keyDown(window, { key: 'b', ctrlKey: true });

    expect(mockOpenBufferDeleteDialog).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+R calls openRecentProjectsDialog', async () => {
    render(Layout, { children: childSnippet });

    await fireEvent.keyDown(window, { key: 'r', ctrlKey: true });

    expect(mockOpenRecentProjectsDialog).toHaveBeenCalledTimes(1);
  });

  it('Escape closes the active dialog when one is open', async () => {
    dialogStateStore.set({ activeDialog: { id: 'test-dialog' } });
    render(Layout, { children: childSnippet });

    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(mockCloseDialog).toHaveBeenCalledTimes(1);
  });
});
