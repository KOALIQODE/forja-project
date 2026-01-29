<script lang="ts">
  import { FolderOpen, Plus, Clock } from "@lucide/svelte";
  import { onMount, onDestroy } from "svelte";
  import { keyboardManager, createNavigationActions } from "../utils/keyboardManager.js";
  import { openProject, recentProjects } from "../stores/projectStore.js";
  import { openRecentProjectsDialog } from "../stores/dialogStore.js";
  import { open } from "@tauri-apps/plugin-dialog";
  
  // Simulamos obtener la versión del sistema - en producción vendrá de Tauri
  const version = "1.0.0-alpha";
  
  let selectedIndex = 0; // 0, 1, 2 para los tres botones
  let welcomeContainer: HTMLElement;

  async function handleOpenProject() {
    try {
      console.log('Opening project dialog...');
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Project Folder",
      });

      if (selected) {
        console.log("Selected project folder:", selected);
        openProject(selected);
      }
    } catch (error) {
      console.error("Error opening folder dialog:", error);
    }
  }

  function handleNewProject() {
    console.log('Creating new project...');
    // TODO: Implement new project creation
  }

  function handleRecentProjects() {
    console.log('Showing recent projects...');
    openRecentProjectsDialog();
  }

  function moveUp() {
    selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : 2;
    console.log("Moving up, selectedIndex:", selectedIndex);
  }

  function moveDown() {
    selectedIndex = (selectedIndex + 1) % 3;
    console.log("Moving down, selectedIndex:", selectedIndex);
  }

  function selectCurrent() {
    switch(selectedIndex) {
      case 0:
        handleOpenProject();
        break;
      case 1:
        handleNewProject();
        break;
      case 2:
        handleRecentProjects();
        break;
    }
  }

  onMount(() => {
    // Register keyboard navigation for welcome screen
    const navigationActions = createNavigationActions({
      onMoveUp: moveUp,
      onMoveDown: moveDown,
      onSelect: selectCurrent,
    });

    // Add leader key combinations
    const leaderActions = [
      {
        key: ' o', // Space + O
        handler: () => handleOpenProject(),
        description: 'Open Project',
      },
      {
        key: ' n', // Space + N  
        handler: () => handleNewProject(),
        description: 'New Project',
      },
      {
        key: ' r', // Space + R
        handler: () => handleRecentProjects(), 
        description: 'Recent Projects',
      },
    ];

    keyboardManager.registerContext("welcome-screen", [
      ...navigationActions,
      ...leaderActions,
    ]);
    keyboardManager.setActiveContext("welcome-screen");
    keyboardManager.startListening();

    // Focus the container
    if (welcomeContainer) {
      welcomeContainer.focus();
    }

    // Clear any old mocked data (one time cleanup)
    const hasCleanedMockData = localStorage.getItem('forja-cleaned-mock-data');
    if (!hasCleanedMockData) {
      localStorage.removeItem('forja-recent-projects');
      localStorage.setItem('forja-cleaned-mock-data', 'true');
      recentProjects.set([]);
    }
  });

  onDestroy(() => {
    keyboardManager.stopListening();
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<main class="welcome-screen" tabindex="0" bind:this={welcomeContainer}>
  <div class="welcome-container">
    <!-- Header section -->
    <header class="welcome-header">
      <h1 class="app-title">
        <span class="title-main">Forja Studio</span>
        <span class="title-sub">Editor</span>
      </h1>
      <p class="version">v{version}</p>
    </header>

    <!-- Tagline -->
    <section class="tagline-section">
      <p class="tagline">
        The essence of <span class="vim-highlight">Vim</span> in a native interface
      </p>
      <p class="description">
        Keyboard navigation, fast commands, efficient editing
      </p>
    </section>

    <!-- Action buttons -->
    <section class="actions-section">
      <button class="action-btn {selectedIndex === 0 ? 'keyboard-focused' : ''}" on:click={handleOpenProject}>
        <FolderOpen size="20" />
        <span>Open Project</span>
        <kbd class="shortcut">Space + O</kbd>
      </button>

      <button class="action-btn {selectedIndex === 1 ? 'keyboard-focused' : ''}" on:click={handleNewProject}>
        <Plus size="20" />
        <span>New Empty Project</span>
        <kbd class="shortcut">Space + N</kbd>
      </button>

      <button class="action-btn {selectedIndex === 2 ? 'keyboard-focused' : ''}" on:click={handleRecentProjects}>
        <Clock size="20" />
        <span>Recent Projects</span>
        <kbd class="shortcut">Space + R</kbd>
      </button>
    </section>

    <!-- Footer -->
    <footer class="welcome-footer">
      <p class="footer-text">Press <kbd>?</kbd> for keyboard shortcuts</p>
    </footer>
  </div>
</main>

<style>
  .welcome-screen {
    background: var(--gradient-primary);
    color: var(--text-secondary);
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-family-system);
  }

  .welcome-container {
    max-width: 480px;
    width: 100%;
    padding: var(--spacing-6xl) var(--spacing-4xl);
    text-align: center;
  }

  .welcome-header {
    margin-bottom: var(--spacing-4xl);
  }

  .app-title {
    font-size: var(--font-size-5xl);
    font-weight: var(--font-weight-light);
    margin: 0 0 var(--spacing-lg) 0;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }

  .title-main {
    color: var(--text-primary);
    font-weight: var(--font-weight-semibold);
  }

  .title-sub {
    color: var(--text-disabled);
    font-weight: var(--font-weight-light);
  }

  .version {
    color: var(--git-muted);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-medium);
    margin: 0;
    opacity: 0.8;
  }

  .tagline-section {
    margin-bottom: var(--spacing-5xl);
  }

  .tagline {
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-normal);
    margin: 0 0 var(--spacing-xs) 0;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .vim-highlight {
    color: var(--accent-green);
    font-weight: var(--font-weight-semibold);
    background: var(--gradient-accent);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .description {
    font-size: var(--font-size-xl);
    color: #999999;
    margin: 0;
    line-height: 1.5;
  }

  .actions-section {
    display: flex;
    flex-direction: column;
    gap: var(--gap-2xl);
    margin-bottom: var(--spacing-4xl);
  }

  .action-btn {
    background: var(--bg-surface);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-2xl) var(--spacing-3xl);
    color: var(--text-secondary);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-normal);
    display: flex;
    align-items: center;
    justify-content: space-between;
    text-align: left;
    position: relative;
    overflow: hidden;
  }

  .action-btn::before {
    content: "";
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: var(--gradient-shimmer);
    transition: left var(--transition-slow);
  }

  .action-btn:hover::before {
    left: 100%;
  }

  .action-btn:hover {
    border-color: #555555;
    background: var(--bg-surface-hover);
    transform: translateY(-1px);
  }

  .action-btn.keyboard-focused {
    background: var(--bg-surface-focus);
    border-color: var(--border-accent);
    box-shadow: var(--shadow-focus);
  }

  .action-btn.keyboard-focused:hover {
    background: rgba(74, 222, 128, 0.2);
    border-color: var(--border-accent);
    box-shadow: var(--shadow-focus);
    transform: translateY(-1px);
  }

  .welcome-screen:focus {
    outline: none;
  }

  .action-btn span {
    flex: 1;
    margin-left: var(--spacing-lg);
  }

  .shortcut {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-muted);
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-md);
    font-family: var(--font-family-mono);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .welcome-footer {
    opacity: 0.6;
  }

  .footer-text {
    font-size: var(--font-size-lg);
    color: var(--text-disabled);
    margin: 0;
  }

  .footer-text kbd {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-muted);
    padding: var(--spacing-xs) var(--spacing-md);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-md);
    font-family: var(--font-family-mono);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  /* Responsive */
  @media (max-width: 640px) {
    .welcome-container {
      padding: var(--spacing-4xl) var(--spacing-3xl);
    }

    .app-title {
      font-size: var(--font-size-4xl);
    }

    .tagline {
      font-size: var(--font-size-2xl);
    }

    .action-btn {
      padding: var(--spacing-xl) var(--spacing-2xl);
    }
  }

  /* Subtle animations */
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .welcome-header {
    animation: fadeInUp 0.6s ease 0.1s both;
  }

  .tagline-section {
    animation: fadeInUp 0.6s ease 0.2s both;
  }

  .actions-section {
    animation: fadeInUp 0.6s ease 0.3s both;
  }

  .welcome-footer {
    animation: fadeInUp 0.6s ease 0.4s both;
  }
</style>
