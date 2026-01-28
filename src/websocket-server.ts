/**
 * WebSocket Server for editor communication
 * Provides real-time bidirectional communication
 */

import { WebSocketServer } from 'ws';
import { createServer, Server } from 'http';
import { Socket } from 'net';

const WS_PORT = 8081;
const MAX_PORT_ATTEMPTS = 5;
let wsServer: WebSocketServer | null = null;
let httpServer: Server | null = null;

// Import del singleton client
let editorClient: any = null;

async function getEditorClient() {
  if (!editorClient) {
    const module = await import('./lib/server/nvim/client.js');
    editorClient = module.nvimClient; // Ya es la instancia singleton
  }
  return editorClient;
}

// Kill any process using the port
async function killPortProcess(port: number): Promise<void> {
  try {
    const { exec } = await import('child_process');
    const util = await import('util');
    const execAsync = util.promisify(exec);
    
    // Find process using the port
    const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
    const lines = stdout.trim().split('\n');
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      
      if (pid && /^\d+$/.test(pid)) {
        try {
          await execAsync(`taskkill /F /PID ${pid}`);
          console.log(`Killed process ${pid} using port ${port}`);
        } catch (killError) {
          // Ignore kill errors, process might have already exited
        }
      }
    }
  } catch (error) {
    // Ignore errors, we'll try to start anyway
    console.log(`Could not kill processes on port ${port}, attempting to start anyway`);
  }
}

// Try to start server with port retry logic
async function startServerOnPort(port: number): Promise<void> {
  return new Promise(async (resolve, reject) => {
    // Kill any existing processes on the port first
    await killPortProcess(port);
    
    // Add a small delay to allow port cleanup
    await new Promise(r => setTimeout(r, 500));

    // Crear servidor HTTP
    httpServer = createServer();
    
    // Configurar socket options para reutilización
    httpServer!.on('listening', () => {
      const handle = (httpServer as any)?._handle;
      if (handle && typeof handle.setSimultaneousAccepts === 'function') {
        handle.setSimultaneousAccepts(false);
      }
    });
    
    // Configurar conexiones entrantes
    httpServer!.on('connection', (socket: Socket) => {
      socket.setKeepAlive(true, 30000);
      socket.setNoDelay(true);
    });

    // Handle server errors
    httpServer!.on('error', async (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.log(`Port ${port} is in use, cleaning up...`);
        httpServer?.close();
        httpServer = null;
        
        // Try to kill processes and retry
        await killPortProcess(port);
        await new Promise(r => setTimeout(r, 1000));
        
        reject(error);
      } else {
        reject(error);
      }
    });
    
    wsServer = new WebSocketServer({ 
      server: httpServer!,
      perMessageDeflate: false // Disable compression for better performance
    });
    
    // Start listening
    httpServer!.listen({
      port: port,
      host: '0.0.0.0',
      exclusive: false
    }, () => {
      console.log(`WebSocket server started on port ${port}`);
      resolve();
    });
  });
}

export async function startWebSocketServer(): Promise<void> {
  if (wsServer) {
    console.log('WebSocket server already running');
    return;
  }

  let lastError: Error | null = null;
  
  // Try starting on the default port, with retries
  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    try {
      await startServerOnPort(WS_PORT);
      break; // Success, exit retry loop
    } catch (error: any) {
      lastError = error;
      console.log(`Attempt ${attempt + 1}/${MAX_PORT_ATTEMPTS} failed: ${error.message}`);
      
      if (attempt < MAX_PORT_ATTEMPTS - 1) {
        console.log('Retrying in 2 seconds...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  // If all attempts failed, throw the last error
  if (!wsServer || !httpServer) {
    throw new Error(`Failed to start WebSocket server after ${MAX_PORT_ATTEMPTS} attempts. Last error: ${lastError?.message}`);
  }

  // Configure WebSocket server - use type assertion to help TypeScript
  const activeWsServer: WebSocketServer = wsServer;
  const activeHttpServer: Server = httpServer;
  
  activeWsServer.on('connection', (ws: any) => {
    console.log('WebSocket client connected');
    
    ws.on('message', async (data: any) => {
      try {
        const message = JSON.parse(data.toString());
        const client = await getEditorClient();
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
      console.log('WebSocket client disconnected');
    });

    ws.on('error', (error: any) => {
      console.error('WebSocket client error:', error);
    });
  });

  activeWsServer.on('error', (error: any) => {
    console.error('WebSocket server error:', error);
  });
}

export function stopWebSocketServer(): Promise<void> {
  return new Promise<void>((resolve) => {
    let closedCount = 0;
    const totalToClose = 2;

    function checkComplete() {
      closedCount++;
      if (closedCount >= totalToClose) {
        wsServer = null;
        httpServer = null;
        console.log('WebSocket server stopped');
        resolve();
      }
    }

    if (wsServer) {
      wsServer.close((error) => {
        if (error) console.error('Error closing WebSocket server:', error);
        checkComplete();
      });
    } else {
      checkComplete();
    }

    if (httpServer) {
      httpServer.close((error: any) => {
        if (error) console.error('Error closing HTTP server:', error);
        checkComplete();
      });
    } else {
      checkComplete();
    }

    // Force cleanup after timeout
    setTimeout(() => {
      if (wsServer || httpServer) {
        wsServer = null;
        httpServer = null;
        console.log('WebSocket server force stopped');
        resolve();
      }
    }, 5000);
  });
}