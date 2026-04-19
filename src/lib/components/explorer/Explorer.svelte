<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { Folder, FolderOpen, FileCode, ChevronLeft, LogOut, LayoutList, ListTree, FolderPlus, Search, X, RefreshCw, Pin, PinOff, GitBranch } from '@lucide/svelte';
  import { openBuffer, activeBufferId } from '$lib/stores/bufferStore';
  import { currentProject, closeProject, openProject } from '$lib/stores/projectStore';
  import { expandedPaths, directoryCache, pinnedPath } from '$lib/stores/explorerStore';
  import FileTreeItem from './FileTreeItem.svelte';
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
  let gitBranch = $state<string | null>(null);

  let hasProject = $derived(!!$currentProject);
  let effectiveRoot = $derived($pinnedPath || $currentProject);
  let canGoUp = $derived(currentPath !== effectiveRoot);
  let currentFolderName = $derived((viewMode === 'tree' ? (effectiveRoot || "") : currentPath).split(/[/\\]/).pop() || "Raíz");

  async function updateGitBranch() {
    if (!$currentProject) {
      gitBranch = null;
      return;
    }
    try {
      const status = await invoke<any>('git_ahead_behind', { path: $currentProject });
      gitBranch = status.branch;
    } catch (error) {
      console.error("Error fetching git branch:", error);
      gitBranch = null;
    }
  }

  $effect(() => {
    if ($currentProject) {
      updateGitBranch();
    } else {
      gitBranch = null;
    }
  });

  async function refresh(silent = false) {
    if (searchQuery) {
      await handleSearch();
    } else if (currentPath) {
      if (!silent) loading = true;
      try {
        const result = await invoke<FileEntry[]>('explore_directory', { path: currentPath });
        entries = result;
        directoryCache.set(currentPath, result);
        updateGitBranch(); // Aprovechamos para refrescar la rama
      } catch (error) {
        console.error("Error refrescando:", error);
      } finally {
        if (!silent) loading = false;
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

  async function loadDirectory(path: string, silent = false) {
    if (!path) return;
    
    const cached = directoryCache.get(path);
    if (cached) {
      entries = cached;
    } else if (!silent) {
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

  $effect(() => {
    if (effectiveRoot) {
      loadDirectory(effectiveRoot, true);
    }
    
    const onWindowFocus = () => refresh(true);
    window.addEventListener('focus', onWindowFocus);
    
    return () => {
      window.removeEventListener('focus', onWindowFocus);
    };
  });
</script>

<div 
  class="relative flex shrink-0 flex-col border-r border-zinc-800/50 bg-[#0a0a0a] text-zinc-400 select-none h-full transition-colors duration-300 font-sans" 
  style="width: {sidebarWidth}px;"
  onauxclick={(e) => e.preventDefault()}
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
            <button type="button" onclick={unpin} title="Volver a la raíz del proyecto" class="flex cursor-pointer items-center rounded-md p-1.5 transition-all hover:bg-white/5 hover:text-emerald-400">
              <PinOff size="14" />
            </button>
          {/if}
          <button type="button" onclick={toggleViewMode} title="Cambiar modo de vista" class="flex cursor-pointer items-center rounded-md p-1.5 transition-all hover:bg-white/5 hover:text-zinc-200">
            {#if viewMode === 'drill'}<ListTree size="14" />{:else}<LayoutList size="14" />{/if}
          </button>
          <button type="button" onclick={goHome} title="Cerrar proyecto" class="flex cursor-pointer items-center rounded-md p-1.5 transition-all hover:bg-white/5 hover:text-red-400/80"><LogOut size="14" /></button>
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
          <button type="button" onclick={clearSearch} class="absolute inset-y-0 right-2 flex items-center text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer">
            <X size="12" />
          </button>
        {/if}
      </div>

      <div class="flex min-h-[28px] items-center gap-2 rounded-lg bg-zinc-900/50 px-2.5 py-1 border border-zinc-800/30">
        {#if viewMode === 'drill' && canGoUp && !searchQuery}
          <button type="button" class="flex cursor-pointer items-center p-0 text-zinc-500 transition-colors hover:text-zinc-200" onclick={goUp} title="Subir nivel">
            <ChevronLeft size="14" />
          </button>
        {/if}
        <span class="flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-medium tracking-tight text-zinc-400 w-full" title={currentPath}>
          <span class="truncate shrink-0">{searchQuery ? 'Search Results' : currentFolderName}</span>
          {#if gitBranch}
            <span class="flex items-center gap-1 text-[10px] text-emerald-500/90 font-bold border-l border-zinc-800/60 pl-2 ml-auto shrink-0">
              <GitBranch size="11" />
              <span>{gitBranch}</span>
            </span>
          {/if}
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
        <FileDrillItem {entry} {handleEntryClick} {pinFolder} />
      {/each}
    {:else if viewMode === 'drill'}
      {#each entries as entry}
        <FileDrillItem {entry} {handleEntryClick} {pinFolder} />
      {/each}
    {:else}
      {#each entries as entry}
        <FileTreeItem {entry} depth={0} />
      {/each}
    {/if}
  </div>

  <div 
    class="absolute top-0 right-0 z-[100] h-full w-[2px] cursor-col-resize transition-all duration-300 hover:bg-zinc-600/50" 
    class:bg-zinc-600={isResizing} 
    class:w-[3px]={isResizing} 
    onmousedown={startResizing}
    onclick={(e) => { e.preventDefault(); e.stopPropagation(); }}
    role="separator"
    aria-label="Resize sidebar"
    tabindex="0"
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') startResizing(e as any); }}
  ></div>
</div>

<style>
  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 10px; }
  .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: #2a2a2a; }
</style>
