import { writable } from 'svelte/store';

/**
 * Store para mantener el estado de expansión de las carpetas del explorador.
 * Usamos un Set de rutas absolutas para persistir qué carpetas están abiertas.
 * Retornamos una nueva instancia del Set en cada cambio para garantizar reactividad.
 */
function createExplorerStore() {
  const { subscribe, update } = writable<Set<string>>(new Set());

  return {
    subscribe,
    toggle: (path: string) => update(set => {
      const newSet = new Set(set);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    }),
    expand: (path: string) => update(set => {
      const newSet = new Set(set);
      newSet.add(path);
      return newSet;
    }),
    collapse: (path: string) => update(set => {
      const newSet = new Set(set);
      newSet.delete(path);
      return newSet;
    }),
    clear: () => update(() => new Set())
  };
}

export const expandedPaths = createExplorerStore();
