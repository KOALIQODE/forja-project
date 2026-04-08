<script lang="ts">
  import { keyboardManager, formatShortcutKey } from "../../utils/keyboardManager";
  import { UI_TEXT, SHORTCUTS_FLAT } from "../../utils/constants.js";
  
  let { visible = false, shortcuts = [] }: { 
    visible: boolean, 
    shortcuts: Array<{key: string, description: string}> 
  } = $props();
  
  function handleQuit() {
    keyboardManager.hideShortcutsPanel();
  }
  
  function handleShow() {
    keyboardManager.showShortcutsPanel();
  }

  // Listen for 'q' key to close
  function handleKeyDown(event: KeyboardEvent) {
    if (visible && event.key.toLowerCase() === 'q') {
      event.preventDefault();
      event.stopPropagation();
      handleQuit();
      return;
    }
    
    if (!visible && event.key === SHORTCUTS_FLAT.HELP) {
      event.preventDefault();
      event.stopPropagation();
      handleShow();
      return;
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if visible}
  <div class="shortcuts-panel">
    <div class="panel-header">
      <h3>{UI_TEXT.KEYBOARD_SHORTCUTS_TITLE}</h3>
      <span class="close-hint">Press <kbd>?</kbd> {UI_TEXT.CLOSE_HINT}</span>
    </div>
    <div class="shortcuts-list">
      {#each shortcuts as shortcut}
        <div class="shortcut-item">
          <span class="shortcut-description">{shortcut.description}</span>
          <kbd class="shortcut-key">{formatShortcutKey(shortcut.key)}</kbd>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .shortcuts-panel {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: rgba(15, 15, 15, 0.9);
    border: 1px solid #333;
    border-radius: 8px;
    padding: 16px;
    max-width: 320px;
    min-width: 280px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    backdrop-filter: blur(10px);
    z-index: 1000;
    color: #ccc;
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(20px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #333;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #eee;
  }

  .close-hint {
    font-size: 11px;
    color: #666;
  }

  .close-hint kbd {
    background: rgba(255, 255, 255, 0.1);
    color: #888;
    padding: 2px 4px;
    border-radius: 4px;
    font-size: 10px;
    font-family: monospace;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .shortcuts-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .shortcut-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
  }

  .shortcut-key {
    background: rgba(255, 255, 255, 0.05);
    color: #4ade80;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    font-family: monospace;
    border: 1px solid rgba(74, 222, 128, 0.2);
    min-width: auto;
  }

  .shortcut-description {
    color: #888;
    font-size: 12px;
    font-weight: 400;
    margin-right: 16px;
    flex: 1;
  }
</style>