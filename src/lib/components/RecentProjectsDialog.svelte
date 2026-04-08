<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { FolderOpen, Clock, X } from "@lucide/svelte";
  import {
    recentProjects,
    openProject,
    shortenedPaths,
    gitStatuses,
  } from "../stores/projectStore";
  import {
    keyboardManager,
    createNavigationActions,
  } from "../utils/keyboardManager";

  let {
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
  } = $props();

  let selectedIndex = $state(0);
  let dialogElement = $state<HTMLElement>();
  let navigation: ReturnType<typeof useNavigation> | undefined;

  function getDisplayPath(index: number): string {
    return $shortenedPaths[index] || $recentProjects[index] || "";
  }

  function openSelectedProject(index: number, projectPath: string) {
    openProject(projectPath);
    onClose();
  }

  function getProjectName(path: string): string {
    return path.split(/[/\\]/).pop() || "Unknown Project";
  }

  function closeDialog() {
    onClose();
  }

  function deleteCurrentProject() {
    if ($recentProjects[selectedIndex]) {
      recentProjects.update((projects) => {
        const newProjects = [...projects];
        newProjects.splice(selectedIndex, 1);
        return newProjects;
      });

      // Update navigation with new items and adjust selectedIndex if needed
      const newProjectsArray = $recentProjects;
      navigation?.updateItems(newProjectsArray);
      
      if (selectedIndex >= newProjectsArray.length && newProjectsArray.length > 0) {
        selectedIndex = newProjectsArray.length - 1;
        navigation?.updateSelectedIndex(selectedIndex);
      }
    }
  }

  onMount(async () => {
    if (isOpen) {
      selectedIndex = 0;

      // Setup navigation controller
      navigation = useNavigation({
        contextName: KEYBOARD_CONTEXTS.RECENT_PROJECTS_DIALOG,
        items: $recentProjects,
        selectedIndex,
        onSelect: openSelectedProject,
        onCancel: closeDialog,
        additionalActions: [
          {
            key: SHORTCUTS_FLAT.DELETE,
            handler: deleteCurrentProject,
            description: "Delete project from recent list",
          },
        ],
        autoFocus: true,
        element: dialogElement,
      });

      navigation.activate();

      // Listen for navigation changes
      if (dialogElement) {
        dialogElement.addEventListener('navigation-change', (event: Event) => {
          const customEvent = event as CustomEvent;
          selectedIndex = customEvent.detail.selectedIndex;
        });
      }
    }
  });

  onDestroy(() => {
    navigation?.destroy();
  });
</script>

{#if isOpen}
  <div class="dialog-backdrop">
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="dialog-container"
      bind:this={dialogElement}
      tabindex="0"
    >
      <div class="dialog-header">
        <div class="header-title">
          <Clock size={16} />
          <h3>{UI_TEXT.RECENT_PROJECTS_TITLE}</h3>
        </div>
        <button class="close-button" onclick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div class="projects-list">
        {#if $recentProjects.length === 0}
          <div class="empty-state">
            <p>{UI_TEXT.NO_RECENT_PROJECTS}</p>
          </div>
        {:else}
          {#each $recentProjects as project, index}
            {@const git = $gitStatuses[index]}
            <button
              class="project-item {selectedIndex === index ? 'selected' : ''}"
              onclick={() => openSelectedProject(index, project)}
            >
              <div class="project-icon">
                <FolderOpen size={16} />
              </div>
              <div class="project-info">
                <div class="project-name">{getProjectName(project)}</div>
                <div class="project-path">{getDisplayPath(index)}</div>
              </div>
              {#if git}
                <div class="project-git-status">
                  {#if git.is_repo}
                    <span class="branch">{git.branch}</span>
                    {#if git.has_upstream}
                      <span class="git-indicator">
                        <kbd class="git-arrow">↑</kbd>
                        <span class="git-count">{git.ahead}</span>
                      </span>
                      <span class="git-indicator">
                        <kbd class="git-arrow">↓</kbd>
                        <span class="git-count">{git.behind}</span>
                      </span>
                    {:else}
                      <span class="git-no-upstream">{UI_TEXT.PUBLISH}</span>
                    {/if}
                  {:else}
                    <span class="git-not-repo">{UI_TEXT.NO_GIT}</span>
                  {/if}
                </div>
              {/if}
            </button>
          {/each}
        {/if}
      </div>

      <div class="dialog-footer">
        <div class="shortcuts-info">
          <!-- <span><kbd>↑</kbd><kbd>↓</kbd> {UI_TEXT.NAVIGATE}</span> -->
          <span><kbd>Enter</kbd> {UI_TEXT.OPEN}</span>
          <span><kbd>D</kbd> {UI_TEXT.DELETE}</span>
          <span><kbd>Esc</kbd> {UI_TEXT.CLOSE}</span>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    /*backdrop-filter: blur(1px);*/
  }

  .dialog-container {
    background: var(--gradient-primary);
    border: 1px solid var(--border-secondary);
    border-radius: var(--radius-sm);
    width: 600px;
    max-height: 70vh;
    box-shadow: var(--shadow-md);
    outline: none;
    color: var(--text-secondary);
  }

  .dialog-header {
    padding: var(--spacing-xl) var(--spacing-2xl);
    border-bottom: 1px solid var(--border-primary);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: var(--gap-lg);
    color: var(--text-primary);
  }

  .header-title :global(svg) {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .header-title h3 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
  }

  .close-button {
    background: transparent;
    border: none;
    color: var(--text-disabled);
    cursor: pointer;
    padding: var(--spacing-sm);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);
  }

  .close-button :global(svg) {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 1px;
  }

  .close-button:hover {
    background: var(--bg-surface-hover);
    color: var(--text-primary);
  }

  .projects-list {
    max-height: 400px;
    overflow-y: auto;
  }

  .empty-state {
    padding: var(--spacing-5xl) var(--spacing-2xl);
    text-align: center;
    color: var(--text-disabled);
  }

  .empty-state p {
    margin: 0;
    font-size: var(--font-size-lg);
  }

  .project-item {
    width: 100%;
    padding: var(--spacing-lg) var(--spacing-2xl);
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: var(--gap-xl);
    transition: background var(--transition-fast);
    color: var(--text-secondary);
  }

  .project-item:hover,
  .project-item.selected {
    background: rgba(255, 255, 255, 0.08);
  }

  .project-icon {
    color: var(--text-accent);
    flex-shrink: 0;
  }

  .project-info {
    flex: 1;
    min-width: 0;
  }

  .project-name {
    font-weight: 500;
    font-size: 14px;
    margin-bottom: 2px;
    color: #ffffff;
  }

  .project-path {
    font-size: 10px;
    color: #888888;
    font-family: "Cascadia Code", monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dialog-footer {
    padding: var(--spacing-lg) var(--spacing-2xl);
    border-top: 1px solid var(--border-primary);
    background: rgba(0, 0, 0, 0.2);
  }

  .shortcuts-info {
    display: flex;
    gap: var(--gap-2xl);
    font-size: var(--font-size-md);
    color: var(--text-disabled);
  }

  .shortcuts-info kbd {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-muted);
    padding: var(--spacing-xs) var(--spacing-md);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-base);
    font-family: var(--font-family-mono);
    border: 1px solid rgba(255, 255, 255, 0.2);
    margin-right: var(--spacing-sm);
  }
  /* ===== Git ===== */
  .project-git-status {
    display: flex;
    align-items: center;
    gap: var(--gap-md);
    margin-top: var(--spacing-xs);
    font-size: var(--font-size-sm);
    color: var(--git-text);
  }

  .branch {
    color: var(--git-branch);
    font-family: var(--font-family-mono);
    font-weight: var(--font-weight-medium);
  }

  .git-indicator {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    color: var(--git-text);
  }

  .git-arrow {
    color: var(--text-disabled);
    padding: 1px var(--spacing-sm);
    font-size: var(--font-size-xs);
    font-family: var(--font-family-mono);
    line-height: 1;
  }

  .git-count {
    font-family: var(--font-family-mono);
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-sm);
  }

  .git-no-upstream {
    background: var(--accent-blue-bg);
    color: var(--accent-blue);
    padding: var(--spacing-xs) var(--spacing-md);
    border-radius: var(--radius-md);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    font-family: var(--font-family-mono);
    border: 1px solid var(--accent-blue-border);
  }

  .git-not-repo {
    color: var(--git-muted);
    font-size: var(--font-size-sm);
  }

</style>
