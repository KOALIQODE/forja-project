<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';

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
  transition:fade={{ duration: 100 }}
  class="fixed z-[999] min-w-[160px] overflow-hidden rounded-lg border border-zinc-800 bg-[#121212]/95 p-1 shadow-2xl backdrop-blur-md"
  style="left: {x}px; top: {y}px;"
>
  {#each options as option}
    {#if option.separator}
      <div class="my-1 h-[1px] bg-zinc-800/60"></div>
    {:else}
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors
               {option.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-zinc-300 hover:bg-white/5 hover:text-zinc-100'}"
        onclick={() => {
          option.onClick();
          close();
        }}
      >
        {#if option.icon}
          <span class="flex w-4 items-center justify-center opacity-70">
            <option.icon size="14" />
          </span>
        {/if}
        <span class="flex-1">{option.label}</span>
      </button>
    {/if}
  {/each}
</div>
