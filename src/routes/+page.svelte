<script lang="ts">
  import WelcomeScreen from "$lib/components/WelcomeScreen.svelte";
  import FileExplorer from "$lib/components/FileExplorer.svelte";
  import BufferView from "$lib/components/BufferView.svelte";
  import { 
    currentBufferId, 
    bufferContent, 
    nvimConnected
  } from "$lib/stores/nvimStore";
  import { BUFFER_IDS } from "$lib/nvim/contentIds";

  // Determinar si debemos mostrar la pantalla de bienvenida o el editor
  let showWelcome = $derived(!$nvimConnected || $currentBufferId === BUFFER_IDS.WELCOME_SCREEN);
</script>

<main class="flex w-full h-full overflow-hidden">
  <!-- El Explorador siempre está a la izquierda -->
  <aside class="shrink-0 z-20 h-full">
    <FileExplorer />
  </aside>

  <!-- El área principal cambia según el estado -->
  <section class="flex-1 relative overflow-hidden bg-transparent">
    {#if showWelcome}
      <WelcomeScreen />
    {:else}
      <!-- <BufferView lines={$bufferContent} bufferId={$currentBufferId || ''} /> -->
    {/if}
  </section>
</main>
