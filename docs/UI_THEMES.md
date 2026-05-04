# UI Theme System — Contributor Guide

Forja's UI theme system lets you define the visual personality of the Welcome Screen (and future UI surfaces) without touching component code. Themes live in a single file and are picked up automatically.

---

## Where themes live

```
src/lib/themes/index.ts   ← define your theme here
src/lib/stores/uiThemeStore.ts  ← store + persistence (don't touch)
src/lib/components/ThemePicker.svelte  ← picker UI (don't touch)
```

---

## Adding a theme

Open `src/lib/themes/index.ts` and add an entry to the `THEMES` array:

```ts
{
  id: 'my-theme',           // unique slug, used as localStorage key
  name: 'My Theme',         // display name in the picker
  kind: 'dark',             // 'dark' | 'light' — shown as badge in picker

  // Background gradient of the main app window
  bgGradient: { from: '#1a1a2e', to: '#16213e', steps: 15, angle: 180 },

  // Small color swatch shown in the picker list
  preview: { bg: '#1a1a2e', accent: '#e94560', text: '#eaeaea' },

  // CSS custom properties scoped to each themed component
  vars: {
    // ── Text ──────────────────────────────────────────────────────────────
    '--forja-ui-text-primary':       '#eaeaea',   // main headings
    '--forja-ui-text-secondary':     '#b0b0c0',   // tagline body
    '--forja-ui-text-muted':         '#6b6b80',   // description, subtle text
    '--forja-ui-text-version':       '#40404f',   // version label

    // ── Tagline gradient ("workflow" word) ────────────────────────────────
    '--forja-ui-gradient-from':      '#e94560',   // start color
    '--forja-ui-gradient-to':        '#c62a47',   // end color

    // ── Action buttons ────────────────────────────────────────────────────
    '--forja-ui-btn-border':         '#2a2a3e',   // default border
    '--forja-ui-btn-bg':             'rgba(26,26,46,0.4)',  // default bg
    '--forja-ui-btn-text':           '#b0b0c0',   // default label
    '--forja-ui-btn-hover-border':   'rgba(233,69,96,0.5)', // hover border
    '--forja-ui-btn-hover-bg':       'rgba(233,69,96,0.06)',// hover bg
    '--forja-ui-btn-hover-text':     '#eaeaea',   // hover label
    '--forja-ui-btn-hover-shadow':   '0 0 20px rgba(233,69,96,0.12)', // glow
    '--forja-ui-btn-icon':           '#6b6b80',   // icon default
    '--forja-ui-btn-icon-hover':     '#e94560',   // icon on hover

    // ── Logo (3-layer diamond SVG) ────────────────────────────────────────
    '--forja-ui-logo-outer':         'rgba(233,69,96,0.35)',// outer ring
    '--forja-ui-logo-mid':           '#1e1e30',   // middle ring (dark on dark, light on light)
    '--forja-ui-logo-core':          '#e94560',   // inner filled diamond
    '--forja-ui-logo-glow':          'rgba(233,69,96,0.25)',// drop-shadow color (keep subtle)

    // ── Theme picker card ─────────────────────────────────────────────────
    '--forja-ui-picker-bg':          'rgba(18,18,30,0.97)', // card background
    '--forja-ui-picker-border':      '#2a2a3e',   // card border
    '--forja-ui-picker-text':        '#b0b0c0',   // item labels
    '--forja-ui-picker-item-hover':  'rgba(255,255,255,0.05)', // row hover bg
    '--forja-ui-picker-active':      'rgba(233,69,96,0.12)',   // active row bg
    '--forja-ui-picker-active-text': '#e94560',   // active row text + checkmark
  },
},
```

That's it — the picker will display it immediately and the theme is persisted via `localStorage`.

---

## Design guidelines

| Token group | Advice |
|---|---|
| `logo-mid` | Match the background tone — **dark** on dark themes, **light** on light themes. Avoids the "white gap" artifact between outer and core rings. |
| `logo-glow` | Keep opacity between `0.20–0.30`. Higher values look noisy. |
| `btn-hover-shadow` | A soft radial glow matches the accent — `rgba(accent, 0.10–0.15)` is enough. |
| `gradient-from/to` | The "workflow" word gradient. Works best when both colors share the same hue family. |
| `bgGradient` | `steps: 12–18` gives a smooth stepped look. `angle: 180` is top-to-bottom. |

---

## CSS var scope

All `--forja-ui-*` vars are applied **inline** on each component's root element (`<main style={themeStyle}>`). They never reach `:root`, so they cannot bleed into the editor, title bar, or any other surface. This is intentional.

---

## Currently themed surfaces

| Surface | Component |
|---|---|
| Welcome Screen | `src/lib/components/WelcomeScreen.svelte` |
| Theme Picker | `src/lib/components/ThemePicker.svelte` |

Future UI surfaces (editor chrome, sidebar, status bar) will each consume the same `--forja-ui-*` vars as they are themed.

---

## Built-in themes

| ID | Name | Kind |
|---|---|---|
| `misto-dark` | Misto Dark | dark (default) |
| `misto-light` | Misto Light | light |
| `tokyo-night-dark` | Tokyo Night Dark | dark |
