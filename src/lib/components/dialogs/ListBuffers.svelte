<script lang="ts">
  import { Search, X, FileCode, Trash2 } from "@lucide/svelte";
  import {
    openBuffers,
    activeBufferId,
    closeBuffer,
    openBuffer,
  } from "../../stores/bufferStore";
  import { currentProject } from "../../stores/projectStore";
  import { closeDialog } from "../../stores/dialogStore";
  import { getFileIcon } from "$lib/utils/shared/fileIcons";
  import { GIT_STATUS_LABELS } from "$lib/utils/shared/explorerHelpers";
  import { gitFileStatuses } from "../../stores/gitStatusStore";
  import DialogWrapper from "./core/DialogWrapper.svelte";

  let searchQuery = $state("");
  let inputElement = $state<HTMLInputElement>();

  function focus(el: HTMLInputElement) {
    requestAnimationFrame(() => el.focus());
  }

  function gitStatusStyle(status: string | undefined): string {
    switch (status) {
      case "modified":
        return "text-(--color-git-modified)";
      case "added":
        return "text-(--color-git-added)";
      case "deleted":
        return "text-(--color-git-deleted)";
      case "renamed":
        return "text-(--color-git-renamed)";
      case "untracked":
        return "text-(--color-git-untracked)";
      default:
        return "text-transparent";
    }
  }

  function getGitStatusLabel(filePath: string): string {
    const fileStatus = $gitFileStatuses.get(filePath);
    return fileStatus?.status
      ? (GIT_STATUS_LABELS[fileStatus.status] ?? "?")
      : "?";
  }

  let filteredBuffers = $derived.by(() => {
    const buffers = Array.from($openBuffers.values());
    if (!searchQuery.trim()) return buffers;
    const query = searchQuery.toLowerCase();
    return buffers.filter(
      (b) =>
        b.filePath.toLowerCase().includes(query) ||
        (b.language && b.language.toLowerCase().includes(query)),
    );
  });

  function selectBuffer(id: string) {
    openBuffer(id);
    closeDialog();
  }

  function handleCloseBuffer(id: string) {
    closeBuffer(id);
    if ($openBuffers.size === 0) closeDialog();
  }

  function getRelativePath(path: string) {
    if ($currentProject) {
      return path.startsWith($currentProject)
        ? path.slice($currentProject.length + 1)
        : path;
    }
    return path;
  }

  function getFileName(path: string) {
    return path.split(/[\/\\]/).pop() || path;
  }

  function getDirectory(path: string) {
    const rel = getRelativePath(path);
    const parts = rel.split(/[\/\\]/);
    parts.pop();
    const dir = parts.join("/") || ".";
    return dir.length > 30 ? "..." + dir.slice(-27) : dir;
  }
</script>

<DialogWrapper onClose={closeDialog} position="center" zIndex={2000}>
  <div
    class="flex w-full max-w-xl flex-col overflow-hidden bg-(--color-surface-base) border border-(--color-border) animate-[picker-in_0.15s_cubic-bezier(0.16,1,0.3,1)]"
  >
    <header
      class="flex items-center gap-3 px-4 py-3 border-b border-(--color-border) bg-(--color-surface-hover)"
    >
      <Search
        strokeWidth={2.5}
        size="1.2em"
        class="text-(--color-text-secondary) shrink-0"
      />
      <input
        use:focus
        bind:value={searchQuery}
        placeholder="Find buffer..."
        class="w-full bg-transparent outline-none text-(--color-text-primary) placeholder:text-(--color-text-secondary)"
      />
      <button
        type="button"
        onclick={closeDialog}
        class="flex h-6 w-6 items-center justify-center text-(--color-text-muted) hover:text-(--color-text-primary) transition-colors"
      >
        <X strokeWidth={2.5} size="1.2em" />
      </button>
    </header>

    <div
      class="max-h-100 overflow-y-auto [scrollbar-width:thin] scrollbar-thumb-(--color-scrollbar)"
    >
      {#if filteredBuffers.length === 0}
        <div
          class="flex flex-col items-center justify-center py-12 text-center text-(--color-text-muted)"
        >
          <p class="text-xs font-medium">No open buffers matching search</p>
        </div>
      {:else}
        <div class="flex flex-col">
          {#each filteredBuffers as buffer (buffer.id)}
            {@const isActive = buffer.id === $activeBufferId}
            {@const fileIconData = getFileIcon(buffer.filePath)}
            <div
              class="group flex items-center transition-colors hover:bg-(--color-accent-fill)"
            >
              <button
                type="button"
                class="flex flex-1 items-center gap-3 px-3 py-2 text-left"
                onclick={() => selectBuffer(buffer.id)}
              >
                <!-- Indicators -->
                <div
                  class="flex h-8 w-8 shrink-0 items-center justify-center text-(--color-text-muted)"
                >
                  {#if isActive}
                    <div
                      class="relative flex h-2 w-2 items-center justify-center"
                    >
                      <div
                        class="h-2 w-5 rounded-full bg-(--color-accent)"
                      ></div>
                      <div
                        class="absolute h-4 w-4 rounded-full border-3 border-(--color-accent) opacity-30"
                      ></div>
                    </div>
                  {:else if fileIconData}
                    <fileIconData.icon
                      strokeWidth={2.5}
                      size="1em"
                      style="color: {fileIconData.color}"
                    />
                  {:else}
                    <FileCode strokeWidth={2.5} size="1em" />
                  {/if}
                </div>

                <div class="flex min-w-0 flex-1 flex-col">
                  <div class="flex items-center gap-2">
                    <span
                      class="min-w-0 truncate {isActive
                        ? 'text-(--color-text-primary)'
                        : 'text-(--color-text-secondary)'}"
                    >
                      {getFileName(buffer.filePath)}
                    </span>

                    {#if buffer.isDirty}
                      <div
                        class="h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-accent)"
                      ></div>
                    {/if}
                  </div>
                  <span class="truncate text-(--color-text-muted)"
                    >{getDirectory(buffer.filePath)}</span
                  >
                </div>
              </button>

              <div class="flex items-center gap-2 pr-2">
                {#if $gitFileStatuses.has(buffer.filePath)}
                  <h6
                    class="font-bold {gitStatusStyle(
                      $gitFileStatuses.get(buffer.filePath)?.status ?? '',
                    )}"
                  >
                    {getGitStatusLabel(buffer.filePath)}
                  </h6>
                {/if}

                <button
                  type="button"
                  class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-(--color-text-primary) hover:bg-(--color-surface-hover) transition-colors"
                  onclick={() => handleCloseBuffer(buffer.id)}
                  title="Close buffer"
                >
                  <X strokeWidth={2.5} size="1em" />
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</DialogWrapper>
