<script lang="ts">
  import type { Snippet } from "svelte";
  import TitleBar from "../lib/components/TitleBar.svelte";
  let { children }: { children: Snippet } = $props();
</script>

<div class="app-container">
  <TitleBar />
  <main class="main-content">
    {@render children()}
  </main>
</div>

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
</style>
