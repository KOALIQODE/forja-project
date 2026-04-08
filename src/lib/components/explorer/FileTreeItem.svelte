<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { Folder, FolderOpen, FileCode, ChevronRight } from '@lucide/svelte';
  import { connectNvimForComponent, currentBufferId } from '$lib/stores/nvimStore';
  import { expandedPaths } from '$lib/stores/explorerStore';
  import { slide } from 'svelte/transition';
  import FileTreeItem from './FileTreeItem.svelte';

  interface FileEntry {
    name: string;
    path: string;
    is_dir: boolean;
    is_ignored: boolean;
    extension?: string;
    git_status?: 'modified' | 'added' | 'renamed' | 'deleted' | 'untracked';
  }

  let { entry, depth = 0 }: { entry: FileEntry, depth?: number } = $props();

  // El estado de expansión ahora es reactivo al store global
  let isExpanded = $derived($expandedPaths.has(entry.path));
  
  let children: FileEntry[] = $state([]);
  let isLoading = $state(false);

  // Cargar metadatos automáticamente cuando se expande
  $effect(() => {
    if (isExpanded && children.length === 0 && !isLoading) {
      loadMetadata();
    }
  });

  async function toggle() {
    if (!entry.is_dir) {
      await openFile(entry.path);
      return;
    }
    expandedPaths.toggle(entry.path);
  }

  async function loadMetadata() {
    isLoading = true;
    try {
      const result = await invoke<FileEntry[]>('explore_directory', { path: entry.path });
      children = result;
    } catch (error) {
      console.error("Error cargando subdirectorio:", error);
    } finally {
      isLoading = false;
    }
  }

  async function openFile(path: string) {
    try {
      const content = await invoke('read_file', { path });
      await connectNvimForComponent(path, { filePath: path, content });
    } catch (error) {
      console.error("Error abriendo archivo:", error);
    }
  }
</script>

<div class="flex flex-col">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    class="group flex h-7 cursor-pointer items-center border-l-2 transition-all duration-150 hover:bg-white/5
           {$currentBufferId === entry.path ? 'border-emerald-500 bg-white/5' : 'border-transparent'}"
    class:opacity-40={entry.is_ignored}
    onclick={toggle}
    style="padding-left: {depth * 12 + 16}px"
  >
    <span class="mr-1 flex items-center text-zinc-600 transition-transform duration-200 group-hover:text-zinc-400"
          class:rotate-90={isExpanded}>
      {#if entry.is_dir}
        <ChevronRight size="12" />
      {/if}
    </span>

    <span class="mr-2.5 flex items-center opacity-60 transition-opacity group-hover:opacity-100" 
          class:text-blue-400={entry.is_dir && !entry.git_status} 
          class:text-emerald-500={!entry.is_dir && !entry.is_ignored && !entry.git_status}
          class:text-orange-400={entry.git_status === 'modified'}
          class:text-green-400={entry.git_status === 'added' || entry.git_status === 'untracked'}
          class:text-zinc-500={entry.is_ignored}>
      {#if entry.is_dir}
        {#if isExpanded}
          <FolderOpen size="15" weight="fill" />
        {:else}
          <Folder size="15" weight="fill" />
        {/if}
      {:else}
        <FileCode size="15" />
      {/if}
    </span>

    <span class="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] tracking-tight transition-colors group-hover:text-zinc-200
                {$currentBufferId === entry.path || entry.git_status ? 'text-zinc-200' : 'text-zinc-400'}
                {entry.git_status === 'modified' ? 'text-orange-400/90' : ''}
                {entry.git_status === 'added' || entry.git_status === 'untracked' ? 'text-green-400/90' : ''}">
      {entry.name}
    </span>

    {#if entry.git_status}
      <span class="ml-auto pr-3 text-[10px] font-bold uppercase tracking-tighter opacity-50"
            class:text-orange-400={entry.git_status === 'modified'}
            class:text-green-400={entry.git_status === 'added' || entry.git_status === 'untracked'}>
        {entry.git_status === 'modified' ? 'M' : 'U'}
      </span>
    {/if}
  </div>

  {#if isExpanded}
    <div transition:slide={{ duration: 200 }}>
      {#if isLoading && children.length === 0}
        <div class="py-1 text-[11px] text-zinc-600" style="padding-left: {(depth + 1) * 12 + 20}px">
          Cargando...
        </div>
      {:else}
        {#each children as child}
          <FileTreeItem entry={child} depth={depth + 1} />
        {/each}
      {/if}
    </div>
  {/if}
</div>
