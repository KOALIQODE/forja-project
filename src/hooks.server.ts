/**
 * App hooks - Initialize services
 */

import { startWebSocketServer } from './websocket-server.js';
import type { Handle } from '@sveltejs/kit';

// Start WebSocket server on app initialization
startWebSocketServer();

export const handle: Handle = async ({ event, resolve }) => {
  return resolve(event);
};