<script lang="ts">
  import RecentProjectsDialog from "../RecentProjectsDialog.svelte";
  import BufferDeleteDialog from "./BufferDeleteDialog.svelte";
  import Telescope from "./Telescope.svelte";
  import ParserManager from "./ParserManager.svelte";
  import PreferencesDialog from "./PreferencesDialog.svelte";
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
    <div data-program-ui>
      <RecentProjectsDialog 
        isOpen={true} 
        onClose={handleClose}
        {...(currentDialog.props || {})}
      />
    </div>
  {:else if currentDialog.id === DIALOG_IDS.BUFFER_DELETE}
    <div data-program-ui>
      <BufferDeleteDialog />
    </div>
  {:else if currentDialog.id === DIALOG_IDS.TELESCOPE}
    <div data-program-ui>
      <Telescope {...(currentDialog.props || {})} />
    </div>
  {:else if currentDialog.id === DIALOG_IDS.GRAMMAR_HUB}
    <div data-program-ui>
      <ParserManager />
    </div>
  {:else if currentDialog.id === DIALOG_IDS.PREFERENCES}
    <div data-program-ui>
      <PreferencesDialog {...(currentDialog.props || {})} />
    </div>
  {/if}
{/if}
