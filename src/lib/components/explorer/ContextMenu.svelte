<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { theme } from "$lib/stores/uiThemeStore";

  interface Option {
    label: string;
    icon?: any;
    onClick: () => void;
    danger?: boolean;
    separator?: boolean;
  }

  let { x, y, options, close }: { x: number, y: number, options: Option[], close: () => void } = $props();

  let menuElement: HTMLElement;

  onMount(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuElement && !menuElement.contains(e.target as Node)) {
        close();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);

    // Ajustar posición si se sale de la pantalla
    const rect = menuElement.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) {
      x = window.innerWidth - rect.width - 10;
    }
    if (y + rect.height > window.innerHeight) {
      y = window.innerHeight - rect.height - 10;
    }

    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

<div
  bind:this={menuElement}
  use:theme
  transition:fade={{ duration: 100 }}
  class="font-semibold fixed z-999 min-w-50 overflow-hidden border border-(--color-border) bg-(--color-surface-base) shadow-2xl"
  style="left: {x}px; top: {y}px;"
>
  {#each options as option}
    {#if option.separator}
      <div class="my-1 h-px bg-(--color-sep)"></div>
    {:else}
      <button
        type="button"
        class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors text-(--color-text-primary) hover:bg-(--color-hover-bg-subtle) hover:text-(--color-text-primary)"
        onclick={() => {
          option.onClick();
          close();
        }}
      >
        <!-- {#if option.icon}
          <span class="flex w-4 items-center justify-center opacity-70">
            <option.icon size="14" />
          </span>
        {/if} -->
        <h6 class="flex-1">{option.label}</h6>
      </button>
    {/if}
  {/each}
</div>
