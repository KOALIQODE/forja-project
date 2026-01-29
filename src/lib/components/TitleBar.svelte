<script>
  import {
    Bell,
    Puzzle,
    User,
    BadgeQuestionMark,
    Minus,
    Square,
    X,
    Download,
    Settings,
  } from "@lucide/svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  const appWindow = getCurrentWindow();

  function handleMinimize() {
    appWindow.minimize();
  }

  function handleMaximize() {
    appWindow.toggleMaximize();
  }

  function handleClose() {
    appWindow.close();
  }
</script>

<header class="titlebar">
  <!-- Left section - Logo/Brand -->
  <div class="titlebar-left">
    <div class="logo"></div>
  </div>

  <!-- Right section - Actions & Controls -->
  <div class="titlebar-right">
    <!-- Notification & User actions -->
    <div class="actions">
      <button class="action-btn" title="Notifications">
        <Bell size="16" />
      </button>
      <button class="action-btn">
        <Puzzle size="16" />
      </button>
      <!-- <button class="action-btn">
        <Download size="16" />
      </button> -->
      <button class="action-btn" title="Profile">
        <User size="16" />
      </button>
      <button class="action-btn" title="Settings">
        <Settings size="16" />
      </button>
      <button class="action-btn" title="Help">
        <BadgeQuestionMark size="16" />
      </button>
    </div>

    <!-- Window controls -->
    <div class="window-controls">
      <button
        class="control-btn minimize"
        title="Minimize"
        on:click={handleMinimize}
      >
        <Minus size="14" />
      </button>
      <button
        class="control-btn maximize"
        title="Maximize"
        on:click={handleMaximize}
      >
        <Square size="12" />
      </button>
      <button class="control-btn close" title="Close" on:click={handleClose}>
        <X size="14" />
      </button>
    </div>
  </div>
</header>

<style>
  .titlebar {
    background: var(--gradient-primary);
    border-bottom: 1px solid var(--border-secondary);
    color: var(--text-secondary);
    height: var(--titlebar-height);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0;
    user-select: none;
    -webkit-app-region: drag;
  }

  .titlebar-left {
    display: flex;
    align-items: center;
    padding-left: 16px;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px;
    width: 20px;
    border-radius: 50%;
    background-color: #2a2a2a;
    height: 20px;
  }

  .titlebar-right {
    display: flex;
    align-items: center;
    -webkit-app-region: no-drag;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding-right: var(--spacing-lg);
  }

  .action-btn {
    background: transparent;
    border: none;
    color: #b0b0b0;
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);
  }

  .action-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary);
  }

  .window-controls {
    display: flex;
    align-items: center;
    height: var(--titlebar-height);
  }

  .control-btn {
    background: transparent;
    border: none;
    color: #b0b0b0;
    width: 46px;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .control-btn.minimize:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
  }

  .control-btn.maximize:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
  }

  .control-btn.close:hover {
    background: #e74c3c;
    color: #ffffff;
  }

  .control-btn:active {
    transform: scale(0.95);
  }

  /* Dark theme enhancements */
  @media (prefers-color-scheme: dark) {
    .titlebar {
      background: linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%);
      border-bottom-color: #2a2a2a;
    }
  }
</style>
