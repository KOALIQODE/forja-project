<script lang="ts">
  import { activeBuffer, activeBufferId, openBuffers } from "$lib/stores/bufferStore";
  import { cursorPosition, currentBreadcrumb } from "$lib/stores/editorStore";
  import { openBufferDeleteDialog } from "$lib/stores/dialogStore";
  import { FileCode, AlertCircle, AlertTriangle, List, ChevronRight } from "@lucide/svelte";
  import { getFileIcon } from "$lib/utils/fileIcons";
  
  // Mock diagnostics for now
  let errors = 0;
  let warnings = 0;

  function handleOpenBufferDialog() {
    openBufferDeleteDialog();
  }

  function getBreadcrumbIcon(kind: string) {
    switch (kind) {
      case 'function_item':
      case 'function_declaration':
      case 'method_definition':
      case 'arrow_function':
        return 'ƒ';
      case 'impl_item':
        return '⧬';
      case 'module':
        return '📦';
      case 'class_declaration':
        return '🏛️';
      case 'struct_item':
        return 'S';
      case 'enum_item':
        return 'E';
      default:
        return '•';
    }
  }

  let activeFileIcon = $derived($activeBuffer ? getFileIcon($activeBuffer.filePath) : null);
</script>

<footer class="h-8 bg-black/15 backdrop-blur-xl border-t border-white/5 flex items-center justify-between px-3 text-[11px] text-[#cccccc] select-none z-50">
  <div class="flex items-center gap-1 h-full overflow-hidden">
    <!-- Breadcrumb -->
    {#if $activeBuffer}
      <div class="flex items-center hover:bg-white/5 px-2 h-full cursor-pointer transition-colors shrink-0">
        {#if activeFileIcon}
          <activeFileIcon.icon size={14} style={`color: ${activeFileIcon.color}`} />
        {:else}
          <FileCode size={14} class="text-[#ce9178]" />
        {/if}
      </div>
      
      {#if $currentBreadcrumb && $currentBreadcrumb.items.length > 0}
        {#each $currentBreadcrumb.items as item, i}
          <ChevronRight size={12} class="text-white/10 shrink-0" />
          <div class="flex items-center gap-1 hover:bg-white/5 px-2 h-full cursor-pointer transition-colors shrink-0 max-w-[150px]">
            <span class="text-[10px] opacity-40">{getBreadcrumbIcon(item.kind)}</span>
            <span class="truncate opacity-80">{item.name}</span>
          </div>
        {/each}
      {/if}
    {:else}
      <div class="flex items-center gap-2 px-2 h-full">
        <FileCode size={14} class="text-white/10" />
        <span class="opacity-40">No buffer open</span>
      </div>
    {/if}

    <!-- Diagnostics (Placeholder) -->
    <div class="flex items-center gap-0 h-full ml-4">
      <div class="flex items-center gap-1 hover:bg-white/5 px-2 h-full cursor-pointer transition-colors">
        <AlertCircle size={14} class="text-red-500/70" />
        <span class="opacity-70">{errors}</span>
      </div>
      <div class="flex items-center gap-1 hover:bg-white/5 px-2 h-full cursor-pointer transition-colors">
        <AlertTriangle size={14} class="text-amber-500/70" />
        <span class="opacity-70">{warnings}</span>
      </div>
    </div>
  </div>

  <div class="flex items-center h-full shrink-0">
    <!-- Active Buffers Icon - Now triggers Telescope Dialog -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
      class="flex items-center gap-2 hover:bg-white/5 px-3 h-full cursor-pointer transition-colors"
      onclick={handleOpenBufferDialog}
    >
      <List size={14} class="opacity-60" />
      <span class="opacity-60">{Array.from($openBuffers.keys()).length} Buffers</span>
    </div>

    <!-- Cursor Position -->
    <div class="flex items-center gap-1 hover:bg-white/5 px-3 h-full cursor-pointer transition-colors min-w-[100px] justify-end">
      <span class="opacity-60 font-mono">Ln {$cursorPosition.line}, Col {$cursorPosition.column}</span>
    </div>
  </div>
</footer>

<style>
  footer {
    font-family: var(--font-family-mono);
  }
</style>