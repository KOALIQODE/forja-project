import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';

const currentProjectStore = vi.hoisted(() => {
  type Sub = (value: string | null) => void;
  let value: string | null = null;
  const subs = new Set<Sub>();
  return {
    subscribe(fn: Sub) { fn(value); subs.add(fn); return () => subs.delete(fn); },
    set(next: string | null) { value = next; subs.forEach((fn) => fn(value)); },
  };
});

const activeBufferStore = vi.hoisted(() => {
  type Buffer = { id: string; filePath: string; language?: string } | null;
  type Sub = (value: Buffer) => void;
  let value: Buffer = null;
  const subs = new Set<Sub>();
  return {
    subscribe(fn: Sub) { fn(value); subs.add(fn); return () => subs.delete(fn); },
    set(next: Buffer) { value = next; subs.forEach((fn) => fn(value)); },
  };
});

const activeBufferIdStore = vi.hoisted(() => {
  type Sub = (value: string | null) => void;
  let value: string | null = null;
  const subs = new Set<Sub>();
  return {
    subscribe(fn: Sub) { fn(value); subs.add(fn); return () => subs.delete(fn); },
    set(next: string | null) { value = next; subs.forEach((fn) => fn(value)); },
  };
});

const mockOpenBuffer = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: { subscribe: (fn: any) => { fn({ vars: {} }); return () => {}; } },
}));
vi.mock('$lib/stores/projectStore', () => ({
  currentProject: currentProjectStore,
}));
vi.mock('$lib/stores/bufferStore', () => ({
  activeBuffer: activeBufferStore,
  activeBufferId: activeBufferIdStore,
  openBuffer: mockOpenBuffer,
}));
vi.mock('$lib/components/explorer/Explorer.svelte', async () => {
  const mod = await import('../stubs/ExplorerStub.svelte');
  return { default: mod.default };
});
vi.mock('$lib/components/editor/EditorBuffer.svelte', async () => {
  const mod = await import('../stubs/EditorBufferStub.svelte');
  return { default: mod.default };
});
vi.mock('$lib/components/TodoSidebar.svelte', () => ({
  default: () => null,
}));

import Page from '../../routes/+page.svelte';

describe('+page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentProjectStore.set(null);
    activeBufferStore.set(null);
    activeBufferIdStore.set(null);
  });

  it('renders WelcomeScreen when no project is open', () => {
    render(Page);

    expect(screen.getByText(/Forge your/i)).toBeInTheDocument();
  });

  it('renders Explorer when currentProject is set', async () => {
    currentProjectStore.set('/project');
    activeBufferIdStore.set('/project/README.md');
    activeBufferStore.set({ id: '/project/README.md', filePath: '/project/README.md', language: 'markdown' });

    render(Page);

    await waitFor(() => {
      expect(screen.getByTestId('explorer-stub')).toBeInTheDocument();
    });
  });

  it('does not render WelcomeScreen when a project is open', async () => {
    currentProjectStore.set('/project');
    activeBufferIdStore.set('/project/README.md');
    activeBufferStore.set({ id: '/project/README.md', filePath: '/project/README.md', language: 'markdown' });

    render(Page);

    await waitFor(() => {
      expect(screen.queryByText(/Forge your/i)).not.toBeInTheDocument();
    });
  });
});
