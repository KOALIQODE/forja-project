import { writable } from 'svelte/store';

export interface BreadcrumbItem {
  name: string;
  kind: string;
  line: number;
  column: number;
}

export interface CodeBreadcrumb {
  items: BreadcrumbItem[];
  line: number;
  column: number;
}

export type VimMode = 'off' | 'normal' | 'insert' | 'visual' | 'command';

export interface VimStatus {
  mode: VimMode;
  command: string;
  pending: string;
  count: string;
}

export const cursorPosition = writable({ line: 0, column: 0 });
export const currentBreadcrumb = writable<CodeBreadcrumb | null>(null);
export const vimStatus = writable<VimStatus>({
  mode: 'off',
  command: '',
  pending: '',
  count: '',
});
