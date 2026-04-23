<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { Folder, FolderOpen, ChevronRight, Pin, Edit2, File as FileIcon, Trash2, Plus, FolderPlus } from '@lucide/svelte';
  import { openBuffer, activeBufferId } from '$lib/stores/bufferStore';
  import { expandedPaths, pinnedPath, directoryCache, inlineAction, type FileEntry } from '$lib/stores/explorerStore';
  import { slide } from 'svelte/transition';
  import { getFileIcon } from '$lib/utils/fileIcons';
  import { tick } from 'svelte';

  let { entry, depth = 0, handleEntryClick, isVirtual = false, onContextMenu }: { 
    entry: FileEntry, 
    depth?: number, 
    handleEntryClick: (entry: FileEntry) => Promise<void>,
    isVirtual?: boolean,
    onContextMenu?: (e: MouseEvent, entry: FileEntry) => void
  } = $props();

  // El estado de expansión ahora es reactivo al store global
  let isExpanded = $derived($expandedPaths.has(entry.path));
  
  let children: FileEntry[] = $state([]);
  let isLoading = $state(false);

  // Get icon config for files
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
      // El refresh lo manejará el Explorer o podemos disparar un evento
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
      // Ensure folder is expanded to see new item
      expandedPaths.setExpanded(entry.path, true);
    } catch (e) {
      console.error("Error creating:", e);
    }
  }

  // Cargar metadatos automáticamente cuando se expande
  $effect(() => {
    if (isExpanded && children.length === 0 && !isLoading) {
      loadMetadata();
    }
  });

  async function loadMetadata() {
    isLoading = true;
    try {
      const result = await invoke<FileEntry[]>('explore_directory', { path: entry.path });
      children = result;
      directoryCache.set(entry.path, result);
    } catch (error) {
      console.error("Error cargando subdirectorio:", error);
    } finally {
      isLoading = false;
    }
  }

  function pinFolder() {
    pinnedPath.pin(entry.path);
  }
</script>

<div class="flex flex-col w-full">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    class="group flex h-7 cursor-pointer items-center border-l-2 transition-all duration-150 hover:bg-white/5
           {$activeBufferId === entry.path ? 'border-emerald-500 bg-white/5' : 'border-transparent'}"
    class:opacity-40={entry.is_ignored}
    onclick={(e) => {
      handleEntryClick(entry);
    }}
    oncontextmenu={(e) => {
      if (onContextMenu) {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, entry);
      }
    }}
    style="padding-left: {depth * 12 + 16}px"
  >
    <!-- ÁREA FIJA IZQUIERDA -->
    <div class="flex w-5 shrink-0 items-center justify-center">
      {#if entry.is_dir}
        <span class="text-zinc-600 transition-transform duration-200 group-hover:text-zinc-400"
              class:rotate-90={isExpanded}>
          <ChevronRight size="12" />
        </span>
      {/if}
    </div>

    <span class="mr-2.5 flex items-center opacity-70 transition-opacity group-hover:opacity-100" 
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
      <span class="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium transition-colors group-hover:text-zinc-200
                  {$activeBufferId === entry.path || entry.git_status ? 'text-zinc-200' : 'text-zinc-400'}
                  {entry.git_status ? gitStatusColor[entry.git_status as keyof typeof gitStatusColor] || '' : ''}">
        {entry.name}
      </span>
    {/if}

    <!-- Área de acciones derecha -->
    <div class="ml-auto flex items-center justify-end gap-1 pr-4">
      {#if entry.git_status}
        <span class="text-[10px] font-bold uppercase tracking-tighter w-4 text-center
                     {gitStatusColor[entry.git_status as keyof typeof gitStatusColor] || 'text-zinc-500'}">
          {gitStatusLabel[entry.git_status as keyof typeof gitStatusLabel] || '?'}
        </span>
      {/if}

      {#if entry.is_dir && !entry.is_ignored}
        <button 
          class="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-emerald-400 transition-all cursor-pointer"
          onclick={(e) => { e.stopPropagation(); pinFolder(); }}
          title="Anclar esta carpeta como raíz"
        >
          <Pin size={12} />
        </button>
      {/if}
    </div>
  </div>

  {#if (isCreatingFile || isCreatingDir) && isExpanded}
    <div class="flex h-7 items-center" style="padding-left: {(depth + 1) * 12 + 16}px">
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

  {#if !isVirtual && isExpanded}
    <div transition:slide={{ duration: 200 }}>
      {#if isLoading && children.length === 0}
        <div class="py-1 text-[11px] text-zinc-600 font-medium" style="padding-left: {(depth + 1) * 12 + 32}px">
          Cargando...
        </div>
      {:else}
        {#each children as child}
          <FileTreeItem entry={child} depth={depth + 1} {handleEntryClick} {onContextMenu} />
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .text-blue-400-git { color: #60a5fa; }
</style>
