<script lang="ts">
  import {
    dialogState,
    closeDialog,
    DIALOG_REGISTRY,
  } from "../../stores/dialogStore";

  function handleClose() {
    closeDialog();
  }
</script>

{#if $dialogState.activeDialog}
  {#await DIALOG_REGISTRY[$dialogState.activeDialog.id]() then module}
    {@const ActiveDialog = module.default}
    <div>
      <ActiveDialog
        isOpen={true}
        onClose={handleClose}
        {...$dialogState.activeDialog.props || {}}
      />
    </div>
  {:catch error}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div class="bg-red-900/20 p-6 rounded-lg border border-red-500/50 text-red-200">
        <h3 class="text-lg font-bold mb-2">Error loading dialog</h3>
        <p>{error}</p>
        <button 
          class="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded border border-red-500/50 transition-colors"
          onclick={handleClose}
        >
          Close
        </button>
      </div>
    </div>
  {/await}
{/if}
