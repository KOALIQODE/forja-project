<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { cursorPosition, nvimMode } from '$lib/stores/nvimStore';
  import { NVIM_MODES } from '$lib/nvim/contentIds';
  import { NavigationFactory } from '$lib/nvim/navigationStrategies';

  interface Props {
    lines: string[];
    bufferId: string;
  }

  let { lines = [], bufferId }: Props = $props();
  let navigationCleanup: (() => void) | null = null;

  // Configuración del renderizado
  const LINE_HEIGHT = 24;
  const CHAR_WIDTH = 9.6; // Ajustado para fuentes mono espaciadas comunes

  // Cursor suave
  let cursorTop = $derived(($cursorPosition.line - 1) * LINE_HEIGHT);
  let cursorLeft = $derived($cursorPosition.col * CHAR_WIDTH);

  // Determinar el estilo del cursor según el modo
  let cursorWidth = $derived($nvimMode === NVIM_MODES.INSERT ? '2px' : `${CHAR_WIDTH}px`);

  onMount(() => {
    if (bufferId) {
      const strategy = NavigationFactory.createNavigation(bufferId);
      navigationCleanup = strategy.handleNavigation();
    }
  });

  onDestroy(() => {
    if (navigationCleanup) navigationCleanup();
  });
</script>

<div class="buffer-view" style="--line-height: {LINE_HEIGHT}px">
  <div class="lines-container">
    {#each lines as line, i}
      <div class="line" class:active={i === $cursorPosition.line - 1}>
        <span class="line-number">{i + 1}</span>
        <pre class="line-content">{line || ' '}</pre>
      </div>
    {/each}
  </div>

  <!-- El Cursor "Mágico" -->
  <div 
    class="virtual-cursor" 
    class:insert={$nvimMode === NVIM_MODES.INSERT}
    style="top: {cursorTop}px; left: calc(3.5rem + {cursorLeft}px); width: {cursorWidth};"
  ></div>
</div>

<style>
  .buffer-view {
    position: relative;
    background: #121212;
    color: #e0e0e0;
    font-family: 'Fira Code', 'JetBrains Mono', 'Courier New', monospace;
    font-size: 14px;
    height: 100%;
    width: 100%;
    overflow: auto;
    padding: 10px 0;
  }

  .lines-container {
    position: relative;
    z-index: 1;
  }

  .line {
    display: flex;
    height: var(--line-height);
    align-items: center;
    padding: 0 10px;
    transition: background 0.2s ease;
  }

  .line.active {
    background: rgba(255, 255, 255, 0.03);
  }

  .line-number {
    width: 3rem;
    text-align: right;
    padding-right: 1rem;
    color: #444;
    user-select: none;
    font-size: 12px;
  }

  .line-content {
    margin: 0;
    white-space: pre;
    color: #ccc;
  }

  /* Cursor con transiciones de alta fidelidad */
  .virtual-cursor {
    position: absolute;
    height: var(--line-height);
    background: rgba(74, 222, 128, 0.5);
    border-radius: 1px;
    z-index: 10;
    pointer-events: none;
    transition: 
      top 0.1s cubic-bezier(0.1, 0.7, 0.1, 1),
      left 0.1s cubic-bezier(0.1, 0.7, 0.1, 1),
      width 0.2s ease,
      background 0.2s ease;
  }

  .virtual-cursor.insert {
    background: #4ade80;
    box-shadow: 0 0 10px rgba(74, 222, 128, 0.8);
  }

  /* Animación de parpadeo sutil */
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  .virtual-cursor.insert {
    animation: blink 1s infinite;
  }
</style>
