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
  RECENT_PROJECTS: "forja-recent-projects",
  CURRENT_PROJECT: "forja-current-project",
} as const;

// === UI Text Constants ===
export const UI_TEXT = {
  APP_TITLE: "Forja Studio",
  APP_SUBTITLE: "Editor",
  TAGLINE: "Forge your workflow",
  DESCRIPTION: "A lightweight, modular editor that grows with your needs.",

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
  CHUNK_SIZE: 100,
  VISIBLE_LINES_OFFSET: 5,
} as const;

// === Syntax Highlighting Colors ===
export const TOKEN_COLORS: Record<string, string> = {
  Keyword: '#C586C0',   // Purple
  Function: '#DCDCAA',  // Yellow
  Type: '#4EC9B0',      // Teal
  String: '#CE9178',    // Orange
  Comment: '#6A9955',   // Green
  Number: '#B5CEA8',    // Light Green
  Punctuation: '#888888', // Gray
  Operator: '#D4D4D4',  // White
  Variable: '#9CDCFE',  // Blue
  Property: '#9CDCFE',  // Blue
  Unknown: '#D4D4D4',   // Default white
} as const;

// === Error Messages ===
export const ERROR_MESSAGES = {
  PROJECT_OPEN_FAILED: "Error opening project",
  RECENT_PROJECTS_SAVE_FAILED: "Error saving recent projects",
  RECENT_PROJECTS_LOAD_FAILED: "Error loading recent projects",
  FOLDER_DIALOG_FAILED: "Error opening folder dialog",
} as const;

// Type helpers for better TypeScript support
export type StorageKeys = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
export type UIText = (typeof UI_TEXT)[keyof typeof UI_TEXT];
export type CSSClasses = (typeof CSS_CLASSES)[keyof typeof CSS_CLASSES];
