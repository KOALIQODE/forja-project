export const navigating = { subscribe: (fn: (v: null) => void) => { fn(null); return () => {}; } };
export const page = { subscribe: (fn: (v: object) => void) => { fn({}); return () => {}; } };
export const updated = { subscribe: (fn: (v: boolean) => void) => { fn(false); return () => {}; } };
