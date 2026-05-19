<script lang="ts">
  import type { Hunk } from '$lib/components/editor/utils/diff';
  import { DIFF_COLORS } from '$lib/components/editor/utils/diff';

  let { hunks, totalLines, editorLineHeight, scrollContainer }: {
    hunks: readonly Hunk[];
    totalLines: number;
    editorLineHeight: number;
    scrollContainer: HTMLElement | null;
  } = $props();

  function jumpToHunk(anchorLine: number) {
    if (!scrollContainer) return;
    const targetY = anchorLine * editorLineHeight - scrollContainer.clientHeight / 2;
    scrollContainer.scrollTop = Math.max(0, targetY);
  }
</script>

<!-- Diff markers overlay rendered on the vertical scrollbar track -->
<div class="scrollbar-diff-overlay" aria-hidden="true">
  {#each [false, true] as renderDeleted}
    {#each hunks as hunk, i (renderDeleted ? `d${i}` : `a${i}`)}
      {#if (hunk.status === 'deleted') === renderDeleted}
        {@const anchorLine = hunk.status === 'deleted' ? hunk.afterLine + 1 : hunk.newStart}
        {@const spanLines  = hunk.status === 'deleted' ? 1 : (hunk.newEnd - hunk.newStart)}
        {@const topPct     = (anchorLine / totalLines) * 100}
        {@const heightPct  = Math.max(spanLines / totalLines * 100, 0.4)}
        {@const color      = DIFF_COLORS[hunk.status]}
        <div
          class="scrollbar-diff-mark"
          style="top:{topPct}%;height:{heightPct}%;background:{color};"
          role="button"
          tabindex="-1"
          aria-label="Jump to {hunk.status} hunk"
          onpointerdown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            jumpToHunk(anchorLine);
          }}
        ></div>
      {/if}
    {/each}
  {/each}
</div>

<style>
  .scrollbar-diff-overlay {
    position: absolute;
    top: 0;
    right: 0;
    width: 12px;
    height: 100%;
    pointer-events: none;
    z-index: 11;
    background: #0d0d0d;
  }
  .scrollbar-diff-mark {
    position: absolute;
    left: 1px;
    right: 1px;
    min-height: 2px;
    border-radius: 2px;
    opacity: 0.9;
    pointer-events: auto;
    cursor: pointer;
    transition: none;
  }
  .scrollbar-diff-mark:hover {
    opacity: 1;
    left: 0;
    right: 0;
  }
</style>
