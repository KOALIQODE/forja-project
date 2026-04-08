<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { Folder, FileCode, ChevronLeft, Home, LogOut } from '@lucide/svelte';
  import { connectNvimForComponent, currentBufferId } from '$lib/stores/nvimStore';
  import { BUFFER_IDS } from '$lib/nvim/contentIds';
  import { currentProject, closeProject } from '$lib/stores/projectStore';

  interface FileEntry {
    name: string;
    path: string;
    is_dir: boolean;
    is_ignored: boolean;
  }

  // Resizing state
  const MIN_WIDTH = 150;
  const MAX_WIDTH = 600;
  const DEFAULT_WIDTH = 260;
  
  let sidebarWidth = $state(DEFAULT_WIDTH);
  let isResizing = $state(false);

  let entries: FileEntry[] = $state([]);
  let currentPath = $state("");
  let loading = $state(false);

  // Determinar si podemos subir de nivel (si no estamos en la raíz del proyecto)
  let canGoUp = $derived(currentPath !== $currentProject);
  
  // Nombre de la carpeta actual (última parte de la ruta)
  let currentFolderName = $derived(currentPath.split(/[/\\]/).pop() || "Raíz");

  async function loadDirectory(path: string) {
    if (!path) return;
    loading = true;
    try {
      currentPath = path;
      entries = await invoke('list_directory', { path });
    } catch (error) {
      console.error("Error loading directory:", error);
    } finally {
      loading = false;
    }
  }

  async function goUp() {
    if (!canGoUp) return;
    const parts = currentPath.split(/[/\\]/);
    parts.pop();
    const parentPath = parts.join("/");
    if (parentPath) {
      await loadDirectory(parentPath);
    }
  }

  async function goHome() {
    closeProject();
    currentBufferId.set(BUFFER_IDS.WELCOME_SCREEN);
    currentPath = "";
    entries = [];
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
      console.error("Error opening file:", error);
    }
  }

  // Resizer logic
  function startResizing(e: MouseEvent) {
    isResizing = true;
    e.preventDefault();
  }

  function stopResizing() {
    isResizing = false;
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isResizing) return;
    const newWidth = e.clientX;
    if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
      sidebarWidth = newWidth;
    }
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

<div class="file-explorer" style="width: {sidebarWidth}px;">
  <header class="explorer-header">
    <div class="header-top">
      <h3>Explorador</h3>
      <div class="header-actions">
        <button onclick={goHome} title="Cerrar proyecto" class:active={!$currentProject}>
          <LogOut size="14" />
        </button>
      </div>
    </div>
    
    <div class="path-nav">
      {#if canGoUp}
        <button class="up-btn" onclick={goUp} title="Subir nivel">
          <ChevronLeft size="14" />
        </button>
      {/if}
      <span class="current-folder" title={currentPath}>{currentFolderName}</span>
    </div>
  </header>

  <div class="entries-list">
    {#if loading}
      <div class="loading">Cargando...</div>
    {:else}
      {#each entries as entry}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="entry" class:dimmed={entry.is_ignored} onclick={() => handleEntryClick(entry)}>
          <span class="icon" class:is-folder={entry.is_dir} class:is-file={!entry.is_dir}>
            {#if entry.is_dir}
              <Folder size="16" />
            {:else}
              <FileCode size="16" />
            {/if}
          </span>
          <span class="name">{entry.name}</span>
        </div>
      {:else}
        <div class="empty">Directorio vacío</div>
      {/each}
    {/if}
  </div>

  <!-- Resizer handle -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    class="resizer" 
    class:resizing={isResizing}
    onmousedown={startResizing}
  ></div>
</div>

<style>
  .file-explorer {
    height: 100vh;
    background: #0d0d0d;
    border-right: 1px solid #222;
    display: flex;
    flex-direction: column;
    color: #999;
    font-family: 'Inter', sans-serif;
    user-select: none;
    box-sizing: border-box;
    position: relative;
    flex-shrink: 0;
  }

  .explorer-header {
    padding: 12px 12px 8px 12px;
    border-bottom: 1px solid #222;
    background: #0d0d0d;
    flex-shrink: 0;
  }

  .header-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .header-top h3 {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin: 0;
    color: #555;
  }

  .header-actions button {
    background: transparent;
    border: none;
    color: #444;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    transition: color 0.2s;
  }

  .header-actions button:hover:not(.active) {
    color: #61afef;
  }

  .header-actions button.active {
    color: #333;
    cursor: default;
  }

  .path-nav {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(255,255,255,0.03);
    padding: 4px 8px;
    border-radius: 4px;
    min-height: 24px;
  }

  .up-btn {
    background: transparent;
    border: none;
    color: #666;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    transition: color 0.2s;
  }

  .up-btn:hover {
    color: #eee;
  }

  .current-folder {
    font-size: 11px;
    font-weight: 600;
    color: #bbb;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .entries-list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 4px 0;
  }

  .entry {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.1s ease;
    border-left: 2px solid transparent;
  }

  .entry:hover {
    background: rgba(255, 255, 255, 0.04);
    color: #ccc;
  }

  .entry.dimmed {
    opacity: 0.35;
    filter: grayscale(0.5);
  }

  .entry.dimmed:hover {
    opacity: 0.6;
  }

  .icon {
    margin-right: 10px;
    display: flex;
    align-items: center;
    opacity: 0.7;
  }

  .icon.is-folder {
    color: #61afef;
  }

  .icon.is-file {
    color: #98c379;
  }

  .name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #888;
  }

  .entry:hover .name {
    color: #bbb;
  }

  .loading, .empty {
    padding: 20px;
    font-size: 11px;
    text-align: center;
    color: #444;
  }

  /* Resizer style */
  .resizer {
    position: absolute;
    top: 0;
    right: -2px;
    width: 4px;
    height: 100%;
    cursor: col-resize;
    z-index: 100;
    transition: background 0.2s;
  }

  .resizer:hover, .resizer.resizing {
    background: #4ade80;
  }

  /* Scrollbar personalizada minimalista */
  .entries-list::-webkit-scrollbar {
    width: 3px;
  }
  .entries-list::-webkit-scrollbar-track {
    background: transparent;
  }
  .entries-list::-webkit-scrollbar-thumb {
    background: #222;
    border-radius: 10px;
  }
  .entries-list:hover::-webkit-scrollbar-thumb {
    background: #333;
  }
</style>
