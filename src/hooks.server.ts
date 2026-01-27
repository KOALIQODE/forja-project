/**
 * App hooks - Initialize services
 */

import { startNvimWebSocketServer } from './nvim-websocket-server.js';
import type { Handle } from '@sveltejs/kit';

// Start WebSocket server on app initialization
startNvimWebSocketServer();

export const handle: Handle = async ({ event, resolve }) => {
  return resolve(event);
};