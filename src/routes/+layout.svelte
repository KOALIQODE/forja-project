<script lang="ts">
  import "../app.css";
  import { onMount, type Snippet } from "svelte";
  import { currentProject } from "$lib/stores/projectStore";
  import { activeUITheme } from "../lib/stores/uiThemeStore";
  import { initPlugins } from "$lib/stores/pluginStore";
  import { initGitReactivity } from "$lib/init/gitReactivity";
  import { steppedGradient } from "../lib/utils/backgroundLayer";
  import { programPreferences } from "$lib/stores/preferencesStore";
  import TitleBar from "../lib/components/TitleBar.svelte";
  import "@fontsource-variable/montserrat/wght.css";

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

  // Inicialización principal
  onMount(async () => {
    await initGitReactivity();
    initPlugins();

  //   // Watch the lockfile of the current project and re-audit on changes
  //   const unsubscribe = currentProject.subscribe((project) => {
  //     if (project) {
  //       void watchLockfile(project);
  //     } else {
  //       closeDepsSidebar();
  //       void clearDepsState();
  //       clearAuditReport();
  //     }
  //   });

  //   const handleKeyDown = (e: KeyboardEvent) => {
  //     // ── Ctrl+K chord — must be highest priority ────────────────────────
  //     if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
  //       e.preventDefault();
  //       e.stopImmediatePropagation();
  //       ctrlKTime = Date.now();
  //       return;
  //     }

  //     // Complete the Ctrl+K → T chord to open theme picker
  //     if (e.key === 't' && ctrlKTime > 0 && Date.now() - ctrlKTime < 1500) {
  //       e.preventDefault();
  //       e.stopImmediatePropagation();
  //       ctrlKTime = 0;
  //       openThemePicker();
  //       return;
  //     }

  //     // Any other key resets the chord
  //     if (ctrlKTime > 0) ctrlKTime = 0;

  //     // Ctrl+R -> Recent projects (always, before any other guards)
  //     if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
  //       e.preventDefault();
  //       e.stopImmediatePropagation();
  //       openRecentProjectsDialog();
  //       return;
  //     }

  //     // ── Guard: dialog handles its own keys ─────────────────────────────
  //     const currentState = get(dialogState);
      
  //     if (currentState.activeDialog) {
  //         if (e.key === 'Escape') closeDialog();
  //         return;
  //     }

  //     const editorEl = document.querySelector('[data-buffer-ui]') as HTMLElement | null;
  //     const editorHasFocus = editorEl && (document.activeElement === editorEl || editorEl.contains(document.activeElement));
  //     const editorVimMode = editorEl?.dataset?.vimMode;
  //     const editorIsInsertMode = editorHasFocus && (editorVimMode === 'insert' || editorVimMode === undefined);
  //     if (editorIsInsertMode) return;

  //     // Tab Tab -> Search Files
  //     if (e.key === 'Tab') {
  //       const now = Date.now();
  //       const delta = now - lastTabTime;
  //       if (delta > 0 && delta < 500) { 
  //         e.preventDefault();
  //         e.stopImmediatePropagation();
  //         openTelescope('files');
  //         lastTabTime = 0;
  //         return;
  //       } 
  //       lastTabTime = now;
  //     }

  //     // Shift + / (es decir '?') -> Live Grep
  //     if (e.shiftKey && e.key === '/') {
  //       e.preventDefault();
  //       e.stopImmediatePropagation();
  //       openTelescope('grep');
  //       return;
  //     }

  //     // Ctrl + B -> Buffers
  //     if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
  //       e.preventDefault();
  //       e.stopImmediatePropagation();
  //       openBufferDeleteDialog();
  //       return;
  //     }

  //     // Ctrl + G -> Grammar Hub
  //     if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
  //       e.preventDefault();
  //       e.stopImmediatePropagation();
  //       openGrammarHub();
  //       return;
  //     }

  //     // Ctrl/Cmd + , -> Preferences
  //     if ((e.ctrlKey || e.metaKey) && e.key === ',') {
  //       e.preventDefault();
  //       e.stopImmediatePropagation();
  //       openPreferencesDialog('program');
  //     }
  //   };

  //   window.addEventListener('keydown', handleKeyDown, true);
  //   return () => {
  //     window.removeEventListener('keydown', handleKeyDown, true);
  //     unsubscribe();
  //   };
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
