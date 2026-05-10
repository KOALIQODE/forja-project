<script lang="ts">
  import { X, Package, RefreshCw } from '@lucide/svelte';
  import { isDepsSidebarOpen, toggleDepsSidebar, scanAll, isScanning } from '$lib/stores/DepsStore';
  import { currentProject } from '$lib/stores/projectStore';
  import DepsPanel from '../DepsPanel.svelte';
  import { activeUITheme } from '$lib/stores/uiThemeStore';

  let themeStyle = $derived(
    Object.entries($activeUITheme.vars).map(([k, v]) => `${k}:${v}`).join(';')
  );

  async function handleRefresh() {
    if ($currentProject) {
      await scanAll($currentProject);
    }
  }
</script>

{#if $isDepsSidebarOpen && $currentProject}
  <aside
    class="fixed right-0 top-0 bottom-0 z-[60] w-[450px] bg-[#0a0a0a] border-l border-zinc-800 shadow-2xl flex flex-col transition-all duration-300 animate-in slide-in-from-right font-sans"
    style={themeStyle}
    data-program-ui
  >
    <header class="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
      <div class="flex items-center gap-2">
        <Package size={16} class="text-emerald-500" />
        <h2 class="text-xs font-bold uppercase tracking-widest text-zinc-400">Project Dependencies</h2>
      </div>
      <div class="flex items-center gap-1">
        <button
          onclick={handleRefresh}
          class="p-1.5 hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors rounded disabled:opacity-50"
          title="Refresh dependencies"
          disabled={$isScanning}
        >
          <RefreshCw size={14} class={$isScanning ? 'animate-spin' : ''} />
        </button>
        <button
          onclick={toggleDepsSidebar}
          class="p-1.5 hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors rounded"
          title="Close sidebar"
        >
          <X size={14} />
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-auto custom-scrollbar">
      <DepsPanel projectRoot={$currentProject || ''} />
    </div>
  </aside>
{/if}
