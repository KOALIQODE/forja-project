<script lang="ts">
  import { untrack } from "svelte";
  import WelcomeScreen from "$lib/components/WelcomeScreen.svelte";
  import Explorer from "$lib/components/explorer/Explorer.svelte";
  import EditorBuffer from "$lib/components/editor/EditorBuffer.svelte";
  import { activeBuffer, activeBufferId, openBuffer } from "$lib/stores/bufferStore";
  import { currentProject } from "$lib/stores/projectStore";

  // Determinar si mostrar la pantalla de bienvenida o el editor basado en el proyecto
  let showWelcome = $derived(!$currentProject);
  let showExplorer = $derived(!!$currentProject);

  // Auto-abrir README.md cuando se abre un proyecto (solo si no hay buffers abiertos)
  $effect(() => {
    const project = $currentProject;
    if (project) {
      untrack(() => {
        // Solo auto-abrir si no hay un buffer activo ya
        if (!$activeBufferId) {
          const openDefaultFile = async () => {
            try {
              const readmePath = project + ( project.endsWith('/') || project.endsWith('\\') ? '' : '/' ) + 'README.md';
              openBuffer(readmePath);
            } catch (error) {
              console.log("No se pudo auto-abrir README.md o no existe:", error);
            }
          };
          openDefaultFile();
        }
      });
    }
  });
</script>

<main class="flex w-full h-full overflow-hidden">
  <!-- El Explorador solo aparece si hay un proyecto abierto -->
  {#if showExplorer}
    <aside class="shrink-0 z-20 h-full">
      <Explorer />
    </aside>
  {/if}

  <!-- El área principal -->
  <section class="flex-1 relative overflow-hidden bg-transparent">
    {#if showWelcome}
      <WelcomeScreen />
    {:else if $activeBuffer}
      <EditorBuffer filePath={$activeBuffer.filePath} bufferId={$activeBuffer.id} language={$activeBuffer.language || 'text'} />
    {/if}
  </section>
</main>
