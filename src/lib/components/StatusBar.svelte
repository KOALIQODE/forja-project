<script lang="ts">
  import { activeBuffer, activeBufferId, openBuffers } from "$lib/stores/bufferStore";
  import { cursorPosition, currentBreadcrumb, vimStatus } from "$lib/stores/editorStore";
  import { openBufferDeleteDialog } from "$lib/stores/dialogStore";
  import { FileCode, AlertCircle, AlertTriangle, List, ChevronRight } from "@lucide/svelte";
  import { getFileIcon } from "$lib/utils/fileIcons";
  import { errorCount, warningCount } from "$lib/stores/diagnosticsStore";
  import { activeUITheme } from "$lib/stores/uiThemeStore";

  let themeStyle = $derived(
    Object.entries($activeUITheme.vars).map(([k, v]) => `${k}:${v}`).join(';')
  );
  
  // Mock diagnostics for now
  // let errors = 0;
  // let warnings = 0;

  function handleOpenBufferDialog() {
    openBufferDeleteDialog();
  }

  function getBreadcrumbIcon(kind: string) {
    switch (kind) {
      case 'function_item':
      case 'function_declaration':
      case 'function_expression':
      case 'generator_function_declaration':
      case 'generator_function':
      case 'method_definition':
      case 'arrow_function':
        return 'ƒ';
      case 'impl_item':
        return '⧬';
      case 'module':
        return '📦';
      case 'class_declaration':
      case 'class_expression':
      case 'abstract_class_declaration':
        return '🏛';
      case 'struct_item':
        return 'S';
      case 'enum_item':
      case 'enum_declaration':
        return 'E';
      case 'pair':
      case 'method_signature':
      case 'property_signature':
        return '{}';

      case 'type_alias_declaration':
        return 'T';
      case 'trait_item':
        return '◈';
      default:
        return '•';
    }
  }

  let activeFileIcon = $derived($activeBuffer ? getFileIcon($activeBuffer.filePath) : null);
  let activeFileName = $derived($activeBuffer ? $activeBuffer.filePath.split('/').pop() ?? '' : '');
  let vimModeLabel = $derived(
    $vimStatus.mode === 'off'
      ? 'VIM OFF'
      : $vimStatus.mode === 'command' && $vimStatus.command
      ? `:${$vimStatus.command}`
      : [
          $vimStatus.mode.toUpperCase(),
          $vimStatus.pending,
          $vimStatus.count
        ].filter(Boolean).join(' ')
  );
</script>

<footer 
  class="h-8 bg-(--forja-ui-explorer-bg,#0a0a0a) backdrop-blur-xl flex items-center justify-between px-3 text-[11px] text-(--forja-ui-text-secondary,#a1a1aa) select-none z-50 transition-colors" 
  data-program-ui 
  style="font-family: var(--forja-buffer-font-family); {themeStyle}"
>
  <div class="flex items-center gap-1 h-full overflow-hidden">
    <!-- Breadcrumb -->
    {#if $activeBuffer}
      <div class="flex items-center hover:bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.04)) px-2 h-full cursor-pointer transition-colors shrink-0 gap-1.5">
        {#if activeFileIcon}
          <activeFileIcon.icon size={13} style={`color: ${activeFileIcon.color}`} />
        {:else}
          <FileCode size={13} class="text-(--forja-ui-text-muted,#71717a)" />
        {/if}
        <span class="opacity-80 text-[10.5px] font-medium">{activeFileName}</span>
      </div>
      
      {#if $currentBreadcrumb && $currentBreadcrumb.items.length > 0}
        {#each $currentBreadcrumb.items as item, i (i)}
          <ChevronRight size={11} class="text-(--forja-ui-text-muted,#71717a) opacity-30 shrink-0" />
          <div class="flex items-center gap-1 hover:bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.04)) px-2 h-full cursor-pointer transition-colors shrink-0 max-w-[150px]">
            <span class="text-[9px] opacity-50">{getBreadcrumbIcon(item.kind)}</span>
            <span class="truncate opacity-90 font-medium">{item.name}</span>
          </div>
        {/each}
      {/if}
    {:else}
      <div class="flex items-center gap-2 px-2 h-full">
        <FileCode size={13} class="text-(--forja-ui-text-muted,#71717a) opacity-20" />
        <span class="opacity-40 uppercase tracking-widest text-[9px] font-bold">No buffer open</span>
      </div>
    {/if}

    <!-- Diagnostics (Placeholder) -->
    <div class="flex items-center gap-0 h-full ml-4">
      <div class="flex items-center gap-1 hover:bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.04)) px-2 h-full cursor-pointer transition-colors">
        <AlertCircle size={13} class="text-rose-500/70" />
        <span class="opacity-80 font-bold">{$errorCount}</span>
      </div>
      <div class="flex items-center gap-1 hover:bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.04)) px-2 h-full cursor-pointer transition-colors">
        <AlertTriangle size={13} class="text-amber-500/70" />
        <span class="opacity-80 font-bold">{$warningCount}</span>
      </div>
    </div>
  </div>

  <div class="flex items-center h-full shrink-0">
    <div class="flex items-center gap-1 hover:bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.04)) px-3 h-full transition-colors min-w-[120px]">
      <span class="rounded bg-(--forja-ui-gradient-from,rgba(52,211,153,0.1)) px-2 py-0.5 text-[9px] font-bold tracking-[0.08em] text-(--forja-ui-gradient-from,#34d399) uppercase">
        {vimModeLabel || 'NORMAL'}
      </span>
    </div>

    <!-- Active Buffers Icon - Now triggers Telescope Dialog -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
      class="flex items-center gap-2 hover:bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.04)) px-3 h-full cursor-pointer transition-colors"
      onclick={handleOpenBufferDialog}
    >
      <List size={13} class="opacity-50" />
      <span class="opacity-70 font-medium">{Array.from($openBuffers.keys()).length} Buffers</span>
    </div>

    <!-- Cursor Position -->
    <div class="flex items-center gap-1 hover:bg-(--forja-ui-btn-hover-bg,rgba(255,255,255,0.04)) px-3 h-full cursor-pointer transition-colors min-w-[100px] justify-end">
      <span class="opacity-60 font-medium">Ln {$cursorPosition.line}, Col {$cursorPosition.column}</span>
    </div>
  </div>
</footer>

<style>
  footer {
    font-family: var(--forja-buffer-font-family, var(--font-family-mono));
  }
</style>
