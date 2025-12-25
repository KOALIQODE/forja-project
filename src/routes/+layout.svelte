<script lang="ts">
  import type { Snippet } from "svelte";
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
    height: calc(100vh - 40px);
    overflow: auto;
  }

  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
  }

  :global(body) {
    background-color: #0a0a0a;
    font-family:
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      Roboto,
      Oxygen,
      Ubuntu,
      Cantarell,
      "Open Sans",
      "Helvetica Neue",
      sans-serif;
  }

  :global(main) {
    height: 100%;
  }
</style>
