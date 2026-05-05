<script lang="ts">
    import { invoke } from '@tauri-apps/api/core';
    import { listen } from '@tauri-apps/api/event';
    import { ask } from '@tauri-apps/plugin-dialog';

    import {
        ChevronLeft,
        Edit2,
        FolderPlus,
        GitBranch,
        LayoutList,
        ListTodo,
        ListTree,
        LogOut,
        Pin,
        PinOff,
        Plus,
        RefreshCw,
        Trash2,
    } from '@lucide/svelte';
    import { onMount, untrack } from 'svelte';

    import ContextMenu from '../ContextMenu.svelte';
    import FileDrillItem from './FileDrillItem.svelte';
    import FileTreeItem from './FileTreeItem.svelte';

    import { openBuffer } from '$lib/stores/bufferStore';
    import {
        directoryCache,
        expandedPaths,
        inlineAction,
        pinnedPath,
        type FileEntry,
    } from '$lib/stores/explorerStore';
    import {
        programPreferences,
        setProgramPreference,
    } from '$lib/stores/preferencesStore';
    import { closeProject, currentProject } from '$lib/stores/projectStore';
    import { toggleTodoSidebar } from '$lib/stores/todoStore';
    import { activeUITheme } from '$lib/stores/uiThemeStore';

    let themeStyle = $derived(
        Object.entries($activeUITheme.vars).map(([k, v]) => `${k}:${v}`).join(';')
    );

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
    let sidebarWidth = $state(260);
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
    
    onMount(() => {
        const onWindowFocus = () => refresh(true);
        window.addEventListener("focus", onWindowFocus);
    
        // ← agregar estos dos listeners
        let unlistenFileSaved: (() => void) | null = null;
        let unlistenFileChanged: (() => void) | null = null;
    
        (async () => {
            // Cuando el editor guarda — refrescar silencioso
            unlistenFileSaved = await listen("file-saved", () => {
                refresh(true);
            });
    
            // Cuando otro programa cambia un archivo — refrescar silencioso
            unlistenFileChanged = await listen("file-changed", () => {
                refresh(true);
            });
        })();
    
        return () => {
            window.removeEventListener("focus", onWindowFocus);
            if (unlistenFileSaved) unlistenFileSaved();
            if (unlistenFileChanged) unlistenFileChanged();
        };
    });

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

    // Search is not yet wired to a UI input — keeping state for future use.
    async function handleSearch() {
        isSearching = true;
        try {
            searchResults = [];
        } finally {
            isSearching = false;
        }
    }

    // function onSearchInput() { ... }
    function clearSearch() { searchQuery = ''; searchResults = []; }

    function getInlineActionTarget(parentPath?: string) {
        return parentPath || currentPath || effectiveRoot;
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
        if (sidebarWidth !== $programPreferences.explorerWidth) {
            setProgramPreference("explorerWidth", sidebarWidth);
        }
        isResizing = false;
    }

    $effect(() => {
        if (!isResizing && sidebarWidth !== $programPreferences.explorerWidth) {
            sidebarWidth = $programPreferences.explorerWidth;
        }
    });

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

    // File Operations with Inline Action Store
    function createNewFile(parentPath?: string) {
        const target = getInlineActionTarget(parentPath);
        if (!target) return;
        inlineAction.setAction('create_file', target);
    }

    function createNewDirectory(parentPath?: string) {
        const target = getInlineActionTarget(parentPath);
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
    class="relative flex shrink-0 flex-col bg-(--forja-ui-explorer-bg,#0a0a0a) text-(--forja-ui-text-secondary,#a1a1aa) select-none h-full transition-colors duration-300 font-sans"
    data-program-ui
    style="width: {sidebarWidth}px; {themeStyle}"
    onauxclick={(e) => e.preventDefault()}
>
    <header
        class="shrink-0 bg-(--forja-ui-explorer-bg,#0a0a0a) p-3 pb-2"
    >
        <div class="mb-2 flex items-center justify-between">
            <div class="flex items-center gap-2">
                <h3
                    class="m-0 text-[10px] font-bold tracking-[0.12em] text-(--forja-ui-text-muted,#71717a) uppercase font-sans"
                >
                    Explorer
                </h3>
                {#if $pinnedPath}
                    <span
                        class="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-semibold text-(--forja-ui-text-muted,#52525b) uppercase tracking-tighter"
                    >
                        <Pin size="10" /> Focus
                    </span>
                {/if}
            </div>

            {#if hasProject}
                <div class="flex items-center gap-0.5">
                    {#if $pinnedPath}
                        <button
                            type="button"
                            onclick={unpin}
                            title="Volver a la raíz del proyecto"
                            class="flex cursor-pointer items-center p-1.5 transition-colors hover:bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.05)) hover:text-(--forja-ui-text-primary,#f4f4f5)"
                        >
                            <PinOff size="13" />
                        </button>
                    {/if}
                    <button
                        type="button"
                        onclick={toggleTodoSidebar}
                        title="Lista de TODOs del proyecto"
                        class="flex cursor-pointer items-center p-1.5 transition-colors hover:bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.05)) hover:text-(--forja-ui-text-primary,#f4f4f5)"
                    >
                        <ListTodo size="13" />
                    </button>
                    <button
                        type="button"
                        onclick={toggleViewMode}
                        title="Cambiar modo de vista"
                        class="flex cursor-pointer items-center p-1.5 transition-colors hover:bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.05)) hover:text-(--forja-ui-text-primary,#f4f4f5)"
                    >
                        {#if viewMode === "drill"}<ListTree
                                size="13"
                            />{:else}<LayoutList size="13" />{/if}
                    </button>
                    <button
                        type="button"
                        onclick={goHome}
                        title="Cerrar proyecto"
                        class="flex cursor-pointer items-center p-1.5 transition-colors hover:bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.05)) hover:text-(--forja-ui-text-primary,#f4f4f5)"
                        ><LogOut size="13" /></button
                    >
                </div>
            {/if}
        </div>

        {#if hasProject}
            <div
                class="flex min-h-[26px] items-center gap-2 px-2 py-0.5"
            >
                {#if viewMode === "drill" && canGoUp && !searchQuery}
                    <button
                        type="button"
                        class="flex cursor-pointer items-center p-0 text-(--forja-ui-text-muted,#71717a) transition-colors hover:text-(--forja-ui-text-primary,#f4f4f5)"
                        onclick={goUp}
                        title="Subir nivel"
                    >
                        <ChevronLeft size="13" />
                    </button>
                {/if}
                <span
                    class="flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold tracking-tight text-(--forja-ui-text-secondary,#a1a1aa) w-full"
                    title={currentPath}
                >
                    <span class="truncate shrink-0"
                        >{searchQuery ? "Search" : currentFolderName}</span
                    >
                    {#if gitBranch}
                        <span
                            class="ml-auto flex shrink-0 items-center gap-1 rounded-sm bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.05)) px-1.5 py-0.5 text-[10px] font-semibold text-(--forja-ui-text-primary,#f4f4f5)"
                        >
                            <GitBranch size="11" strokeWidth={2.25} />
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
                    class="w-4 h-4 rounded-full border-2 border-transparent border-t-(--forja-ui-text-muted,rgba(113,113,122,0.5)) animate-spin"
                ></div>
                <span
                    class="text-[10px] text-(--forja-ui-text-muted,#71717a) font-bold uppercase tracking-widest"
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
        class="absolute top-0 right-0 z-[100] h-full w-[2px] cursor-col-resize transition-all duration-300 hover:bg-(--forja-ui-explorer-resize,rgba(82,82,91,0.5)) p-0 border-none"
        class:bg-(--forja-ui-explorer-resize,rgba(82,82,91,0.5))={isResizing}
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
        background: var(--forja-ui-explorer-scrollbar, #1e1e1e);
        border-radius: 10px;
    }
    .custom-scrollbar:hover::-webkit-scrollbar-thumb {
        background: var(--forja-ui-explorer-scrollbar-hover, #2e2e2e);
    }
</style>
