import { writable } from 'svelte/store';

const STORAGE_KEYS = {
  PROGRAM: 'forja-preferences-program',
  BUFFER: 'forja-preferences-buffer',
} as const;

export const PROGRAM_FONT_OPTIONS = [
  {
    label: 'Montserrat',
    value: '"Montserrat Variable", "Segoe UI", system-ui, sans-serif',
  },
  {
    label: 'System UI',
    value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  {
    label: 'Segoe UI',
    value: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
  },
  {
    label: 'Verdana',
    value: 'Verdana, Geneva, sans-serif',
  },
] as const;

export const BUFFER_FONT_OPTIONS = [
  {
    label: 'JetBrains Mono',
    value: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
  },
  {
    label: 'Cascadia Code',
    value: '"Cascadia Code", "JetBrains Mono", monospace',
  },
  {
    label: 'Fira Code',
    value: '"Fira Code", "JetBrains Mono", monospace',
  },
  {
    label: 'Consolas',
    value: 'Consolas, "Cascadia Code", monospace',
  },
  {
    label: 'Monaco',
    value: 'Monaco, Menlo, monospace',
  },
] as const;

export interface ProgramPreferences {
  fontFamily: string;
  fontSize: number;
  explorerWidth: number;
  reduceMotion: boolean;
}

export interface BufferPreferences {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  vimModeEnabled: boolean;
  showLineNumbers: boolean;
  highlightActiveLine: boolean;
  softWrapEnabled: boolean;
}

export const DEFAULT_PROGRAM_PREFERENCES: ProgramPreferences = {
  fontFamily: PROGRAM_FONT_OPTIONS[0].value,
  fontSize: 12,
  explorerWidth: 260,
  reduceMotion: false,
};

export const DEFAULT_BUFFER_PREFERENCES: BufferPreferences = {
  fontFamily: BUFFER_FONT_OPTIONS[0].value,
  fontSize: 13,
  lineHeight: 22,
  vimModeEnabled: false,
  showLineNumbers: true,
  highlightActiveLine: true,
  softWrapEnabled: true,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function loadStoredPreferences<T>(key: string, defaults: T, sanitize: (value: Partial<T>) => T): T {
  if (typeof localStorage === 'undefined') {
    return defaults;
  }

  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return defaults;
    }

    return sanitize(JSON.parse(raw));
  } catch (error) {
    console.error(`Failed to load preferences for ${key}:`, error);
    return defaults;
  }
}

function sanitizeProgramPreferences(value: Partial<ProgramPreferences>): ProgramPreferences {
  return {
    fontFamily:
      typeof value.fontFamily === 'string' && value.fontFamily.trim()
        ? value.fontFamily
        : DEFAULT_PROGRAM_PREFERENCES.fontFamily,
    fontSize: clamp(Number(value.fontSize ?? DEFAULT_PROGRAM_PREFERENCES.fontSize), 10, 18),
    explorerWidth: clamp(
      Number(value.explorerWidth ?? DEFAULT_PROGRAM_PREFERENCES.explorerWidth),
      220,
      420,
    ),
    reduceMotion:
      typeof value.reduceMotion === 'boolean'
        ? value.reduceMotion
        : DEFAULT_PROGRAM_PREFERENCES.reduceMotion,
  };
}

function sanitizeBufferPreferences(value: Partial<BufferPreferences>): BufferPreferences {
  return {
    fontFamily:
      typeof value.fontFamily === 'string' && value.fontFamily.trim()
        ? value.fontFamily
        : DEFAULT_BUFFER_PREFERENCES.fontFamily,
    fontSize: clamp(Number(value.fontSize ?? DEFAULT_BUFFER_PREFERENCES.fontSize), 11, 24),
    lineHeight: clamp(Number(value.lineHeight ?? DEFAULT_BUFFER_PREFERENCES.lineHeight), 18, 34),
    vimModeEnabled:
      typeof value.vimModeEnabled === 'boolean'
        ? value.vimModeEnabled
        : DEFAULT_BUFFER_PREFERENCES.vimModeEnabled,
    showLineNumbers:
      typeof value.showLineNumbers === 'boolean'
        ? value.showLineNumbers
        : DEFAULT_BUFFER_PREFERENCES.showLineNumbers,
    highlightActiveLine:
      typeof value.highlightActiveLine === 'boolean'
        ? value.highlightActiveLine
        : DEFAULT_BUFFER_PREFERENCES.highlightActiveLine,
    softWrapEnabled:
      typeof value.softWrapEnabled === 'boolean'
        ? value.softWrapEnabled
        : DEFAULT_BUFFER_PREFERENCES.softWrapEnabled,
  };
}

function applyProgramPreferences(preferences: ProgramPreferences) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  root.style.setProperty('--forja-program-font-family', preferences.fontFamily);
  root.style.setProperty('--forja-program-font-size', `${preferences.fontSize}px`);
  root.style.setProperty(
    '--forja-program-ui-scale',
    (preferences.fontSize / DEFAULT_PROGRAM_PREFERENCES.fontSize).toFixed(3),
  );
  root.style.setProperty('--forja-explorer-width', `${preferences.explorerWidth}px`);
  root.dataset.reduceMotion = preferences.reduceMotion ? 'true' : 'false';
}

function applyBufferPreferences(preferences: BufferPreferences) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  root.style.setProperty('--forja-buffer-font-family', preferences.fontFamily);
  root.style.setProperty('--forja-buffer-font-size', `${preferences.fontSize}px`);
  root.style.setProperty('--forja-buffer-line-height', `${preferences.lineHeight}px`);
}

const initialProgramPreferences = loadStoredPreferences(
  STORAGE_KEYS.PROGRAM,
  DEFAULT_PROGRAM_PREFERENCES,
  sanitizeProgramPreferences,
);

const initialBufferPreferences = loadStoredPreferences(
  STORAGE_KEYS.BUFFER,
  DEFAULT_BUFFER_PREFERENCES,
  sanitizeBufferPreferences,
);

export const programPreferences = writable<ProgramPreferences>(initialProgramPreferences);
export const bufferPreferences = writable<BufferPreferences>(initialBufferPreferences);

if (typeof localStorage !== 'undefined') {
  programPreferences.subscribe((value) => {
    const sanitized = sanitizeProgramPreferences(value);
    localStorage.setItem(STORAGE_KEYS.PROGRAM, JSON.stringify(sanitized));
    applyProgramPreferences(sanitized);
  });

  bufferPreferences.subscribe((value) => {
    const sanitized = sanitizeBufferPreferences(value);
    localStorage.setItem(STORAGE_KEYS.BUFFER, JSON.stringify(sanitized));
    applyBufferPreferences(sanitized);
  });
} else {
  applyProgramPreferences(initialProgramPreferences);
  applyBufferPreferences(initialBufferPreferences);
}

export function setProgramPreference<K extends keyof ProgramPreferences>(
  key: K,
  value: ProgramPreferences[K],
) {
  programPreferences.update((preferences) =>
    sanitizeProgramPreferences({
      ...preferences,
      [key]: value,
    }),
  );
}

export function setBufferPreference<K extends keyof BufferPreferences>(
  key: K,
  value: BufferPreferences[K],
) {
  bufferPreferences.update((preferences) =>
    sanitizeBufferPreferences({
      ...preferences,
      [key]: value,
    }),
  );
}

export function resetProgramPreferences() {
  programPreferences.set(DEFAULT_PROGRAM_PREFERENCES);
}

export function resetBufferPreferences() {
  bufferPreferences.set(DEFAULT_BUFFER_PREFERENCES);
}
