<script lang="ts">
  import { onMount } from 'svelte';
  import { Search, X, FileCode, Trash2, Command } from "@lucide/svelte";
  import { openBuffers, activeBufferId, closeBuffer, openBuffer } from "../../stores/bufferStore";
  import { closeDialog } from "../../stores/dialogStore";
  import { fade, scale } from 'svelte/transition';

  let searchQuery = $state("");
  let selectedIndex = $state(0);
  let inputElement = $state<HTMLInputElement>();

  // Filter buffers based on search query
  let filteredBuffers = $derived.by(() => {
    const buffers = Array.from($openBuffers.values());
    if (!searchQuery.trim()) return buffers;
    
    const query = searchQuery.toLowerCase();
    return buffers.filter(b => 
      b.filePath.toLowerCase().includes(query) || 
      (b.language && b.language.toLowerCase().includes(query))
    );
  });

  // Reset selected index when filtered list changes
  $effect(() => {
    if (selectedIndex >= filteredBuffers.length) {
      selectedIndex = Math.max(0, filteredBuffers.length - 1);
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % filteredBuffers.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + filteredBuffers.length) % filteredBuffers.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredBuffers[selectedIndex]) {
        selectBuffer(filteredBuffers[selectedIndex].id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeDialog();
    } else if (e.key === 'd' && (e.ctrlKey || e.altKey)) {
      // Shortcut to delete buffer
      e.preventDefault();
      if (filteredBuffers[selectedIndex]) {
        handleCloseBuffer(filteredBuffers[selectedIndex].id);
      }
    }
  }

  function selectBuffer(id: string) {
    openBuffer(id); // This sets it as active
    closeDialog();
  }

  function handleCloseBuffer(id: string) {
    closeBuffer(id);
    if ($openBuffers.size === 0) {
      closeDialog();
    }
  }

  function getFileName(path: string) {
    return path.split(/[\/\\]/).pop() || path;
  }

  function getDirectory(path: string) {
    const parts = path.split(/[\/\\]/);
    parts.pop();
    return parts.join('/') || '.';
  }

  onMount(() => {
    inputElement?.focus();
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div 
  class="fixed inset-0 z-[2000] flex items-start justify-center pt-[15vh] px-4"
  transition:fade={{ duration: 150 }}
  onclick={closeDialog}
>
  <div
    class="relative flex w-full max-w-xl flex-col overflow-hidden border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black outline-none"
    transition:scale={{ duration: 200, start: 0.98, opacity: 0 }}
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Search Input -->
    <div class="flex items-center gap-3 border-b border-zinc-800/50 bg-zinc-900/20 px-4 py-3">
      <Search size={18} class="text-zinc-500" />
      <input
        bind:this={inputElement}
        bind:value={searchQuery}
        onkeydown={handleKeydown}
        placeholder="Find buffer..."
        class="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
      />
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-1 border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">
          <Command size={10} />
          <span>B</span>
        </div>
        <button 
          type="button"
          onclick={closeDialog}
          class="flex h-6 w-6 cursor-pointer items-center justify-center text-zinc-500 transition-all hover:bg-white/5 hover:text-zinc-100"
        >
          <X size={16} />
        </button>
      </div>
    </div>

    <!-- Buffers List -->
    <div class="custom-scrollbar max-h-[400px] overflow-y-auto p-2">
      {#if filteredBuffers.length === 0}
        <div class="flex flex-col items-center justify-center py-12 text-center">
          <p class="text-xs font-medium text-zinc-600">No open buffers matching search</p>
        </div>
      {:else}
        <div class="flex flex-col gap-0.5">
          {#each filteredBuffers as buffer, index}
            {@const isActive = buffer.id === $activeBufferId}
            {@const isSelected = index === selectedIndex}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="group relative flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-all duration-75 {isSelected ? 'bg-emerald-500/10 border-l-2 border-emerald-500 pl-2.5' : ''}"
              onclick={() => selectBuffer(buffer.id)}
              onmouseenter={() => selectedIndex = index}
            >
              <div class="flex h-8 w-8 shrink-0 items-center justify-center bg-zinc-900 text-zinc-500 transition-colors"
                   class:text-emerald-400={isSelected || isActive}>
                <FileCode size={16} />
              </div>
              
              <div class="flex flex-1 flex-col min-w-0">
                <div class="flex items-center gap-2">
                  <span class="truncate text-[13px] font-medium" class:text-zinc-100={isSelected || isActive} class:text-zinc-400={!isSelected && !isActive}>
                    {getFileName(buffer.filePath)}
                  </span>
                  {#if isActive}
                    <span class="bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-500 uppercase tracking-tighter">active</span>
                  {/if}
                </div>
                <span class="truncate font-mono text-[10px] text-zinc-600 tracking-tight">{getDirectory(buffer.filePath)}</span>
              </div>

              <!-- Close Action -->
              <button 
                type="button"
                class="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center text-zinc-700 transition-all hover:bg-red-500/10 hover:text-red-400"
                class:opacity-100={isSelected}
                class:opacity-0={!isSelected}
                onclick={(e) => { e.stopPropagation(); handleCloseBuffer(buffer.id); }}
                title="Close buffer"
              >
                <Trash2 size={14} />
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Footer / Keybinds -->
    <footer class="flex items-center justify-between border-t border-zinc-800/50 bg-zinc-900/30 px-4 py-2">
      <div class="flex items-center gap-4 text-[10px] text-zinc-500">
        <div class="flex items-center gap-1">
          <kbd class="border border-zinc-800 bg-zinc-900 px-1 py-0.5 font-mono">↵</kbd>
          <span>select</span>
        </div>
        <div class="flex items-center gap-1">
          <kbd class="border border-zinc-800 bg-zinc-900 px-1 py-0.5 font-mono">ctrl+d</kbd>
          <span>close</span>
        </div>
      </div>
      <div class="text-[10px] font-mono text-zinc-600">
        {filteredBuffers.length} buffers
      </div>
    </footer>
  </div>
</div>

<style>
  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 10px; }
  .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: #2a2a2a; }
</style>