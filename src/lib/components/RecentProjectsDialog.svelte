<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { FolderOpen, Clock, X } from "@lucide/svelte";
  import {
    recentProjects,
    openProject,
    shortenedPaths,
    gitStatuses,
  } from "../stores/projectStore.js";
  import {
    keyboardManager,
    createNavigationActions,
  } from "../utils/keyboardManager.js";

  let {
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
  } = $props();

  let selectedIndex = $state(0);
  let dialogElement = $state<HTMLElement>();

  function getDisplayPath(index: number): string {
    return $shortenedPaths[index] || $recentProjects[index] || "";
  }

  function handleProjectSelect(projectPath: string) {
    openProject(projectPath);
    onClose();
  }

  function getProjectName(path: string): string {
    return path.split(/[/\\]/).pop() || "Unknown Project";
  }

  function moveUp() {
    selectedIndex = Math.max(selectedIndex - 1, 0);
  }

  function moveDown() {
    selectedIndex = Math.min(selectedIndex + 1, $recentProjects.length - 1);
  }

  function selectCurrent() {
    if ($recentProjects[selectedIndex]) {
      handleProjectSelect($recentProjects[selectedIndex]);
    }
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

      // Adjust selectedIndex if needed
      if (selectedIndex >= $recentProjects.length - 1) {
        selectedIndex = Math.max(0, $recentProjects.length - 2);
      }
    }
  }

  onMount(async () => {
    if (isOpen) {
      selectedIndex = 0;

      // Register keyboard context for dialog
      const navigationActions = createNavigationActions({
        onMoveUp: moveUp,
        onMoveDown: moveDown,
        onSelect: selectCurrent,
        onCancel: closeDialog,
      });

      // Add delete action
      navigationActions.push({
        key: "d",
        handler: deleteCurrentProject,
        description: "Delete project from recent list",
      });

      keyboardManager.registerContext(
        "recent-projects-dialog",
        navigationActions,
      );
      keyboardManager.setActiveContext("recent-projects-dialog");

      if (dialogElement) {
        dialogElement.focus();
      }
    }
  });

  onDestroy(() => {
    // Context will be restored by DialogManager
  });

  // Watch for isOpen changes
  $effect(() => {
    if (isOpen) {
      selectedIndex = 0;

      // Register keyboard context for dialog
      const navigationActions = createNavigationActions({
        onMoveUp: moveUp,
        onMoveDown: moveDown,
        onSelect: selectCurrent,
        onCancel: closeDialog,
      });

      // Add delete action
      navigationActions.push({
        key: "d",
        handler: deleteCurrentProject,
        description: "Delete project from recent list",
      });

      keyboardManager.registerContext(
        "recent-projects-dialog",
        navigationActions,
      );
      keyboardManager.setActiveContext("recent-projects-dialog");

      setTimeout(() => {
        if (dialogElement) {
          dialogElement.focus();
        }
      }, 0);
    }
  });
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dialog-backdrop" onclick={onClose}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="dialog-container"
      onclick={(e) => e.stopPropagation()}
      bind:this={dialogElement}
      tabindex="0"
    >
      <div class="dialog-header">
        <div class="header-title">
          <Clock size={16} />
          <h3>Recent Projects</h3>
        </div>
        <button class="close-button" onclick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div class="projects-list">
        {#if $recentProjects.length === 0}
          <div class="empty-state">
            <p>No recent projects found</p>
          </div>
        {:else}
          {#each $recentProjects as project, index}
            {@const git = $gitStatuses[index]}
            <button
              class="project-item {selectedIndex === index ? 'selected' : ''}"
              onclick={() => handleProjectSelect(project)}
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
                      <span class="git-no-upstream">Publish</span>
                    {/if}
                  {:else}
                    <span class="git-not-repo">No Git</span>
                  {/if}
                </div>
              {/if}
            </button>
          {/each}
        {/if}
      </div>

      <div class="dialog-footer">
        <div class="shortcuts-info">
          <!-- <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span> -->
          <span><kbd>Enter</kbd> Open</span>
          <span><kbd>D</kbd> Delete</span>
          <span><kbd>Esc</kbd> Close</span>
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
    background: linear-gradient(135deg, #141414 0%, #1f1f1f 100%);
    border: 1px solid #404040;
    border-radius: 3px;
    width: 600px;
    max-height: 70vh;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.8);
    outline: none;
    color: #e0e0e0;
  }

  .dialog-header {
    padding: 16px 20px;
    border-bottom: 1px solid #333333;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #ffffff;
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
    font-size: 16px;
    font-weight: 600;
  }

  .close-button {
    background: transparent;
    border: none;
    color: #888888;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .close-button :global(svg) {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 1px;
  }

  .close-button:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
  }

  .projects-list {
    max-height: 400px;
    overflow-y: auto;
  }

  .empty-state {
    padding: 40px 20px;
    text-align: center;
    color: #888888;
  }

  .empty-state p {
    margin: 0;
    font-size: 14px;
  }

  .project-item {
    width: 100%;
    padding: 12px 20px;
    background: transparent;
    border: none;
    border-radius: 4px;
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 12px;
    transition: background 0.15s ease;
    color: #e0e0e0;
  }

  .project-item:hover,
  .project-item.selected {
    background: rgba(255, 255, 255, 0.08);
  }

  .project-icon {
    color: #4ade80;
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
    padding: 12px 20px;
    border-top: 1px solid #333333;
    background: rgba(0, 0, 0, 0.2);
  }

  .shortcuts-info {
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: #888888;
  }

  .shortcuts-info kbd {
    background: rgba(255, 255, 255, 0.1);
    color: #cccccc;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 11px;
    font-family: "Cascadia Code", monospace;
    border: 1px solid rgba(255, 255, 255, 0.2);
    margin-right: 4px;
  }
  /* ===== Git ===== */
  .project-git-status {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
    font-size: 10px;
    color: #6b7280;
  }

  .branch {
    color: #888888;
    font-family: "Cascadia Code", monospace;
    font-weight: 500;
  }

  .git-indicator {
    display: flex;
    align-items: center;
    gap: 2px;
    color: #6b7280;
  }

  .git-arrow {
    color: #888888;
    padding: 1px 3px;
    font-size: 9px;
    font-family: "Cascadia Code", monospace;
    line-height: 1;
  }

  .git-count {
    font-family: "Cascadia Code", monospace;
    font-weight: 500;
    font-size: 10px;
  }

  .git-no-upstream {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 500;
    font-family: "Cascadia Code", monospace;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .git-not-repo {
    color: #666666;
    font-size: 10px;
  }

</style>
