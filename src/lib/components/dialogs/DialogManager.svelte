<script lang="ts">
  import RecentProjectsDialog from "../RecentProjectsDialog.svelte";
  import { dialogState, closeDialog, DIALOG_IDS } from "../../stores/dialogStore";

  let currentDialog: any = null;

  // Subscribe to dialog state
  dialogState.subscribe(state => {
    if (state.activeDialog) {
      currentDialog = state.activeDialog;
    } else {
      currentDialog = null;
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