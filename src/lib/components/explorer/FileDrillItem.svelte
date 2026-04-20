<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { Folder, FolderOpen, FileCode, Pin } from '@lucide/svelte';
  import { activeBufferId } from '$lib/stores/bufferStore';
  import { expandedPaths } from '$lib/stores/explorerStore';
  
  interface FileEntry {
    name: string;
    path: string;
    is_dir: boolean;
    is_ignored: boolean;
    extension?: string;
    git_status?: 'modified' | 'added' | 'renamed' | 'deleted' | 'untracked';
  }

  let { 
    entry, 
    handleEntryClick, 
    pinFolder 
  }: { 
    entry: FileEntry, 
    handleEntryClick: (entry: FileEntry) => Promise<void>, 
    pinFolder: (path: string) => void
  } = $props();

  let isExpanded = $derived(entry.is_dir && $expandedPaths.has(entry.path));
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div 
  class="group flex h-7 w-full cursor-pointer items-center border-l-2 pl-4 text-[13px] transition-all duration-150 hover:bg-white/[0.03] 
         {$activeBufferId === entry.path ? 'border-emerald-500 bg-white/5' : 'border-transparent'}" 
  class:opacity-40={entry.is_ignored} 
  class:grayscale={entry.is_ignored}
  onclick={() => handleEntryClick(entry)}
>
  <div class="flex w-5 shrink-0 items-center justify-center"></div>
  <span class="mr-2.5 flex shrink-0 items-center opacity-60 transition-opacity group-hover:opacity-100" 
        class:text-blue-400={entry.is_dir && !entry.git_status} 
        class:text-emerald-500={!entry.is_dir && !entry.is_ignored && !entry.git_status}
        class:text-orange-400={entry.git_status === 'modified'}
        class:text-green-400={entry.git_status === 'added' || entry.git_status === 'untracked'}
        class:text-zinc-500={entry.is_ignored}>
    {#if entry.is_dir}
      {#if isExpanded}<FolderOpen size="15" />{:else}<Folder size="15" />{/if}
    {:else}
      <FileCode size="15" />
    {/if}
  </span>
  <span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left font-medium transition-colors
               {$activeBufferId === entry.path || entry.git_status ? 'text-zinc-200' : 'text-zinc-400'}
               {entry.git_status === 'modified' ? 'text-orange-400/90' : ''}
               {entry.git_status === 'added' || entry.git_status === 'untracked' ? 'text-green-400/90' : ''}
               group-hover:text-zinc-200">
    {entry.name}
  </span>

  <div class="flex w-16 shrink-0 items-center justify-end gap-2 pr-4 ml-auto">
    {#if entry.git_status}
      <span class="text-[10px] font-bold uppercase opacity-50
                   {entry.git_status === 'modified' ? 'text-orange-400' : 'text-green-400'}">
        {entry.git_status === 'modified' ? 'M' : 'U'}
      </span>
    {/if}

    {#if entry.is_dir && !entry.is_ignored}
      <button type="button" class="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-emerald-400 transition-all cursor-pointer" onclick={(e) => { e.stopPropagation(); pinFolder(entry.path); }} title="Anclar esta carpeta como raíz">
        <Pin size={12} />
      </button>
    {/if}
  </div>
</div>