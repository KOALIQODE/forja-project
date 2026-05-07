import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { readable } from 'svelte/store';

// --- Mocks (must be hoisted before imports that trigger side effects) ---

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

vi.mock('$lib/stores/projectStore', () => ({
  openProject: vi.fn(),
}));

vi.mock('$lib/stores/dialogStore', () => ({
  openRecentProjectsDialog: vi.fn(),
  openCloneRepositoryDialog: vi.fn(),
}));

vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: readable({ vars: {} }),
}));

// --- Imports after mocks ---

import { open } from '@tauri-apps/plugin-dialog';
import { openProject } from '$lib/stores/projectStore';
import { openCloneRepositoryDialog, openRecentProjectsDialog } from '$lib/stores/dialogStore';
import WelcomeScreen from '$lib/components/WelcomeScreen.svelte';

// ---

describe('WelcomeScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Forja logo', () => {
    render(WelcomeScreen);
    expect(screen.getByRole('img', { name: 'Forja' })).toBeInTheDocument();
  });

  it('renders tagline text', () => {
    render(WelcomeScreen);
    expect(screen.getByText(/Forge your/i)).toBeInTheDocument();
    expect(screen.getByText(/workflow/i)).toBeInTheDocument();
    expect(screen.getByText(/lightweight, modular editor/i)).toBeInTheDocument();
  });

  it('renders version string', () => {
    render(WelcomeScreen);
    expect(screen.getByText(/v1\.0\.0-alpha/)).toBeInTheDocument();
  });

  it('renders both action buttons', () => {
    render(WelcomeScreen);
    expect(screen.getByRole('button', { name: /open project/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clone repository/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recent projects/i })).toBeInTheDocument();
  });

  describe('Open Project button', () => {
    it('opens folder dialog with correct options', async () => {
      vi.mocked(open).mockResolvedValue('/some/path');
      render(WelcomeScreen);

      await fireEvent.click(screen.getByRole('button', { name: /open project/i }));

      expect(open).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
        title: 'Select Project Folder',
      });
    });

    it('calls openProject with the selected path', async () => {
      vi.mocked(open).mockResolvedValue('/my/project');
      render(WelcomeScreen);

      await fireEvent.click(screen.getByRole('button', { name: /open project/i }));

      expect(openProject).toHaveBeenCalledWith('/my/project');
    });

    it('does not call openProject when user cancels (dialog returns null)', async () => {
      vi.mocked(open).mockResolvedValue(null);
      render(WelcomeScreen);

      await fireEvent.click(screen.getByRole('button', { name: /open project/i }));

      expect(openProject).not.toHaveBeenCalled();
    });

    it('logs error and does not crash when dialog throws', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(open).mockRejectedValue(new Error('Dialog failed'));
      render(WelcomeScreen);

      await fireEvent.click(screen.getByRole('button', { name: /open project/i }));

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error opening folder dialog',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('Recent Projects button', () => {
    it('calls openRecentProjectsDialog when clicked', async () => {
      render(WelcomeScreen);

      await fireEvent.click(screen.getByRole('button', { name: /recent projects/i }));

      expect(openRecentProjectsDialog).toHaveBeenCalledTimes(1);
    });
  });

  describe('Clone Repository button', () => {
    it('opens the clone repository dialog when clicked', async () => {
      render(WelcomeScreen);

      await fireEvent.click(screen.getByRole('button', { name: /clone repository/i }));

      expect(openCloneRepositoryDialog).toHaveBeenCalledTimes(1);
    });
  });
});
