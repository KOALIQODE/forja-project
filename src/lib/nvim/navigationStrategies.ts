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
import { NavigationBuilder, type NavigationStrategy } from './navigations/baseNavigation';

/**
 * Navigation Factory - Creates navigation strategies for client-side
 */
export class NavigationFactory {
  static createNavigation(bufferType: string): NavigationStrategy {
    // Si es la pantalla de bienvenida
    if (bufferType === BUFFER_IDS.WELCOME_SCREEN) {
      return new WelcomeScreenNavigation();
    }

    // Por defecto para archivos reales (o cualquier otro ID que parezca una ruta)
    return {
      handleNavigation: (onDown, onUp, onSelect) => {
        return NavigationBuilder.create()
          .withVertical(true)
          .withHorizontal(true)
          .withEnter(true)
          .withEscape(true)
          .withCallbacks({
            onNavigateDown: onDown,
            onNavigateUp: onUp,
            onSelect: onSelect
          })
          .build();
      }
    };
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