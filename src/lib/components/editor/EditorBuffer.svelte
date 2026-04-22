<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { untrack, onMount, onDestroy } from "svelte";
    import { listen } from "@tauri-apps/api/event"; // Correct import for listen in Tauri v2
    import { ask } from "@tauri-apps/plugin-dialog";

    import { EDITOR_CONFIG, TOKEN_COLORS } from "$lib/utils/constants";
    // activeBufferId is not directly used here but might be for other editor-related logic

    interface Props {
        filePath: string;
        bufferId: string; // Assuming bufferId is same as filePath for simplicity
        language: string;
    }

    let { filePath, bufferId, language }: Props = $props();
    console.log(`EditorBuffer initialized for: ${filePath}`);

    const { LINE_HEIGHT, FONT_FAMILY, CHUNK_SIZE } = EDITOR_CONFIG;

    let canvas = $state<HTMLCanvasElement | null>(null);
    let scrollContainer = $state<HTMLElement | null>(null);
    let totalLines = $state(0);
    let currentScrollTop = $state(0);
    let needsRedraw = $state(true);
    let isLoading = $state(false); // Declare isLoading state
    let mouseLine = $state<number | null>(null);
    let cursorVisible = $state(true);

    let lineCache = new Map<number, string>();
    let tokenCache = new Map<number, Token[]>();
    let highlightEnabled = $state(false);

    // State to track the currently loaded file path, to avoid redundant checks
    let currentFilePath = $state<string | null>(null);

    function queueRedraw() {
        needsRedraw = true;
    }

    // Helper functions to interact with backend
    async function fetchTotalLines(): Promise<number> {
        isLoading = true;
        try {
            const count = await invoke<number>("get_total_lines", {
                path: filePath,
            });
            console.log(`fetchTotalLines: ${count} lines for ${filePath}`);
            totalLines = count;
            return count;
        } catch (e) {
            console.error("Failed to get total lines:", e);
            totalLines = 0;
            return 0;
        } finally {
            isLoading = false;
            queueRedraw();
        }
    }

    async function fetchChunk(lineIdx: number) {
        const chunkId = Math.floor(lineIdx / CHUNK_SIZE);
        if (pendingChunks.has(chunkId)) return;

        pendingChunks.add(chunkId);
        isLoading = true;

        const start = chunkId * CHUNK_SIZE;
        const end = Math.min(
            start + CHUNK_SIZE - 1,
            totalLines > 0 ? totalLines - 1 : 0,
        );

        console.log(`fetchChunk: fetching lines ${start} to ${end}`);

        try {
            const fetched = await invoke<string[]>("read_file_lines", {
                path: filePath,
                startLine: start,
                endLine: end,
            });

            console.log(`fetchChunk: received ${fetched.length} lines`);

            fetched.forEach((line, idx) => {
                const actualLineIdx = start + idx;
                lineCache.set(actualLineIdx, line);
                // Ensure totalLines is at least enough to cover the cached lines
                if (actualLineIdx >= totalLines) {
                    totalLines = actualLineIdx + 1;
                }
            });
            if (highlightEnabled) {
                highlightChunk(fetched, start).then(queueRedraw);
            }
            queueRedraw();
        } catch (e) {
            console.error("Chunk Fetch Error:", e);
        } finally {
            pendingChunks.delete(chunkId);
            isLoading = false;
        }
    }

    async function highlightChunk(lines: string[], start: number) {
        try {
            const result = await invoke<SyntaxHighlight>("highlight_syntax", {
                content: lines.join("\n"),
                language: language,
            });
            let lineIdx = start;
            let currentTokens: Token[] = [];
            for (const token of result.tokens) {
                const parts = token.text.split("\n");
                for (let i = 0; i < parts.length; i++) {
                    if (parts[i].length > 0 || i < parts.length - 1) {
                        // Handle non-empty parts or intermediate newlines
                        currentTokens.push({
                            text: parts[i],
                            token_type: token.token_type,
                        });
                    }
                    if (i < parts.length - 1) {
                        // Newline encountered, store and reset for next line
                        tokenCache.set(lineIdx++, currentTokens);
                        currentTokens = [];
                    }
                }
            }
            if (currentTokens.length > 0)
                tokenCache.set(lineIdx, currentTokens); // Store any remaining tokens for the last line
        } catch (e) {
            console.error("Highlight Chunk Error:", e);
        }
    }

    let pendingChunks = new Set<number>(); // Needs to be declared outside `requestChunk`

    function draw() {
        if (!canvas || !scrollContainer) {
            requestAnimationFrame(draw);
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();

        if (rect.width === 0 || rect.height === 0) {
            requestAnimationFrame(draw);
            return;
        }

        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) return;

        if (
            canvas.width !== Math.floor(rect.width * dpr) ||
            canvas.height !== Math.floor(rect.height * dpr)
        ) {
            console.log(
                `Resizing canvas: ${rect.width}x${rect.height} (DPR: ${dpr})`,
            );
            canvas.width = Math.floor(rect.width * dpr);
            canvas.height = Math.floor(rect.height * dpr);
            ctx.scale(dpr, dpr);
            needsRedraw = true;
        }

        if (!needsRedraw) {
            requestAnimationFrame(draw);
            return;
        }
        console.log(`Redrawing canvas at ${new Date().getTime()}`);
        needsRedraw = false;

        ctx.fillStyle = "#0d0d0d";
        ctx.fillRect(0, 0, rect.width, rect.height);

        const scrollPos = untrack(() => currentScrollTop);
        const startLine = Math.floor(scrollPos / LINE_HEIGHT);
        const endLine = Math.min(
            startLine + Math.ceil(rect.height / LINE_HEIGHT) + 1,
            totalLines,
        );
        const yOffset = -(scrollPos % LINE_HEIGHT);

        if (totalLines > 0) {
            // console.log(`Drawing lines ${startLine} to ${endLine}`);
        }

        ctx.font = FONT_FAMILY;
        ctx.textBaseline = "middle";

        for (let i = startLine; i < endLine; i++) {
            const y = (i - startLine) * LINE_HEIGHT + yOffset + LINE_HEIGHT / 2;

            // Draw hover highlight
            if (i === mouseLine) {
                ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
                ctx.fillRect(0, y - LINE_HEIGHT / 2, rect.width, LINE_HEIGHT);
            }

            ctx.fillStyle = "#3a3a3a";
            ctx.textAlign = "right";
            ctx.fillText((i + 1).toString(), 45, y);

            ctx.textAlign = "left";
            const line = lineCache.get(i);

            if (line !== undefined) {
                const tokens = highlightEnabled ? tokenCache.get(i) : null;
                if (tokens) {
                    let x = 65;
                    for (const token of tokens) {
                        ctx.fillStyle =
                            TOKEN_COLORS[token.token_type] ||
                            TOKEN_COLORS.Unknown;
                        ctx.fillText(token.text, x, y);
                        x += ctx.measureText(token.text).width;
                    }
                } else {
                    ctx.fillStyle = "#cccccc";
                    ctx.fillText(line, 65, y);
                }

                // Draw cursor
                if (i === cursorLine && cursorVisible) {
                    const textBeforeCursor = line.substring(0, cursorChar);
                    const cursorX =
                        65 + ctx.measureText(textBeforeCursor).width;
                    ctx.fillStyle = "#34d399"; // Emerald color for the cursor
                    ctx.fillRect(
                        cursorX,
                        y - LINE_HEIGHT / 2 + 2,
                        2,
                        LINE_HEIGHT - 4,
                    );
                }
            } else {
                ctx.fillStyle = "#1a1a1a";
                ctx.fillRect(65, y - 2, 100, 4);
                fetchChunk(i); // Use fetchChunk here
            }
        }

        requestAnimationFrame(draw);
    }

    // --- Basic Editing Support ---
    let cursorLine = $state(0);
    let cursorChar = $state(0);

    function handleClick(e: MouseEvent) {
        if (!canvas || !scrollContainer) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const scrollPos = currentScrollTop;
        const clickedLine = Math.floor((y + scrollPos) / LINE_HEIGHT);

        if (clickedLine >= 0 && clickedLine < totalLines) {
            cursorLine = clickedLine;
            cursorVisible = true; // Show immediately on click
            const lineText = lineCache.get(cursorLine) ?? "";

            // Use measureText to find the character index
            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.font = FONT_FAMILY;
                let bestChar = 0;
                let minDiff = Infinity;

                for (let i = 0; i <= lineText.length; i++) {
                    const width = ctx.measureText(
                        lineText.substring(0, i),
                    ).width;
                    const diff = Math.abs(x - (65 + width));
                    if (diff < minDiff) {
                        minDiff = diff;
                        bestChar = i;
                    }
                }
                cursorChar = bestChar;
            }
            queueRedraw();
        }

        // Focus the container to capture keyboard events
        (e.currentTarget as HTMLElement).focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
        if ((e.ctrlKey || e.metaKey) && e.key === "s") return; // Handled in outer listener

        cursorVisible = true; // Show immediately on typing

        // Stop some defaults
        if (
            [
                "ArrowUp",
                "ArrowDown",
                "ArrowLeft",
                "ArrowRight",
                "Backspace",
                "Enter",
                "Tab",
            ].includes(e.key)
        ) {
            e.preventDefault();
        }

        const currentLineText = lineCache.get(cursorLine) ?? "";

        if (e.key === "Enter") {
            // Simple Enter: break line
            const left = currentLineText.substring(0, cursorChar);
            const right = currentLineText.substring(cursorChar);

            // Shift all subsequent lines in cache
            for (let i = totalLines; i > cursorLine + 1; i--) {
                const prev = lineCache.get(i - 1);
                if (prev !== undefined) lineCache.set(i, prev);
            }

            lineCache.set(cursorLine, left);
            lineCache.set(cursorLine + 1, right);
            totalLines++;
            cursorLine++;
            cursorChar = 0;
            isDirty = true;
            queueRedraw();
        } else if (e.key === "Backspace") {
            if (cursorChar > 0) {
                const newText =
                    currentLineText.substring(0, cursorChar - 1) +
                    currentLineText.substring(cursorChar);
                lineCache.set(cursorLine, newText);
                cursorChar--;
                isDirty = true;
                queueRedraw();
            } else if (cursorLine > 0) {
                // Merge with previous line
                const prevLineText = lineCache.get(cursorLine - 1) ?? "";
                const newCursorChar = prevLineText.length;
                lineCache.set(cursorLine - 1, prevLineText + currentLineText);

                // Shift lines up
                for (let i = cursorLine; i < totalLines - 1; i++) {
                    const next = lineCache.get(i + 1);
                    if (next !== undefined) lineCache.set(i, next);
                }
                lineCache.delete(totalLines - 1);
                totalLines--;
                cursorLine--;
                cursorChar = newCursorChar;
                isDirty = true;
                queueRedraw();
            }
        } else if (e.key.length === 1) {
            // Normal character input
            const newText =
                currentLineText.substring(0, cursorChar) +
                e.key +
                currentLineText.substring(cursorChar);
            lineCache.set(cursorLine, newText);
            cursorChar++;
            isDirty = true;
            queueRedraw();
        } else if (e.key === "ArrowLeft") {
            if (cursorChar > 0) cursorChar--;
            else if (cursorLine > 0) {
                cursorLine--;
                cursorChar = (lineCache.get(cursorLine) ?? "").length;
            }
            queueRedraw();
        } else if (e.key === "ArrowRight") {
            if (cursorChar < currentLineText.length) cursorChar++;
            else if (cursorLine < totalLines - 1) {
                cursorLine++;
                cursorChar = 0;
            }
            queueRedraw();
        } else if (e.key === "ArrowUp") {
            if (cursorLine > 0) {
                cursorLine--;
                cursorChar = Math.min(
                    cursorChar,
                    (lineCache.get(cursorLine) ?? "").length,
                );
            }
            queueRedraw();
        } else if (e.key === "ArrowDown") {
            if (cursorLine < totalLines - 1) {
                cursorLine++;
                cursorChar = Math.min(
                    cursorChar,
                    (lineCache.get(cursorLine) ?? "").length,
                );
            }
            queueRedraw();
        }
    }

    function handleScroll() {
        if (scrollContainer) {
            const newScroll = scrollContainer.scrollTop;
            if (newScroll !== currentScrollTop) {
                currentScrollTop = newScroll;
                queueRedraw();
            }
        }
    }

    let isSaving = $state(false);
    let isDirty = $state(false);

    let lastSaveTime = 0;

    async function saveFile() {
        if (!isDirty || isSaving) return;
        isSaving = true;
        try {
            // ...
            let lines: string[] = [];
            for (let i = 0; i < totalLines; i++) {
                lines.push(lineCache.get(i) ?? "");
            }
            const content = lines.join("\n");
            await invoke("write_file", { path: filePath, content });
            isDirty = false;
            lastSaveTime = Date.now(); // Record save time
        } catch (e) {
            console.error("Save failed:", e);
        } finally {
            isSaving = false;
            queueRedraw();
        }
    }

    // --- Effect de Carga Inicial ---
    // A Svelte effect to react to filePath changes
    $effect(() => {
        // Only proceed if filePath is defined and has actually changed
        if (filePath && filePath !== currentFilePath) {
            console.log(
                "EditorBuffer: filePath changed, resetting and loading new file:",
                filePath,
            );

            // Reset all states related to the previous file
            lineCache.clear();
            tokenCache.clear();
            pendingChunks.clear();
            totalLines = 0;
            currentScrollTop = 0;
            // startLine is now derived, no need to reset it directly
            highlightEnabled = false;

            // Reset scroll position if container exists
            if (scrollContainer) {
                scrollContainer.scrollTop = 0;
            }

            // Load data sequentially
            fetchTotalLines().then(() => {
                // fetchTotalLines updates totalLines state
                // Fetch the initial chunk
                fetchChunk(0);
                queueRedraw();
            });
            currentFilePath = filePath; // Update current path after initiating load
        }
    });
    function handleMouseMove(e: MouseEvent) {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const scrollPos = currentScrollTop;
        const line = Math.floor((y + scrollPos) / LINE_HEIGHT);

        if (line !== mouseLine) {
            mouseLine = line >= 0 && line < totalLines ? line : null;
            queueRedraw();
        }
    }

    function handleMouseLeave() {
        mouseLine = null;
        queueRedraw();
    }

    onMount(() => {
        const raf = requestAnimationFrame(draw);

        const blinkInterval = setInterval(() => {
            cursorVisible = !cursorVisible;
            queueRedraw();
        }, 500);

        const resizeObserver = new ResizeObserver(() => {
            queueRedraw();
        });

        if (canvas) {
            resizeObserver.observe(canvas);
        }

        invoke("watch_directory", {
            path: filePath.substring(0, filePath.lastIndexOf("/")),
        }).catch((e) => console.error("Failed to start directory watcher:", e));

        // 🔧 AQUÍ: Hacer async y await los listeners
        let unlistenFileChanged: (() => void) | null = null;
        let unlistenFocus: (() => void) | null = null;

        (async () => {
            // Escuchar cambios de archivo
            unlistenFileChanged = await listen(
                "file-changed",
                async (event: CustomEvent<string>) => {
                    const changedPath = event.detail;

                    // Ignorar si guardamos hace menos de 1 segundo
                    if (Date.now() - lastSaveTime < 1000) return;

                    if (changedPath === filePath) {
                        const confirmed = await ask(
                            `The file "${changedPath.split(/[\/\\]/).pop()}" has been modified outside the editor. Reload?`,
                            {
                                title: "File Changed Externally",
                                kind: "warning",
                                okLabel: "Reload",
                                cancelLabel: "Cancel",
                            },
                        );

                        if (confirmed) {
                            fetchTotalLines().then(() => {
                                fetchChunk(startLine);
                                queueRedraw();
                            });
                        }
                    }
                },
            );

            // Escuchar foco de ventana
            unlistenFocus = await listen("tauri://focus", async () => {
                console.log("Window focused, refreshing editor state.");
                fetchTotalLines().then(() => {
                    fetchChunk(startLine);
                    queueRedraw();
                });
            });
        })(); // Ejecutar inmediatamente

        // Cleanup en onDestroy
        return () => {
            cancelAnimationFrame(raf);
            clearInterval(blinkInterval);
            resizeObserver.disconnect();

            // Ahora son funciones, no Promises
            if (unlistenFileChanged) unlistenFileChanged();
            if (unlistenFocus) unlistenFocus();
        };
    });
    // --- Derived values for layout ---
    let startLine = $derived(Math.floor(currentScrollTop / LINE_HEIGHT)); // Correctly declare startLine as derived
    let totalHeight = $derived(totalLines * LINE_HEIGHT);
    // let offsetY = $derived(startLine * LINE_HEIGHT); // This is not used

    // --- Types & Colors ---
    interface Token {
        text: string;
        token_type: string;
    }
    interface SyntaxHighlight {
        tokens: Token[];
    }
</script>

<div
    class="relative h-full w-full bg-[#0d0d0d] flex flex-col font-mono text-sm overflow-hidden"
    onkeydown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
            e.preventDefault();
            saveFile();
        } else {
            handleKeyDown(e);
        }
    }}
    tabindex="0"
>
    <!-- Colorful Enhanced Status Bar (Top Right) -->
    <div
        class="absolute top-4 right-6 z-50 flex items-center justify-end pointer-events-none select-none group"
    >
        <div
            class="flex items-center gap-0.5 p-1 bg-[#121212]/80 backdrop-blur-xl border border-white/5 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-500 hover:border-emerald-500/20"
        >
            <!-- File Path Section -->
            <div
                class="px-3 py-1.5 bg-white/5 rounded-lg flex items-center gap-2 border border-white/5"
            >
                {#if isDirty}
                    <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                {/if}
                <span
                    class="text-[11px] font-bold text-zinc-100 tracking-tight"
                >
                    {filePath.split(/[\/\\]/).pop()}
                </span>
            </div>

            <!-- Stats Section -->
            <div class="px-3 py-1.5 flex items-center gap-4">
                <div class="flex flex-col items-end">
                    <span
                        class="text-[9px] uppercase tracking-[0.1em] text-zinc-500 font-bold leading-none mb-0.5"
                        >Lines</span
                    >
                    <span class="text-[11px] text-zinc-300 font-medium"
                        >{totalLines.toLocaleString()}</span
                    >
                </div>
            </div>
        </div>
    </div>

    <!-- Main Canvas Renderer -->
    <canvas
        bind:this={canvas}
        class="absolute inset-0 w-full h-full pointer-events-none"
    ></canvas>

    <!-- Scroll Capturer (Invisible but native) -->
    <div
        class="flex-1 w-full overflow-auto custom-scrollbar relative z-10 outline-none bg-transparent cursor-text"
        bind:this={scrollContainer}
        onscroll={handleScroll}
        onmousedown={handleClick}
        onmousemove={handleMouseMove}
        onmouseleave={handleMouseLeave}
    >
        <div
            style="height: {totalLines * LINE_HEIGHT}px; width: 100%;"
            class="pointer-events-none"
        ></div>
    </div>
</div>

<style>
    .custom-scrollbar::-webkit-scrollbar {
        width: 12px;
        height: 12px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: #1a1a1a;
        border-radius: 6px;
        border: 3px solid #0d0d0d;
    }
    .custom-scrollbar:hover::-webkit-scrollbar-thumb {
        background: #252525;
    }
</style>
