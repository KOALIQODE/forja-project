<script lang="ts">
  import { type Snippet } from "svelte";
  import { steppedGradient } from "../lib/utils/backgroundLayer"
  import TitleBar from "../lib/components/TitleBar.svelte";
  import ShortcutsManager from "../lib/components/shortcuts/ShortcutsManager.svelte";
  import DialogManager from "../lib/components/dialogs/DialogManager.svelte";
  import "../app.css";
  import '@fontsource-variable/montserrat/wght.css';

  let { children }: { children: Snippet } = $props();

  let steps = $state(15);
  let angle = $state(135);
  let from  = $state('#0a0a0a');
  let to    = $state('#1a1a1a');
  
  let gradient = $derived(steppedGradient(steps, angle, from, to));
</script>

<div class="flex h-screen flex-col overflow-hidden" style="background: {gradient};">
  <TitleBar/>
  <main class="flex-1 overflow-hidden relative">
    {@render children()}
  </main>
</div>

<ShortcutsManager />
<DialogManager />

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
  }

  :global(body) {
    font-family: 'Montserrat Variable', sans-serif;
  }
</style>
