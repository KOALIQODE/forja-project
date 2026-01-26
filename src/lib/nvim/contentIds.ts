/**
 * Content ID Constants - Centralized IDs for nvim buffer content
 * This prevents magic strings and ensures consistency across components
 */

// Nvim Mode Constants
export const NVIM_MODES = {
  NORMAL: 'normal',
  INSERT: 'insert', 
  VISUAL: 'visual'
} as const;

// Buffer Type IDs
export const BUFFER_IDS = {
  DEFAULT: 'default',
  WELCOME_SCREEN: 'welcome_screen',
  FILE_EXPLORER: 'file_explorer',
  COMMAND_PALETTE: 'command_palette',
  SETTINGS_PANEL: 'settings_panel'
} as const;

// Welcome Screen Content IDs
export const WELCOME_CONTENT = {
  OPEN_PROJECT: 'nav_open_project',
  NEW_PROJECT: 'nav_new_project', 
  RECENT_PROJECTS: 'nav_recent_projects'
} as const;

// File Explorer Content IDs
export const FILE_EXPLORER_CONTENT = {
  NO_FILES_FOUND: 'no_files_found'
} as const;

// Command Palette Content IDs (for future use)
export const COMMAND_PALETTE_CONTENT = {
  SEARCH_FILES: 'cmd_search_files',
  OPEN_SETTINGS: 'cmd_open_settings',
  TOGGLE_TERMINAL: 'cmd_toggle_terminal'
} as const;

// Settings Panel Content IDs (for future use)
export const SETTINGS_CONTENT = {
  GENERAL: 'settings_general',
  APPEARANCE: 'settings_appearance',
  SHORTCUTS: 'settings_shortcuts',
  EXTENSIONS: 'settings_extensions'
} as const;

// Content Display Mapping - Central mapping of IDs to display text
export const CONTENT_DISPLAY_MAP: Record<string, string> = {
  // Welcome Screen
  [WELCOME_CONTENT.OPEN_PROJECT]: 'Open Project',
  [WELCOME_CONTENT.NEW_PROJECT]: 'New Empty Project', 
  [WELCOME_CONTENT.RECENT_PROJECTS]: 'Recent Projects',
  
  // File Explorer
  [FILE_EXPLORER_CONTENT.NO_FILES_FOUND]: 'No files found',
  
  // Command Palette
  [COMMAND_PALETTE_CONTENT.SEARCH_FILES]: 'Search Files...',
  [COMMAND_PALETTE_CONTENT.OPEN_SETTINGS]: 'Open Settings',
  [COMMAND_PALETTE_CONTENT.TOGGLE_TERMINAL]: 'Toggle Terminal',
  
  // Settings Panel
  [SETTINGS_CONTENT.GENERAL]: 'General',
  [SETTINGS_CONTENT.APPEARANCE]: 'Appearance',
  [SETTINGS_CONTENT.SHORTCUTS]: 'Keyboard Shortcuts', 
  [SETTINGS_CONTENT.EXTENSIONS]: 'Extensions'
} as const;

// Type for nvim modes (for type safety)
export type NvimMode = typeof NVIM_MODES[keyof typeof NVIM_MODES];

// Type for buffer IDs (for type safety)
export type BufferId = typeof BUFFER_IDS[keyof typeof BUFFER_IDS];

// Type for content IDs (for type safety)
export type ContentId = keyof typeof CONTENT_DISPLAY_MAP;

// Helper function to get display text for a content ID
export function getDisplayText(contentId: string): string {
  return CONTENT_DISPLAY_MAP[contentId] || contentId;
}

// Helper function to validate content ID exists
export function isValidContentId(contentId: string): contentId is ContentId {
  return contentId in CONTENT_DISPLAY_MAP;
}

// Helper function to validate buffer ID exists
export function isValidBufferId(bufferId: string): bufferId is BufferId {
  return Object.values(BUFFER_IDS).includes(bufferId as BufferId);
}

// Helper function to validate nvim mode exists
export function isValidNvimMode(mode: string): mode is NvimMode {
  return Object.values(NVIM_MODES).includes(mode as NvimMode);
}