<script lang="ts">
  // Handle Tauri invoke
  import { invoke } from '@tauri-apps/api/core';
  import { Folder, FolderOpen, Pin, File as FileIcon } from '@lucide/svelte';
  import { activeBufferId } from '$lib/stores/bufferStore';
  import { expandedPaths, inlineAction, type FileEntry } from '$lib/stores/explorerStore';
  import { GIT_STATUS_LABELS } from '$lib/utils/explorerHelpers';
  import { getFileIcon } from '$lib/utils/fileIcons';
  import { tick } from 'svelte';
  import { activeUITheme } from '$lib/stores/uiThemeStore';
  import { gitFileStatuses, getFileGitStatus } from '$lib/stores/gitStatusStore';
  
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

  // Git status from reactive store (takes precedence over entry.git_status)
  let reactiveGitStatus = $derived.by(() => {
    const status = getFileGitStatus(entry.path);
    return status?.status ?? entry.git_status ?? null;
  });

  let isExpanded = $derived(entry.is_dir && $expandedPaths.has(entry.path));
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

<div class="flex flex-col w-full">
  <div 
    class="group flex h-[26px] w-full cursor-pointer items-center pl-3 text-[12px] transition-all duration-150 hover:bg-(--color-hover-bg-subtle)
          {$activeBufferId === entry.path ? 'bg-(--color-accent-fill)' : ''}" 
    class:opacity-40={entry.is_ignored || entry.git_status === 'deleted'} 
    class:grayscale={entry.is_ignored}
    onclick={() => handleEntryClick(entry)}
    oncontextmenu={handleContextMenu}
  >
    <div class="flex w-3 shrink-0 items-center justify-center"></div>
    <span class="mr-2 flex shrink-0 items-center opacity-90 transition-opacity duration-150 group-hover:opacity-100 {$activeBufferId === entry.path ? 'scale-[1.04]' : ''}" 
          style={entry.is_dir && !reactiveGitStatus ? 'color: var(--color-text-muted)' : reactiveGitStatus === 'modified' ? 'color: var(--color-accent-alt)' : reactiveGitStatus === 'added' ? 'color: var(--color-accent)' : reactiveGitStatus === 'renamed' ? 'color: var(--color-accent)' : reactiveGitStatus === 'deleted' ? 'color: var(--color-text-faint)' : entry.is_ignored || reactiveGitStatus === 'untracked' ? 'color: var(--color-text-muted)' : !entry.is_dir && iconConfig ? `color: ${iconConfig.color}` : ''
          }>
      {#if entry.is_dir}
        {#if isExpanded}<FolderOpen size="15" strokeWidth={2.75} />{:else}<Folder size="15" strokeWidth={2.75} />{/if}
      {:else if iconConfig}
        <iconConfig.icon size="15" strokeWidth={2.6} />
      {/if}
    </span>

    {#if isRenaming}
      <input
        bind:this={inputElement}
        bind:value={newName}
        class="h-5 w-[calc(100%-40px)] bg-(--color-surface-base) ring-1 ring-(--color-border) px-1 text-[12px] text-(--color-text-primary) outline-none"
        onblur={handleRename}
        onkeydown={(e) => {
          if (e.key === 'Enter') handleRename();
          if (e.key === 'Escape') inlineAction.clear();
        }}
        onclick={(e) => e.stopPropagation()}
      />
    {:else}
      <span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left font-medium transition-colors group-hover:text-(--color-text-primary)"
            style={reactiveGitStatus === 'modified' ? 'color: var(--color-accent-alt)' : reactiveGitStatus === 'added' ? 'color: var(--color-accent)' : reactiveGitStatus === 'renamed' ? 'color: var(--color-accent)' : reactiveGitStatus === 'deleted' ? 'color: var(--color-text-faint)' : reactiveGitStatus === 'untracked' ? 'color: var(--color-text-muted)' : $activeBufferId === entry.path ? 'color: var(--color-text-primary)' : 'color: var(--color-text-secondary)'}>
        {entry.name}
      </span>
    {/if}

    <div class="flex w-20 shrink-0 items-center justify-end gap-1 pr-3 ml-auto">
      {#if reactiveGitStatus}
        <span class="text-[9px] font-bold uppercase w-3.5 text-center"
              style={reactiveGitStatus === 'modified' ? 'color: var(--color-accent-alt)' : reactiveGitStatus === 'added' ? 'color: var(--color-accent)' : reactiveGitStatus === 'renamed' ? 'color: var(--color-accent)' : reactiveGitStatus === 'deleted' ? 'color: var(--color-text-faint)' : 'color: var(--color-text-muted)'}>
          {GIT_STATUS_LABELS[reactiveGitStatus as keyof typeof GIT_STATUS_LABELS] || '?'}
        </span>
      {/if}

      {#if entry.is_dir && !entry.is_ignored}
        <button type="button" class="opacity-0 group-hover:opacity-100 p-1 text-(--color-text-muted) hover:text-(--color-text-primary) transition-colors cursor-pointer" onclick={(e) => { e.stopPropagation(); pinFolder(entry.path); }} title="Anclar esta carpeta como raíz">
          <Pin size={11} strokeWidth={2.25} />
        </button>
      {/if}
    </div>
  </div>

  {#if (isCreatingFile || isCreatingDir)}
    <div class="flex h-[26px] items-center pl-6">
      <div class="flex w-3 shrink-0 items-center justify-center"></div>
      <span class="mr-2 flex items-center opacity-70">
        {#if isCreatingFile}<FileIcon size="15" strokeWidth={2.6} />{:else}<Folder size="15" strokeWidth={2.75} class="text-(--color-text-muted)" />{/if}
      </span>
      <input
        bind:this={inputElement}
        bind:value={creationName}
        placeholder={isCreatingFile ? "filename..." : "folder name..."}
        class="h-5 w-[calc(100%-40px)] bg-(--color-surface-base) ring-1 ring-(--color-border) px-1 text-[12px] text-(--color-text-primary) outline-none"
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


<style></style>
