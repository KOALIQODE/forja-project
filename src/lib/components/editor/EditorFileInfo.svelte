<script lang="ts">
  import { getFileIcon } from '$lib/utils/fileIcons';
  import { activeUITheme } from '$lib/stores/uiThemeStore';

  let { filePath, isDirty, totalLines }: {
    filePath: string;
    isDirty: boolean;
    totalLines: number;
  } = $props();

  let fileName = $derived(filePath.split(/[\/\\]/).pop() ?? filePath);
  let fileIcon = $derived(getFileIcon(fileName));

  let themeStyle = $derived(
    Object.entries($activeUITheme.vars).map(([k, v]) => `${k}:${v}`).join(';')
  );
</script>

<!-- Floating file info — top-right of editor, reacts to active theme -->
<div
  class="absolute top-3 right-4 z-50 flex items-center gap-0 pointer-events-none select-none divide-x"
  style="{themeStyle};background:var(--forja-editor-bg,#0e0e0e);outline:1px solid var(--forja-ui-btn-border,rgba(255,255,255,0.06));backdrop-filter:blur(8px);divide-color:var(--forja-ui-btn-border,rgba(255,255,255,0.06));"
  data-testid="editor-file-info"
>
  <!-- Filename -->
  <div class="flex items-center gap-1.5 px-2.5 py-1.5">
    {#if isDirty}
      <div class="w-1.5 h-1.5 rounded-full shrink-0" style="background:var(--forja-ui-picker-active-text,#4ade80)" title="Unsaved changes"></div>
    {/if}
    {#if fileIcon}
      <fileIcon.icon size={13} style={`color: ${fileIcon.color}`} />
    {/if}
    <span class="text-[11px] font-normal" style="color:var(--forja-ui-text-primary,#e4e4e7)">{fileName}</span>
  </div>

  <!-- Line count -->
  <div class="flex items-center gap-1.5 px-2.5 py-1.5">
    <span class="text-[10px] font-medium uppercase tracking-wider" style="color:var(--forja-ui-text-muted,#71717a)">LN</span>
    <span class="text-[11px] font-normal tabular-nums" style="color:var(--forja-ui-text-secondary,#d4d4d8)">{totalLines.toLocaleString()}</span>
  </div>
</div>
