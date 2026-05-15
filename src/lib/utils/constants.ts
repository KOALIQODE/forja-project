// === Context Names ===
export const KEYBOARD_CONTEXTS = {
  WELCOME_SCREEN: "welcome-screen",
  RECENT_PROJECTS_DIALOG: "recent-projects-dialog",
} as const;

// === Dialog State Keys ===
export const DIALOG_STATE_KEYS = {
  RECENT_PROJECTS_OPEN: "recentProjectsOpen",
} as const;

// === Local Storage Keys ===
export const STORAGE_KEYS = {
  // Project
  RECENT_PROJECTS: "forja-recent-projects",
  CURRENT_PROJECT: "forja-current-project",
  // Preferences
  PREFERENCES_PROGRAM: "forja-preferences-program",
  PREFERENCES_BUFFER: "forja-preferences-buffer",
  // UI Theme
  UI_THEME: "forja:ui-theme",
  // Buffer session (keyed by project — append btoa(projectPath))
  BUFFERS_PREFIX: "forja-buffers-",
  ACTIVE_BUFFER_PREFIX: "forja-active-",
  // Plugins
  DISABLED_PLUGINS: "forja:disabledPlugins",
  // Explorer
  EXPLORER_PINNED_PATH: "forja-explorer-pinned-path",
} as const;

// === UI Text Constants ===
export const UI_TEXT = {
  // Actions
  OPEN_PROJECT: "Open Project",
  NEW_EMPTY_PROJECT: "New Empty Project",
  RECENT_PROJECTS: "Recent Projects",

  // Dialog titles
  RECENT_PROJECTS_TITLE: "Recent Projects",

  // Status messages
  NO_RECENT_PROJECTS: "No recent projects found",
  PUBLISH: "Publish",
  NO_GIT: "No Git",

  // Help text
  CLOSE_HINT: "to close",

  // Navigation hints
  NAVIGATE: "Navigate",
  OPEN: "Open",
  DELETE: "Delete",
  CLOSE: "Close",
} as const;

// === CSS Classes ===
export const CSS_CLASSES = {
  WELCOME_SCREEN: "welcome-screen",
  ACTION_BTN: "action-btn",
  DIALOG_CONTAINER: "dialog-container",
  PROJECT_ITEM: "project-item",
  SELECTED: "selected",
} as const;

// === Animation Durations (in ms) ===
export const ANIMATION_DURATIONS = {
  CONTEXT_RESTORE_DELAY: 10,
  SHORT: 150,
  NORMAL: 200,
  SLOW: 500,
} as const;

// === Git Status Constants ===
export const GIT_STATUS = {
  BRANCH: "branch",
  AHEAD: "ahead",
  BEHIND: "behind",
  PUBLISH: "Publish",
  NO_GIT: "No Git",
} as const;

// === File Sizes ===
export const FILE_LIMITS = {
  MAX_RECENT_PROJECTS: 10,
} as const;

// === Validation Patterns ===
export const VALIDATION = {
  PROJECT_PATH_MIN_LENGTH: 1,
  PROJECT_NAME_MAX_LENGTH: 100,
} as const;

// === Component Sizes ===
export const COMPONENT_SIZES = {
  DIALOG_MAX_HEIGHT: "70vh",
  DIALOG_WIDTH: 600,
  TITLEBAR_HEIGHT: 40,
  WINDOW_CONTROL_WIDTH: 46,
} as const;

// === Editor Configuration ===
export const EDITOR_CONFIG = {
  LINE_HEIGHT: 22,
  FONT_SIZE: 13,
  FONT_FAMILY: '13px "JetBrains Mono", "Fira Code", monospace',
  CHUNK_SIZE: 500,
  VISIBLE_LINES_OFFSET: 5,
} as const;

// === Syntax Highlighting Colors ===
export const TOKEN_COLORS: Record<string, string> = {
  Keyword:     '#C586C0',  // Purple
  Function:    '#DCDCAA',  // Yellow
  Type:        '#4EC9B0',  // Teal  (also used for HTML tags)
  String:      '#CE9178',  // Orange
  Comment:     '#6A9955',  // Green
  Number:      '#B5CEA8',  // Light green
  Punctuation: '#888888',  // Gray
  Operator:    '#D4D4D4',  // White
  Variable:    '#9CDCFE',  // Light blue
  Property:    '#9CDCFE',  // Light blue
  Constant:    '#569CD6',  // Blue     (constants, true/false/null, bold text)
  Attribute:   '#9CDCFE',  // Light blue
  Boolean:     '#569CD6',  // Blue
  Unknown:     '#D4D4D4',  // Default white
} as const;

// === Error Messages ===
export const ERROR_MESSAGES = {
  PROJECT_OPEN_FAILED: "Error opening project",
  RECENT_PROJECTS_SAVE_FAILED: "Error saving recent projects",
  RECENT_PROJECTS_LOAD_FAILED: "Error loading recent projects",
  FOLDER_DIALOG_FAILED: "Error opening folder dialog",
} as const;

// === Language Extension Map ===
// Maps file extensions (with leading dot) to language identifiers.
// Mirrors the backend detect_language command — keep in sync.
export const LANG_MAP: Readonly<Record<string, string>> = {
  '.rs':       'rust',
  '.js':       'javascript',
  '.mjs':      'javascript',
  '.cjs':      'javascript',
  '.jsx':      'jsx',
  '.ts':       'typescript',
  '.tsx':      'tsx',
  '.svelte':   'svelte',
  '.py':       'python',
  '.pyw':      'python',
  '.json':     'json',
  '.jsonc':    'json',
  '.md':       'markdown',
  '.mdx':      'markdown',
  '.markdown': 'markdown',
  '.css':      'css',
  '.html':     'html',
  '.htm':      'html',
  '.go':       'go',
  '.cpp':      'cpp',
  '.cc':       'cpp',
  '.cxx':      'cpp',
  '.c':        'c',
  '.h':        'cpp',
  '.hpp':      'cpp',
  '.java':     'java',
  '.rb':       'ruby',
  '.php':      'php',
  '.toml':     'toml',
  '.yaml':     'yaml',
  '.yml':      'yaml',
  '.sh':       'bash',
  '.bash':     'bash',
  '.lua':      'lua',
};

// Type helpers for better TypeScript support
export type StorageKeys = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
export type UIText = (typeof UI_TEXT)[keyof typeof UI_TEXT];
export type CSSClasses = (typeof CSS_CLASSES)[keyof typeof CSS_CLASSES];
