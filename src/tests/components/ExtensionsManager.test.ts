import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';

const mockInvoke = vi.hoisted(() => vi.fn());
const mockCloseDialog = vi.hoisted(() => vi.fn());
const mockRefreshPlugins = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockActivateThemeByName = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockDisablePlugin = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockEnablePlugin = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: { subscribe: (fn: any) => { fn({ vars: {} }); return () => {}; } },
}));
vi.mock('$lib/stores/dialogStore', () => ({
  closeDialog: mockCloseDialog,
}));
vi.mock('$lib/stores/pluginStore', () => ({
  loadedPlugins: { subscribe: (fn: any) => { fn([]); return () => {}; } },
  knownPlugins: {
    subscribe: (fn: any) => {
      fn([
        { name: 'formatter', kind: 'plugin', version: '1.0.0', permissions: ['buffer.read'], commands: ['fmt'], dir_path: '/plugins/formatter' },
        { name: 'nightfox', kind: 'theme', version: '2.0.0', permissions: ['theme.apply'], commands: [] },
      ]);
      return () => {};
    },
  },
  disabledPluginNames: { subscribe: (fn: any) => { fn(new Set<string>()); return () => {}; } },
  activeTheme: { subscribe: (fn: any) => { fn(null); return () => {}; }, set: vi.fn() },
  pluginLoading: { subscribe: (fn: any) => { fn(false); return () => {}; } },
  refreshPlugins: mockRefreshPlugins,
  activateThemeByName: mockActivateThemeByName,
  unloadPlugin: vi.fn(),
  disablePlugin: mockDisablePlugin,
  enablePlugin: mockEnablePlugin,
}));
vi.mock('$lib/utils/themeEngine', () => ({
  clearTheme: vi.fn(),
}));
vi.mock('$lib/utils/pluginClient', () => ({
  pluginUnload: vi.fn(),
  pluginLoadFromPath: vi.fn().mockResolvedValue(undefined),
  pluginPreflight: vi.fn().mockResolvedValue({ name: 'x', kind: 'plugin', version: '1.0.0', permissions: [] }),
}));
vi.mock('$lib/components/dialogs/PermissionConsentDialog.svelte', () => ({
  default: () => null,
}));

import ExtensionsManager from '$lib/components/dialogs/ExtensionsManager.svelte';

describe('ExtensionsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === 'list_lsp_servers') {
        return [
          {
            id: 'tsserver',
            name: 'TypeScript Language Server',
            language: 'typescript',
            description: 'TypeScript support',
            method: 'npm',
            binary: 'typescript-language-server',
            installed: false,
            version: null,
          },
        ];
      }
      return null;
    });
  });

  it('renders the extensions dialog and default LSP content', async () => {
    render(ExtensionsManager);

    expect(screen.getByText('EXTENSIONS')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('TypeScript Language Server')).toBeInTheDocument();
    });
  });

  it('switches to the Plugins tab and shows plugin entries', async () => {
    render(ExtensionsManager);

    await fireEvent.click(screen.getByRole('button', { name: /Plugins/i }));

    expect(screen.getByText('formatter')).toBeInTheDocument();
    expect(screen.getByText('Commands: fmt')).toBeInTheDocument();
  });

  it('filters the current tab using the search input', async () => {
    render(ExtensionsManager);
    await fireEvent.click(screen.getByRole('button', { name: /Plugins/i }));

    const input = screen.getByPlaceholderText('Search…');
    await fireEvent.input(input, { target: { value: 'missing' } });

    expect(screen.getByText('No plugins loaded')).toBeInTheDocument();
  });

  it('activates a theme from the Themes tab', async () => {
    render(ExtensionsManager);
    await fireEvent.click(screen.getByRole('button', { name: /Themes/i }));
    await fireEvent.click(screen.getByRole('button', { name: /Activate/i }));

    expect(mockActivateThemeByName).toHaveBeenCalledWith('nightfox');
  });

  it('calls install_lsp_server when installing an LSP server', async () => {
    render(ExtensionsManager);

    await waitFor(() => screen.getByRole('button', { name: /Install/i }));
    await fireEvent.click(screen.getByRole('button', { name: /Install/i }));

    expect(mockInvoke).toHaveBeenCalledWith('install_lsp_server', { id: 'tsserver' });
  });
});
