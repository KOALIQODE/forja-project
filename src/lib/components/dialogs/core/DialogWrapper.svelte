<script lang="ts">
  import { theme } from "$lib/stores/uiThemeStore";
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";

  let {
    children,
    onClose,
    position = "top",
    zIndex = 1000,
    class: className = "",
  }: {
    children: Snippet;
    onClose: () => void;
    position?: "top" | "center";
    zIndex?: number;
    class?: string;
  } = $props();

  function handleKeydown(e: KeyboardEvent) {
    // We only trigger onClose if the event hasn't been handled/prevented by children (like an input)
    if (e.key === "Escape" && !e.defaultPrevented) {
      onClose();
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });
</script>

<div
  class="fixed inset-0 flex justify-center font-semibold {className} {position ===
  'top'
    ? 'items-start pt-12'
    : 'items-center'}"
  style="z-index: {zIndex}"
  onclick={(e) => e.target === e.currentTarget && onClose()}
  role="presentation"
  use:theme
>
  {@render children()}
</div>

<style>
  /* Ensuring the dialog itself doesn't inherit the backdrop's click-to-close behavior */
  :global([role="presentation"] > *) {
    pointer-events: auto;
  }
</style>
