<script lang="ts">
  import { onMount } from 'svelte';
  import { Palette, Moon, Sun, Check } from '@lucide/svelte';
  import { allUIThemes, activeUIThemeId, activeUITheme, setUITheme } from '$lib/stores/uiThemeStore';
  import { activateThemeByName } from '$lib/stores/pluginStore';

  let { onClose }: { onClose: () => void } = $props();

  let themes = $derived($allUIThemes);

  let activeId = $derived($activeUIThemeId);
  let selectedIndex = $state(0);
  $effect(() => {
    selectedIndex = Math.max(0, $allUIThemes.findIndex((t) => t.id === $activeUIThemeId));
  });

  let themeStyle = $derived(
    Object.entries($activeUITheme.vars).map(([k, v]) => `${k}:${v}`).join(';')
  );

  function selectTheme(id: string) {
    setUITheme(id);
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
  class="fixed inset-0 z-[3000] flex justify-center items-start pt-12"
  onclick={() => onClose()}
  onkeydown={handleKeyDown}
  role="presentation"
>
  <!-- Picker card -->
  <div
    style={themeStyle}
    onclick={(e) => e.stopPropagation()}
    onkeydown={handleKeyDown}
    bind:this={pickerEl}
    tabindex="-1"
    role="listbox"
    aria-label="Select theme"
    class="w-[380px] outline-none overflow-hidden
           bg-(--forja-ui-picker-bg,rgba(14,14,17,0.97))
           border border-(--forja-ui-picker-border,#2a2a2e)
           shadow-[0_20px_60px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04)]
           animate-[picker-in_0.15s_cubic-bezier(0.16,1,0.3,1)]"
  >
    <!-- Header -->
    <header class="flex items-center gap-2 px-3.5 pt-3 pb-2.5
                   border-b border-(--forja-ui-picker-border,#2a2a2e)">
      <Palette size="13" class="shrink-0 text-(--forja-ui-picker-active-text,#34d399)" />
      <span class="flex-1 text-[10px] font-semibold tracking-[0.08em] uppercase
                   text-(--forja-ui-picker-text,#a1a1aa)">
        Select Theme
      </span>
      <kbd class="text-[9px] font-mono px-1.5 py-0.5 opacity-50
                  bg-white/6 border border-white/10
                  text-(--forja-ui-picker-text,#a1a1aa)">
        Ctrl K → T
      </kbd>
    </header>

    <!-- Theme list -->
    <ul class="list-none m-0 p-1.5 flex flex-col gap-0.5" role="presentation">
      {#each themes as theme, i}
        {@const isActive = theme.id === activeId}
        {@const isFocused = i === selectedIndex}
        <li role="presentation">
          <button
            type="button"
            onclick={() => selectTheme(theme.id)}
            onmouseenter={() => { selectedIndex = i; }}
            role="option"
            aria-selected={isActive}
            style={isActive ? `border-color: color-mix(in srgb, var(--forja-ui-picker-active-text, #34d399) 30%, transparent)` : ''}
            class="flex items-center gap-2.5 w-full px-2.5 py-[9px] cursor-pointer text-left
                   border border-transparent transition-[background,border-color] duration-100
                   text-(--forja-ui-picker-text,#a1a1aa)
                   {isFocused || isActive ? 'bg-(--forja-ui-picker-item-hover,rgba(255,255,255,0.05))' : 'bg-transparent'}
                   {isActive ? 'bg-(--forja-ui-picker-active,rgba(52,211,153,0.12))' : ''}"
          >
            <!-- Color swatch -->
            <span
              class="w-7 h-5 border-2 shrink-0 flex items-center justify-center"
              style:background={theme.preview.bg}
              style:border-color={theme.preview.accent}
            >
              <span class="w-1.5 h-1.5" style:background={theme.preview.accent}></span>
            </span>

            <!-- Theme name -->
            <span class="flex-1 text-xs font-medium transition-colors
                         {isActive || isFocused
                           ? 'text-(--forja-ui-text-primary,#f4f4f5)'
                           : 'text-(--forja-ui-picker-text,#a1a1aa)'}">
              {theme.name}
            </span>

            <!-- Kind badge -->
            <span class="flex items-center gap-1 text-[9px] tracking-[0.06em] uppercase opacity-55
                         text-(--forja-ui-picker-text,#a1a1aa)">
              {#if theme.kind === 'dark'}
                <Moon size="10" />
              {:else}
                <Sun size="10" />
              {/if}
              {theme.kind}
            </span>

            <!-- Active checkmark -->
            {#if isActive}
              <Check size="12" class="shrink-0 text-(--forja-ui-picker-active-text,#34d399)" />
            {/if}
          </button>
        </li>
      {/each}
    </ul>

    <!-- Footer hints -->
    <footer class="flex gap-4 px-3.5 py-2 border-t opacity-50
                   border-(--forja-ui-picker-border,#2a2a2e)
                   text-[9px] text-(--forja-ui-picker-text,#a1a1aa)">
      <span>↑↓ navigate</span>
      <span>↵ select</span>
      <span>esc close</span>
    </footer>
  </div>
</div>

<style>
  @keyframes picker-in {
    from { opacity: 0; transform: translateY(-8px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)    scale(1);    }
  }
</style>
