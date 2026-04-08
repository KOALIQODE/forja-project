/**
 * App hooks - Initialize services
 */

import type { Handle } from '@sveltejs/kit';

// WebSocket server has been disabled in favor of direct API communication
// to reduce latency.

export const handle: Handle = async ({ event, resolve }) => {
  return resolve(event);
};