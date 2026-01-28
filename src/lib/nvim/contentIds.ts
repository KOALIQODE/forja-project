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

// Buffer Type IDs - Only active buffers
export const BUFFER_IDS = {
  DEFAULT: 'default',
  WELCOME_SCREEN: 'welcome_screen'
} as const;

// Dialog IDs
export const DIALOG_IDS = {
  RECENT_PROJECTS: 'recent_projects'
} as const;

// Welcome Screen Content IDs
export const WELCOME_CONTENT = {
  OPEN_PROJECT: 'nav_open_project',
  NEW_PROJECT: 'nav_new_project', 
  RECENT_PROJECTS: 'nav_recent_projects'
} as const;

// Content Display Mapping - Only for active content
export const CONTENT_DISPLAY_MAP: Record<string, string> = {
  // Welcome Screen
  [WELCOME_CONTENT.OPEN_PROJECT]: 'Open Project',
  [WELCOME_CONTENT.NEW_PROJECT]: 'New Empty Project', 
  [WELCOME_CONTENT.RECENT_PROJECTS]: 'Recent Projects'
} as const;

// Type for nvim modes (for type safety)
export type NvimMode = typeof NVIM_MODES[keyof typeof NVIM_MODES];

// Type for buffer IDs (for type safety)
export type BufferId = typeof BUFFER_IDS[keyof typeof BUFFER_IDS];

// Type for dialog IDs (for type safety)
export type DialogId = typeof DIALOG_IDS[keyof typeof DIALOG_IDS];

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