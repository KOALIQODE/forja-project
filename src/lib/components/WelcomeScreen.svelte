<script lang="ts">
  import { FolderOpen, Plus, Clock } from "@lucide/svelte";
  import { onMount, onDestroy } from "svelte";
  import { openProject, recentProjects } from "../stores/projectStore";
  import { openRecentProjectsDialog } from "../stores/dialogStore";
  import { open } from "@tauri-apps/plugin-dialog";
  
  // Nvim integration imports
  import { 
    nvimConnected, 
    nvimNavEnabled, 
    cursorPosition, 
    connectNvim,
    sendNvimCommand 
  } from "$lib/stores/nvimStore";

  // Simulamos obtener la versión del sistema - en producción vendrá de Tauri
  const version = "1.0.0-alpha";

  let selectedIndex = 0; // 0, 1, 2 para los tres botones
  let welcomeContainer: HTMLElement;
  let showNvimDebug = true; // Para mostrar info de debug

  // Map nvim cursor line to button selection (line 1-3 maps to buttons 0-2)
  $: {
    if ($nvimNavEnabled && $cursorPosition) {
      selectedIndex = Math.max(0, Math.min(2, $cursorPosition.line - 1));
    }
  }

  // Initialize nvim navigation
  async function initializeNvim() {
    const connected = await connectNvim();
    if (connected) {
      // Enable nvim navigation mode
      $nvimNavEnabled = true;
      // Set initial cursor position to line 1 (first button)
      await sendNvimCommand('1G', 'command'); // Go to line 1
    }
  }

  async function handleOpenProject() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Project Folder",
      });

      if (selected) {
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

  // function handleRecentProjects() {
  //   console.log('Showing recent projects...');
  //   openRecentProjectsDialog();
  // }

  // function handleNewProject() {
  //   console.log('Creating new project...');
  //   // TODO: Implement new project creation
  // }

  function handleRecentProjects() {
    console.log('Showing recent projects...');
    openRecentProjectsDialog();
  }

  // Navigation via nvim j/k keys
  async function handleNvimNavigation() {
    if (!$nvimNavEnabled) return;
    
    // Listen for nvim navigation
    document.addEventListener('keydown', async (e) => {
      if (!$nvimNavEnabled) return;
      
      if (e.key === 'j') {
        e.preventDefault();
        await sendNvimCommand('j', 'input');
      } else if (e.key === 'k') {
        e.preventDefault();
        await sendNvimCommand('k', 'input');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectCurrent();
      }
    });
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

  onMount(async () => {
    // Initialize nvim connection and navigation
    await initializeNvim();
    
    // Setup nvim navigation listeners
    await handleNvimNavigation();

    // Clear any old mocked data (one time cleanup)
    const hasCleanedMockData = localStorage.getItem('forja-cleaned-mock-data');
    if (!hasCleanedMockData) {
      localStorage.removeItem('forja-recent-projects');
      localStorage.setItem('forja-cleaned-mock-data', 'true');
      recentProjects.set([]);
    }
  });

  onDestroy(() => {
    // Clean up nvim navigation listeners
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
      <button class="action-btn primary {selectedIndex === 0 ? 'keyboard-focused' : ''}" on:click={handleOpenProject}>
        <FolderOpen size="20" />
        <span>Open Project</span>
        <kbd class="shortcut">Space+O</kbd>
      </button>

      <button class="action-btn secondary {selectedIndex === 1 ? 'keyboard-focused' : ''}" on:click={handleNewProject}>
        <Plus size="20" />
        <span>New Empty Project</span>
        <kbd class="shortcut">Space+N</kbd>
      </button>

      <button class="action-btn secondary {selectedIndex === 2 ? 'keyboard-focused' : ''}" on:click={handleRecentProjects}>
        <Clock size="20" />
        <span>Recent Projects</span>
        <kbd class="shortcut">Space+R</kbd>
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
    background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
    color: #e0e0e0;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family:
      -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  .welcome-container {
    max-width: 480px;
    width: 100%;
    padding: 48px 32px;
    text-align: center;
  }

  .welcome-header {
    margin-bottom: 32px;
  }

  .app-title {
    font-size: 48px;
    font-weight: 300;
    margin: 0 0 12px 0;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }

  .title-main {
    color: #ffffff;
    font-weight: 600;
  }

  .title-sub {
    color: #888888;
    font-weight: 300;
  }

  .version {
    color: #666666;
    font-size: 14px;
    font-weight: 500;
    margin: 0;
    opacity: 0.8;
  }

  .tagline-section {
    margin-bottom: 40px;
  }

  .tagline {
    font-size: 24px;
    font-weight: 400;
    margin: 0 0 2px 0;
    color: #cccccc;
    line-height: 1.4;
  }

  .vim-highlight {
    color: #4ade80;
    font-weight: 600;
    background: linear-gradient(45deg, #4ade80, #22c55e);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .description {
    font-size: 16px;
    color: #999999;
    margin: 0;
    line-height: 1.5;
  }

  .actions-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 32px;
  }

  .action-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid #333333;
    border-radius: 8px;
    padding: 20px 24px;
    color: #e0e0e0;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
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
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.05),
      transparent
    );
    transition: left 0.5s ease;
  }

  .action-btn:hover::before {
    left: 100%;
  }

  .action-btn.primary {
    border-color: #333333;
    background: rgba(255, 255, 255, 0.05);
  }

  .action-btn.primary:hover {
    border-color: #555555;
    background: rgba(255, 255, 255, 0.1);
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(255, 255, 255, 0.1);
  }

  .action-btn.secondary:hover {
    border-color: #555555;
    background: rgba(255, 255, 255, 0.1);
    transform: translateY(-1px);
  }

  .action-btn.keyboard-focused {
    background: rgba(74, 222, 128, 0.15);
    border-color: #4ade80;
    box-shadow: 0 0 0 2px rgba(74, 222, 128, 0.3);
  }

  .welcome-screen:focus {
    outline: none;
  }

  .action-btn span {
    flex: 1;
    margin-left: 12px;
  }

  .shortcut {
    background: rgba(255, 255, 255, 0.1);
    color: #cccccc;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-family: "Courier New", monospace;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .welcome-footer {
    opacity: 0.6;
  }

  .footer-text {
    font-size: 14px;
    color: #888888;
    margin: 0;
  }

  .footer-text kbd {
    background: rgba(255, 255, 255, 0.1);
    color: #cccccc;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 12px;
    font-family: "Courier New", monospace;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  /* Responsive */
  @media (max-width: 640px) {
    .welcome-container {
      padding: 32px 24px;
    }

    .app-title {
      font-size: 36px;
    }

    .tagline {
      font-size: 20px;
    }

    .action-btn {
      padding: 16px 20px;
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
