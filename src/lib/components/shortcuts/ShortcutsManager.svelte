<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { keyboardManager } from "../../utils/keyboardManager";
  import ShortcutsModal from "./ShortcutsModal.svelte";
  
  let showShortcuts = false;
  let shortcuts: Array<{key: string, description: string}> = [];

  function showShortcutsPanel() {
    shortcuts = keyboardManager.getLeaderShortcuts();
    showShortcuts = true;
  }

  function hideShortcutsPanel() {
    showShortcuts = false;
  }

  onMount(() => {
    // Set global callbacks for shortcuts panel
    keyboardManager.setShortcutsCallbacks(showShortcutsPanel, hideShortcutsPanel);
  });

  onDestroy(() => {
    // Clean up callbacks
    keyboardManager.setShortcutsCallbacks(() => {}, () => {});
  });
</script>

<ShortcutsModal bind:visible={showShortcuts} {shortcuts} />