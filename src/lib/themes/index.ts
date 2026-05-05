/**
 * Forja UI Theme System
 *
 * Themes define CSS custom properties applied to :root plus a background
 * gradient config for the main layout. To create a new theme, add an entry
 * to THEMES following the UITheme interface below.
 */

export interface UITheme {
  /** Unique identifier (used as localStorage key and data-ui-theme attribute) */
  id: string;
  /** Display name shown in the theme picker */
  name: string;
  /** Used for badge in picker */
  kind: 'dark' | 'light';
  /** CSS custom properties applied to :root when this theme is active */
  vars: Record<string, string>;
  /** Stepped gradient config for the main layout background */
  bgGradient: { from: string; to: string; steps: number; angle: number };
  /** Colors for the visual swatch in the theme picker */
  preview: { bg: string; accent: string; text: string };
}

export const THEMES: UITheme[] = [
  // ── Misto Dark (default) ────────────────────────────────────────────────────
  {
    id: 'misto-dark',
    name: 'Misto Dark',
    kind: 'dark',
    bgGradient: { from: '#080808', to: '#242424', steps: 12, angle: 135 },
    preview: { bg: '#0a0a0a', accent: '#4ade80', text: '#f4f4f5' },
    vars: {
      '--forja-ui-text-primary':      '#f4f4f5',
      '--forja-ui-text-secondary':    '#a1a1aa',
      '--forja-ui-text-muted':        '#71717a',
      '--forja-ui-text-version':      '#52525b',
      '--forja-ui-gradient-from':     '#34d399',
      '--forja-ui-gradient-to':       '#2dd4bf',
      '--forja-ui-btn-border':        '#27272a',
      '--forja-ui-btn-bg':            '#09090b',
      '--forja-ui-btn-text':          '#a1a1aa',
      '--forja-ui-btn-hover-border':  'rgba(16,185,129,0.5)',
      '--forja-ui-btn-hover-bg':      'rgba(255,255,255,0.06)',
      '--forja-ui-btn-hover-text':    '#f4f4f5',
      '--forja-ui-btn-hover-shadow':  '0 0 25px rgba(16,185,129,0.1)',
      '--forja-ui-btn-icon':          '#9ca3af',
      '--forja-ui-btn-icon-hover':    '#d4d4d8',
      '--forja-ui-ws-bg':             'transparent',
      '--forja-ui-picker-bg':         'rgba(14,14,17,0.97)',
      '--forja-ui-picker-border':     '#2a2a2e',
      '--forja-ui-picker-text':       '#a1a1aa',
      '--forja-ui-picker-item-hover': 'rgba(255,255,255,0.05)',
      '--forja-ui-picker-active':     'rgba(52,211,153,0.12)',
      '--forja-ui-picker-active-text':'#34d399',
      '--forja-ui-logo-outer':        'rgba(126,207,176,0.55)',
      '--forja-ui-logo-mid':          '#1e3a2f',
      '--forja-ui-logo-core':         '#1aab6d',
      '--forja-ui-logo-glow':         'rgba(26,171,109,0.45)',
      '--forja-ui-explorer-bg':       '#0a0a0a',
      '--forja-ui-explorer-folder':   '#7a7a8a',
      '--forja-ui-explorer-scrollbar':'#1e1e1e',
      '--forja-ui-explorer-scrollbar-hover':'#2e2e2e',
      '--forja-ui-explorer-resize':   'rgba(82,82,91,0.5)',
    },
  },

  // ── Misto Light ─────────────────────────────────────────────────────────────
  {
    id: 'misto-light',
    name: 'Misto Light',
    kind: 'light',
    bgGradient: { from: '#ffffff', to: '#bdd0c8', steps: 12, angle: 135 },
    preview: { bg: '#f5f5f5', accent: '#16a34a', text: '#111111' },
    vars: {
      '--forja-ui-text-primary':      '#111111',
      '--forja-ui-text-secondary':    '#3a3a3a',
      '--forja-ui-text-muted':        '#5c5c5c',
      '--forja-ui-text-version':      '#8a8a8a',
      '--forja-ui-gradient-from':     '#16a34a',
      '--forja-ui-gradient-to':       '#0d9488',
      '--forja-ui-btn-border':        '#d4d4d4',
      '--forja-ui-btn-bg':            '#ffffff',
      '--forja-ui-btn-text':          '#3a3a3a',
      '--forja-ui-btn-hover-border':  'rgba(22,163,74,0.5)',
      '--forja-ui-btn-hover-bg':      'rgba(0,0,0,0.06)',
      '--forja-ui-btn-hover-text':    '#111111',
      '--forja-ui-btn-hover-shadow':  '0 0 25px rgba(22,163,74,0.12)',
      '--forja-ui-btn-icon':          '#4b5563',
      '--forja-ui-btn-icon-hover':    '#111111',
      '--forja-ui-ws-bg':             'rgba(245,245,245,0.97)',
      '--forja-ui-picker-bg':         'rgba(250,250,250,0.97)',
      '--forja-ui-picker-border':     '#d4d4d4',
      '--forja-ui-picker-text':       '#3a3a3a',
      '--forja-ui-picker-item-hover': 'rgba(0,0,0,0.05)',
      '--forja-ui-picker-active':     'rgba(22,163,74,0.10)',
      '--forja-ui-picker-active-text':'#16a34a',
      '--forja-ui-logo-outer':        'rgba(134,239,172,0.5)',
      '--forja-ui-logo-mid':          '#f0fdf4',
      '--forja-ui-logo-core':         '#16a34a',
      '--forja-ui-logo-glow':         'rgba(22,163,74,0.35)',
      '--forja-ui-explorer-bg':       '#f0f0f0',
      '--forja-ui-explorer-folder':   '#4a4a5a',
      '--forja-ui-explorer-scrollbar':'#d4d4d8',
      '--forja-ui-explorer-scrollbar-hover':'#a1a1aa',
      '--forja-ui-explorer-resize':   'rgba(113,113,122,0.5)',
    },
  },

];

export const DEFAULT_THEME_ID = 'misto-dark';

export function getThemeById(id: string): UITheme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
