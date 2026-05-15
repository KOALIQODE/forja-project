import {
  initGitReactivity,
  disposeGitReactivity,
} from "$lib/init/gitReactivity";
import { initPlugins } from "$lib/stores/pluginStore";
import { dialogs } from "./dialogs";
import { get } from "svelte/store";
import { currentProject } from "../stores/projectStore";
import { activeBufferId, openBuffer } from "../stores/bufferStore";
// import { watchLockfile } from "$lib/utils/securityClient";
// import { clearDepsState, closeDepsSidebar } from "$lib/stores/DepsStore";
// import { clearAuditReport } from "$lib/stores/securityStore";
/**
 * Program Orchestrator
 * Centralizes the initialization and cleanup of all core systems.
 */
export const program = {
  /**
   * Main entry point for application setup.
   * Called once when the root layout mounts.
   */
  async initialize() {
    console.log("[program] Initializing core systems...");

    // 1. Reactive systems (Git, file watching)
    await initGitReactivity();

    // 2. Plugin system
    initPlugins();

    // 3. UI Services (Shortcuts)
    const cleanupShortcuts = dialogs.initialize();

    // 4. Project Watcher (for auto-opening README)
    const unsubscribeProject = currentProject.subscribe(async (project) => {
      if (project && !get(activeBufferId)) {
        await this.autoOpenReadme(project);
      }
    });

    // const unsubscribeWatcher = currentProject.subscribe((project) => {
    //   if (project) {
    //     void watchLockfile(project);
    //   } else {
    //     closeDepsSidebar();
    //     void clearDepsState();
    //     clearAuditReport();
    //   }
    // });

    return () => {
      console.log("[program] Disposing core systems...");
      cleanupShortcuts();
      disposeGitReactivity();
      unsubscribeProject();
      // unsubscribeWatcher();
    };
  },

  /**
   * Attempts to open the README.md file of the project.
   */
  autoOpenReadme(projectPath: string) {
    try {
      const readmePath =
        projectPath + (projectPath.match(/[/\\]$/) ? "" : "/") + "README.md";
      // We assume openBuffer handles existence check or fails gracefully
      openBuffer(readmePath);
    } catch (error) {
      console.log("[program] No se pudo auto-abrir README.md:", error);
    }
  },
};
