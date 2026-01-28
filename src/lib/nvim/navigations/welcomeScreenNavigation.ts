/**
 * Welcome Screen Navigation Strategy
 */

import { NavigationBuilder } from './baseNavigation';
import type { NavigationStrategy } from './baseNavigation';
import { openRecentProjectsDialog } from '$lib/stores/dialogStore';
import { keyboardManager } from '$lib/utils/keyboardManager';
import { sendNvimCommand } from '$lib/stores/nvimStore';

export class WelcomeScreenNavigation implements NavigationStrategy {
  handleNavigation(onNavigateDown?: () => void, onNavigateUp?: () => void, onSelect?: () => void): () => void {
    return NavigationBuilder
      .create()
      .withVertical(true)      // Allow j/k
      .withHorizontal(false)   // No h/l
      .withEnter(true)         // Allow Enter
      .withEscape(false)       // No Escape needed
      .withCustomKeys({
        '?': async () => {
          console.log('? pressed - Showing shortcuts and sending to nvim');
          // Send to nvim first
          await sendNvimCommand('?', 'input');
          // Then show shortcuts panel
          keyboardManager.showShortcutsPanel();
        },
        ' r': () => {
          console.log('Space+R pressed - Opening Recent Projects');
          // Pass current context to preserve it
          const currentContext = keyboardManager.getActiveContext();
          openRecentProjectsDialog(currentContext || undefined);
        },
        ' o': () => {
          console.log('Space+O pressed - Open Project');
          // TODO: Dispatch custom event for open project
          document.dispatchEvent(new CustomEvent('nvim:openProject'));
        },
        ' n': () => {
          console.log('Space+N pressed - New Project');
          // TODO: Dispatch custom event for new project
          document.dispatchEvent(new CustomEvent('nvim:newProject'));
        }
      })
      .withCallbacks({
        onNavigateDown,
        onNavigateUp,
        onSelect
      })
      .build();
  }
}