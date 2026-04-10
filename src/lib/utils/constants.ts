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
} as const;

// === Keyboard Configuration ===
export const KEYBOARD_CONFIG = {
  LEADER_KEY: " ", // Space as leader key (configurable: could be " ", "AltLeft", "AltRight", "ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight")
  LEADER_KEY_DISPLAY: "Space", // How to display it in UI
} as const;

// Alternative leader key configurations (examples):
// For Space as leader:
// LEADER_KEY: " ", LEADER_KEY_DISPLAY: "Space"
// For Alt Left as leader:
// LEADER_KEY: "AltLeft", LEADER_KEY_DISPLAY: "Alt"  
// For Alt Right as leader:
// LEADER_KEY: "AltRight", LEADER_KEY_DISPLAY: "Alt"
// For Ctrl Left as leader:
// LEADER_KEY: "ControlLeft", LEADER_KEY_DISPLAY: "Ctrl"
// For Shift Left as leader:
// LEADER_KEY: "ShiftLeft", LEADER_KEY_DISPLAY: "Shift"

// === Keyboard Shortcuts - Scalable Structure ===
export const KEYBOARD_SHORTCUTS = {
  // UI Actions - Main interface shortcuts
  UI: {
    OPEN_PROJECT: { 
      key: `${KEYBOARD_CONFIG.LEADER_KEY}o`, 
      description: "Open Project",
      isLeaderKey: true 
    },
    NEW_PROJECT: { 
      key: `${KEYBOARD_CONFIG.LEADER_KEY}n`, 
      description: "New Empty Project",
      isLeaderKey: true 
    },
    RECENT_PROJECTS: { 
      key: `${KEYBOARD_CONFIG.LEADER_KEY}r`, 
      description: "Recent Projects",
      isLeaderKey: true 
    },
  },
  
  // Navigation - General navigation shortcuts
  NAVIGATION: {
    ESCAPE: { 
      key: "Escape", 
      description: "Cancel",
      isLeaderKey: false 
    },
    HELP: { 
      key: "?", 
      description: "Show keyboard shortcuts",
      isLeaderKey: false 
    },
    DELETE: { 
      key: "d", 
      description: "Delete",
      isLeaderKey: false 
    },
  },

  // Future categories can be added here:
  // EDITOR: { ... },
  // TERMINAL: { ... },
  // DEBUG: { ... },
} as const;

// Helper function to get all shortcuts by category
export function getShortcutsByCategory(category?: keyof typeof KEYBOARD_SHORTCUTS) {
  if (category) {
    return KEYBOARD_SHORTCUTS[category];
  }
  return KEYBOARD_SHORTCUTS;
}

// Helper function to get only leader key shortcuts for shortcut panel
export function getLeaderKeyShortcuts(): Array<{category: string, shortcuts: Array<{key: string, description: string}>}> {
  const result: Array<{category: string, shortcuts: Array<{key: string, description: string}>}> = [];
  
  Object.entries(KEYBOARD_SHORTCUTS).forEach(([categoryName, shortcuts]) => {
    const leaderShortcuts = Object.values(shortcuts)
      .filter(shortcut => shortcut.isLeaderKey)
      .map(shortcut => ({
        key: shortcut.key.replace(KEYBOARD_CONFIG.LEADER_KEY, KEYBOARD_CONFIG.LEADER_KEY_DISPLAY + '+'),
        description: shortcut.description
      }));
    
    if (leaderShortcuts.length > 0) {
      result.push({
        category: categoryName,
        shortcuts: leaderShortcuts
      });
    }
  });
  
  return result;
}

// Legacy compatibility - flat access (for existing code)
export const SHORTCUTS_FLAT = {
  OPEN_PROJECT: KEYBOARD_SHORTCUTS.UI.OPEN_PROJECT.key,
  NEW_PROJECT: KEYBOARD_SHORTCUTS.UI.NEW_PROJECT.key,
  RECENT_PROJECTS: KEYBOARD_SHORTCUTS.UI.RECENT_PROJECTS.key,
  ESCAPE: KEYBOARD_SHORTCUTS.NAVIGATION.ESCAPE.key,
  HELP: KEYBOARD_SHORTCUTS.NAVIGATION.HELP.key,
  DELETE: KEYBOARD_SHORTCUTS.NAVIGATION.DELETE.key,
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
  KEYBOARD_SHORTCUTS_HELP: "Press ? for keyboard shortcuts",
  KEYBOARD_SHORTCUTS_TITLE: "Keyboard Shortcuts",
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
  KEYBOARD_FOCUSED: "keyboard-focused",
  SHORTCUT: "shortcut",
  DIALOG_CONTAINER: "dialog-container",
  PROJECT_ITEM: "project-item",
  SELECTED: "selected",
  SHORTCUTS_PANEL: "shortcuts-panel",
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
  SHORTCUTS_PANEL_MAX_WIDTH: 320,
  SHORTCUTS_PANEL_MIN_WIDTH: 280,
  TITLEBAR_HEIGHT: 40,
  WINDOW_CONTROL_WIDTH: 46,
} as const;

// === API Endpoints (for future use) ===
export const API_ENDPOINTS = {
  // Will be populated when backend is added
} as const;

// === Error Messages ===
export const ERROR_MESSAGES = {
  PROJECT_OPEN_FAILED: "Error opening project",
  RECENT_PROJECTS_SAVE_FAILED: "Error saving recent projects",
  RECENT_PROJECTS_LOAD_FAILED: "Error loading recent projects",
  FOLDER_DIALOG_FAILED: "Error opening folder dialog",
} as const;

// Type helpers for better TypeScript support
export type KeyboardContexts =
  (typeof KEYBOARD_CONTEXTS)[keyof typeof KEYBOARD_CONTEXTS];
export type StorageKeys = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
export type KeyboardShortcuts =
  (typeof KEYBOARD_SHORTCUTS)[keyof typeof KEYBOARD_SHORTCUTS];
export type UIText = (typeof UI_TEXT)[keyof typeof UI_TEXT];
export type CSSClasses = (typeof CSS_CLASSES)[keyof typeof CSS_CLASSES];
export type KeyboardConfig =
  (typeof KEYBOARD_CONFIG)[keyof typeof KEYBOARD_CONFIG];
