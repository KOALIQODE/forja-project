/**
 * API Route: /api/nvim/connect
 * Initialize connection to embedded Neovim instance
 */

import { json } from '@sveltejs/kit';
import { nvimClient } from '$lib/server/nvim/client';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    await nvimClient.connect();
    const cursor = await nvimClient.getCursorPosition();

    return json({
      success: true,
      message: 'Neovim connected successfully',
      cursor,
      connected: nvimClient.isClientConnected()
    });

  } catch (error) {
    console.error('Connection error:', error);
    
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown connection error',
      connected: false
    }, { status: 500 });
  }
};