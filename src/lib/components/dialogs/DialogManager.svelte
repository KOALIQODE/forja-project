<script>
  import RecentProjectsDialog from "../RecentProjectsDialog.svelte";
  import { dialogState, closeRecentProjectsDialog } from "../../stores/dialogStore.js";
  import { keyboardManager } from "../../utils/keyboardManager.js";
  import { KEYBOARD_CONTEXTS, ANIMATION_DURATIONS, DIALOG_STATE_KEYS } from "../../utils/constants.js";

  let showRecentProjects = false;

  // Subscribe to dialog state
  dialogState.subscribe(state => {
    showRecentProjects = state[DIALOG_STATE_KEYS.RECENT_PROJECTS_OPEN];
    
    // When dialog closes, restore welcome screen context
    if (!state[DIALOG_STATE_KEYS.RECENT_PROJECTS_OPEN]) {
      setTimeout(() => {
        keyboardManager.setActiveContext(KEYBOARD_CONTEXTS.WELCOME_SCREEN);
      }, ANIMATION_DURATIONS.CONTEXT_RESTORE_DELAY);
    }
  });

  function closeRecentProjects() {
    closeRecentProjectsDialog();
  }
</script>

<RecentProjectsDialog 
  isOpen={showRecentProjects} 
  onClose={closeRecentProjects} 
/>

<RecentProjectsDialog 
  isOpen={showRecentProjects} 
  onClose={closeRecentProjects} 
/>