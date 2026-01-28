/**
 * WebSocket Server for Neovim communication
 * Provides real-time bidirectional communication
 */

import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { Socket } from 'net';

const WS_PORT = 8081;
let wsServer: WebSocketServer | null = null;
let httpServer: any = null;

// Import del singleton nvimClient
let nvimClient: any = null;

async function getNvimClient() {
  if (!nvimClient) {
    const module = await import('./lib/server/nvim/client.js');
    nvimClient = module.nvimClient; // Ya es la instancia singleton
  }
  return nvimClient;
}

export function startWebSocketServer() {
  if (wsServer) {
    // console.log('WebSocket server already running');
    return;
  }

  // Crear servidor HTTP
  httpServer = createServer();
  
  // Configurar SO_REUSEADDR en el servidor
  httpServer.on('connection', (socket: Socket) => {
    socket.setKeepAlive(true);
    socket.setNoDelay(true);
  });
  
  wsServer = new WebSocketServer({ 
    server: httpServer
  });
  
  // Habilitar reutilización de dirección y puerto
  httpServer.listen({
    port: WS_PORT,
    host: '0.0.0.0'
  }, () => {
    // console.log(`Neovim WebSocket server started on port ${WS_PORT}`);
  });

  // Configurar para reutilizar el puerto cuando el servidor se cierre
  httpServer.on('close', () => {
    // Esto ayuda a liberar el puerto más rápidamente
    setTimeout(() => {
      if (httpServer && httpServer._handle) {
        httpServer._handle.close();
      }
    }, 100);
  });
  
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

export function stopWebSocketServer() {
  if (wsServer) {
    wsServer.close();
    wsServer = null;
  }
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
  console.log('WebSocket server stopped');
}