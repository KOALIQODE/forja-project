<script lang="ts">
  import { ChevronDown } from "@lucide/svelte";

  interface Props {
    value: string;
    options: { label: string; value: string }[];
    onChange: (value: string) => void;
  }

  let { value, options, onChange }: Props = $props();
  let isOpen = $state(false);

  function toggle() {
    isOpen = !isOpen;
  }

  function select(val: string) {
    onChange(val);
    isOpen = false;
  }
</script>

<div class="relative min-w-[160px]">
  <button
    type="button"
    class="flex w-full items-center justify-between border border-(--color-border) bg-(--color-surface-base) px-3 py-1.5 outline-none transition-colors hover:bg-(--color-hover-bg-subtle) focus:border-(--color-accent)"
    onclick={toggle}
    onblur={() => setTimeout(() => (isOpen = false), 200)}
  >
    <span class="text-(--color-text-primary)">
      {options.find((o) => o.value === value)?.label ?? value}
    </span>
    <ChevronDown size={14} class="text-(--color-text-muted)" />
  </button>

  {#if isOpen}
    <div
      class="absolute left-0 top-full z-10 mt-1 w-full border border-(--color-border) bg-(--color-surface-base) py-1 shadow-lg"
    >
      {#each options as option}
        <button
          type="button"
          class="block w-full px-3 py-1.5 text-left text-(--color-text-primary) transition-colors hover:bg-(--color-hover-bg-subtle)"
          onclick={() => select(option.value)}
        >
          {option.label}
        </button>
      {/each}
    </div>
  {/if}
</div>
