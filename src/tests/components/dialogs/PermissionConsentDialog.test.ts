import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: { subscribe: (fn: any) => { fn({ vars: {} }); return () => {}; } },
}));

import PermissionConsentDialog from '$lib/components/dialogs/PermissionConsentDialog.svelte';
import type { PluginPreflightInfo } from '$lib/utils/pluginClient';

const baseInfo: PluginPreflightInfo = {
  name: 'git-tools',
  kind: 'plugin',
  version: '1.2.3',
  permissions: [
    { id: 'buffer.read', description: 'Read buffer contents', risk: 'low' },
    { id: 'workspace.write', description: 'Modify workspace files', risk: 'high' },
    { id: 'events.listen', description: 'Listen for editor events', risk: 'medium' },
  ],
};

describe('PermissionConsentDialog', () => {
  it('renders plugin name and permission request label', () => {
    render(PermissionConsentDialog, { info: baseInfo, onApprove: vi.fn(), onDeny: vi.fn() });

    expect(screen.getByText('Permission Request')).toBeInTheDocument();
    expect(screen.getByText('git-tools')).toBeInTheDocument();
  });

  it('renders each permission id and description', () => {
    render(PermissionConsentDialog, { info: baseInfo, onApprove: vi.fn(), onDeny: vi.fn() });

    expect(screen.getByText('buffer.read')).toBeInTheDocument();
    expect(screen.getByText('Read buffer contents')).toBeInTheDocument();
    expect(screen.getByText('workspace.write')).toBeInTheDocument();
    expect(screen.getByText('Modify workspace files')).toBeInTheDocument();
  });

  it('shows low, medium, and high risk labels', () => {
    render(PermissionConsentDialog, { info: baseInfo, onApprove: vi.fn(), onDeny: vi.fn() });

    expect(screen.getByText('Low risk')).toBeInTheDocument();
    expect(screen.getByText('Medium risk')).toBeInTheDocument();
    expect(screen.getByText('High risk')).toBeInTheDocument();
  });

  it('shows a no permissions message when the permissions list is empty', () => {
    render(PermissionConsentDialog, {
      info: { ...baseInfo, permissions: [] },
      onApprove: vi.fn(),
      onDeny: vi.fn(),
    });

    expect(screen.getByText(/requests no permissions/i)).toBeInTheDocument();
  });

  it('calls onDeny when Deny is clicked', async () => {
    const onDeny = vi.fn();
    render(PermissionConsentDialog, { info: baseInfo, onApprove: vi.fn(), onDeny });

    await fireEvent.click(screen.getByText('Deny'));

    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it('calls onApprove when Approve is clicked', async () => {
    const onApprove = vi.fn();
    render(PermissionConsentDialog, { info: baseInfo, onApprove, onDeny: vi.fn() });

    await fireEvent.click(screen.getByText(/Allow/));

    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('shows the high-risk styling class for high risk permissions', () => {
    render(PermissionConsentDialog, { info: baseInfo, onApprove: vi.fn(), onDeny: vi.fn() });

    expect(screen.getByText('High risk').className).toContain('text-rose-400');
  });
});
