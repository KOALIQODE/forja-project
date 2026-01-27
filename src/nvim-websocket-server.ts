/**
 * WebSocket Server for Neovim communication
 * Provides real-time bidirectional communication
 */

import { WebSocketServer } from 'ws';

const WS_PORT = 8081;
let wsServer: WebSocketServer | null = null;

// Import del singleton nvimClient
let nvimClient: any = null;

async function getNvimClient() {
  if (!nvimClient) {
    const module = await import('./lib/server/nvim/client.js');
    nvimClient = module.nvimClient; // Ya es la instancia singleton
  }
  return nvimClient;
}

export function startNvimWebSocketServer() {
  if (wsServer) {
    // console.log('WebSocket server already running');
    return;
  }

  wsServer = new WebSocketServer({ port: WS_PORT });
  
  wsServer.on('connection', (ws) => {
    // console.log('Neovim WebSocket client connected');
    
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        const client = await getNvimClient(); // Usar la instancia singleton
        let response: any;

        switch (message.type) {
          case 'navigation':
            if (message.key) {
              const result = await client.sendInput(message.key);
              response = {
                type: 'cursor_update',
                cursor: result.cursor,
                error: result.success ? undefined : result.error
              };
            } else {
              response = { type: 'error', error: 'Navigation key required' };
            }
            break;

          case 'command':
            if (message.command) {
              const result = await client.executeCommand(message.command);
              response = {
                type: 'command_result',
                result: result.result,
                cursor: result.cursor,
                error: result.success ? undefined : result.error
              };
            } else {
              response = { type: 'error', error: 'Command required' };
            }
            break;

          case 'cursor_request':
            const cursor = await client.getCursorPosition();
            response = {
              type: 'cursor_update',
              cursor
            };
            break;

          default:
            response = { type: 'error', error: 'Unknown message type' };
        }

        ws.send(JSON.stringify(response));
        
      } catch (error) {
        console.error('WebSocket message error:', error);
        const errorResponse = {
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        };
        ws.send(JSON.stringify(errorResponse));
      }
    });

    ws.on('close', () => {
      // console.log('Neovim WebSocket client disconnected');
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  // console.log(`Neovim WebSocket server started on port ${WS_PORT}`);
}

export function stopNvimWebSocketServer() {
  if (wsServer) {
    wsServer.close();
    wsServer = null;
    console.log('Neovim WebSocket server stopped');
  }
}