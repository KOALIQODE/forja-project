<script lang="ts">
  import { keyboardManager } from "../../utils/keyboardManager";
  
  export let visible = false;
  export let shortcuts: Array<{key: string, description: string}> = [];
  
  function handleQuit() {
    keyboardManager.hideShortcutsPanel();
  }
  
  // Listen for 'q' key to close
  function handleKeyDown(event: KeyboardEvent) {
    if (visible && event.key.toLowerCase() === 'q') {
      event.preventDefault();
      event.stopPropagation();
      handleQuit();
    }
  }
</script>

<svelte:window on:keydown={handleKeyDown} />

{#if visible}
  <div class="shortcuts-panel">
    <div class="panel-header">
      <h3>Keyboard Shortcuts</h3>
      <span class="close-hint">Press <kbd>Q</kbd> to close</span>
    </div>
    <div class="shortcuts-list">
      {#each shortcuts as shortcut}
        <div class="shortcut-item">
          <span class="shortcut-description">{shortcut.description}</span>
          <kbd class="shortcut-key">{shortcut.key}</kbd>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .shortcuts-panel {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    border: 1px solid #404040;
    border-radius: 12px;
    padding: 16px;
    max-width: 320px;
    min-width: 280px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(10px);
    z-index: 1000;
    color: #e0e0e0;
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
    border-bottom: 1px solid #333333;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #ffffff;
  }

  .close-hint {
    font-size: 11px;
    color: #888888;
  }

  .close-hint kbd {
    background: rgba(255, 255, 255, 0.1);
    color: #cccccc;
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 10px;
    font-family: 'Courier New', monospace;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .shortcuts-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .shortcut-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
  }

  .shortcut-key {
    background: rgba(74, 222, 128, 0.15);
    color: #4ade80;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 500;
    font-family: 'Courier New', monospace;
    border: 1px solid rgba(74, 222, 128, 0.3);
    min-width: auto;
  }

  .shortcut-description {
    color: #cccccc;
    font-size: 12px;
    font-weight: 400;
    margin-right: 12px;
    flex: 1;
  }
</style>