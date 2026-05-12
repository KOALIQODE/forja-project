import { writable } from 'svelte/store';
import type { Component } from 'svelte';

export const SIDEBAR_IDS = {
  EXPLORER: 'explorer',
  TODO: 'todo',
  DEPS: 'deps',
} as const;

export type SidebarId = typeof SIDEBAR_IDS[keyof typeof SIDEBAR_IDS];

export interface SidebarState {
  openSidebars: Set<SidebarId>;
}

export const sidebarState = writable<SidebarState>({
  openSidebars: new Set([SIDEBAR_IDS.EXPLORER]) // Explorer open by default
});

/**
 * Registry of sidebar components with lazy loading
 */
export const SIDEBAR_REGISTRY: Record<SidebarId, () => Promise<{ default: Component<any> }>> = {
  [SIDEBAR_IDS.EXPLORER]: () => import('../components/explorer/Explorer.svelte'),
  [SIDEBAR_IDS.TODO]: () => import('../components/sidebars/TodoSidebar.svelte'),
  [SIDEBAR_IDS.DEPS]: () => import('../components/sidebars/DepsSidebar.svelte'),
};

export function toggleSidebar(id: SidebarId) {
  sidebarState.update(state => {
    const next = new Set(state.openSidebars);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return { ...state, openSidebars: next };
  });
}

export function openSidebar(id: SidebarId) {
  sidebarState.update(state => {
    const next = new Set(state.openSidebars);
    next.add(id);
    return { ...state, openSidebars: next };
  });
}

export function closeSidebar(id: SidebarId) {
  sidebarState.update(state => {
    const next = new Set(state.openSidebars);
    next.delete(id);
    return { ...state, openSidebars: next };
  });
}

export function isSidebarOpen(id: SidebarId, state: SidebarState): boolean {
  return state.openSidebars.has(id);
}
