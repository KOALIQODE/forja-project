<script lang="ts">
  import RecentProjectsDialog from "../RecentProjectsDialog.svelte";
  import BufferDeleteDialog from "./BufferDeleteDialog.svelte";
  import Telescope from "./Telescope.svelte";
  import ParserManager from "./ParserManager.svelte";
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
  {:else if currentDialog.id === DIALOG_IDS.BUFFER_DELETE}
    <BufferDeleteDialog />
  {:else if currentDialog.id === DIALOG_IDS.TELESCOPE}
    <Telescope {...(currentDialog.props || {})} />
  {:else if currentDialog.id === DIALOG_IDS.GRAMMAR_HUB}
    <ParserManager />
  {/if}
{/if}