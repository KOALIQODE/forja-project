import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { THEMES } from '$lib/themes/index';

// ── Theme fixtures ────────────────────────────────────────────────────────────

const mistoDark  = THEMES.find((t) => t.id === 'misto-dark')!;
const mistoLight = THEMES.find((t) => t.id === 'misto-light')!;

const tokyoNightDark = {
  id: 'tokyo-night-dark',
  name: 'Tokyo Night Dark',
  kind: 'dark' as const,
  bgGradient: { from: '#080912', to: '#1e2030', steps: 12, angle: 135 },
  preview: { bg: '#0a0b14', accent: '#7aa2f7', text: '#c0caf5' },
  vars: {
    '--forja-ui-text-primary':       '#c0caf5',
    '--forja-ui-text-secondary':     '#a9b1d6',
    '--forja-ui-text-muted':         '#444b6a',
    '--forja-ui-text-version':       '#2e3452',
    '--forja-ui-gradient-from':      '#7aa2f7',
    '--forja-ui-gradient-to':        '#bb9af7',
    '--forja-ui-btn-border':         '#1c1e2e',
    '--forja-ui-btn-bg':             'rgba(10,11,20,0.55)',
    '--forja-ui-btn-text':           '#a9b1d6',
    '--forja-ui-btn-hover-border':   'rgba(122,162,247,0.35)',
    '--forja-ui-btn-hover-bg':       'rgba(122,162,247,0.06)',
    '--forja-ui-btn-hover-text':     '#c0caf5',
    '--forja-ui-btn-hover-shadow':   '0 0 25px rgba(122,162,247,0.1)',
    '--forja-ui-btn-icon':           '#8892b8',
    '--forja-ui-btn-icon-hover':     '#7aa2f7',
    '--forja-ui-ws-bg':              'transparent',
    '--forja-ui-picker-bg':          'rgba(8,9,18,0.97)',
    '--forja-ui-picker-border':      '#1c1e2e',
    '--forja-ui-picker-text':        '#a9b1d6',
    '--forja-ui-picker-item-hover':  'rgba(255,255,255,0.04)',
    '--forja-ui-picker-active':      'rgba(122,162,247,0.12)',
    '--forja-ui-picker-active-text': '#7aa2f7',
    '--forja-ui-logo-outer':         'rgba(122,162,247,0.4)',
    '--forja-ui-logo-mid':           '#0f1020',
    '--forja-ui-logo-core':          '#7aa2f7',
    '--forja-ui-logo-glow':          'rgba(122,162,247,0.45)',
  },
};

// ── Minimal hand-rolled store (no svelte/store import needed in hoisted scope) ─

const mockThemeStore = vi.hoisted(() => {
  let _value: { vars: Record<string, string> } = { vars: {} };
  const _subs = new Set<(v: typeof _value) => void>();
  return {
    subscribe(fn: (v: typeof _value) => void) {
      fn(_value);
      _subs.add(fn);
      return () => { _subs.delete(fn); };
    },
    set(next: typeof _value) {
      _value = next;
      _subs.forEach((fn) => fn(_value));
    },
  };
});

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockAppWindow = vi.hoisted(() => ({
  minimize:        vi.fn(),
  toggleMaximize:  vi.fn(),
  close:           vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => mockAppWindow,
}));

vi.mock('$lib/stores/dialogStore', () => ({
  openPreferencesDialog: vi.fn(),
  openExtensionsManager: vi.fn(),
}));

vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: mockThemeStore,
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { openPreferencesDialog, openExtensionsManager } from '$lib/stores/dialogStore';
import TitleBar from '$lib/components/TitleBar.svelte';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the header element that carries the inline theme style. */
function getHeader() {
  return document.querySelector('header[data-program-ui]') as HTMLElement;
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('TitleBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockThemeStore.set(mistoDark);
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  describe('render', () => {
    it('shows the Forja brand text', () => {
      render(TitleBar);
      expect(screen.getByText('Forja')).toBeInTheDocument();
      expect(screen.getByText('Studio')).toBeInTheDocument();
      expect(screen.getByText('Editor')).toBeInTheDocument();
    });

    it('renders the Extensions button', () => {
      render(TitleBar);
      expect(screen.getByTitle('Extensions')).toBeInTheDocument();
    });

    it('renders the Preferences button', () => {
      render(TitleBar);
      expect(screen.getByTitle('Preferences')).toBeInTheDocument();
    });

    it('renders the Help button', () => {
      render(TitleBar);
      expect(screen.getByTitle('Help')).toBeInTheDocument();
    });

    it('renders the Minimize button', () => {
      render(TitleBar);
      expect(screen.getByTitle('Minimize')).toBeInTheDocument();
    });

    it('renders the Maximize button', () => {
      render(TitleBar);
      expect(screen.getByTitle('Maximize')).toBeInTheDocument();
    });

    it('renders the Close button', () => {
      render(TitleBar);
      expect(screen.getByTitle('Close')).toBeInTheDocument();
    });
  });

  // ── Theme reactivity ─────────────────────────────────────────────────────────

  describe('theme reactivity', () => {
    it('applies Misto Dark CSS vars to the header style', () => {
      mockThemeStore.set(mistoDark);
      render(TitleBar);
      const style = getHeader().getAttribute('style') ?? '';
      expect(style).toContain('--forja-ui-text-primary: #f4f4f5');
      expect(style).toContain('--forja-ui-btn-icon: #9ca3af');
      // dark theme: hover overlay is white-translucent
      expect(style).toContain('--forja-ui-picker-item-hover: rgba(255,255,255,0.05)');
    });

    it('applies Misto Light CSS vars to the header style', () => {
      mockThemeStore.set(mistoLight);
      render(TitleBar);
      const style = getHeader().getAttribute('style') ?? '';
      expect(style).toContain('--forja-ui-text-primary: #111111');
      expect(style).toContain('--forja-ui-btn-icon: #4b5563');
      // light theme: hover overlay is dark-translucent
      expect(style).toContain('--forja-ui-picker-item-hover: rgba(0,0,0,0.05)');
    });

    it('applies Tokyo Night Dark CSS vars to the header style', () => {
      mockThemeStore.set(tokyoNightDark);
      render(TitleBar);
      const style = getHeader().getAttribute('style') ?? '';
      expect(style).toContain('--forja-ui-text-primary: #c0caf5');
      expect(style).toContain('--forja-ui-btn-icon: #8892b8');
      // dark theme: hover overlay is white-translucent
      expect(style).toContain('--forja-ui-picker-item-hover: rgba(255,255,255,0.04)');
    });

    it('updates the style when the theme changes at runtime', async () => {
      mockThemeStore.set(mistoDark);
      render(TitleBar);
      expect(getHeader().getAttribute('style')).toContain('--forja-ui-text-primary: #f4f4f5');

      mockThemeStore.set(mistoLight);
      // Let Svelte flush reactive updates
      await Promise.resolve();
      expect(getHeader().getAttribute('style')).toContain('--forja-ui-text-primary: #111111');
    });

    it('switches from Misto Dark to Tokyo Night Dark at runtime', async () => {
      mockThemeStore.set(mistoDark);
      render(TitleBar);
      expect(getHeader().getAttribute('style')).toContain('--forja-ui-gradient-from: #34d399');

      mockThemeStore.set(tokyoNightDark);
      await Promise.resolve();
      expect(getHeader().getAttribute('style')).toContain('--forja-ui-gradient-from: #7aa2f7');
    });
  });

  // ── Window controls ──────────────────────────────────────────────────────────

  describe('window controls', () => {
    it('calls minimize() when the Minimize button is clicked', async () => {
      render(TitleBar);
      await fireEvent.click(screen.getByTitle('Minimize'));
      expect(mockAppWindow.minimize).toHaveBeenCalledTimes(1);
    });

    it('calls toggleMaximize() when the Maximize button is clicked', async () => {
      render(TitleBar);
      await fireEvent.click(screen.getByTitle('Maximize'));
      expect(mockAppWindow.toggleMaximize).toHaveBeenCalledTimes(1);
    });

    it('calls close() when the Close button is clicked', async () => {
      render(TitleBar);
      await fireEvent.click(screen.getByTitle('Close'));
      expect(mockAppWindow.close).toHaveBeenCalledTimes(1);
    });
  });

  // ── Action buttons ───────────────────────────────────────────────────────────

  describe('action buttons', () => {
    it('calls openExtensionsManager() when Extensions is clicked', async () => {
      render(TitleBar);
      await fireEvent.click(screen.getByTitle('Extensions'));
      expect(openExtensionsManager).toHaveBeenCalledTimes(1);
    });

    it('calls openPreferencesDialog("program") when Preferences is clicked', async () => {
      render(TitleBar);
      await fireEvent.click(screen.getByTitle('Preferences'));
      expect(openPreferencesDialog).toHaveBeenCalledWith('program');
    });
  });
});
