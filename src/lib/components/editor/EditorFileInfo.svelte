<script lang="ts">
  import { getFileIcon } from '$lib/utils/fileIcons';

  let { filePath, isDirty, totalLines }: {
    filePath: string;
    isDirty: boolean;
    totalLines: number;
  } = $props();

  let fileName = $derived(filePath.split(/[\/\\]/).pop() ?? filePath);
  let fileIcon = $derived(getFileIcon(fileName));
</script>

<!-- Floating file info — top-right of editor, always over dark canvas -->
<div
  class="absolute top-3 right-4 z-50 flex items-center gap-0 pointer-events-none select-none divide-x"
  style="background:rgba(14,14,14,0.82);backdrop-filter:blur(8px);divide-color:rgba(255,255,255,0.06)"
  data-testid="editor-file-info"
>
  <!-- Filename -->
  <div class="flex items-center gap-1.5 px-2.5 py-1.5">
    {#if isDirty}
      <div class="w-1 h-1 rounded-full shrink-0" style="background:#4ade80;opacity:0.7" title="Unsaved changes"></div>
    {/if}
    {#if fileIcon}
      <fileIcon.icon size={13} style={`color: ${fileIcon.color}; opacity: 0.75`} />
    {/if}
    <span class="text-[11px] font-normal" style="color:#e4e4e7">{fileName}</span>
  </div>

  <!-- Line count -->
  <div class="flex items-center gap-1.5 px-2.5 py-1.5">
    <span class="text-[10px] font-medium uppercase tracking-wider" style="color:#71717a">LN</span>
    <span class="text-[11px] font-normal tabular-nums" style="color:#d4d4d8">{totalLines.toLocaleString()}</span>
  </div>
</div>
