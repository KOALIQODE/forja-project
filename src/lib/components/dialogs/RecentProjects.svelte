<script lang="ts">
  import { FolderOpen, X, GitBranch, ArrowUp, ArrowDown } from "@lucide/svelte";
  import {
    recentProjects,
    openProject,
    shortenedPaths,
    gitStatuses,
    currentProject,
  } from "$lib/stores/projectStore";
  import { theme } from "$lib/stores/uiThemeStore";
  import { closeDialog } from "$lib/stores/dialogStore";

  function getDisplayPath(index: number): string {
    return $shortenedPaths[index] || $recentProjects[index] || "";
  }

  function openSelectedProject(projectPath: string) {
    openProject(projectPath);
    closeDialog();
  }

  function getProjectName(path: string): string {
    return path.split(/[/\\]/).pop() || "Unknown Project";
  }

  function deleteProject(index: number) {
    recentProjects.update((projects) => {
      const updated = [...projects];
      updated.splice(index, 1);
      return updated;
    });
  }
</script>

<div
  class="fixed inset-0 z-2000 flex items-start justify-center pt-[15%] font-semibold"
  use:theme
>
  <div
    class="flex w-full max-w-2xl flex-col overflow-hidden border border-(--color-border) bg-(--color-surface-base)"
  >
    <header
      class="flex items-center gap-3 border-b border-(--color-border) px-4 py-2.5"
    >
      <span class="text-(--color-text-primary)">Recent Projects</span>
      <div class="h-3 w-px shrink-0 bg-(--color-border)"></div>
      <span class="flex-1 text-(--color-text-secondary)"
        >Open a recent project</span
      >
      <button
        onclick={closeDialog}
        class="flex h-6 w-6 items-center justify-center text-(--color-text-muted) hover:text-(--color-text-primary)"
      >
        <X strokeWidth={2.5} size="1.2em" />
      </button>
    </header>

    <!-- List -->
    <ul class="max-h-100 overflow-y-auto" role="list">
      {#if $recentProjects.length === 0}
        <li
          class="flex flex-col items-center justify-center gap-2 p-6 text-(--color-text-secondary) opacity-50"
        >
          <FolderOpen strokeWidth={2.5} size="2.2em" />
          <p>No recent projects found</p>
        </li>
      {:else}
        {#each $recentProjects as project, index (project)}
          {@const git = $gitStatuses[index]}
          <li
            class="group flex items-center transition-colors
              {project === $currentProject
                ? 'text-(--color-text-primary) bg-(--color-accent-fill)'
                : 'text-(--color-text-muted) hover:text-(--color-text-primary) hover:bg-(--color-accent-fill)'}"
          >
            <button
              type="button"
              class="flex flex-1 items-center gap-3 px-4 py-2.5 text-left"
              onclick={() => openSelectedProject(project)}
            >
              <FolderOpen
                strokeWidth={2.5}
                size="1.2em"
                class="shrink-0 text-(--color-text-primary)"
              />

              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <h5 class="text-(--color-text-primary)">
                  {getProjectName(project)}
                </h5>
                <h6 class="text-(--color-text-secondary)">
                  {getDisplayPath(index)}
                </h6>
              </div>

              <!-- Git info -->
              {#if git}
                <div class="flex shrink-0 items-center gap-3">
                  {#if git.is_repo}
                    <div
                      class="flex items-center gap-1 text-(--color-text-muted)"
                    >
                      <GitBranch strokeWidth={2.5} size="1em" />
                      <h6>{git.branch}</h6>
                    </div>
                    {#if git.has_upstream}
                      <div class="flex items-center gap-1.5">
                        <h6
                          class="flex items-center gap-0.5 {git.ahead > 0
                            ? 'text-[#60a5fa]'
                            : ''}"
                        >
                          <ArrowUp strokeWidth={2.5} size="1em" />{git.ahead}
                        </h6>
                        <h6
                          class="flex items-center gap-0.5 {git.behind > 0
                            ? 'text-[#fb923c]'
                            : ''}"
                        >
                          <ArrowDown strokeWidth={2.5} size="1em" />{git.behind}
                        </h6>
                      </div>
                    {:else}
                      <h6 class="text-(--color-text-muted)">No Git</h6>
                    {/if}
                  {/if}
                </div>
              {/if}
            </button>

            <!-- Delete -->
            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                deleteProject(index);
              }}
              title="Remove from recent"
              class="flex h-6 w-6 shrink-0 items-center justify-center mx-2 rounded-md text-(--color-text-primary) hover:bg-(--color-surface-hover) transition-colors"
            >
              <X strokeWidth={2.5} size="1em" />
            </button>
          </li>
        {/each}
      {/if}
    </ul>
  </div>
</div>
