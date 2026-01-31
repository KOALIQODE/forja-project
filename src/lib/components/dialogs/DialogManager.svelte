<script lang="ts">
  import RecentProjectsDialog from "../RecentProjectsDialog.svelte";
  import { dialogState, dialogActions } from "../../stores/dialogStore.js";
  import { keyboardManager } from "../../utils/keyboardManager.js";
  import { 
    ANIMATION_DURATIONS, 
    DIALOG_STATE_KEYS,
    SHORTCUTS_FLAT,
    UI_TEXT
  } from "../../utils/constants.js";
  // import { onMount } from "svelte";

  // Dialog state reactivity - properly typed
  let dialogStates: Record<string, boolean> = {};
  
  // onMount(() => {
  //   // Register global dialog actions dynamically
  //   // const globalDialogActions = [
  //   //   {
  //   //     key: SHORTCUTS_FLAT.RECENT_PROJECTS,
  //   //     handler: () => dialogActions.open(DIALOG_STATE_KEYS.RECENT_PROJECTS_OPEN),
  //   //     description: UI_TEXT.RECENT_PROJECTS,
  //   //   },
  //   // ];

  //   // keyboardManager.addGlobalActions(globalDialogActions);
  // });

  // Subscribe to dialog state changes
  dialogState.subscribe(state => {
    const previousDialogStates = { ...dialogStates };
    dialogStates = { ...state };
    
    // Check if any dialog was closed and restore context
    Object.keys(previousDialogStates).forEach((dialogKey: string) => {
      if (previousDialogStates[dialogKey] && !state[dialogKey as keyof typeof state]) {
        setTimeout(() => {
          keyboardManager.restorePreviousContext();
        }, ANIMATION_DURATIONS.CONTEXT_RESTORE_DELAY);
      }
    });
  });

  // Generic close handler
  function closeDialog(dialogKey: string) {
    dialogActions.close(dialogKey as any);
  }
</script>

<!-- Recent Projects Dialog -->
{#if dialogStates[DIALOG_STATE_KEYS.RECENT_PROJECTS_OPEN]}
  <RecentProjectsDialog 
    isOpen={dialogStates[DIALOG_STATE_KEYS.RECENT_PROJECTS_OPEN]} 
    onClose={() => closeDialog(DIALOG_STATE_KEYS.RECENT_PROJECTS_OPEN)} 
  />
{/if}
