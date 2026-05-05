<script lang="ts">
    import { todoList, isTodoSidebarOpen, isScanningTodos, scanTodos } from "$lib/stores/todoStore";
    import { openBuffer } from "$lib/stores/bufferStore";
    import { activeUITheme } from "$lib/stores/uiThemeStore";
    import { X, RefreshCw } from "@lucide/svelte";
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
        class="fixed inset-y-0 right-0 z-50 flex h-full flex-col border-l select-none
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

        <header class="shrink-0 border-b px-3 py-2 flex items-center justify-between
                       border-(--forja-ui-picker-border,#2a2a2e) bg-(--forja-ui-explorer-bg,#0a0a0a)">
            <div class="flex items-center gap-1.5">
                <span class="text-[11px] font-semibold uppercase tracking-wider font-mono
                             text-(--forja-ui-text-muted,#71717a)">
                    TODO
                </span>
                <span class="text-[10px] font-mono text-(--forja-ui-text-muted,#71717a)/60">
                    ({$todoList.length})
                </span>
            </div>
            <div class="flex items-center gap-0.5">
                <button
                    type="button"
                    onclick={scanTodos}
                    title="Refresh TODOs"
                    class="flex cursor-pointer items-center p-1 transition-colors
                           text-(--forja-ui-text-muted,#71717a)
                           hover:text-(--forja-ui-text-secondary,#a1a1aa)"
                    disabled={$isScanningTodos}
                >
                    <RefreshCw size="13" class={$isScanningTodos ? "animate-spin" : ""} />
                </button>
                <button
                    type="button"
                    onclick={closeSidebar}
                    class="close-btn flex cursor-pointer items-center p-1 transition-colors
                           text-(--forja-ui-text-muted,#71717a)
                           hover:text-(--forja-ui-text-secondary,#a1a1aa)"
                >
                    <X size="13" />
                </button>
            </div>
        </header>

        <div class="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
            {#if $isScanningTodos && $todoList.length === 0}
                <div class="flex items-center gap-2 px-3 py-2">
                    <RefreshCw size="12" class="animate-spin text-(--forja-ui-text-muted,#71717a)" />
                    <span class="text-[11px] font-mono text-(--forja-ui-text-muted,#71717a)">Scanning...</span>
                </div>
            {:else if $todoList.length === 0}
                <p class="px-3 py-2 text-[11px] font-mono text-(--forja-ui-text-muted,#71717a)">
                    No TODOs found.
                </p>
            {:else}
                <div class="todo-list">
                    {#each $todoList as todo}
                        {@const colonIdx = todo.content.indexOf(':')}
                        {@const title = (colonIdx !== -1 ? todo.content.slice(colonIdx + 1).trim() : todo.content.trim()) || 'Empty task'}
                        <button
                            type="button"
                            onclick={() => goToTodo(todo)}
                            class="todo-item w-full text-left px-3 py-2 transition-colors"
                        >
                            <p class="text-[12px] font-mono leading-snug break-words
                                      text-(--forja-ui-text-primary,#f4f4f5)">
                                {title}
                            </p>
                            <div class="flex items-center gap-1.5 mt-1">
                                <span class="text-[11px] font-mono text-(--forja-ui-text-secondary,#a1a1aa)">{todo.fileName}</span>
                                <span class="text-[11px] font-mono text-(--forja-ui-text-secondary,#a1a1aa)">:{todo.lineNum}</span>
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

    .resize-handle:hover,
    .resize-handle:focus {
        background: color-mix(in srgb, var(--forja-ui-gradient-from, #34d399) 30%, transparent);
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
        background: var(--forja-ui-picker-active, rgba(52, 211, 153, 0.06));
    }
</style>
