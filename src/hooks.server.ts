/**
 * App hooks - Initialize services
 */

import { startWebSocketServer } from './websocket-server.js';
import type { Handle } from '@sveltejs/kit';

// Start WebSocket server on app initialization
startWebSocketServer().catch(error => {
  console.error('Failed to start WebSocket server:', error);
  // Don't block the app from starting even if WebSocket fails
});

export const handle: Handle = async ({ event, resolve }) => {
  return resolve(event);
};