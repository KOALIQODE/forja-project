<script lang="ts">
  import { activeUITheme } from '$lib/stores/uiThemeStore';
  let { commandLine }: { commandLine: string } = $props();
  let themeStyle = $derived(
    Object.entries($activeUITheme.vars).map(([k, v]) => `${k}:${v}`).join(';')
  );
</script>

<!-- Vim command line — appears at bottom when in command mode -->
<div
  class="pointer-events-none absolute bottom-0 left-0 right-0 z-40 flex items-center px-3 py-0.5 font-mono text-[11px]"
  style="{themeStyle}; background: var(--forja-ui-editor-overlay-bg, rgba(9,9,11,0.85)); color: var(--forja-ui-editor-overlay-text, #a1a1aa); border-top: 1px solid var(--forja-ui-editor-overlay-sep, rgba(255,255,255,0.07))"
  data-testid="vim-command-line"
>
  <span class="mr-1.5 select-none" style="color: var(--forja-ui-text-muted, #71717a)">:</span>
  <span>{commandLine}</span>
</div>
