<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { get } from 'svelte/store'
    import {
        Folder,
        FolderOpen,
        FileCode,
        ChevronLeft,
        LogOut,
        LayoutList,
        ListTree,
        Search,
        X,
        Pin,
        PinOff,
        GitBranch,
        Plus,
        FolderPlus,
        Edit2,
        RefreshCw,
        Trash2,
        File as FileIcon
    } from "@lucide/svelte";
    import { openBuffer, activeBufferId } from "$lib/stores/bufferStore";
    import {
        currentProject,
        closeProject,
        openProject,
    } from "$lib/stores/projectStore";
    import {
        expandedPaths,
        directoryCache,
        pinnedPath,
        inlineAction,
        type FileEntry
    } from "$lib/stores/explorerStore";
    import FileDrillItem from "./FileDrillItem.svelte";
    import FileTreeItem from "./FileTreeItem.svelte";
    import ContextMenu from "../ContextMenu.svelte";
    import { open as openDialog, ask } from "@tauri-apps/plugin-dialog";
    import { untrack, onMount } from "svelte";

    const STORAGE_KEY_VIEW = "forja-explorer-view-mode";
    let viewMode = $state<"drill" | "tree">(
        (typeof localStorage !== "undefined" &&
            (localStorage.getItem(STORAGE_KEY_VIEW) as any)) ||
            "drill",
    );

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
    let currentFolderName = $derived(
        (viewMode === "tree" ? effectiveRoot || "" : currentPath)
            .split(/[\/\\]/)
            .pop() || "Raíz",
    );

    // Context Menu State
    let contextMenu = $state<{ x: number, y: number, options: any[] } | null>(null);

    async function updateGitBranch() {
        if (!effectiveRoot) {
            gitBranch = null;
            return;
        }
        try {
            const status = await invoke<any>("git_ahead_behind", {
                path: effectiveRoot,
            });
            gitBranch = status.branch;
        } catch (error) {
            console.error("Explorer: Error fetching git branch:", error);
            gitBranch = null;
        }
    }

    async function refresh(silent = false) {
        if (searchQuery) {
            await handleSearch();
        } else if (currentPath) {
            await loadDirectory(currentPath, silent);
        } else if (effectiveRoot) {
            await loadDirectory(effectiveRoot, silent);
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
            searchResults = await invoke("search_files", {
                path: effectiveRoot,
                query: searchQuery,
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

    const ITEM_HEIGHT = 28;
    let visibleHeight = $state(0);
    let scrollTop = $state(0);

    let flattenedItems = $derived.by(() => {
        if (searchQuery) return searchResults;
        if (viewMode === "drill") return entries;
    
        const cache = $directoryCache;
        const expanded = $expandedPaths;
    
        const items: (FileEntry & { depth: number })[] = [];
        const stack: { entry: FileEntry; depth: number }[] = entries
            .slice()
            .reverse()
            .map((entry) => ({ entry, depth: 0 }));
    
        while (stack.length > 0) {
            const { entry, depth } = stack.pop()!;
            items.push({ ...entry, depth });
    
            if (entry.is_dir && expanded.has(entry.path)) {
                const cached = cache.get(entry.path);
    
                if (cached) {
                    for (let i = cached.length - 1; i >= 0; i--) {
                        stack.push({
                            entry: cached[i],
                            depth: depth + 1,
                        });
                    }
                }
            }
        }
    
        return items;
    });

    let startIndex = $derived(
        Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 5),
    );
    let endIndex = $derived(
        Math.min(
            flattenedItems.length,
            startIndex + Math.ceil(visibleHeight / ITEM_HEIGHT) + 10,
        ),
    );
    let visibleItems = $derived(flattenedItems.slice(startIndex, endIndex));
    let totalHeight = $derived(flattenedItems.length * ITEM_HEIGHT);
    let offsetY = $derived(startIndex * ITEM_HEIGHT);

    async function handleEntryClick(entry: FileEntry) {
        if (entry.is_dir) {
            if (viewMode === "drill") {
                await loadDirectory(entry.path);
            } else {
                expandedPaths.toggle(entry.path);
                if (
                    $expandedPaths.has(entry.path) &&
                    !directoryCache.get(entry.path)
                ) {
                    try {
                        const res = await invoke<FileEntry[]>(
                            "explore_directory",
                            { path: entry.path },
                        );
                        directoryCache.set(entry.path, res);
                    } catch (e) {
                        console.error(e);
                    }
                }
            }
        } else {
            openBuffer(entry.path);
        }
    }

    function pinFolder(path: string) {
        pinnedPath.pin(path);
    }

    async function loadDirectory(path: string, silent = false) {
        if (!path) return;
        if (!silent) loading = true;
        try {
            currentPath = path;
            const result = await invoke<FileEntry[]>("explore_directory", {
                path: path,
            });
            entries = result;
            directoryCache.set(path, result);
            updateGitBranch();
        } catch (error) {
            console.error("Explorer: Error explorando:", error);
        } finally {
            loading = false;
        }
    }

    async function goUp() {
        if (!canGoUp) return;
        const parts = currentPath.split(/[\/\\]/);
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
        viewMode = viewMode === "drill" ? "tree" : "drill";
        if (viewMode === "tree" && effectiveRoot) {
            loadDirectory(effectiveRoot);
        }
    }

    function unpin() {
        pinnedPath.unpin();
        if ($currentProject) loadDirectory($currentProject);
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
            window.addEventListener("mousemove", handleMouseMove);
            window.addEventListener("mouseup", stopResizing);
        } else {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", stopResizing);
        }
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", stopResizing);
        };
    });

    onMount(() => {
        const onWindowFocus = () => refresh(true);
        window.addEventListener("focus", onWindowFocus);
        return () => {
            window.removeEventListener("focus", onWindowFocus);
        };
    });

    // File Operations with Inline Action Store
    function createNewFile(parentPath?: string) {
        const target = parentPath || currentPath || effectiveRoot;
        if (!target) return;
        inlineAction.setAction('create_file', target);
    }

    function createNewDirectory(parentPath?: string) {
        const target = parentPath || currentPath || effectiveRoot;
        if (!target) return;
        inlineAction.setAction('create_dir', target);
    }

    function startRename(entry: FileEntry) {
        inlineAction.setAction('rename', entry.path);
    }

    async function deleteEntry(entry: FileEntry) {
        const confirmed = await ask(`¿Estás seguro de que deseas eliminar "${entry.name}"?`, {
            title: 'Confirmar eliminación',
            kind: 'warning'
        });

        if (confirmed) {
            try {
                await invoke('delete_entry', { path: entry.path });
                refresh();
            } catch (e) {
                console.error("Error deleting:", e);
            }
        }
    }

    function handleContextMenu(e: MouseEvent, entry?: FileEntry) {
        e.preventDefault();
        e.stopPropagation();

        const options = [];

        if (entry) {
            if (entry.is_dir) {
                options.push({ label: 'New File', icon: Plus, onClick: () => createNewFile(entry.path) });
                options.push({ label: 'New Folder', icon: FolderPlus, onClick: () => createNewDirectory(entry.path) });
                options.push({ separator: true });
                options.push({ label: 'Pin as Root', icon: Pin, onClick: () => pinFolder(entry.path) });
            }
            options.push({ label: 'Rename', icon: Edit2, onClick: () => startRename(entry) });
            options.push({ label: 'Delete', icon: Trash2, danger: true, onClick: () => deleteEntry(entry) });
        } else {
            // Context menu for empty area
            options.push({ label: 'New File', icon: Plus, onClick: () => createNewFile() });
            options.push({ label: 'New Folder', icon: FolderPlus, onClick: () => createNewDirectory() });
            options.push({ separator: true });
            options.push({ label: 'Refresh', icon: RefreshCw, onClick: () => refresh() });
        }

        contextMenu = { x: e.clientX, y: e.clientY, options };
    }

    // React to inlineAction completion to refresh
    $effect(() => {
        if ($inlineAction === null) {
            untrack(() => refresh(true));
        }
    });

    $effect(() => {
        if (effectiveRoot) {
            untrack(() => {
                loadDirectory(effectiveRoot, true);
            });
        } else {
            entries = [];
            currentPath = "";
        }
    });

    function handleContainerScroll(e: Event) {
        const target = e.target as HTMLElement;
        scrollTop = target.scrollTop;
    }

    function handleResizeContainer(node: HTMLElement) {
        const updateHeight = () => {
            visibleHeight = node.clientHeight;
        };
        updateHeight();
        const observer = new ResizeObserver(updateHeight);
        observer.observe(node);
        return { destroy: () => observer.disconnect() };
    }
</script>

<div
    class="relative flex shrink-0 flex-col border-r border-zinc-800/50 bg-[#0a0a0a] text-zinc-400 select-none h-full transition-colors duration-300 font-sans"
    style="width: {sidebarWidth}px;"
    onauxclick={(e) => e.preventDefault()}
>
    <header
        class="shrink-0 border-b border-zinc-800/40 bg-[#0a0a0a]/80 backdrop-blur-sm p-3.5 pb-3"
    >
        <div class="mb-3 flex items-center justify-between">
            <div class="flex items-center gap-2">
                <h3
                    class="m-0 text-[10px] font-bold tracking-[0.15em] text-zinc-500 uppercase font-mono"
                >
                    Explorer
                </h3>
                {#if $pinnedPath}
                    <span
                        class="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-500 uppercase tracking-tighter font-mono"
                    >
                        <Pin size="10" /> Focus
                    </span>
                {/if}
            </div>

            {#if hasProject}
                <div class="flex items-center gap-1">
                    <button
                        type="button"
                        onclick={() => createNewFile()}
                        title="New File"
                        class="flex cursor-pointer items-center rounded-md p-1.5 transition-all hover:bg-white/5 hover:text-emerald-400"
                    >
                        <Plus size="14" />
                    </button>
                    <button
                        type="button"
                        onclick={() => createNewDirectory()}
                        title="New Folder"
                        class="flex cursor-pointer items-center rounded-md p-1.5 transition-all hover:bg-white/5 hover:text-emerald-400"
                    >
                        <FolderPlus size="14" />
                    </button>
                    <button
                        type="button"
                        onclick={() => refresh()}
                        title="Refresh"
                        class="flex cursor-pointer items-center rounded-md p-1.5 transition-all hover:bg-white/5 hover:text-emerald-400"
                    >
                        <RefreshCw
                            size="14"
                            class={loading ? "animate-spin" : ""}
                        />
                    </button>
                    {#if $pinnedPath}
                        <button
                            type="button"
                            onclick={unpin}
                            title="Volver a la raíz del proyecto"
                            class="flex cursor-pointer items-center rounded-md p-1.5 transition-all hover:bg-white/5 hover:text-emerald-400"
                        >
                            <PinOff size="14" />
                        </button>
                    {/if}
                    <button
                        type="button"
                        onclick={toggleViewMode}
                        title="Cambiar modo de vista"
                        class="flex cursor-pointer items-center rounded-md p-1.5 transition-all hover:bg-white/5 hover:text-zinc-200"
                    >
                        {#if viewMode === "drill"}<ListTree
                                size="14"
                            />{:else}<LayoutList size="14" />{/if}
                    </button>
                    <button
                        type="button"
                        onclick={goHome}
                        title="Cerrar proyecto"
                        class="flex cursor-pointer items-center rounded-md p-1.5 transition-all hover:bg-white/5 hover:text-red-400/80"
                        ><LogOut size="14" /></button
                    >
                </div>
            {/if}
        </div>

        {#if hasProject}
            <div class="relative mb-3 group">
                <div
                    class="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-zinc-600 group-focus-within:text-emerald-500/70 transition-colors"
                >
                    <Search size="12" />
                </div>
                <input
                    type="text"
                    bind:value={searchQuery}
                    oninput={onSearchInput}
                    placeholder="Search files..."
                    class="w-full bg-zinc-900/50 border border-zinc-800/50 rounded-lg py-1.5 pl-8 pr-8 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/30 focus:bg-zinc-900/80 transition-all font-medium"
                />
                {#if searchQuery}
                    <button
                        type="button"
                        onclick={clearSearch}
                        class="absolute inset-y-0 right-2 flex items-center text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer"
                    >
                        <X size="12" />
                    </button>
                {/if}
            </div>

            <div
                class="flex min-h-[28px] items-center gap-2 rounded-lg bg-zinc-900/50 px-2.5 py-1 border border-zinc-800/30"
            >
                {#if viewMode === "drill" && canGoUp && !searchQuery}
                    <button
                        type="button"
                        class="flex cursor-pointer items-center p-0 text-zinc-500 transition-colors hover:text-zinc-200"
                        onclick={goUp}
                        title="Subir nivel"
                    >
                        <ChevronLeft size="14" />
                    </button>
                {/if}
                <span
                    class="flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-medium tracking-tight text-zinc-400 w-full font-mono"
                    title={currentPath}
                >
                    <span class="truncate shrink-0"
                        >{searchQuery ? "Search" : currentFolderName}</span
                    >
                    {#if gitBranch}
                        <span
                            class="flex items-center gap-1 text-[10px] text-emerald-500/90 font-bold border-l border-zinc-800/60 pl-2 ml-auto shrink-0"
                        >
                            <GitBranch size="11" />
                            <span>{gitBranch}</span>
                        </span>
                    {/if}
                </span>
            </div>
        {/if}
    </header>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="flex-1 overflow-auto custom-scrollbar relative"
        use:handleResizeContainer
        onscroll={handleContainerScroll}
        oncontextmenu={(e) => handleContextMenu(e)}
    >
        {#if loading || isSearching}
            <div class="flex flex-col items-center justify-center p-10 gap-3">
                <div
                    class="w-4 h-4 border-2 border-zinc-700 border-t-emerald-500/50 rounded-full animate-spin"
                ></div>
                <span
                    class="text-[10px] text-zinc-600 font-medium uppercase tracking-widest font-mono"
                    >Loading</span
                >
            </div>
        {:else}
            <div
                style="height: {totalHeight}px; width: 1px;"
                class="pointer-events-none"
            ></div>

            <div
                class="absolute top-0 left-0 w-full pointer-events-none"
                style="transform: translate3d(0, {offsetY}px, 0);"
            >
                <div class="pointer-events-auto">
                    {#each visibleItems as item (item.path)}
                        {#if viewMode === "tree" || searchQuery}
                            <FileTreeItem
                                entry={item}
                                depth={item.depth || 0}
                                {handleEntryClick}
                                isVirtual={true}
                                onContextMenu={handleContextMenu}
                            />
                        {:else}
                            <FileDrillItem
                                entry={item}
                                {handleEntryClick}
                                {pinFolder}
                                onContextMenu={handleContextMenu}
                            />
                        {/if}
                    {/each}
                </div>
            </div>
        {/if}
    </div>

    <button
        class="absolute top-0 right-0 z-[100] h-full w-[2px] cursor-col-resize transition-all duration-300 hover:bg-zinc-600/50 p-0 border-none"
        class:bg-zinc-600={isResizing}
        class:w-[3px]={isResizing}
        onmousedown={startResizing}
        onclick={(e) => {
            e.preventDefault();
            e.stopPropagation();
        }}
        onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") startResizing(e as any);
        }}
        aria-label="Resize sidebar"
        tabindex="0"
    ></button>
</div>

{#if contextMenu}
  <ContextMenu 
    x={contextMenu.x} 
    y={contextMenu.y} 
    options={contextMenu.options} 
    close={() => contextMenu = null} 
  />
{/if}

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
