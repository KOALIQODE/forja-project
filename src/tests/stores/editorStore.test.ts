import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

import {
  cursorPosition,
  currentBreadcrumb,
  vimStatus,
  type CodeBreadcrumb,
  type VimMode,
} from '$lib/stores/editorStore';

describe('editorStore', () => {
  beforeEach(() => {
    cursorPosition.set({ line: 0, column: 0 });
    currentBreadcrumb.set(null);
    vimStatus.set({ mode: 'off', command: '', pending: '', count: '' });
  });

  it('initializes cursorPosition at the origin and allows updates', () => {
    expect(get(cursorPosition)).toEqual({ line: 0, column: 0 });

    cursorPosition.set({ line: 4, column: 12 });

    expect(get(cursorPosition)).toEqual({ line: 4, column: 12 });
  });

  it('initializes currentBreadcrumb as null and stores breadcrumb values', () => {
    const breadcrumb: CodeBreadcrumb = {
      items: [{ name: 'render', kind: 'function', line: 8, column: 2 }],
      line: 8,
      column: 2,
    };

    expect(get(currentBreadcrumb)).toBeNull();

    currentBreadcrumb.set(breadcrumb);

    expect(get(currentBreadcrumb)).toEqual(breadcrumb);
  });

  it('initializes vimStatus with the default off mode', () => {
    expect(get(vimStatus)).toEqual({
      mode: 'off',
      command: '',
      pending: '',
      count: '',
    });
  });

  it('updates vimStatus for every supported interactive mode', () => {
    const modes: VimMode[] = ['normal', 'insert', 'visual', 'command'];

    for (const mode of modes) {
      vimStatus.set({ mode, command: ':w', pending: 'd', count: '2' });
      expect(get(vimStatus)).toEqual({ mode, command: ':w', pending: 'd', count: '2' });
    }
  });
});
