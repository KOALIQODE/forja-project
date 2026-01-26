/**
 * API Route: /api/nvim/cursor
 * Get current cursor position
 */

import { json } from '@sveltejs/kit';
import { nvimClient } from '$lib/server/nvim/client';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  try {
    const cursor = await nvimClient.getCursorPosition();
    
    return json({
      success: true,
      cursor,
      timestamp: Date.now(),
      connected: nvimClient.isClientConnected()
    });

  } catch (error) {
    console.error('Cursor position error:', error);
    
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get cursor position',
      cursor: { line: 1, col: 1 },
      connected: nvimClient.isClientConnected()
    }, { status: 500 });
  }
};