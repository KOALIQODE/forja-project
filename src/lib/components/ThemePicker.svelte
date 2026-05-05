<script lang="ts">
  import { onMount } from 'svelte';
  import { Palette, Moon, Sun, Check } from '@lucide/svelte';
  import { allUIThemes, activeUIThemeId, activeUITheme, setUITheme } from '$lib/stores/uiThemeStore';
  import { activateThemeByName } from '$lib/stores/pluginStore';

  let { onClose }: { onClose: () => void } = $props();

  let themes = $derived($allUIThemes);

  // Use Svelte 5 store auto-subscription — no manual unsubscribe needed
  let activeId = $derived($activeUIThemeId);
  let selectedIndex = $state(0);
  $effect(() => {
    selectedIndex = Math.max(0, $allUIThemes.findIndex((t) => t.id === $activeUIThemeId));
  });

  // Scope picker CSS vars to this component only
  let themeStyle = $derived(
    Object.entries($activeUITheme.vars).map(([k, v]) => `${k}:${v}`).join(';')
  );

  function selectTheme(id: string) {
    setUITheme(id);
    // Sync the editor canvas theme with the UI theme (same name/id).
    // Fire-and-forget — canvas updates reactively when activeTheme store changes.
    void activateThemeByName(id);
    onClose();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % themes.length;
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + themes.length) % themes.length;
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      selectTheme(themes[selectedIndex].id);
      return;
    }
  }

  let pickerEl: HTMLElement;

  onMount(() => {
    pickerEl?.focus();
  });
</script>

<!-- Backdrop -->
<div
  class="overlay"
  onclick={() => onClose()}
  onkeydown={handleKeyDown}
  role="presentation"
>
  <!-- Picker card — theme vars scoped here, no :root pollution -->
  <div
    class="card"
    style={themeStyle}
    onclick={(e) => e.stopPropagation()}
    onkeydown={handleKeyDown}
    bind:this={pickerEl}
    tabindex="-1"
    role="listbox"
    aria-label="Select theme"
  >
    <!-- Header -->
    <header class="header">
      <Palette size="13" class="header-icon" />
      <span class="header-title">Select Theme</span>
      <kbd class="header-kbd">Ctrl K → T</kbd>
    </header>

    <!-- Theme list -->
    <ul class="list" role="presentation">
      {#each themes as theme, i}
        <li role="presentation">
          <button
            type="button"
            class="item"
            class:item--active={theme.id === activeId}
            class:item--focused={i === selectedIndex}
            onclick={() => selectTheme(theme.id)}
            onmouseenter={() => { selectedIndex = i; }}
            role="option"
            aria-selected={theme.id === activeId}
          >
            <!-- Color swatch -->
            <span
              class="swatch"
              style:background={theme.preview.bg}
              style:border-color={theme.preview.accent}
            >
              <span class="swatch-dot" style:background={theme.preview.accent}></span>
            </span>

            <!-- Theme name -->
            <span class="item-name">{theme.name}</span>

            <!-- Kind badge -->
            <span class="item-badge">
              {#if theme.kind === 'dark'}
                <Moon size="10" />
              {:else}
                <Sun size="10" />
              {/if}
              {theme.kind}
            </span>

            <!-- Active checkmark -->
            {#if theme.id === activeId}
              <Check size="12" class="item-check" />
            {/if}
          </button>
        </li>
      {/each}
    </ul>

    <!-- Footer hints -->
    <footer class="footer">
      <span>↑↓ navigate</span>
      <span>↵ select</span>
      <span>esc close</span>
    </footer>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 3000;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 48px;
  }

  .card {
    background: var(--forja-ui-picker-bg, rgba(14, 14, 17, 0.97));
    border: 1px solid var(--forja-ui-picker-border, #2a2a2e);
    border-radius: 10px;
    width: 380px;
    outline: none;
    box-shadow:
      0 20px 60px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(20px);
    overflow: hidden;
    animation: picker-in 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes picker-in {
    from { opacity: 0; transform: translateY(-8px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)    scale(1);    }
  }

  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px 10px;
    border-bottom: 1px solid var(--forja-ui-picker-border, #2a2a2e);
  }

  :global(.header-icon) {
    color: var(--forja-ui-picker-active-text, #34d399);
    flex-shrink: 0;
  }

  .header-title {
    flex: 1;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--forja-ui-picker-text, #a1a1aa);
  }

  .header-kbd {
    font-size: 9px;
    font-family: monospace;
    color: var(--forja-ui-picker-text, #a1a1aa);
    opacity: 0.5;
    background: rgba(255, 255, 255, 0.06);
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px 10px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s ease, border-color 0.1s ease;
    color: var(--forja-ui-picker-text, #a1a1aa);
  }

  .item:hover,
  .item--focused {
    background: var(--forja-ui-picker-item-hover, rgba(255, 255, 255, 0.05));
  }

  .item--active {
    background: var(--forja-ui-picker-active, rgba(52, 211, 153, 0.12));
    border-color: color-mix(in srgb, var(--forja-ui-picker-active-text, #34d399) 30%, transparent);
  }

  .swatch {
    width: 28px;
    height: 20px;
    border-radius: 5px;
    border: 2px solid;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .swatch-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .item-name {
    flex: 1;
    font-size: 12px;
    font-weight: 500;
    color: var(--forja-ui-picker-text, #a1a1aa);
    transition: color 0.1s ease;
  }

  .item--active .item-name,
  .item--focused .item-name {
    color: var(--forja-ui-text-primary, #f4f4f5);
  }

  .item-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 9px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--forja-ui-picker-text, #a1a1aa);
    opacity: 0.55;
  }

  :global(.item-check) {
    color: var(--forja-ui-picker-active-text, #34d399);
    flex-shrink: 0;
  }

  .footer {
    display: flex;
    gap: 16px;
    padding: 8px 14px;
    border-top: 1px solid var(--forja-ui-picker-border, #2a2a2e);
    font-size: 9px;
    color: var(--forja-ui-picker-text, #a1a1aa);
    opacity: 0.5;
  }
</style>
