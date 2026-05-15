<script lang="ts">
  import { activeBuffer, openBuffers } from "$lib/stores/bufferStore";
  import { cursorPosition, currentBreadcrumb, vimStatus } from "$lib/stores/editorStore";
  import { openBufferDeleteDialog } from "$lib/stores/dialogStore";
  import { AlertCircle, AlertTriangle, ChevronRight, FileCode, LayoutGrid } from "@lucide/svelte";
  import { errorCount, warningCount } from "$lib/stores/diagnosticsStore";
  import { getFileIcon } from "$lib/utils/fileIcons";
  import { getBreadcrumbIcon } from "$lib/utils/explorerHelpers";
  import { theme } from "$lib/stores/uiThemeStore";

  function handleOpenBufferDialog() {
    openBufferDeleteDialog();
  }

  let hasActiveBuffer = $derived(Boolean($activeBuffer));
  let activeFileIconData = $derived($activeBuffer ? getFileIcon($activeBuffer.filePath) : null);
  let activeFileName = $derived($activeBuffer?.filePath.split('/').pop() ?? '');
  let breadcrumbItems = $derived($currentBreadcrumb?.items ?? []);
  let openBufferCount = $derived(Array.from($openBuffers.keys()).length);
  let cursorLine = $derived($cursorPosition.line);
  let cursorColumn = $derived($cursorPosition.column);
  let vimModeLabel = $derived(
    $vimStatus.mode === 'off'
      ? 'VIM OFF'
      : $vimStatus.mode === 'command' && $vimStatus.command
        ? `:${$vimStatus.command}`
        : [$vimStatus.mode.toUpperCase(), $vimStatus.pending, $vimStatus.count].filter(Boolean).join(' ')
  );
</script>

<footer
  class="flex h-6 w-full font-semibold items-center justify-between bg-(--color-surface-base) border-t border-(--color-border) px-2 text-(--color-text-secondary) select-none"
  data-testid="status-bar"
  use:theme
>
  <div class="flex min-w-0 items-center overflow-hidden">
    {#if hasActiveBuffer}
      <div class="flex h-full min-w-0 items-center gap-1 px-2 hover:bg-(--color-hover-bg-subtle)">
        {#if activeFileIconData}
          <activeFileIconData.icon strokeWidth={2.5} size="1.2em" style={`color: ${activeFileIconData.color}`} />
        {:else}
          <FileCode strokeWidth={2.5} size="1.2em" class="text-(--color-text-muted)" />
        {/if}
        <span class="truncate text-(--color-text-secondary)" data-testid="status-file-name">{activeFileName}</span>
      </div>

      {#if breadcrumbItems.length > 0}
        <div class="mx-1 h-3 w-px shrink-0 bg-(--color-border)"></div>
        <div class="flex min-w-0 items-center overflow-hidden">
          {#each breadcrumbItems as item, index (`${item.name}-${index}`)}
            {#if index > 0}
              <ChevronRight strokeWidth={2.5} size="1.2em" class="mx-1 shrink-0 text-(--color-text-muted)" />
            {/if}
            <div class="flex min-w-0 items-center gap-1 px-2 hover:bg-(--color-hover-bg-subtle)">
              <span class="text-(--color-text-muted)">{getBreadcrumbIcon(item.kind)}</span>
              <span class="truncate">{item.name}</span>
            </div>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="flex h-full items-center gap-1 px-2 uppercase text-(--color-text-muted)">
        <FileCode strokeWidth={2.5} size="1.2em" class="shrink-0" />
        <span>No buffer open</span>
      </div>
    {/if}

    <div class="mx-1 h-3 w-px shrink-0 bg-(--color-border)"></div>

    <div class="flex items-center">
      <div class="flex h-full items-center gap-1.5 px-2 hover:bg-(--color-hover-bg-subtle)">
        <AlertCircle strokeWidth={2.5} size="1em" class="text-rose-400" />
        <span class="font-semibold text-rose-400 leading-none" style="transform:translateY(0.5px)" data-testid="status-error-count">{$errorCount}</span>
      </div>
      <div class="flex h-full items-center gap-1.5 px-2 hover:bg-(--color-hover-bg-subtle)">
        <AlertTriangle strokeWidth={2.5} size="1em" class="text-amber-400" />
        <span class="font-semibold text-amber-400 leading-none" style="transform:translateY(0.5px)" data-testid="status-warning-count">{$warningCount}</span>
      </div>
    </div>
  </div>

  <div class="ml-2 flex shrink-0 items-center h-full">
    <div class="flex h-full items-center gap-1.5 px-2 hover:bg-(--color-hover-bg-subtle) transition-colors">
      <h6 class="uppercase text-(--color-text-muted) leading-none" style="transform:translateY(0.5px)">Vim</h6>
      <h6 class="font-bold text-(--color-accent) leading-none" data-testid="status-vim-mode">{vimModeLabel}</h6>
    </div>

    <div class="mx-1 h-3 w-px shrink-0 bg-(--color-border)"></div>

    <button
      class="flex h-full items-center gap-1.5 px-2 text-(--color-text-secondary) hover:bg-(--color-hover-bg-subtle) hover:text-(--color-text-primary) transition-colors"
      onclick={handleOpenBufferDialog}
      type="button"
    >
      <LayoutGrid strokeWidth={2.5} size="1em" />
      <h6 class="uppercase leading-none" style="transform:translateY(0.5px)">Buf</h6>
      <h6 class="font-bold leading-none" data-testid="status-buffer-count">{openBufferCount}</h6>
    </button>

    <div class="mx-1 h-3 w-px shrink-0 bg-(--color-border)"></div>

    <div class="flex h-full items-center gap-1.5 px-2 hover:bg-(--color-hover-bg-subtle) transition-colors">
      <h6 class="uppercase leading-none text-(--color-text-secondary)" style="transform:translateY(0.5px)">Pos</h6>
      <h6 class="font-bold leading-none" data-testid="status-cursor">
        {hasActiveBuffer ? `Ln ${cursorLine}, Col ${cursorColumn}` : '--:--'}
      </h6>
    </div>
  </div>
</footer>
