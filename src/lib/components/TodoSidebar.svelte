<script lang="ts">
    import { todoList, isTodoSidebarOpen, isScanningTodos, scanTodos } from "$lib/stores/todoStore";
    import { openBuffer } from "$lib/stores/bufferStore";
    import { X, RefreshCw, ListTodo, FileText, Hash } from "@lucide/svelte";
    import { fly } from "svelte/transition";

    function closeSidebar() {
        isTodoSidebarOpen.set(false);
    }

    function goToTodo(todo: any) {
        openBuffer(todo.filePath);
        // Dispatch an event to scroll to the line. 
        // Assuming EditorBuffer or similar listens to line changes.
        // For now, opening the buffer is the first step.
        // We might need a way to tell the editor to go to a line.
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
        class="fixed inset-y-0 right-0 z-50 flex h-full flex-col border-l border-zinc-800/50 bg-[#0a0a0a] text-zinc-400 select-none shadow-2xl transition-colors duration-300 font-sans"
        style="width: {sidebarWidth}px;"
        transition:fly={{ x: 320, duration: 300 }}
    >
        <!-- Resize handle -->
        <div
            role="separator"
            aria-label="Resize sidebar"
            class="absolute left-0 top-0 h-full w-1 cursor-col-resize hover:bg-emerald-500/30 transition-colors"
            onmousedown={startResizing}
        ></div>

        <header class="shrink-0 border-b border-zinc-800/40 bg-[#0a0a0a]/80 backdrop-blur-sm p-4">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <ListTodo size="16" class="text-emerald-500" />
                    <h3 class="m-0 text-[11px] font-bold tracking-[0.15em] text-zinc-400 uppercase font-mono">
                        TODO LIST
                    </h3>
                    <span class="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                        {$todoList.length}
                    </span>
                </div>
                <div class="flex items-center gap-1">
                    <button
                        type="button"
                        onclick={scanTodos}
                        title="Refresh TODOs"
                        class="flex cursor-pointer items-center rounded-md p-1.5 transition-all hover:bg-white/5 hover:text-emerald-400"
                        disabled={$isScanningTodos}
                    >
                        <RefreshCw size="14" class={$isScanningTodos ? "animate-spin" : ""} />
                    </button>
                    <button
                        type="button"
                        onclick={closeSidebar}
                        class="flex cursor-pointer items-center rounded-md p-1.5 transition-all hover:bg-white/5 hover:text-red-400/80"
                    >
                        <X size="14" />
                    </button>
                </div>
            </div>
        </header>

        <div class="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
            {#if $isScanningTodos && $todoList.length === 0}
                <div class="flex flex-col items-center justify-center h-40 gap-3">
                    <RefreshCw size="24" class="animate-spin text-emerald-500/50" />
                    <span class="text-[11px] text-zinc-600 font-medium">Scanning project...</span>
                </div>
            {:else if $todoList.length === 0}
                <div class="flex flex-col items-center justify-center h-60 gap-4 p-8 text-center">
                    <div class="rounded-full bg-zinc-900/50 p-4">
                        <ListTodo size="32" class="text-zinc-800" />
                    </div>
                    <div>
                        <p class="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1">No todos found</p>
                        <p class="text-[10px] text-zinc-600">Start adding comments with // TODO: to track your tasks.</p>
                    </div>
                </div>
            {:else}
                <div class="divide-y divide-zinc-800/30">
                    {#each $todoList as todo}
                        <button
                            type="button"
                            onclick={() => goToTodo(todo)}
                            class="w-full text-left p-3.5 hover:bg-emerald-500/[0.03] transition-colors group relative overflow-hidden"
                        >
                            <div class="flex flex-col gap-1.5">
                                <p class="text-[11px] text-zinc-300 line-clamp-2 leading-relaxed font-medium break-words">
                                    {todo.content.replace('// TODO:', '').trim() || 'Empty task'}
                                </p>
                                <div class="flex items-center gap-3">
                                    <div class="flex items-center gap-1 text-zinc-600 group-hover:text-emerald-500/70 transition-colors">
                                        <FileText size="10" />
                                        <span class="text-[9px] font-mono truncate max-w-[120px]">{todo.fileName}</span>
                                    </div>
                                    <div class="flex items-center gap-1 text-zinc-600 group-hover:text-emerald-500/70 transition-colors">
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
        background: rgba(63, 63, 70, 0.4);
        border-radius: 10px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(16, 185, 129, 0.3);
    }
</style>
