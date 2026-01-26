/**
 * API Route: /api/nvim/status
 * Get Neovim connection status and info
 */

import { json } from '@sveltejs/kit';
import { nvimClient } from '$lib/server/nvim/client';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  try {
    const connected = nvimClient.isClientConnected();
    let cursor = { line: 1, col: 1 };
    let bufferContent: string[] = [];

    if (connected) {
      cursor = await nvimClient.getCursorPosition();
      bufferContent = await nvimClient.getBufferContent();
    }

    return json({
      success: true,
      connected,
      cursor,
      bufferLines: bufferContent.length,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Status check error:', error);
    
    return json({
      success: false,
      connected: false,
      error: error instanceof Error ? error.message : 'Status check failed'
    }, { status: 500 });
  }
};