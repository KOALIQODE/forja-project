import { get } from 'svelte/store';
import { dialogState } from '../stores/dialogStore';
import { currentProject } from '../stores/projectStore';
import { executeAction, type ShortcutActionId } from '../services/shortcutService';

/**
 * State for complex shortcuts
 */
let ctrlKTime = 0;
let lastTabTime = 0;

/**
 * Shortcut Registry
 * Maps key combinations to actions.
 */
interface ShortcutDef {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
  action: ShortcutActionId;
}

const GLOBAL_SHORTCUTS: ShortcutDef[] = [
  { key: 'r', ctrl: true, action: 'open-recent' },
  { key: ',', ctrl: true, action: 'open-preferences' },
  { key: 'g', ctrl: true, action: 'open-grammar' },
];

const PROJECT_SHORTCUTS: ShortcutDef[] = [
  { key: 'b', ctrl: true, action: 'open-buffers' },
  { key: '/', shift: true, action: 'live-grep' }, // Shift + / is '?'
];

/**
 * Hook to manage global shortcuts
 * @returns A cleanup function to remove event listeners
 */
export function useShortcuts() {
  if (typeof window === 'undefined') return () => {};

  const handleKeyDown = (e: KeyboardEvent) => {
    const isMod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    // ── 1. Chord Handling (Highest Priority) ──────────────────────────
    if (isMod && key === 'k') {
      e.preventDefault();
      e.stopImmediatePropagation();
      ctrlKTime = Date.now();
      return;
    }

    if (key === 't' && ctrlKTime > 0 && Date.now() - ctrlKTime < 1500) {
      e.preventDefault();
      e.stopImmediatePropagation();
      ctrlKTime = 0;
      executeAction('open-themes');
      return;
    }

    if (ctrlKTime > 0) ctrlKTime = 0;

    // ── 2. Global Shortcuts ──────────────────────────────────────────
    const globalMatch = GLOBAL_SHORTCUTS.find(s => 
      s.key === key && 
      (!!s.ctrl === isMod) && 
      (!!s.shift === e.shiftKey)
    );

    if (globalMatch) {
      e.preventDefault();
      e.stopImmediatePropagation();
      executeAction(globalMatch.action);
      return;
    }

    // ── 3. Dialog Guard ──────────────────────────────────────────────
    const currentState = get(dialogState);
    if (currentState.activeDialog) {
      if (e.key === 'Escape') {
        e.preventDefault();
        executeAction('close-dialog');
      }
      return;
    }

    // ── 4. Contextual Guards (Insert mode / Input focus) ─────────────
    const editorEl = document.querySelector('[data-buffer-ui]') as HTMLElement | null;
    const editorHasFocus = editorEl && (document.activeElement === editorEl || editorEl.contains(document.activeElement));
    const isVimInsert = editorEl?.dataset?.vimMode === 'insert';
    const isInputFocused = document.activeElement instanceof HTMLInputElement || 
                          document.activeElement instanceof HTMLTextAreaElement;

    if (isVimInsert || isInputFocused) return;

    // ── 5. Project-dependent Shortcuts ───────────────────────────────
    if (!get(currentProject)) return;

    // Special: Tab Tab (Double tap)
    if (e.key === 'Tab') {
      const now = Date.now();
      const delta = now - lastTabTime;
      if (delta > 0 && delta < 500) {
        e.preventDefault();
        e.stopImmediatePropagation();
        executeAction('search-files');
        lastTabTime = 0;
        return;
      }
      lastTabTime = now;
      return;
    }

    const projectMatch = PROJECT_SHORTCUTS.find(s => 
      s.key === key && 
      (!!s.ctrl === isMod) && 
      (!!s.shift === e.shiftKey)
    );

    if (projectMatch) {
      e.preventDefault();
      e.stopImmediatePropagation();
      executeAction(projectMatch.action);
      return;
    }
  };

  window.addEventListener('keydown', handleKeyDown, true);
  return () => window.removeEventListener('keydown', handleKeyDown, true);
}
