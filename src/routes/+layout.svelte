<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { steppedGradient } from "../lib/utils/backgroundLayer"
  import TitleBar from "../lib/components/TitleBar.svelte";
  import ParserPrompt from "../lib/components/ParserPrompt.svelte";
  import DialogManager from "../lib/components/dialogs/DialogManager.svelte";
  import "../lib/stores/preferencesStore";
  import { openTelescope, openGrammarHub, openPreferencesDialog, closeDialog, dialogState } from "../lib/stores/dialogStore";
  import { get } from 'svelte/store';
  import "../app.css";
  import '@fontsource-variable/montserrat/wght.css';

  let { children }: { children: Snippet } = $props();

  let steps = $state(15);
  let angle = $state(135);
  let from  = $state('#0a0a0a');
  let to    = $state('#1a1a1a');
  
  let gradient = $derived(steppedGradient(steps, angle, from, to));

  let lastTabTime = 0;

  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const currentState = get(dialogState);
      
      // Si el diálogo ya está abierto, solo permitimos Escape para cerrar
      if (currentState.activeDialog) {
          if (e.key === 'Escape') closeDialog();
          return;
      }

      // No interceptar shortcuts si el editor está en insert mode:
      // el usuario está escribiendo y los caracteres deben llegar al editor.
      const editorEl = document.querySelector('[data-buffer-ui]') as HTMLElement | null;
      const editorHasFocus = editorEl && (document.activeElement === editorEl || editorEl.contains(document.activeElement));
      const editorVimMode = editorEl?.dataset?.vimMode;
      // "insert" = vim insert mode; undefined = vim disabled (always insert)
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
        openTelescope('buffers');
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

    // Usar useCapture = true para interceptar antes que el editor
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
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
</div>

<div data-program-ui>
  <ParserPrompt />
</div>
<DialogManager />

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
    font-family: var(--forja-program-font-family, 'Montserrat Variable', sans-serif);
  }
</style>
