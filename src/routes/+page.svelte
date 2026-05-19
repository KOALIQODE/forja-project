<script lang="ts">
  import WelcomeScreen from "$lib/components/WelcomeScreen.svelte";
  import { activeBuffer } from "$lib/stores/bufferStore";
  import { currentProject } from "$lib/stores/projectStore";
  import { SIDEBAR_IDS, isSidebarOpen, sidebarState } from "$lib/stores/sidebarStore";

  // Determinar si mostrar la pantalla de bienvenida o el editor basado en el proyecto
  let showWelcome = $derived(!$currentProject);
  let showExplorer = $derived(isSidebarOpen(SIDEBAR_IDS.EXPLORER, $sidebarState) && !!$currentProject);
</script>

<section class="flex w-full h-full">
  {#if $currentProject}
    <!-- Sidebar docked area (Explorer) -->
    {#if showExplorer}
      <aside class="shrink-0 z-20 h-full">
        {#await import("$lib/components/sidebars/SidebarManager.svelte") then module}
          <module.default exclude={[SIDEBAR_IDS.TODO, SIDEBAR_IDS.DEPS]} />
        {/await}
      </aside>
    {/if}

    <!-- Overlay sidebars (Todo, Deps, etc.) are rendered here but use fixed positioning -->
    {#await import("$lib/components/sidebars/SidebarManager.svelte") then module}
      <module.default exclude={[SIDEBAR_IDS.EXPLORER]} />
    {/await}
  {/if}

  <!-- El área principal -->
  <section class="flex-1 bg-transparent">
    {#if showWelcome}
      <WelcomeScreen />
    {:else if $activeBuffer}
      {#await import("$lib/components/editor/EditorBuffer.svelte") then module}
        <module.default
          filePath={$activeBuffer.filePath}
          bufferId={$activeBuffer.id}
          language={$activeBuffer.language ?? "unknown"}
        />
      {/await}
    {/if}
  </section>
</section>
