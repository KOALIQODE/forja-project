import { writable, get } from "svelte/store";
import { currentProject } from "./projectStore";

// State: Map<projectId, Set<lspId>>
export const enabledLspServers = writable<Record<string, Set<string>>>({});

export function isLspEnabled(projectId: string, lspId: string): boolean {
  const state = get(enabledLspServers);
  return state[projectId]?.has(lspId) ?? false;
}

export function toggleLsp(projectId: string, lspId: string) {
  enabledLspServers.update((state) => {
    const projectServers = new Set(state[projectId] || []);
    if (projectServers.has(lspId)) {
      projectServers.delete(lspId);
    } else {
      projectServers.add(lspId);
    }
    return { ...state, [projectId]: projectServers };
  });
}

// Ensure the project ID exists in the state
currentProject.subscribe((projectId) => {
  if (projectId) {
    enabledLspServers.update((state) => {
      if (!state[projectId]) {
        return { ...state, [projectId]: new Set<string>() };
      }
      return state;
    });
  }
});
