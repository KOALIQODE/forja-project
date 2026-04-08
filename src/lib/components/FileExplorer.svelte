<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { Folder, FileCode, ChevronLeft, LogOut, LayoutList, ListTree, FolderPlus, Search, X } from '@lucide/svelte';
  import { connectNvimForComponent, currentBufferId } from '$lib/stores/nvimStore';
  import { currentProject, closeProject, openProject } from '$lib/stores/projectStore';
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

  // Configuración de visualización con persistencia
  const STORAGE_KEY_VIEW = "forja-explorer-view-mode";
  let viewMode = $state<'drill' | 'tree'>((typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY_VIEW) as any) || 'drill');

  $effect(() => {
    localStorage.setItem(STORAGE_KEY_VIEW, viewMode);
  });

  // Resizing state
  const MIN_WIDTH = 180;
  const MAX_WIDTH = 600;
  const DEFAULT_WIDTH = 260;
  let sidebarWidth = $state(DEFAULT_WIDTH);
  let isResizing = $state(false);

  // Search state
  let searchQuery = $state("");
  let searchResults: FileEntry[] = $state([]);
  let isSearching = $state(false);

  // File state
  let entries: FileEntry[] = $state([]);
  let currentPath = $state("");
  let loading = $state(false);

  // Derivados
  let hasProject = $derived(!!$currentProject);
  let canGoUp = $derived(currentPath !== $currentProject);
  let currentFolderName = $derived((viewMode === 'tree' ? ($currentProject || "") : currentPath).split(/[/\\]/).pop() || "Raíz");

  /**
   * Lógica de búsqueda global en el proyecto
   */
  async function handleSearch() {
    if (!searchQuery.trim() || !$currentProject) {
      searchResults = [];
      isSearching = false;
      return;
    }

    isSearching = true;
    try {
      searchResults = await invoke('search_files', { 
        path: $currentProject, 
        query: searchQuery 
      });
    } catch (error) {
      console.error("Error en búsqueda:", error);
    } finally {
      isSearching = false;
    }
  }

  // Debounce para la búsqueda
  let searchTimeout: any;
  function onSearchInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(handleSearch, 300);
  }

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
      if (selected) openProject(selected);
    } catch (error) {
      console.error("Error opening folder:", error);
    }
  }

  async function loadDirectory(path: string) {
    if (!path) return;
    loading = true;
    try {
      currentPath = path;
      entries = await invoke('explore_directory', { path });
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
    currentPath = "";
    entries = [];
    clearSearch();
  }

  function toggleViewMode() {
    if (!hasProject) return;
    viewMode = viewMode === 'drill' ? 'tree' : 'drill';
    if (viewMode === 'tree' && $currentProject) {
      loadDirectory($currentProject);
    }
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
      const content = await invoke('read_file', { path });
      await connectNvimForComponent(path, { filePath: path, content });
    } catch (error) {
      console.error("Error abriendo archivo:", error);
    }
  }

  // Resizer logic
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
    if ($currentProject && currentPath === "") {
      loadDirectory($currentProject);
    }
  });

  onMount(() => {
    if ($currentProject) loadDirectory($currentProject);
  });
</script>

<div 
  class="relative flex shrink-0 flex-col border-r border-zinc-800/50 bg-[#0a0a0a] text-zinc-400 select-none h-full transition-colors duration-300 font-sans" 
  style="width: {sidebarWidth}px;"
>
  <!-- Cabecera -->
  <header class="shrink-0 border-b border-zinc-800/40 bg-[#0a0a0a]/80 backdrop-blur-sm p-3.5 pb-3">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="m-0 text-[10px] font-bold tracking-[0.15em] text-zinc-500 uppercase">
        Explorer
      </h3>
      
      {#if hasProject}
        <div class="flex items-center gap-1">
          <button 
            onclick={toggleViewMode} 
            title="Cambiar modo de vista" 
            class="flex cursor-pointer items-center rounded-md p-1.5 transition-all hover:bg-white/5 hover:text-zinc-200"
          >
            {#if viewMode === 'drill'}
              <ListTree size="14" />
            {:else}
              <LayoutList size="14" />
            {/if}
          </button>
          <button 
            onclick={goHome} 
            title="Cerrar proyecto" 
            class="flex cursor-pointer items-center rounded-md p-1.5 transition-all hover:bg-white/5 hover:text-red-400/80"
          >
            <LogOut size="14" />
          </button>
        </div>
      {/if}
    </div>
    
    {#if hasProject}
      <!-- Barra de Búsqueda Global Pro Max -->
      <div class="relative mb-3 group">
        <div class="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-zinc-600 group-focus-within:text-emerald-500/70 transition-colors">
          <Search size="12" />
        </div>
        <input 
          type="text" 
          bind:value={searchQuery}
          oninput={onSearchInput}
          placeholder="Search files..."
          class="w-full bg-zinc-900/50 border border-zinc-800/50 rounded-lg py-1.5 pl-8 pr-8 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/30 focus:bg-zinc-900/80 transition-all"
        />
        {#if searchQuery}
          <button 
            onclick={clearSearch}
            class="absolute inset-y-0 right-2 flex items-center text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            <X size="12" />
          </button>
        {/if}
      </div>

      <!-- Ruta Actual -->
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

  <!-- Lista de Archivos -->
  <div class="flex-1 overflow-x-hidden overflow-y-auto py-2 custom-scrollbar">
    {#if !hasProject}
      <div class="flex h-full flex-col items-center justify-center p-6 text-center gap-4">
        <div class="rounded-full bg-zinc-900 p-4 text-zinc-600 border border-zinc-800/50">
          <FolderPlus size="24" />
        </div>
        <div>
          <p class="text-[12px] font-semibold text-zinc-400 font-sans">No project opened</p>
          <p class="text-[11px] text-zinc-600 mt-1 px-4 leading-relaxed font-sans">Open a folder to start exploring your files.</p>
        </div>
        <button 
          onclick={handleOpenProject}
          class="mt-2 rounded-md bg-zinc-800 px-4 py-2 text-[11px] font-bold text-zinc-300 transition-all hover:bg-zinc-700 hover:text-white active:scale-95 border border-zinc-700/50 shadow-lg shadow-black/20 cursor-pointer font-sans"
        >
          Open Folder
        </button>
      </div>
    {:else if loading || isSearching}
      <div class="flex flex-col items-center justify-center p-10 gap-3">
        <div class="w-4 h-4 border-2 border-zinc-700 border-t-emerald-500/50 rounded-full animate-spin"></div>
        <span class="text-[10px] text-zinc-600 font-medium uppercase tracking-widest">Searching</span>
      </div>
    {:else if searchQuery}
      <!-- VISTA DE BÚSQUEDA -->
      {#each searchResults as entry}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div 
          class="group flex h-7 cursor-pointer items-center border-l-2 px-4 text-[13px] transition-all duration-150 hover:bg-white/[0.03]
                 {$currentBufferId === entry.path ? 'border-emerald-500 bg-white/5' : 'border-transparent'}" 
          onclick={() => handleEntryClick(entry)}
        >
          <span class="mr-2.5 flex items-center opacity-60 transition-opacity group-hover:opacity-100 text-emerald-500">
            <FileCode size="15" />
          </span>
          <div class="flex flex-col overflow-hidden">
            <span class="overflow-hidden text-ellipsis whitespace-nowrap transition-colors group-hover:text-zinc-200
                         {$currentBufferId === entry.path ? 'text-zinc-200' : 'text-zinc-400'}">
              {entry.name}
            </span>
          </div>
        </div>
      {:else}
        <div class="p-8 text-center text-[11px] text-zinc-600 font-medium italic">No results found</div>
      {/each}
    {:else if viewMode === 'drill'}
      <!-- MODO DRILL-DOWN -->
      {#each entries as entry}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div 
          class="group flex h-7 cursor-pointer items-center border-l-2 px-4 text-[13px] transition-all duration-150 hover:bg-white/[0.03]
                 {$currentBufferId === entry.path ? 'border-emerald-500 bg-white/5' : 'border-transparent'}" 
          class:opacity-40={entry.is_ignored} 
          class:grayscale={entry.is_ignored}
          onclick={() => handleEntryClick(entry)}
        >
          <span class="mr-2.5 flex items-center opacity-60 transition-opacity group-hover:opacity-100" 
                class:text-blue-400={entry.is_dir} 
                class:text-emerald-500={!entry.is_dir && !entry.is_ignored && !entry.git_status}
                class:text-orange-400={entry.git_status === 'modified'}
                class:text-green-400={entry.git_status === 'added' || entry.git_status === 'untracked'}>
            {#if entry.is_dir}
              <Folder size="15" />
            {:else}
              <FileCode size="15" />
            {/if}
          </span>
          <span class="overflow-hidden text-ellipsis whitespace-nowrap transition-colors group-hover:text-zinc-200
                       {$currentBufferId === entry.path || entry.git_status ? 'text-zinc-200' : 'text-zinc-400'}
                       {entry.git_status === 'modified' ? 'text-orange-400/90' : ''}
                       {entry.git_status === 'added' || entry.git_status === 'untracked' ? 'text-green-400/90' : ''}">
            {entry.name}
          </span>

          {#if entry.git_status}
            <span class="ml-auto text-[10px] font-bold uppercase tracking-tighter opacity-50"
                  class:text-orange-400={entry.git_status === 'modified'}
                  class:text-green-400={entry.git_status === 'added' || entry.git_status === 'untracked'}>
              {entry.git_status === 'modified' ? 'M' : 'U'}
            </span>
          {/if}
        </div>
      {:else}
        <div class="p-8 text-center text-[11px] text-zinc-600 font-medium italic">Empty folder</div>
      {/each}
    {:else}
      <!-- MODO TREE-VIEW -->
      {#each entries as entry}
        <FileTreeItem {entry} depth={0} />
      {:else}
        <div class="p-8 text-center text-[11px] text-zinc-600 font-medium italic">Empty project</div>
      {/each}
    {/if}
  </div>

  <!-- Resizer Pro Max: Elegante en Zinc -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    class="absolute top-0 right-0 z-[100] h-full w-[2px] cursor-col-resize transition-all duration-300 hover:bg-zinc-600/50" 
    class:bg-zinc-600={isResizing}
    class:w-[3px]={isResizing}
    onmousedown={startResizing}
  ></div>
</div>

<style>
  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #1a1a1a;
    border-radius: 10px;
  }
  .custom-scrollbar:hover::-webkit-scrollbar-thumb {
    background: #2a2a2a;
  }
</style>
