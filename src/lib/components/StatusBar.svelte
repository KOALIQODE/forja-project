<script lang="ts">
  import { activeBuffer, openBuffers } from "$lib/stores/bufferStore";
  import { cursorPosition, currentBreadcrumb, vimStatus } from "$lib/stores/editorStore";
  import { openBufferDeleteDialog } from "$lib/stores/dialogStore";
  import { AlertCircle, AlertTriangle, ChevronRight, FileCode, LayoutGrid } from "@lucide/svelte";
  import { errorCount, warningCount } from "$lib/stores/diagnosticsStore";
  import { activeUITheme } from "$lib/stores/uiThemeStore";
  import { getFileIcon } from "$lib/utils/fileIcons";
  import { getBreadcrumbIcon } from "$lib/utils/explorerHelpers";

  function handleOpenBufferDialog() {
    openBufferDeleteDialog();
  }

  let themeStyle = $derived(
    Object.entries($activeUITheme.vars)
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ')
  );

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
  class="flex h-6 w-full items-center justify-between bg-(--forja-ui-explorer-bg,#111111) px-2 text-[10px] tracking-wide text-(--forja-ui-text-secondary,#a1a1aa) select-none"
  data-program-ui
  data-testid="status-bar"
  style="font-family: var(--forja-buffer-font-family, var(--font-family-mono)); {themeStyle}"
>
  <div class="flex min-w-0 items-center overflow-hidden">
    {#if hasActiveBuffer}
      <div class="flex h-full min-w-0 items-center gap-1 px-2 hover:bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.04))">
        {#if activeFileIconData}
          <activeFileIconData.icon size={12} style={`color: ${activeFileIconData.color}`} />
        {:else}
          <FileCode size={12} class="text-(--forja-ui-text-muted,#71717a)" />
        {/if}
        <span class="truncate text-(--forja-ui-text-primary,#f4f4f5)" data-testid="status-file-name">{activeFileName}</span>
      </div>

      {#if breadcrumbItems.length > 0}
        <div class="mx-1 h-3 w-px shrink-0 bg-(--forja-ui-btn-border,#27272a)"></div>
        <div class="flex min-w-0 items-center overflow-hidden">
          {#each breadcrumbItems as item, index (`${item.name}-${index}`)}
            {#if index > 0}
              <ChevronRight size={10} class="mx-1 shrink-0 text-(--forja-ui-text-muted,#71717a)" />
            {/if}
            <div class="flex min-w-0 items-center gap-1 px-2 hover:bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.04))">
              <span class="text-[9px] text-(--forja-ui-text-muted,#71717a)">{getBreadcrumbIcon(item.kind)}</span>
              <span class="truncate">{item.name}</span>
            </div>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="flex h-full items-center gap-1 px-2 uppercase text-(--forja-ui-text-muted,#71717a)">
        <FileCode size={12} class="shrink-0" />
        <span>No buffer open</span>
      </div>
    {/if}

    <div class="mx-1 h-3 w-px shrink-0 bg-(--forja-ui-btn-border,#27272a)"></div>

    <div class="flex items-center">
      <div class="flex h-full items-center gap-1 px-2 hover:bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.04))">
        <AlertCircle size={12} class="text-rose-400" />
        <span class="font-semibold text-rose-400" data-testid="status-error-count">{$errorCount}</span>
      </div>
      <div class="flex h-full items-center gap-1 px-2 hover:bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.04))">
        <AlertTriangle size={12} class="text-amber-400" />
        <span class="font-semibold text-amber-400" data-testid="status-warning-count">{$warningCount}</span>
      </div>
    </div>
  </div>

  <div class="ml-2 flex shrink-0 items-center">
    <div class="flex h-full items-center gap-2 px-2 hover:bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.04))">
      <span class="uppercase tracking-widest text-[9px] font-bold leading-none text-(--forja-ui-text-secondary,#a1a1aa)" style="transform:translateY(1px)">Vim</span>
      <span class="font-bold tracking-[0.1em] text-(--forja-ui-gradient-from,#34d399)" data-testid="status-vim-mode">{vimModeLabel}</span>
    </div>

    <div class="mx-1 h-3 w-px shrink-0 bg-(--forja-ui-btn-border,#27272a)"></div>

    <button
      class="flex h-full items-center gap-1.5 px-2 text-(--forja-ui-text-secondary,#a1a1aa)"
      onclick={handleOpenBufferDialog}
      type="button"
    >
      <LayoutGrid size={11} class="text-(--forja-ui-text-secondary,#a1a1aa)" />
      <span class="uppercase tracking-widest text-[9px] font-bold leading-none text-(--forja-ui-text-secondary,#a1a1aa)" style="transform:translateY(1px)">Buf</span>
      <span class="font-semibold" data-testid="status-buffer-count">{openBufferCount}</span>
    </button>

    <div class="mx-1 h-3 w-px shrink-0 bg-(--forja-ui-btn-border,#27272a)"></div>

    <div class="flex h-full items-center gap-1.5 px-2 hover:bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.04))">
      <span class="uppercase tracking-widest text-[9px] font-bold leading-none text-(--forja-ui-text-secondary,#a1a1aa)" style="transform:translateY(1px)">Pos</span>
      <span class="font-semibold" data-testid="status-cursor">Ln {cursorLine}, Col {cursorColumn}</span>
    </div>
  </div>
</footer>

<style></style>
