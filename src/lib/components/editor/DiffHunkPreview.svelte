<script lang="ts">
  let { visible, html, screenX, screenY }: {
    visible: boolean;
    html: string;
    screenX: number;
    screenY: number;
  } = $props();
</script>

{#if visible}
  <div
    class="diff-hunk-preview"
    style="top: {screenY}px; left: {screenX}px"
    aria-hidden="true"
  >
    {@html html}
  </div>
{/if}

<style>
  .diff-hunk-preview {
    position: fixed;
    z-index: 9999;
    background: #161616;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 4px 0;
    pointer-events: none;
    min-width: 280px;
    max-width: 560px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7);
    overflow: hidden;
    font-family: monospace;
    font-size: 12px;
    line-height: 1.6;
  }

  :global(.diff-preview-container) { display: flex; flex-direction: column; }
  :global(.diff-preview-line) { display: flex; align-items: baseline; padding: 0 8px; white-space: pre; }
  :global(.diff-preview-added)   { background: rgba(78, 201, 78, 0.12); color: #7ddd7d; }
  :global(.diff-preview-deleted) { background: rgba(224, 82, 82, 0.12); color: #e07777; }
  :global(.diff-preview-lineno) {
    color: #444;
    min-width: 2.8em;
    text-align: right;
    margin-right: 10px;
    flex-shrink: 0;
    font-size: 11px;
    user-select: none;
  }
  :global(.diff-preview-text)                          { white-space: pre; color: #ccc; }
  :global(.diff-preview-added .diff-preview-text)   { color: #7ddd7d; }
  :global(.diff-preview-deleted .diff-preview-text) { color: #e07777; }
</style>
