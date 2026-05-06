import '@testing-library/jest-dom';

// Provide a working localStorage for store modules that initialize at load time.
// jsdom's Storage IDL wrapper can have broken prototype chains in some vitest
// configurations; this universal mock ensures all store tests work reliably.
const _storage: Record<string, string> = {};
const localStorageMock: Storage = {
  getItem: (key: string) => _storage[key] ?? null,
  setItem: (key: string, value: string) => { _storage[key] = String(value); },
  removeItem: (key: string) => { delete _storage[key]; },
  clear: () => { Object.keys(_storage).forEach(k => delete _storage[k]); },
  get length() { return Object.keys(_storage).length; },
  key: (index: number) => Object.keys(_storage)[index] ?? null,
};
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});
