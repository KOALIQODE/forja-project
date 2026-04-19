<script lang="ts">
  import WelcomeScreen from "$lib/components/WelcomeScreen.svelte";
  import Explorer from "$lib/components/explorer/Explorer.svelte";
  import BufferView from "$lib/components/BufferView.svelte";
  import { 
    activeBuffer,
    activeBufferId,
    openBuffer
  } from "$lib/stores/bufferStore";
  import { currentProject } from "$lib/stores/projectStore";
  import { invoke } from "@tauri-apps/api/core";

  // Determinar si mostrar la pantalla de bienvenida o el editor basado en el proyecto
  let showWelcome = $derived(!$currentProject);
  let showExplorer = $derived(!!$currentProject);

  // Auto-abrir README.md cuando se abre un proyecto
  $effect(() => {
    if ($currentProject) {
      const openDefaultFile = async () => {
        try {
          // Usar normalize para evitar problemas de / o \
          const readmePath = $currentProject + ( $currentProject.endsWith('/') || $currentProject.endsWith('\\') ? '' : '/' ) + 'README.md';

          // Intentar leer el README.md
          const content = await invoke<string>('read_file', { path: readmePath });
          openBuffer(readmePath, content);
        } catch (error) {
          console.log("No se pudo auto-abrir README.md o no existe:", error);
        }
      };

      openDefaultFile();
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
      <BufferView lines={$activeBuffer.content} bufferId={$activeBuffer.id} />
    {/if}
  </section>
</main>
