<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { steppedGradient } from "../lib/utils/backgroundLayer"
  import TitleBar from "../lib/components/TitleBar.svelte";
  import ParserPrompt from "../lib/components/ParserPrompt.svelte";
  import DialogManager from "../lib/components/dialogs/DialogManager.svelte";
  import StatusBar from "$lib/components/StatusBar.svelte";
  import { currentProject } from "$lib/stores/projectStore";
  import "../lib/stores/preferencesStore";
  import { openTelescope, openGrammarHub, openPreferencesDialog, openBufferDeleteDialog, openThemePicker, openRecentProjectsDialog, closeDialog, dialogState } from "../lib/stores/dialogStore";
  import { activeUITheme } from "../lib/stores/uiThemeStore";
  import { get } from 'svelte/store';
  import "../app.css";
  import '@fontsource-variable/montserrat/wght.css';
  import { initPlugins } from "$lib/stores/pluginStore";
  import { watchLockfile } from "$lib/utils/securityClient";
  import { clearAuditReport } from "$lib/stores/securityStore";
  import SecurityAlert from "$lib/components/SecurityAlert.svelte";

  let { children }: { children: Snippet } = $props();

  // Reactive gradient — updates whenever the active UI theme changes
  let gradient = $derived(
    steppedGradient(
      $activeUITheme.bgGradient.steps,
      $activeUITheme.bgGradient.angle,
      $activeUITheme.bgGradient.from,
      $activeUITheme.bgGradient.to,
    )
  );

  let lastTabTime = 0;
  let ctrlKTime = 0;

  onMount(() => {
    initPlugins();

    // Watch the lockfile of the current project and re-audit on changes
    const unsubscribe = currentProject.subscribe((project) => {
      if (project) {
        watchLockfile(project);
      } else {
        clearAuditReport();
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      // ── Ctrl+K chord — must be highest priority ────────────────────────
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        e.stopImmediatePropagation();
        ctrlKTime = Date.now();
        return;
      }

      // Complete the Ctrl+K → T chord to open theme picker
      if (e.key === 't' && ctrlKTime > 0 && Date.now() - ctrlKTime < 1500) {
        e.preventDefault();
        e.stopImmediatePropagation();
        ctrlKTime = 0;
        openThemePicker();
        return;
      }

      // Any other key resets the chord
      if (ctrlKTime > 0) ctrlKTime = 0;

      // Ctrl+R -> Recent projects (always, before any other guards)
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        e.stopImmediatePropagation();
        openRecentProjectsDialog();
        return;
      }

      // ── Guard: dialog handles its own keys ─────────────────────────────
      const currentState = get(dialogState);
      
      if (currentState.activeDialog) {
          if (e.key === 'Escape') closeDialog();
          return;
      }

      const editorEl = document.querySelector('[data-buffer-ui]') as HTMLElement | null;
      const editorHasFocus = editorEl && (document.activeElement === editorEl || editorEl.contains(document.activeElement));
      const editorVimMode = editorEl?.dataset?.vimMode;
      const editorIsInsertMode = editorHasFocus && (editorVimMode === 'insert' || editorVimMode === undefined);
      if (editorIsInsertMode) return;

      // Tab Tab -> Search Files
      if (e.key === 'Tab') {
        const now = Date.now();
        const delta = now - lastTabTime;
        if (delta > 0 && delta < 500) { 
          e.preventDefault();
          e.stopImmediatePropagation();
          openTelescope('files');
          lastTabTime = 0;
          return;
        } 
        lastTabTime = now;
      }

      // Shift + / (es decir '?') -> Live Grep
      if (e.shiftKey && e.key === '/') {
        e.preventDefault();
        e.stopImmediatePropagation();
        openTelescope('grep');
        return;
      }

      // Ctrl + B -> Buffers
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        e.stopImmediatePropagation();
        openBufferDeleteDialog();
        return;
      }

      // Ctrl + G -> Grammar Hub
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        e.stopImmediatePropagation();
        openGrammarHub();
        return;
      }

      // Ctrl/Cmd + , -> Preferences
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        e.stopImmediatePropagation();
        openPreferencesDialog('program');
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      unsubscribe();
    };
  });
</script>

<div 
  class="flex h-screen flex-col overflow-hidden font-sans" 
  style:background={gradient}
>
  <TitleBar/>
  <main class="flex-1 overflow-hidden relative">
    {@render children()}
  </main>
  {#if $currentProject}
    <StatusBar />
  {/if}
</div>

<div data-program-ui>
  <ParserPrompt />
</div>
<DialogManager />
<SecurityAlert />

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
    font-family: var(--forja-program-font-family, 'Montserrat Variable', sans-serif);
  }
</style>
