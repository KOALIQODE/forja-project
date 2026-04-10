<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { Folder, FolderOpen, FileCode, ChevronLeft, LogOut, LayoutList, ListTree, FolderPlus, Search, X, RefreshCw, Pin, PinOff } from '@lucide/svelte';
  import { openBuffer, activeBufferId } from '$lib/stores/bufferStore';
  import { currentProject, closeProject, openProject } from '$lib/stores/projectStore';
  import { expandedPaths, directoryCache, pinnedPath } from '$lib/stores/explorerStore';
  import FileTreeItem from './explorer/FileTreeItem.svelte';
  import { open } from "@tauri-apps/plugin-dialog";

  interface FileEntry {
    name: string;
    path: string;
    is_dir: boolean;
    is_ignored: boolean;
    extension?: string;
    git_status?: 'modified' | 'added' | 'renamed' | 'deleted' | 'untracked';
  }

  const STORAGE_KEY_VIEW = "forja-explorer-view-mode";
  let viewMode = $state<'drill' | 'tree'>((typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY_VIEW) as any) || 'drill');

  $effect(() => {
    localStorage.setItem(STORAGE_KEY_VIEW, viewMode);
  });

  const MIN_WIDTH = 180;
  const MAX_WIDTH = 600;
  const DEFAULT_WIDTH = 260;
  let sidebarWidth = $state(DEFAULT_WIDTH);
  let isResizing = $state(false);

  let searchQuery = $state("");
  let searchResults: FileEntry[] = $state([]);
  let isSearching = $state(false);

  let entries: FileEntry[] = $state([]);
  let currentPath = $state("");
  let loading = $state(false);

  let hasProject = $derived(!!$currentProject);
  let effectiveRoot = $derived($pinnedPath || $currentProject);
  let canGoUp = $derived(currentPath !== effectiveRoot);
  let currentFolderName = $derived((viewMode === 'tree' ? (effectiveRoot || "") : currentPath).split(/[/\\]/).pop() || "Raíz");

  async function refresh() {
    if (searchQuery) {
      await handleSearch();
    } else if (currentPath) {
      loading = true;
      try {
        const result = await invoke<FileEntry[]>('explore_directory', { path: currentPath });
        entries = result;
        directoryCache.set(currentPath, result);
      } catch (error) {
        console.error("Error refrescando:", error);
      } finally {
        loading = false;
      }
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim() || !effectiveRoot) {
      searchResults = [];
      isSearching = false;
      return;
    }

    isSearching = true;
    try {
      searchResults = await invoke('search_files', { 
        path: effectiveRoot, 
        query: searchQuery 
      });
    } catch (error) {
      console.error("Error en búsqueda:", error);
    } finally {
      isSearching = false;
    }
  }

  function onSearchInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(handleSearch, 300);
  }
  let searchTimeout: any;

  function clearSearch() {
    searchQuery = "";
    searchResults = [];
  }

  async function handleOpenProject() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Project Folder",
      });
      if (selected) {
        pinnedPath.unpin();
        openProject(selected);
      }
    } catch (error) {
      console.error("Error opening folder:", error);
    }
  }

  async function loadDirectory(path: string) {
    if (!path) return;
    
    const cached = directoryCache.get(path);
    if (cached) {
      entries = cached;
    } else {
      loading = true;
    }

    try {
      currentPath = path;
      const result = await invoke<FileEntry[]>('explore_directory', { path: path });
      entries = result;
      directoryCache.set(path, result);
    } catch (error) {
      console.error("Error explorando directorio:", error);
    } finally {
      loading = false;
    }
  }

  async function goUp() {
    if (!canGoUp) return;
    const parts = currentPath.split(/[/\\]/);
    parts.pop();
    const parentPath = parts.join("/");
    if (parentPath) await loadDirectory(parentPath);
  }

  async function goHome() {
    closeProject();
    pinnedPath.unpin();
    currentPath = "";
    entries = [];
    clearSearch();
    directoryCache.clear();
  }

  function toggleViewMode() {
    if (!hasProject) return;
    viewMode = viewMode === 'drill' ? 'tree' : 'drill';
    if (viewMode === 'tree' && effectiveRoot) {
      loadDirectory(effectiveRoot);
    }
  }

  function unpin() {
    pinnedPath.unpin();
    if ($currentProject) loadDirectory($currentProject);
  }

  function pinFolder(path: string) {
    pinnedPath.pin(path);
    loadDirectory(path);
  }

  async function handleEntryClick(entry: FileEntry) {
    if (entry.is_dir) {
      await loadDirectory(entry.path);
    } else {
      await openFile(entry.path);
    }
  }

  async function openFile(path: string) {
    try {
      const content = await invoke<string>('read_file', { path });
      openBuffer(path, content);
    } catch (error) {
      console.error("Error abriendo archivo:", error);
    }
  }

  function startResizing(e: MouseEvent) {
    isResizing = true;
    e.preventDefault();
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isResizing) return;
    const newWidth = e.clientX;
    if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
      sidebarWidth = newWidth;
    }
  }

  function stopResizing() {
    isResizing = false;
  }

  $effect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopResizing);
    };
  });

  // REACTIVIDAD CRÍTICA: Recargar cuando cambia la raíz (Focus Mode)
  $effect(() => {
    if (effectiveRoot) {
      loadDirectory(effectiveRoot);
    }
  });

  onMount(() => {
    if (effectiveRoot) loadDirectory(effectiveRoot);
    const handleFocus = () => refresh();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  });
</script>

<div 
  class="relative flex shrink-0 flex-col border-r border-zinc-800/50 bg-[#0a0a0a] text-zinc-400 select-none h-full transition-colors duration-300 font-sans" 
  style="width: {sidebarWidth}px;"
>
  <header class="shrink-0 border-b border-zinc-800/40 bg-[#0a0a0a]/80 backdrop-blur-sm p-3.5 pb-3">
    <div class="mb-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <h3 class="m-0 text-[10px] font-bold tracking-[0.15em] text-zinc-500 uppercase">Explorer</h3>
        {#if $pinnedPath}
          <span class="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-500 uppercase tracking-tighter">
            <Pin size="10" /> Focus
          </span>
        {/if}
      </div>
      
      {#if hasProject}
        <div class="flex items-center gap-1">
          {#if $pinnedPath}
            <button onclick={unpin} title="Volver a la raíz del proyecto" class="flex cursor-pointer items-center rounded-md p-1.5 transition-all hover:bg-white/5 hover:text-emerald-400">
              <PinOff size="14" />
            </button>
          {/if}
          <button onclick={toggleViewMode} title="Cambiar modo de vista" class="flex cursor-pointer items-center rounded-md p-1.5 transition-all hover:bg-white/5 hover:text-zinc-200">
            {#if viewMode === 'drill'}<ListTree size="14" />{:else}<LayoutList size="14" />{/if}
          </button>
          <button onclick={goHome} title="Cerrar proyecto" class="flex cursor-pointer items-center rounded-md p-1.5 transition-all hover:bg-white/5 hover:text-red-400/80"><LogOut size="14" /></button>
        </div>
      {/if}
    </div>
    
    {#if hasProject}
      <div class="relative mb-3 group">
        <div class="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-zinc-600 group-focus-within:text-emerald-500/70 transition-colors">
          <Search size="12" />
        </div>
        <input 
          type="text" 
          bind:value={searchQuery}
          oninput={onSearchInput}
          placeholder="Search in {currentFolderName}..."
          class="w-full bg-zinc-900/50 border border-zinc-800/50 rounded-lg py-1.5 pl-8 pr-8 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/30 focus:bg-zinc-900/80 transition-all font-medium"
        />
        {#if searchQuery}
          <button onclick={clearSearch} class="absolute inset-y-0 right-2 flex items-center text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer">
            <X size="12" />
          </button>
        {/if}
      </div>

      <div class="flex min-h-[28px] items-center gap-2 rounded-lg bg-zinc-900/50 px-2.5 py-1 border border-zinc-800/30">
        {#if viewMode === 'drill' && canGoUp && !searchQuery}
          <button class="flex cursor-pointer items-center p-0 text-zinc-500 transition-colors hover:text-zinc-200" onclick={goUp} title="Subir nivel">
            <ChevronLeft size="14" />
          </button>
        {/if}
        <span class="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-medium tracking-tight text-zinc-400" title={currentPath}>
          {searchQuery ? 'Search Results' : currentFolderName}
        </span>
      </div>
    {/if}
  </header>

  <div class="flex-1 overflow-x-hidden overflow-y-auto py-2 custom-scrollbar">
    {#if loading || isSearching}
      <div class="flex flex-col items-center justify-center p-10 gap-3">
        <div class="w-4 h-4 border-2 border-zinc-700 border-t-emerald-500/50 rounded-full animate-spin"></div>
        <span class="text-[10px] text-zinc-600 font-medium uppercase tracking-widest">Processing</span>
      </div>
    {:else if searchQuery}
      {#each searchResults as entry}
        <div class="group flex h-7 cursor-pointer items-center border-l-2 px-4 text-[13px] transition-all duration-150 hover:bg-white/[0.03] {$activeBufferId === entry.path ? 'border-emerald-500 bg-white/5' : 'border-transparent'}" onclick={() => handleEntryClick(entry)}>
          <div class="flex w-5 shrink-0 items-center justify-center"></div>
          <span class="mr-2 flex shrink-0 items-center opacity-60 transition-opacity group-hover:opacity-100 {entry.git_status === 'modified' ? 'text-orange-400' : entry.git_status === 'added' || entry.git_status === 'untracked' ? 'text-green-400' : 'text-emerald-500'}">
            <FileCode size="15" />
          </span>
          <span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-medium transition-colors {$activeBufferId === entry.path || entry.git_status ? 'text-zinc-200' : 'text-zinc-400'} group-hover:text-zinc-200">{entry.name}</span>
          
          <div class="flex w-16 shrink-0 items-center justify-end gap-2 pr-4 ml-auto">
            {#if entry.git_status}
              <span class="text-[10px] font-bold uppercase tracking-tighter opacity-50 {entry.git_status === 'modified' ? 'text-orange-400' : 'text-green-400'}">
                {entry.git_status === 'modified' ? 'M' : 'U'}
              </span>
            {/if}
          </div>
        </div>
      {/each}
    {:else if viewMode === 'drill'}
      {#each entries as entry}
        <div 
          class="group flex h-7 cursor-pointer items-center border-l-2 pl-4 text-[13px] transition-all duration-150 hover:bg-white/[0.03] 
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
              {#if $expandedPaths.has(entry.path)}<FolderOpen size="15" weight="fill" />{:else}<Folder size="15" weight="fill" />{/if}
            {:else}
              <FileCode size="15" />
            {/if}
          </span>
          <span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-medium transition-colors
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
              <button class="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-emerald-400 transition-all cursor-pointer" onclick={(e) => { e.stopPropagation(); pinFolder(entry.path); }} title="Anclar esta carpeta como raíz">
                <Pin size={12} />
              </button>
            {/if}
          </div>
        </div>
      {/each}
    {:else}
      {#each entries as entry}
        <FileTreeItem {entry} depth={0} />
      {/each}
    {/if}
  </div>

  <div class="absolute top-0 right-0 z-[100] h-full w-[2px] cursor-col-resize transition-all duration-300 hover:bg-zinc-600/50" class:bg-zinc-600={isResizing} class:w-[3px]={isResizing} onmousedown={startResizing}></div>
</div>

<style>
  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 10px; }
  .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: #2a2a2a; }
</style>
