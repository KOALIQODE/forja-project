<script lang="ts">
  import { onMount } from "svelte";
  import { Moon, Sun, Search, X } from "@lucide/svelte";
  import {
    allUIThemes,
    activeUIThemeId,
    setUITheme,
    previewUIThemeId,
  } from "$lib/stores/uiThemeStore";
  import { activateThemeByName } from "$lib/stores/pluginStore";
  import { closeDialog } from "$lib/stores/dialogStore";
  import { theme } from "$lib/stores/uiThemeStore";

  let { onClose = closeDialog }: { onClose?: () => void } = $props();
  let activeId = $derived($activeUIThemeId);
  let selectedIndex = $state(0);
  let pickerEl: HTMLElement;

  function focus(el: HTMLInputElement) {
    el.focus();
  }

  let searchQuery = $state("");
  let themes = $derived(
    $allUIThemes.filter((t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  );

  function selectTheme(id: string) {
    setUITheme(id);
    void activateThemeByName(id);
    onClose();
  }

  $effect(() => {
    // Reset selected index when searching
    if (searchQuery) {
      selectedIndex = 0;
    } else {
      selectedIndex = Math.max(
        0,
        $allUIThemes.findIndex((t) => t.id === $activeUIThemeId),
      );
    }
  });

  onMount(() => {
    pickerEl?.focus();
    return () => {
      previewUIThemeId.set(null);
    };
  });
</script>

<!-- Backdrop -->
<div
  class="fixed inset-0 z-3000 flex justify-center items-start pt-12"
  onclick={() => onClose()}
  role="presentation"
>
  <!-- Picker card -->
  <div
    use:theme
    bind:this={pickerEl}
    tabindex="-1"
    role="listbox"
    aria-label="Select theme"
    class="w-100 outline-none overflow-hidden
           bg-(--color-surface-base)
           font-semibold
           border border-(--color-border)
           animate-[picker-in_0.15s_cubic-bezier(0.16,1,0.3,1)]"
  >
    <!-- Header -->
    <header
      class="flex items-center gap-3 px-4 py-2.5 border-b border-(--color-border)"
    >
      <div
        class="relative flex flex-1 items-center px-1"
        role="button"
        tabindex="0"
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
          }
        }}
      >
        <Search
          strokeWidth={2.5}
          size="1.2em"
          class="absolute left-1 text-(--color-text-secondary)"
        />
        <input
          type="text"
          use:focus
          bind:value={searchQuery}
          placeholder="Search themes…"
          class="w-full bg-transparent pl-6 outline-none text-(--color-text-primary) placeholder:text-(--color-text-secondary)"
          onclick={(e) => e.stopPropagation()}
        />
      </div>

      <button
        onclick={() => onClose()}
        class="flex h-6 w-6 items-center justify-center text-(--color-text-muted) hover:text-(--color-text-primary) transition-colors"
      >
        <X size={14} />
      </button>
    </header>

    <!-- Theme list -->
    <ul
      class="list-none m-0 flex flex-col"
      role="presentation"
      onmouseleave={() => previewUIThemeId.set(null)}
    >
      {#each themes as theme, i}
        {@const isActive = theme.id === activeId}
        {@const isFocused = i === selectedIndex}
        <li role="presentation">
          <button
            type="button"
            onclick={() => selectTheme(theme.id)}
            onmouseenter={() => {
              selectedIndex = i;
              previewUIThemeId.set(theme.id);
            }}
            role="option"
            aria-selected={isActive}
            class="flex items-center gap-2.5 w-full px-2.5 py-2.25 cursor-pointer text-left
                   border border-transparent transition-[background,border-color] duration-100
                   {isFocused || isActive
              ? 'text-(--color-text-primary) bg-(--color-accent-fill)'
              : 'text-(--color-text-secondary) hover:bg-(--color-hover-bg-subtle)'}"
          >
            <!-- Color swatch -->
            <span
              class="w-4 h-3 border-2 shrink-0 flex items-center justify-center"
              style:background={theme.preview.bg}
              style:border-color={theme.preview.accent}
            >
              <span class="w-1.5 h-1.5" style:background={theme.preview.accent}
              ></span>
            </span>

            <!-- Theme name -->
            <span
              class="flex-1 transition-colors
                         {isActive || isFocused
                ? 'text-(--color-text-primary)'
                : 'text-(--color-text-secondary)'}"
            >
              {theme.name}
            </span>

            <!-- Kind badge -->
            <h6
              class="flex items-center gap-1 uppercase
                         text-(--color-text-secondary)"
            >
              {#if theme.kind === "dark"}
                <Moon strokeWidth={2.5} size="1.2em" />
              {:else}
                <Sun strokeWidth={2.5} size="1.2em" />
              {/if}
              {theme.kind}
            </h6>
          </button>
        </li>
      {:else}
        <li class="px-4 py-5 text-center text-(--color-text-secondary)">
          No themes found matching "{searchQuery}"
        </li>
      {/each}
    </ul>
  </div>
</div>

<style>
  @keyframes picker-in {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
