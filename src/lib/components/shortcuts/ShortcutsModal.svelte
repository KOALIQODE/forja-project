<script lang="ts">
  import { keyboardManager } from "../../utils/keyboardManager.js";
  
  export let visible = false;
  export let shortcuts: Array<{key: string, description: string}> = [];
  
  function formatShortcutKey(key: string): string {
    const formatted = key.replace('+', ' + ');
    const parts = formatted.split(' + ');
    if (parts.length > 1) {
      parts[parts.length - 1] = parts[parts.length - 1].toUpperCase();
      return parts.join(' + ');
    }
    return formatted.toUpperCase();
  }
  
  function handleQuit() {
    keyboardManager.hideShortcutsPanel();
  }
  
  // Listen for 'Escape' key to close
  function handleKeyDown(event: KeyboardEvent) {
    if (visible && event.key === 'Escape') {
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
      <span class="close-hint">Press <kbd>Esc</kbd> to close</span>
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
    bottom: var(--spacing-2xl);
    right: var(--spacing-2xl);
    background: var(--gradient-primary);
    border: 1px solid var(--border-secondary);
    border-radius: var(--radius-sm);
    padding: var(--spacing-xl);
    max-width: 320px;
    min-width: 280px;
    box-shadow: var(--shadow-sm);
    backdrop-filter: blur(10px);
    z-index: var(--z-overlay);
    color: var(--text-secondary);
    animation: slideIn var(--transition-normal);
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
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }

  .close-hint {
    font-size: var(--font-size-base);
    color: var(--text-disabled);
  }

  .close-hint kbd {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-muted);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-family: var(--font-family-mono);
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
    border-radius: 4px;
    font-size: 10px;
    font-weight: 500;
    font-family: "Cascadia Code", monospace;
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