<script lang="ts">
  import { type Snippet } from "svelte";
  import "../lib/styles/variables.css";
  import "../lib/styles/components.css";
  import TitleBar from "../lib/components/TitleBar.svelte";
  import ShortcutsManager from "../lib/components/shortcuts/ShortcutsManager.svelte";
  import DialogManager from "../lib/components/dialogs/DialogManager.svelte";
  let { children }: { children: Snippet } = $props();
</script>

<div class="app-container">
  <TitleBar />
  <main class="main-content">
    {@render children()}
  </main>
</div>

<ShortcutsManager />
<DialogManager />

<style>
  .app-container {
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .main-content {
    height: calc(100vh - var(--titlebar-height));
    overflow: auto;
  }

  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
  }

  :global(body) {
    background-color: var(--bg-primary);
    font-family: var(--font-family-system);
  }

  :global(main) {
    height: 100%;
  }
</style>
