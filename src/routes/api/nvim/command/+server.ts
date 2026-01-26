/**
 * API Route: /api/nvim/command
 * Execute Neovim commands
 */

import { json } from '@sveltejs/kit';
import { nvimClient } from '$lib/server/nvim/client';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { command, type = 'command' } = body;

    if (!command) {
      return json({
        success: false,
        error: 'Command is required'
      }, { status: 400 });
    }

    let result;
    
    if (type === 'input') {
      // Send input keys (for navigation like hjkl)
      result = await nvimClient.sendInput(command);
    } else {
      // Execute command (like :w, :q, etc)
      result = await nvimClient.executeCommand(command);
    }

    return json(result);

  } catch (error) {
    console.error('Command execution error:', error);
    
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown command error'
    }, { status: 500 });
  }
};