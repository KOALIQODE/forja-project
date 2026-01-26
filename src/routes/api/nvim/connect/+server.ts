/**
 * API Route: /api/nvim/connect
 * Initialize connection to embedded Neovim instance with dynamic buffer
 */

import { json } from '@sveltejs/kit';
import { nvimClient } from '$lib/server/nvim/client';
import { BUFFER_IDS } from '$lib/nvim/contentIds';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { componentType = BUFFER_IDS.WELCOME_SCREEN, options } = await request.json().catch(() => ({}));
    
    const result = await nvimClient.createComponentBuffer(componentType, options);
    
    if (result.success) {
      return json({
        success: true,
        message: `Buffer created for ${componentType}`,
        cursor: result.cursor,
        bufferId: result.result?.bufferId,
        maxLines: result.result?.maxLines,
        connected: nvimClient.isClientConnected()
      });
    } else {
      return json({
        success: false,
        error: result.error || 'Failed to create component buffer',
        connected: nvimClient.isClientConnected()
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Connection error:', error);
    
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown connection error',
      connected: false
    }, { status: 500 });
  }
};