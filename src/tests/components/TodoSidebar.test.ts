import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

const todoListStore = vi.hoisted(() => {
  type Todo = { filePath: string; fileName: string; lineNum: number; content: string };
  type Sub = (value: Todo[]) => void;
  let value: Todo[] = [];
  const subs = new Set<Sub>();
  return {
    subscribe(fn: Sub) { fn(value); subs.add(fn); return () => subs.delete(fn); },
    set(next: Todo[]) { value = next; subs.forEach((fn) => fn(value)); },
    get() { return value; },
  };
});

const isTodoSidebarOpenStore = vi.hoisted(() => {
  type Sub = (value: boolean) => void;
  let value = false;
  const subs = new Set<Sub>();
  return {
    subscribe(fn: Sub) { fn(value); subs.add(fn); return () => subs.delete(fn); },
    set(next: boolean) { value = next; subs.forEach((fn) => fn(value)); },
    get() { return value; },
  };
});

const isScanningTodosStore = vi.hoisted(() => {
  type Sub = (value: boolean) => void;
  let value = false;
  const subs = new Set<Sub>();
  return {
    subscribe(fn: Sub) { fn(value); subs.add(fn); return () => subs.delete(fn); },
    set(next: boolean) { value = next; subs.forEach((fn) => fn(value)); },
  };
});

const mockScanTodos = vi.hoisted(() => vi.fn());
const mockOpenBuffer = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: { subscribe: (fn: any) => { fn({ vars: {} }); return () => {}; } },
}));
vi.mock('$lib/stores/todoStore', () => ({
  todoList: todoListStore,
  isTodoSidebarOpen: isTodoSidebarOpenStore,
  isScanningTodos: isScanningTodosStore,
  scanTodos: mockScanTodos,
}));
vi.mock('$lib/stores/bufferStore', () => ({
  openBuffer: mockOpenBuffer,
}));

import TodoSidebar from '$lib/components/TodoSidebar.svelte';

describe('TodoSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    todoListStore.set([]);
    isTodoSidebarOpenStore.set(false);
    isScanningTodosStore.set(false);

    if (!Element.prototype.animate) {
      Element.prototype.animate = () => ({ onfinish: null, cancel: () => {} } as unknown as Animation);
    }
  });

  it('renders only when the sidebar store is open', () => {
    const { container, rerender } = render(TodoSidebar);
    expect(container.querySelector('header')).toBeNull();

    isTodoSidebarOpenStore.set(true);
    rerender({});
    expect(screen.getByText('TODO')).toBeInTheDocument();
  });

  it('shows an empty state when there are no todos and not scanning', () => {
    isTodoSidebarOpenStore.set(true);
    render(TodoSidebar);

    expect(screen.getByText('No TODOs found.')).toBeInTheDocument();
  });

  it('shows a scanning state when scanning with an empty list', () => {
    isTodoSidebarOpenStore.set(true);
    isScanningTodosStore.set(true);
    render(TodoSidebar);

    expect(screen.getByText('Scanning...')).toBeInTheDocument();
  });

  it('renders todo items and opens the buffer when one is clicked', async () => {
    isTodoSidebarOpenStore.set(true);
    todoListStore.set([
      { filePath: '/project/src/todo.ts', fileName: 'todo.ts', lineNum: 7, content: 'TODO: finish test' },
    ]);
    render(TodoSidebar);

    await fireEvent.click(screen.getByRole('button', { name: /finish test/i }));

    expect(screen.getByText('todo.ts')).toBeInTheDocument();
    expect(mockOpenBuffer).toHaveBeenCalledWith('/project/src/todo.ts');
  });

  it('closes when the close button is clicked', async () => {
    isTodoSidebarOpenStore.set(true);
    render(TodoSidebar);

    const buttons = screen.getAllByRole('button');
    await fireEvent.click(buttons[1]);

    expect(isTodoSidebarOpenStore.get()).toBe(false);
  });

  it('calls scanTodos when Refresh TODOs is clicked', async () => {
    isTodoSidebarOpenStore.set(true);
    render(TodoSidebar);

    await fireEvent.click(screen.getByTitle('Refresh TODOs'));

    expect(mockScanTodos).toHaveBeenCalledTimes(1);
  });
});
