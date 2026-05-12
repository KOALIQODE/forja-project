<script lang="ts">
  import "../app.css";
  import { onMount, type Snippet } from "svelte";
  import { currentProject } from "$lib/stores/projectStore";
  import { activeUITheme } from "../lib/stores/uiThemeStore";
  import { steppedGradient } from "../lib/utils/backgroundLayer";
  import { programPreferences } from "$lib/stores/preferencesStore";
  import { program } from "$lib/services/program";
  import TitleBar from "../lib/components/TitleBar.svelte";
  import "@fontsource-variable/montserrat/wght.css";

  import { watchLockfile } from "$lib/utils/securityClient";
  import { clearDepsState, closeDepsSidebar } from "$lib/stores/DepsStore";
  import { clearAuditReport } from "$lib/stores/securityStore";

  let { children }: { children: Snippet } = $props();

  // Reactive gradient — updates whenever the active UI theme changes
  let gradient = $derived(
    steppedGradient(
      $activeUITheme.bgGradient.steps,
      $activeUITheme.bgGradient.angle,
      $activeUITheme.bgGradient.from,
      $activeUITheme.bgGradient.to,
    ),
  );

  // Inicialización principal y orquestación de servicios
  onMount(() => {
    const initTask = program.initialize();

    return () => {
      initTask.then((cleanup) => cleanup());
    };
  });

  $effect(() => {
    // Watch the lockfile of the current project and re-audit on changes
    const unsubscribe = currentProject.subscribe((project) => {
      if (project) {
        void watchLockfile(project);
      } else {
        closeDepsSidebar();
        void clearDepsState();
        clearAuditReport();
      }
    });

    return () => {
      unsubscribe();
    };
  });
</script>

<div
  data-program-ui
  class="flex h-screen flex-col overflow-hidden font-sans"
  style="
     font-family: {$programPreferences.fontFamily};
     font-size: {$programPreferences.fontSize}px;
     font-weight: {$programPreferences.fontWeight};
     background: {gradient}
   "
>
  <TitleBar />
  <main class="flex-1 overflow-hidden relative">
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

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
  }
</style>
