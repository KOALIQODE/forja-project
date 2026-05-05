<script lang="ts">
    import { todoList, isTodoSidebarOpen, isScanningTodos, scanTodos } from "$lib/stores/todoStore";
    import { openBuffer } from "$lib/stores/bufferStore";
    import { activeUITheme } from "$lib/stores/uiThemeStore";
    import { X, RefreshCw, ListTodo, FileText, Hash } from "@lucide/svelte";
    import { fly } from "svelte/transition";

    let themeStyle = $derived(
        Object.entries($activeUITheme.vars).map(([k, v]) => `${k}:${v}`).join(';')
    );

    function closeSidebar() {
        isTodoSidebarOpen.set(false);
    }

    function goToTodo(todo: any) {
        openBuffer(todo.filePath);
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('go-to-line', {
                detail: { filePath: todo.filePath, line: todo.lineNum }
            }));
        }, 100);
    }

    const MIN_WIDTH = 250;
    const MAX_WIDTH = 600;
    let sidebarWidth = $state(320);
    let isResizing = $state(false);

    function startResizing(e: MouseEvent) {
        isResizing = true;
        e.preventDefault();
    }

    function stopResizing() {
        isResizing = false;
    }

    function handleMouseMove(e: MouseEvent) {
        if (!isResizing) return;
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
            sidebarWidth = newWidth;
        }
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
</script>

{#if $isTodoSidebarOpen}
    <div
        class="fixed inset-y-0 right-0 z-50 flex h-full flex-col border-l select-none shadow-2xl transition-colors duration-300 font-sans
               bg-(--forja-ui-explorer-bg,#0a0a0a) border-(--forja-ui-picker-border,#2a2a2e) text-(--forja-ui-text-secondary,#a1a1aa)"
        style="width: {sidebarWidth}px; {themeStyle}"
        transition:fly={{ x: 320, duration: 300 }}
    >
        <!-- Resize handle -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_no_noninteractive_tabindex -->
        <div
            role="separator"
            aria-label="Resize sidebar"
            aria-orientation="vertical"
            tabindex="0"
            class="resize-handle absolute left-0 top-0 h-full w-1 cursor-col-resize focus:outline-none transition-colors"
            onmousedown={startResizing}
            onkeydown={(e) => {
                if (e.key === 'ArrowLeft') sidebarWidth = Math.min(sidebarWidth + 10, MAX_WIDTH);
                if (e.key === 'ArrowRight') sidebarWidth = Math.max(sidebarWidth - 10, MIN_WIDTH);
            }}
        ></div>

        <header class="shrink-0 border-b backdrop-blur-sm p-4
                       border-(--forja-ui-picker-border,#2a2a2e) bg-(--forja-ui-explorer-bg,#0a0a0a)/80">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <ListTodo size="16" class="text-(--forja-ui-gradient-from,#34d399)" />
                    <h3 class="m-0 text-[11px] font-bold tracking-[0.15em] uppercase font-mono
                               text-(--forja-ui-text-secondary,#a1a1aa)">
                        TODO LIST
                    </h3>
                    <span class="rounded-sm px-2 py-0.5 text-[10px]
                                 bg-(--forja-ui-btn-bg,#09090b) text-(--forja-ui-text-muted,#71717a)">
                        {$todoList.length}
                    </span>
                </div>
                <div class="flex items-center gap-1">
                    <button
                        type="button"
                        onclick={scanTodos}
                        title="Refresh TODOs"
                        class="flex cursor-pointer items-center p-1.5 transition-all
                               hover:bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.05))
                               hover:text-(--forja-ui-picker-active-text,#34d399)"
                        disabled={$isScanningTodos}
                    >
                        <RefreshCw size="14" class={$isScanningTodos ? "animate-spin" : ""} />
                    </button>
                    <button
                        type="button"
                        onclick={closeSidebar}
                        class="close-btn flex cursor-pointer items-center p-1.5 transition-all
                               hover:bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.05))"
                    >
                        <X size="14" />
                    </button>
                </div>
            </div>
        </header>

        <div class="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
            {#if $isScanningTodos && $todoList.length === 0}
                <div class="flex flex-col items-center justify-center h-40 gap-3">
                    <RefreshCw size="24" class="animate-spin text-(--forja-ui-gradient-from,#34d399)/50" />
                    <span class="text-[11px] font-medium text-(--forja-ui-text-muted,#71717a)">Scanning project...</span>
                </div>
            {:else if $todoList.length === 0}
                <div class="flex flex-col items-center justify-center h-60 gap-4 p-8 text-center">
                    <div class="p-4 bg-(--forja-ui-btn-bg,#09090b)/50">
                        <ListTodo size="32" class="text-(--forja-ui-text-muted,#71717a)/40" />
                    </div>
                    <div>
                        <p class="text-[11px] font-bold uppercase tracking-widest mb-1
                                  text-(--forja-ui-text-muted,#71717a)">No todos found</p>
                        <p class="text-[10px] text-(--forja-ui-text-muted,#71717a)/70">
                            Start adding comments with // TODO: to track your tasks.
                        </p>
                    </div>
                </div>
            {:else}
                <div class="todo-list">
                    {#each $todoList as todo}
                        <button
                            type="button"
                            onclick={() => goToTodo(todo)}
                            class="todo-item w-full text-left p-3.5 transition-colors group relative overflow-hidden"
                        >
                            <div class="flex flex-col gap-1.5">
                                <p class="text-[11px] line-clamp-2 leading-relaxed font-medium break-words
                                          text-(--forja-ui-text-primary,#f4f4f5)">
                                    {todo.content.replace('// TODO:', '').trim() || 'Empty task'}
                                </p>
                                <div class="flex items-center gap-3">
                                    <div class="todo-meta flex items-center gap-1 transition-colors">
                                        <FileText size="10" />
                                        <span class="text-[9px] font-mono truncate max-w-[120px]">{todo.fileName}</span>
                                    </div>
                                    <div class="todo-meta flex items-center gap-1 transition-colors">
                                        <Hash size="10" />
                                        <span class="text-[9px] font-mono">{todo.lineNum}</span>
                                    </div>
                                </div>
                            </div>
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .custom-scrollbar::-webkit-scrollbar {
        width: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: var(--forja-ui-explorer-scrollbar, rgba(63, 63, 70, 0.4));
        border-radius: 10px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: color-mix(in srgb, var(--forja-ui-gradient-from, #34d399) 30%, transparent);
    }

    .resize-handle:hover,
    .resize-handle:focus {
        background: color-mix(in srgb, var(--forja-ui-gradient-from, #34d399) 30%, transparent);
    }

    .close-btn:hover {
        color: color-mix(in srgb, var(--forja-ui-git-deleted, #f87171) 80%, transparent);
    }

    .todo-list {
        display: flex;
        flex-direction: column;
    }

    .todo-item {
        border-bottom: 1px solid color-mix(in srgb, var(--forja-ui-picker-border, #2a2a2e) 50%, transparent);
        background: transparent;
        cursor: pointer;
    }

    .todo-item:hover {
        background: var(--forja-ui-picker-active, rgba(52, 211, 153, 0.08));
    }

    .todo-meta {
        color: var(--forja-ui-text-muted, #71717a);
    }

    .todo-item:hover .todo-meta {
        color: color-mix(in srgb, var(--forja-ui-picker-active-text, #34d399) 70%, transparent);
    }
</style>
