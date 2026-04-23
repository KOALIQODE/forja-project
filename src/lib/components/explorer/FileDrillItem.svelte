<script lang="ts">
  // Handle Tauri invoke
  import { invoke } from '@tauri-apps/api/core';
  import { Folder, FolderOpen, Pin, Edit2, File as FileIcon, Trash2, Plus, FolderPlus } from '@lucide/svelte';
  import { activeBufferId } from '$lib/stores/bufferStore';
  import { expandedPaths, inlineAction, type FileEntry } from '$lib/stores/explorerStore';
  import { getFileIcon } from '$lib/utils/fileIcons';
  import { tick } from 'svelte';
  
  let { 
    entry, 
    handleEntryClick, 
    pinFolder,
    onContextMenu
  }: { 
    entry: FileEntry, 
    handleEntryClick: (entry: FileEntry) => Promise<void>, 
    pinFolder: (path: string) => void,
    onContextMenu?: (e: MouseEvent, entry: FileEntry) => void
  } = $props();

  let isExpanded = $derived(entry.is_dir && $expandedPaths.has(entry.path));
  let iconConfig = $derived(!entry.is_dir ? getFileIcon(entry.name) : null);

  const gitStatusColor = {
    modified: 'text-orange-400',
    added: 'text-green-400',
    untracked: 'text-zinc-500',
    renamed: 'text-blue-400',
    deleted: 'text-red-400'
  };

  const gitStatusLabel = {
    modified: 'M',
    added: 'A',
    untracked: 'U',
    renamed: 'R',
    deleted: 'D'
  };

  // Inline action state
  let isRenaming = $derived($inlineAction?.type === 'rename' && $inlineAction?.path === entry.path);
  let isCreatingFile = $derived($inlineAction?.type === 'create_file' && $inlineAction?.path === entry.path);
  let isCreatingDir = $derived($inlineAction?.type === 'create_dir' && $inlineAction?.path === entry.path);
  
  let newName = $state(entry.name);
  let creationName = $state('');
  let inputElement: HTMLInputElement | null = $state(null);

  $effect(() => {
    if ((isRenaming || isCreatingFile || isCreatingDir) && inputElement) {
      tick().then(() => {
        inputElement?.focus();
        if (isRenaming) {
          const lastDot = entry.name.lastIndexOf('.');
          inputElement?.setSelectionRange(0, lastDot > 0 ? lastDot : entry.name.length);
        }
      });
    }
  });

  async function handleRename() {
    if (!newName || newName === entry.name) {
      inlineAction.clear();
      return;
    }
    try {
      const parentPath = entry.path.substring(0, entry.path.lastIndexOf(entry.name));
      const newPath = parentPath + newName;
      await invoke('rename_entry', { oldPath: entry.path, newPath });
      inlineAction.clear();
    } catch (e) {
      console.error("Error renaming:", e);
    }
  }

  async function handleCreate() {
    if (!creationName) {
      inlineAction.clear();
      return;
    }
    try {
      const fullPath = entry.path + (entry.path.endsWith('/') || entry.path.endsWith('\\') ? '' : '/') + creationName;
      if (isCreatingFile) {
        await invoke('create_file', { path: fullPath });
      } else {
        await invoke('create_directory', { path: fullPath });
      }
      inlineAction.clear();
    } catch (e) {
      console.error("Error creating:", e);
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="flex flex-col w-full">
  <div 
    class="group flex h-7 w-full cursor-pointer items-center border-l-2 pl-4 text-[13px] transition-all duration-150 hover:bg-white/[0.03] 
          {$activeBufferId === entry.path ? 'border-emerald-500 bg-white/5' : 'border-transparent'}" 
    class:opacity-40={entry.is_ignored || entry.git_status === 'deleted'} 
    class:grayscale={entry.is_ignored}
    onclick={() => handleEntryClick(entry)}
    oncontextmenu={(e) => {
      if (onContextMenu) {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, entry);
      }
    }}
  >
    <div class="flex w-5 shrink-0 items-center justify-center"></div>
    <span class="mr-2.5 flex shrink-0 items-center opacity-70 transition-opacity group-hover:opacity-100" 
          style={!entry.is_dir && iconConfig && !entry.git_status ? `color: ${iconConfig.color}` : ''}
          class:text-blue-400={entry.is_dir && !entry.git_status} 
          class:text-orange-400={entry.git_status === 'modified'}
          class:text-green-400={entry.git_status === 'added'}
          class:text-blue-400-git={entry.git_status === 'renamed'}
          class:text-red-400={entry.git_status === 'deleted'}
          class:text-zinc-500={entry.is_ignored || entry.git_status === 'untracked'}>
      {#if entry.is_dir}
        {#if isExpanded}<FolderOpen size="15" />{:else}<Folder size="15" />{/if}
      {:else if iconConfig}
        <iconConfig.icon size="15" />
      {/if}
    </span>

    {#if isRenaming}
      <input
        bind:this={inputElement}
        bind:value={newName}
        class="h-5 w-[calc(100%-100px)] bg-zinc-800 px-1 text-[13px] text-zinc-200 outline-none ring-1 ring-emerald-500"
        onblur={handleRename}
        onkeydown={(e) => {
          if (e.key === 'Enter') handleRename();
          if (e.key === 'Escape') inlineAction.clear();
        }}
        onclick={(e) => e.stopPropagation()}
      />
    {:else}
      <span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left font-medium transition-colors
                  {$activeBufferId === entry.path || entry.git_status ? 'text-zinc-200' : 'text-zinc-400'}
                  {entry.git_status ? gitStatusColor[entry.git_status as keyof typeof gitStatusColor] || '' : ''}
                  group-hover:text-zinc-200">
        {entry.name}
      </span>
    {/if}

    <div class="flex w-24 shrink-0 items-center justify-end gap-1 pr-4 ml-auto">
      {#if entry.git_status}
        <span class="text-[10px] font-bold uppercase w-4 text-center
                    {gitStatusColor[entry.git_status as keyof typeof gitStatusColor] || 'text-zinc-500'}">
          {gitStatusLabel[entry.git_status as keyof typeof gitStatusLabel] || '?'}
        </span>
      {/if}

      {#if entry.is_dir && !entry.is_ignored}
        <button type="button" class="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-emerald-400 transition-all cursor-pointer" onclick={(e) => { e.stopPropagation(); pinFolder(entry.path); }} title="Anclar esta carpeta como raíz">
          <Pin size={12} />
        </button>
      {/if}
    </div>
  </div>

  {#if (isCreatingFile || isCreatingDir)}
    <div class="flex h-7 items-center pl-8">
      <div class="flex w-5 shrink-0 items-center justify-center"></div>
      <span class="mr-2.5 flex items-center opacity-70">
        {#if isCreatingFile}<FileIcon size="15" />{:else}<Folder size="15" class="text-blue-400" />{/if}
      </span>
      <input
        bind:this={inputElement}
        bind:value={creationName}
        placeholder={isCreatingFile ? "filename..." : "folder name..."}
        class="h-5 w-[calc(100%-100px)] bg-zinc-800 px-1 text-[13px] text-zinc-200 outline-none ring-1 ring-emerald-500"
        onblur={handleCreate}
        onkeydown={(e) => {
          if (e.key === 'Enter') handleCreate();
          if (e.key === 'Escape') inlineAction.clear();
        }}
        onclick={(e) => e.stopPropagation()}
      />
    </div>
  {/if}
</div>

<style>
  .text-blue-400-git { color: #60a5fa; }
</style>
