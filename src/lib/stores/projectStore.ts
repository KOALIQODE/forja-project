import { writable } from 'svelte/store';

export const currentProject = writable<string | null>(null);

// Recent projects with localStorage persistence
function createRecentProjectsStore() {
  const STORAGE_KEY = 'forja-recent-projects';
  
  // Save to localStorage
  function saveRecentProjects(projects: string[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch (error) {
      console.error('Error saving recent projects:', error);
    }
  }
  
  // Load from localStorage
  function loadRecentProjects(): string[] {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        
        // Handle migration from old format (objects) to new format (strings)
        if (Array.isArray(parsed)) {
          if (parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0].path) {
            // Old format: array of objects with path property
            console.log('Migrating old recent projects format');
            const migrated = parsed.map((item: any) => item.path).filter((path: any) => typeof path === 'string');
            saveRecentProjects(migrated); // Save in new format
            return migrated;
          } else if (parsed.every((item: any) => typeof item === 'string')) {
            // New format: array of strings
            return parsed;
          }
        }
      }
    } catch (error) {
      console.error('Error loading recent projects:', error);
    }
    return [];
  }
  
  const { subscribe, set, update } = writable<string[]>(loadRecentProjects());
  
  return {
    subscribe,
    set: (projects: string[]) => {
      set(projects);
      saveRecentProjects(projects);
    },
    update: (fn: (projects: string[]) => string[]) => {
      update((projects) => {
        const newProjects = fn(projects);
        saveRecentProjects(newProjects);
        return newProjects;
      });
    }
  };
}

export const recentProjects = createRecentProjectsStore();

export function openProject(projectPath: string) {
  console.log('Opening project via store:', projectPath);
  currentProject.set(projectPath);
  
  // Add to recent projects
  recentProjects.update(projects => {
    const filtered = projects.filter(p => p !== projectPath);
    return [projectPath, ...filtered].slice(0, 10); // Keep only last 10 projects
  });
  
  console.log('Updated currentProject store to:', projectPath);
}

export function closeProject() {
  console.log('Closing current project');
  currentProject.set(null);
}