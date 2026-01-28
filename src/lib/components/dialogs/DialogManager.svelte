<script lang="ts">
  import RecentProjectsDialog from "../RecentProjectsDialog.svelte";
  import { dialogState, closeDialog } from "../../stores/dialogStore";
  import { keyboardManager } from "../../utils/keyboardManager";
  import { DIALOG_IDS } from "../../nvim/contentIds";

  let currentDialog: any = null;
  let previousContext: string | null = null;

  // Subscribe to dialog state
  dialogState.subscribe(state => {
    if (state.activeDialog) {
      currentDialog = state.activeDialog;
      previousContext = state.activeDialog.previousContext || null;
    } else {
      // When dialog closes, restore previous context
      if (previousContext) {
        setTimeout(() => {
          keyboardManager.setActiveContext(previousContext!);
        }, 10);
      }
      currentDialog = null;
      previousContext = null;
    }
  });

  function handleClose() {
    closeDialog();
  }
</script>

{#if currentDialog}
  {#if currentDialog.id === DIALOG_IDS.RECENT_PROJECTS}
    <RecentProjectsDialog 
      isOpen={true} 
      onClose={handleClose}
      {...(currentDialog.props || {})}
    />
  {/if}
{/if}