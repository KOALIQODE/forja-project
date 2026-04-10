<script lang="ts">
  interface Props {
    lines: string[];
    bufferId: string;
  }

  let { lines = [], bufferId }: Props = $props();

  // Configuración del renderizado
  const LINE_HEIGHT = 22;
</script>

<div class="buffer-view" style="--line-height: {LINE_HEIGHT}px">
  <div class="lines-container">
    {#each lines as line, i}
      <div class="line">
        <span class="line-number">{i + 1}</span>
        <textarea
          class="line-content"
          bind:value={lines[i]}
        />
      </div>
    {/each}
  </div>
</div>

<style>
  .buffer-view {
    position: relative;
    background: #0a0a0a;
    color: #e0e0e0;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 13px;
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
  }

  .line:hover {
    background: rgba(255, 255, 255, 0.02);
  }

  .line-number {
    width: 3rem;
    text-align: right;
    padding-right: 1.5rem;
    color: #333;
    user-select: none;
    font-size: 12px;
  }

  .line-content {
    background: transparent;
    border: none;
    resize: none;
    outline: none;
    color: #a0a0a0;
    width: 100%;
    height: var(--line-height);
    overflow: hidden;
  }
</style>
