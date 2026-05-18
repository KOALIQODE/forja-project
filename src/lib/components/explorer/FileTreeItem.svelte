<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { ChevronRight, Folder, FolderOpen, Pin, File as FileIcon } from '@lucide/svelte';
  import { activeBufferId } from '$lib/stores/bufferStore';
  import { expandedPaths, pinnedPath, directoryCache, inlineAction, type FileEntry } from '$lib/stores/explorerStore';
  import { slide } from 'svelte/transition';
  import { GIT_STATUS_LABELS } from '$lib/utils/explorerHelpers';
  import { getFileIcon } from '$lib/utils/fileIcons';
  import { tick } from 'svelte';
  import FileTreeItem from './FileTreeItem.svelte';
  import { activeUITheme } from '$lib/stores/uiThemeStore';
  import { gitFileStatuses, getFileGitStatus } from '$lib/stores/gitStatusStore';

  let { entry, depth = 0, handleEntryClick, isVirtual = false, onContextMenu }: { 
    entry: FileEntry, 
    depth?: number, 
    handleEntryClick: (entry: FileEntry) => Promise<void>,
    isVirtual?: boolean,
    onContextMenu?: (e: MouseEvent, entry: FileEntry) => void
  } = $props();

  let themeStyle = $derived(
    Object.entries($activeUITheme.vars).map(([k, v]) => `${k}:${v}`).join(';')
  );

  // Git status from reactive store (takes precedence over entry.git_status)
  let reactiveGitStatus = $derived.by(() => {
    const status = getFileGitStatus(entry.path);
    return status?.status ?? entry.git_status ?? null;
  });

  // El estado de expansión ahora es reactivo al store global
  let isExpanded = $derived($expandedPaths.has(entry.path));
  
  let children: FileEntry[] = $state([]);
  let isLoading = $state(false);

  // Get icon config for files
  let iconConfig = $derived(!entry.is_dir ? getFileIcon(entry.name) : null);

  // Inline action state
  let isRenaming = $derived($inlineAction?.type === 'rename' && $inlineAction?.path === entry.path);
  let isCreatingFile = $derived($inlineAction?.type === 'create_file' && $inlineAction?.path === entry.path);
  let isCreatingDir = $derived($inlineAction?.type === 'create_dir' && $inlineAction?.path === entry.path);
  
  let newName = $state('');
  let creationName = $state('');
  let inputElement: HTMLInputElement | null = $state(null);

  $effect(() => { if (isRenaming) newName = entry.name; });

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

<div class="flex flex-col w-full" style={themeStyle}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    class="group flex h-[26px] cursor-pointer items-center transition-all duration-150 hover:bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.04))
           {$activeBufferId === entry.path ? 'bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.06))' : ''}"
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
    style="padding-left: {depth * 12 + 12}px"
  >
    <!-- ÁREA FIJA IZQUIERDA -->
    <div class="flex w-4 shrink-0 items-center justify-center">
      {#if entry.is_dir}
        <span class="text-(--forja-ui-text-muted,#71717a) transition-transform duration-200 group-hover:text-(--forja-ui-text-secondary,#a1a1aa)"
              class:rotate-90={isExpanded}>
          <ChevronRight size="11" strokeWidth={2.4} />
        </span>
      {/if}
    </div>

    <span class="mr-2 flex items-center opacity-90 transition-opacity duration-150 group-hover:opacity-100 {$activeBufferId === entry.path ? 'scale-[1.04]' : ''}" 
          style={entry.is_dir && !reactiveGitStatus ? 'color: var(--forja-ui-explorer-folder, #7a7a8a)' : reactiveGitStatus === 'modified' ? 'color: var(--forja-ui-git-modified, #fb923c)' : reactiveGitStatus === 'added' ? 'color: var(--forja-ui-git-added, #4ade80)' : reactiveGitStatus === 'renamed' ? 'color: var(--forja-ui-git-renamed, #60a5fa)' : reactiveGitStatus === 'deleted' ? 'color: var(--forja-ui-git-deleted, #f87171)' : entry.is_ignored || reactiveGitStatus === 'untracked' ? 'color: var(--forja-ui-text-muted, #71717a)' : !entry.is_dir && iconConfig ? `color: ${iconConfig.color}` : ''
          }>
      {#if entry.is_dir}
        {#if isExpanded}<FolderOpen size="15" strokeWidth={2.5} />{:else}<Folder size="15" strokeWidth={2.5} />{/if}
      {:else if iconConfig}
        <iconConfig.icon size="15" strokeWidth={2.6} />
      {/if}
    </span>

    {#if isRenaming}
      <input
        bind:this={inputElement}
        bind:value={newName}
        class="h-5 w-[calc(100%-40px)] bg-(--forja-ui-btn-bg,#0a0a0a) ring-1 ring-(--forja-ui-btn-border,#27272a) px-1 text-[12px] text-(--forja-ui-text-primary,#f4f4f5) outline-none"
        onblur={handleRename}
        onkeydown={(e) => {
          if (e.key === 'Enter') handleRename();
          if (e.key === 'Escape') inlineAction.clear();
        }}
        onclick={(e) => e.stopPropagation()}
      />
    {:else}
      <span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-medium transition-colors group-hover:text-(--forja-ui-text-primary,#f4f4f5)"
            style={reactiveGitStatus === 'modified' ? 'color: var(--forja-ui-git-modified, #fb923c)' : reactiveGitStatus === 'added' ? 'color: var(--forja-ui-git-added, #4ade80)' : reactiveGitStatus === 'renamed' ? 'color: var(--forja-ui-git-renamed, #60a5fa)' : reactiveGitStatus === 'deleted' ? 'color: var(--forja-ui-git-deleted, #f87171)' : reactiveGitStatus === 'untracked' ? 'color: var(--forja-ui-text-muted, #71717a)' : $activeBufferId === entry.path ? 'color: var(--forja-ui-text-primary, #f4f4f5)' : 'color: var(--forja-ui-text-secondary, #a1a1aa)'}>
        {entry.name}
      </span>
    {/if}

    <!-- Área de acciones derecha -->
    <div class="ml-auto flex items-center justify-end gap-1 pr-3">
      {#if reactiveGitStatus}
        <span class="text-[9px] font-bold uppercase tracking-tighter w-3.5 text-center"
              style={reactiveGitStatus === 'modified' ? 'color: var(--forja-ui-git-modified, #fb923c)' : reactiveGitStatus === 'added' ? 'color: var(--forja-ui-git-added, #4ade80)' : reactiveGitStatus === 'renamed' ? 'color: var(--forja-ui-git-renamed, #60a5fa)' : reactiveGitStatus === 'deleted' ? 'color: var(--forja-ui-git-deleted, #f87171)' : 'color: var(--forja-ui-text-muted, #71717a)'}>
          {GIT_STATUS_LABELS[reactiveGitStatus as keyof typeof GIT_STATUS_LABELS] || '?'}
        </span>
      {/if}

      {#if entry.is_dir && !entry.is_ignored}
        <button 
          class="opacity-0 group-hover:opacity-100 p-1 text-(--forja-ui-text-muted,#71717a) hover:text-(--forja-ui-text-primary,#f4f4f5) transition-colors cursor-pointer"
          onclick={(e) => { e.stopPropagation(); pinFolder(); }}
          title="Anclar esta carpeta como raíz"
        >
          <Pin size={11} strokeWidth={2.25} />
        </button>
      {/if}
    </div>
  </div>

  {#if (isCreatingFile || isCreatingDir) && isExpanded}
    <div class="flex h-[26px] items-center" style="padding-left: {(depth + 1) * 12 + 12}px">
      <div class="flex w-4 shrink-0 items-center justify-center"></div>
      <span class="mr-2 flex items-center opacity-70">
        {#if isCreatingFile}<FileIcon size="15" strokeWidth={2.6} />{:else}<Folder size="15" strokeWidth={2.75} class="text-(--forja-ui-explorer-folder,#7a7a8a)" />{/if}
      </span>
      <input
        bind:this={inputElement}
        bind:value={creationName}
        placeholder={isCreatingFile ? "filename..." : "folder name..."}
        class="h-5 w-[calc(100%-40px)] bg-(--forja-ui-btn-bg,#0a0a0a) ring-1 ring-(--forja-ui-btn-border,#27272a) px-1 text-[12px] text-(--forja-ui-text-primary,#f4f4f5) outline-none"
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
    <div transition:slide={{ duration: 150 }}>
      {#if isLoading && children.length === 0}
        <div class="py-1 text-[10px] text-(--forja-ui-text-muted,#71717a) font-bold uppercase tracking-wider" style="padding-left: {(depth + 1) * 12 + 28}px">
          Loading...
        </div>
      {:else}
        {#each children as child}
          <FileTreeItem entry={child} depth={depth + 1} {handleEntryClick} {onContextMenu} />
        {/each}
      {/if}
    </div>
  {/if}
</div>



<style></style>
