/**
 * Navigation Factory - Creates navigation strategies for different buffer types
 * 
 * This factory creates predefined navigation strategies for each buffer type.
 * For custom navigation, use NavigationBuilder directly from navigations/baseNavigation.ts
 * 
 * ## Usage Examples:
 * 
 * ### Using Factory (recommended for standard behavior):
 * ```typescript
 * import { NavigationFactory } from '$lib/nvim/navigationStrategies';
 * import { BUFFER_IDS } from '$lib/nvim/contentIds';
 * 
 * function setupNavigation() {
 *   const navigation = NavigationFactory.createNavigation(BUFFER_IDS.WELCOME_SCREEN);
 *   const cleanup = navigation.handleNavigation(
 *     () => {}, // onNavigateDown
 *     () => {}, // onNavigateUp  
 *     selectCurrent // onSelect
 *   );
 *   return cleanup;
 * }
 * ```
 * 
 * ### Using NavigationBuilder directly (for custom behavior):
 * ```typescript
 * import { NavigationBuilder } from '$lib/nvim/navigations';
 * 
 * function setupCustomNavigation() {
 *   const cleanup = NavigationBuilder
 *     .create()
 *     .withVertical(true)
 *     .withCustomKeys({
 *       ' r': () => openRecentProjectsDialog(),
 *       '?': () => showHelp()
 *     })
 *     .withCallbacks({ onSelect: selectCurrent })
 *     .build();
 *   return cleanup;
 * }
 * ```
 */

import { BUFFER_IDS } from './contentIds';
import { WelcomeScreenNavigation } from './navigations/welcomeScreenNavigation';
import type { NavigationStrategy } from './navigations/baseNavigation';

// Re-export NavigationBuilder for convenience
export { NavigationBuilder } from './navigations/baseNavigation';

/**
 * Navigation Factory - Creates navigation strategies for client-side
 */
export class NavigationFactory {
  static createNavigation(bufferType: string): NavigationStrategy {
    switch (bufferType) {
      case BUFFER_IDS.WELCOME_SCREEN:
        return new WelcomeScreenNavigation();
      default:
        return new WelcomeScreenNavigation(); // default fallback
    }
  }

  /**
   * Create custom navigation with builder
   */
  static createCustomNavigation() {
    // Import dynamically to avoid circular dependencies
    const { NavigationBuilder } = require('./navigations/baseNavigation');
    return NavigationBuilder.create();
  }
}