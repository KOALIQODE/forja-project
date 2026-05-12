<script lang="ts">
  import { sidebarState, SIDEBAR_REGISTRY, type SidebarId } from "../../stores/sidebarStore";
  
  let { exclude = [] }: { exclude?: SidebarId[] } = $props();

  let activeSidebars = $derived(
    Array.from($sidebarState.openSidebars).filter(id => !exclude.includes(id))
  );
</script>

{#each activeSidebars as id (id)}
  {#await SIDEBAR_REGISTRY[id]() then module}
    {@const SidebarComponent = module.default}
    <SidebarComponent />
  {/await}
{/each}
