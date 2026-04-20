<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { untrack, onMount } from 'svelte';
  import { EDITOR_CONFIG, TOKEN_COLORS } from '$lib/utils/constants';

  interface Props {
    filePath: string;
    bufferId: string;
    language: string; 
  }

  let { filePath, bufferId, language }: Props = $props();

  const { LINE_HEIGHT, FONT_FAMILY, CHUNK_SIZE } = EDITOR_CONFIG;
  
  let canvas = $state<HTMLCanvasElement | null>(null);
  let scrollContainer = $state<HTMLElement | null>(null);
  let totalLines = $state(0);
  let currentScrollTop = $state(0); 
  let needsRedraw = $state(true);
  
  let lineCache = new Map<number, string>();
  let tokenCache = new Map<number, Token[]>();
  let highlightEnabled = $state(false);

  function queueRedraw() {
    needsRedraw = true;
  }

  function draw() {
    if (!canvas || !scrollContainer) {
        requestAnimationFrame(draw);
        return;
    }

    if (!needsRedraw) {
        requestAnimationFrame(draw);
        return;
    }

    needsRedraw = false;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
    }

    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Usar untrack para leer el scroll sin disparar el efecto de Svelte, 
    // ya que el redibujo lo controlamos nosotros
    const scrollPos = untrack(() => currentScrollTop);
    const startLine = Math.floor(scrollPos / LINE_HEIGHT);
    const endLine = Math.min(startLine + Math.ceil(rect.height / LINE_HEIGHT) + 1, totalLines);
    const yOffset = -(scrollPos % LINE_HEIGHT);

    ctx.font = FONT_FAMILY;
    ctx.textBaseline = 'middle';

    for (let i = startLine; i < endLine; i++) {
        const y = (i - startLine) * LINE_HEIGHT + yOffset + (LINE_HEIGHT / 2);
        
        ctx.fillStyle = '#3a3a3a';
        ctx.textAlign = 'right';
        ctx.fillText((i + 1).toString(), 45, y);

        ctx.textAlign = 'left';
        const line = lineCache.get(i);
        
        if (line !== undefined) {
            const tokens = highlightEnabled ? tokenCache.get(i) : null;
            if (tokens) {
                let x = 65;
                for (const token of tokens) {
                    ctx.fillStyle = TOKEN_COLORS[token.token_type] || TOKEN_COLORS.Unknown;
                    ctx.fillText(token.text, x, y);
                    x += ctx.measureText(token.text).width;
                }
            } else {
                ctx.fillStyle = '#cccccc';
                ctx.fillText(line, 65, y);
            }
        } else {
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(65, y - 2, 100, 4);
            requestChunk(i);
        }
    }

    requestAnimationFrame(draw);
  }

  let pendingChunks = new Set<number>();
  async function requestChunk(lineIdx: number) {
    const chunkId = Math.floor(lineIdx / CHUNK_SIZE);
    if (pendingChunks.has(chunkId)) return;
    
    pendingChunks.add(chunkId);
    const start = chunkId * CHUNK_SIZE;
    const end = start + CHUNK_SIZE;

    try {
      const fetched = await invoke<string[]>('read_file_lines', { 
        path: filePath, 
        startLine: start, 
        endLine: Math.min(end, totalLines - 1)
      });
      
      fetched.forEach((line, idx) => lineCache.set(start + idx, line));
      if (highlightEnabled) {
          highlightChunk(fetched, start).then(queueRedraw);
      }
      queueRedraw();
    } catch (e) {
      console.error("Chunk Fetch Error:", e);
    }
  }

  async function highlightChunk(lines: string[], start: number) {
    try {
      const result = await invoke<SyntaxHighlight>('highlight_syntax', {
        content: lines.join('\n'),
        language: language,
      });
      let lineIdx = start;
      let currentTokens: Token[] = [];
      for (const token of result.tokens) {
        const parts = token.text.split('\n');
        for (let i = 0; i < parts.length; i++) {
          if (parts[i].length > 0 || i < parts.length - 1) {
             currentTokens.push({ text: parts[i], token_type: token.token_type });
          }
          if (i < parts.length - 1) {
            tokenCache.set(lineIdx++, currentTokens);
            currentTokens = [];
          }
        }
      }
      if (currentTokens.length > 0) tokenCache.set(lineIdx, currentTokens);
    } catch (e) {
      console.error("Highlight Chunk Error:", e);
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

  $effect(() => {
    const path = filePath;
    untrack(async () => {
      lineCache.clear();
      tokenCache.clear();
      pendingChunks.clear();
      totalLines = 0;
      currentScrollTop = 0;
      if (scrollContainer) scrollContainer.scrollTop = 0;
      
      try {
          const count = await invoke<number>('get_total_lines', { path });
          totalLines = count;
          requestChunk(0);
          queueRedraw();
      } catch (e) {
          console.error("Initial Load Error:", e);
      }
    });
  });

  onMount(() => {
    const raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  });

  interface Token { text: string; token_type: string; }
  interface SyntaxHighlight { tokens: Token[]; }
</script>

<div class="relative h-full w-full bg-[#0d0d0d] flex overflow-hidden">
  <div class="absolute top-0 right-0 z-50 p-1.5 px-4 bg-[#0a0a0a]/90 border-b border-l border-emerald-500/20 backdrop-blur-xl text-[10px] text-zinc-400 rounded-bl-xl font-mono select-none pointer-events-none flex items-center gap-2 shadow-2xl">
    <span class="text-emerald-400 font-bold">{filePath.split(/[/\\]/).pop()}</span>
    <span class="text-zinc-600">|</span>
    <span class="text-zinc-500">{totalLines.toLocaleString()} lines</span>
  </div>

  <canvas 
    bind:this={canvas} 
    class="absolute inset-0 w-full h-full pointer-events-none"
  ></canvas>

  <div 
    class="flex-1 overflow-auto custom-scrollbar relative z-10" 
    bind:this={scrollContainer} 
    onscroll={handleScroll}
  >
    <div style="height: {totalLines * LINE_HEIGHT}px; width: 1px;"></div>
  </div>

  <button 
    onclick={() => {
        highlightEnabled = !highlightEnabled;
        tokenCache.clear();
        pendingChunks.clear();
        requestChunk(Math.floor(currentScrollTop / LINE_HEIGHT));
        queueRedraw();
    }}
    class="absolute bottom-6 right-8 z-50 bg-[#1a1a1a] border border-white/10 p-2 px-4 rounded-full text-[11px] {highlightEnabled ? 'text-emerald-400 border-emerald-500/30' : 'text-zinc-500'} cursor-pointer hover:bg-[#222] transition-all shadow-2xl backdrop-blur-md font-mono"
  >
    {highlightEnabled ? 'SYNTAX: ON' : 'SYNTAX: OFF'}
  </button>
</div>

<style>
  .custom-scrollbar::-webkit-scrollbar { width: 12px; height: 12px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { 
    background: #1a1a1a; 
    border-radius: 6px; 
    border: 3px solid #0d0d0d;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #252525; }
</style>
