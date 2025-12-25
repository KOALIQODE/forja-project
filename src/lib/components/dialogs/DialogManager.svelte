<script>
  import RecentProjectsDialog from "../RecentProjectsDialog.svelte";
  import { dialogState, closeRecentProjectsDialog } from "../../stores/dialogStore.js";
  import { keyboardManager } from "../../utils/keyboardManager.js";

  let showRecentProjects = false;

  // Subscribe to dialog state
  dialogState.subscribe(state => {
    showRecentProjects = state.recentProjectsOpen;
    
    // When dialog closes, restore welcome screen context
    if (!state.recentProjectsOpen) {
      setTimeout(() => {
        keyboardManager.setActiveContext("welcome-screen");
      }, 10);
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