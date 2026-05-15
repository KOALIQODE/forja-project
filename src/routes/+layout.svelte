<script lang="ts">
  import "../app.css";
  import { get } from "svelte/store";
  import { onMount, type Snippet } from "svelte";
  import { currentProject } from "$lib/stores/projectStore";
  import {
    activeUITheme,
    loadUIThemesFromBackend,
  } from "../lib/stores/uiThemeStore";
  import { steppedGradient } from "../lib/utils/backgroundLayer";
  import { programPreferences } from "$lib/stores/preferencesStore";
  import { program } from "$lib/services/program";
  import TitleBar from "../lib/components/TitleBar.svelte";
  import "@fontsource-variable/montserrat/wght.css";

  let { children }: { children: Snippet } = $props();

  const themesReady = loadUIThemesFromBackend();
  let currentTheme = $state(get(activeUITheme));
  activeUITheme.subscribe((val) => {
    currentTheme = val;
  });

  // Reactive gradient — updates whenever the active UI theme changes
  let gradient = $derived(
    currentTheme
      ? steppedGradient(
          currentTheme.bgGradient.steps,
          currentTheme.bgGradient.angle,
          currentTheme.bgGradient.from,
          currentTheme.bgGradient.to,
        )
      : null,
  );

  // Inicialización principal y orquestación de servicios
  onMount(() => {
    const initTask = program.initialize();

    return () => {
      initTask.then((cleanup) => cleanup());
    };
  });
</script>

{#await themesReady}
  <!-- bloquea render hasta que los temas estén listos -->
{:then}
  <div
    class="flex h-screen flex-col"
    style="
     font-family: {$programPreferences.fontFamily};
     font-size: {$programPreferences.fontSize}px;
     font-weight: {$programPreferences.fontWeight};
     background: {gradient}
   "
  >
    <TitleBar />
    <main class="flex-1">
      {@render children()}
    </main>
    {#if $currentProject}
      {#await import("$lib/components/StatusBar.svelte") then Module}
        <Module.default />
      {/await}
    {/if}
    {#await import("$lib/components/dialogs/DialogManager.svelte") then Module}
      <Module.default />
    {/await}
  </div>
{/await}

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
  }

  :global(h1) {
    font-size: 2.15em;
  }
  :global(h2) {
    font-size: 1.8em;
  }
  :global(h3) {
    font-size: 1.5em;
  }
  :global(h4) {
    font-size: 1.25em;
  }
  :global(h5) {
    font-size: 1.08em;
  }
  :global(h6) {
    font-size: 0.9em;
  }
</style>
