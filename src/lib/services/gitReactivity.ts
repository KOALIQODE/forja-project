import { listen } from '@tauri-apps/api/event';

let initialized = false;
const unlistens: Array<() => void> = [];

export async function initGitReactivity() {
  if (initialized) return;
  if (typeof window === 'undefined') return;
  initialized = true;

  try {
    const un1 = await listen<string>('file-changed', (event) => {
      const p = normalizePath(event.payload);
      try { window.dispatchEvent(new CustomEvent('forja:file-changed', { detail: { path: p } })); } catch {}
    });
    unlistens.push(un1 as unknown as () => void);

    const un2 = await listen<string>('file-saved', (event) => {
      const p = normalizePath(event.payload);
      try { window.dispatchEvent(new CustomEvent('forja:file-saved', { detail: { path: p } })); } catch {}
    });
    unlistens.push(un2 as unknown as () => void);

    const un3 = await listen<string>('deps:changed', (event) => {
      const p = normalizePath(event.payload);
      try { window.dispatchEvent(new CustomEvent('forja:deps:changed', { detail: { path: p } })); } catch {}
    });
    unlistens.push(un3 as unknown as () => void);
  } catch (e) {
    console.error('[initGitReactivity] registration failed:', e);
  }
}

export function disposeGitReactivity() {
  for (const un of unlistens) {
    try { un(); } catch {}
  }
  unlistens.length = 0;
  initialized = false;
}

function normalizePath(p?: string): string {
  if (!p) return '';
  return p.replace(/\\/g, '/').replace(/\/+/g, '/');
}
