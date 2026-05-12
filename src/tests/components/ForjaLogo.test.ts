import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

import ForjaLogo from '$lib/components/ForjaLogo.svelte';

describe('ForjaLogo', () => {
  it('renders an SVG with image semantics', () => {
    render(ForjaLogo);

    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('uses the accessible Forja label', () => {
    render(ForjaLogo);

    expect(screen.getByRole('img', { name: 'Forja' })).toBeInTheDocument();
  });

  it('renders the three logo rectangles', () => {
    const { container } = render(ForjaLogo);

    expect(container.querySelectorAll('rect')).toHaveLength(3);
  });
});
