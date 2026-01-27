/**
 * Nvim Embed Client - Singleton Pattern with Dynamic Buffer Management
 * Manages a single embedded Neovim instance with multiple dynamic buffers
 */

import { attach } from 'neovim';
import type { CursorPosition, NvimResponse } from './types';
import { BufferManager } from './bufferManager';

export class NvimEmbedClient {
  private static instance: NvimEmbedClient | null = null;
  private nvim: any = null;
  private nvimProcess: any = null;
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;
  private bufferManager = new BufferManager();

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): NvimEmbedClient {
    if (!NvimEmbedClient.instance) {
      NvimEmbedClient.instance = new NvimEmbedClient();
    }
    return NvimEmbedClient.instance;
  }

  /**
   * Connect to embedded Neovim instance
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    // If connection is already in progress, wait for it
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this._doConnect();
    await this.connectionPromise;
  }

  private async _doConnect(): Promise<void> {
    try {
      // Import child_process dynamically (server-side only)
      const { spawn } = await import('node:child_process');
      
      // Spawn nvim process with --embed flag
      this.nvimProcess = spawn('nvim', ['--embed'], {});
      
      // Attach to the spawned process
      this.nvim = await attach({ proc: this.nvimProcess });

      // Configure Neovim options
      await this.nvim.command('set noswapfile');

      this.isConnected = true;
      
    } catch (error) {
      console.error('Failed to connect to Neovim:', error);
      this.isConnected = false;
      this.connectionPromise = null;
      throw error;
    }
  }

  /**
   * Create or switch to a component buffer
   */
  async createComponentBuffer(componentType: string, options?: any): Promise<NvimResponse> {
    await this.connect();

    try {
      const buffer = await this.bufferManager.createBuffer(componentType, this.nvim, options);
      
      return {
        success: true,
        cursor: buffer.cursorPosition,
        result: {
          bufferId: buffer.id,
          maxLines: buffer.maxLines
        }
      };
    } catch (error) {
      console.error('Failed to create component buffer:', error);
      return {
        success: false,
        cursor: { line: 1, col: 0 },
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Switch to existing buffer
   */
  async switchBuffer(bufferId: string): Promise<NvimResponse> {
    await this.connect();

    try {
      const buffer = await this.bufferManager.switchToBuffer(bufferId, this.nvim);
      
      if (!buffer) {
        return {
          success: false,
          cursor: { line: 1, col: 0 },
          error: `Buffer ${bufferId} not found`
        };
      }

      return {
        success: true,
        cursor: buffer.cursorPosition
      };
    } catch (error) {
      console.error('Failed to switch buffer:', error);
      return {
        success: false,
        cursor: { line: 1, col: 0 },
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Disconnect from Neovim
   */
  async disconnect(): Promise<void> {
    if (this.nvim && this.isConnected) {
      try {
        await this.nvim.quit();
      } catch (error) {
        console.warn('Error during Neovim disconnect:', error);
      }
      
      // Kill the process if it's still running
      if (this.nvimProcess && !this.nvimProcess.killed) {
        this.nvimProcess.kill();
      }
      
      this.nvim = null;
      this.nvimProcess = null;
      this.isConnected = false;
      this.connectionPromise = null;
      this.bufferManager.clearAllBuffers();
    }
  }

  /**
   * Execute a Neovim command
   */
  async executeCommand(command: string): Promise<NvimResponse> {
    await this.connect();

    try {
      const result = await this.nvim.command(command);
      const cursor = await this.updateAndGetCursorPosition();

      return {
        success: true,
        result,
        cursor
      };
    } catch (error) {
      console.error('Neovim command error:', error);
      return {
        success: false,
        cursor: { line: 1, col: 0 },
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Send input keys to Neovim (for navigation) with dynamic bounds checking
   */
  async sendInput(keys: string): Promise<NvimResponse> {
    await this.connect();

    try {
      const currentBuffer = this.bufferManager.getCurrentBuffer();
      if (!currentBuffer) {
        return {
          success: false,
          cursor: { line: 1, col: 0 },
          error: 'No active buffer'
        };
      }

      const bounds = this.bufferManager.getNavigationBounds(currentBuffer.id);
      console.log('Current buffer:', currentBuffer.id, 'maxLines:', currentBuffer.maxLines);
      console.log('Navigation bounds:', bounds);
      console.log('Current position before move:', currentBuffer.cursorPosition);
      
      // Handle navigation with dynamic bounds checking
      if (keys === 'j') {
        const currentLine = currentBuffer.cursorPosition.line;
        console.log(`j pressed: currentLine=${currentLine}, maxLine=${bounds.maxLine}`);
        if (currentLine < bounds.maxLine) {
          await this.nvim.command('normal! j');
        } else {
          console.log('j blocked: at max line');
        }
      } else if (keys === 'k') {
        const currentLine = currentBuffer.cursorPosition.line;
        console.log(`k pressed: currentLine=${currentLine}, minLine=${bounds.minLine}`);
        if (currentLine > bounds.minLine) {
          await this.nvim.command('normal! k');
        } else {
          console.log('k blocked: at min line');
        }
      } else {
        // For other keys, use normal command
        await this.nvim.command(`normal! ${keys}`);
      }
      
      const cursor = await this.updateAndGetCursorPosition();
      console.log('Cursor position after move:', cursor);
      
      // Update buffer manager with new cursor position
      this.bufferManager.updateBufferCursor(currentBuffer.id, cursor);

      return {
        success: true,
        cursor
      };
    } catch (error) {
      console.error('Neovim input error:', error);
      return {
        success: false,
        cursor: { line: 1, col: 0 },
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Update and get current cursor position
   */
  private async updateAndGetCursorPosition(): Promise<CursorPosition> {
    if (!this.nvim || !this.isConnected) {
      return { line: 1, col: 0 };
    }

    try {
      const window = await this.nvim.window;
      const cursor = await window.cursor;
      
      return {
        line: cursor[0],
        col: cursor[1]
      };
    } catch (error) {
      console.warn('Failed to get cursor position:', error);
      return { line: 1, col: 0 };
    }
  }

  /**
   * Get current cursor position
   */
  async getCursorPosition(): Promise<CursorPosition> {
    return await this.updateAndGetCursorPosition();
  }

  /**
   * Check if connected
   */
  isClientConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get buffer content (for debugging)
   */
  async getBufferContent(): Promise<string[]> {
    await this.connect();
    
    try {
      const buffer = await this.nvim.buffer;
      const lines = await buffer.lines;
      return lines;
    } catch (error) {
      console.error('Failed to get buffer content:', error);
      return [];
    }
  }

  /**
   * Get current buffer info
   */
  getCurrentBufferInfo(): any {
    return this.bufferManager.getCurrentBuffer();
  }

  /**
   * Get strategy for current buffer (for client-side navigation)
   */
  getBufferStrategy(): any {
    const currentBuffer = this.bufferManager.getCurrentBuffer();
    if (!currentBuffer) return null;
    
    return this.bufferManager.getStrategy(currentBuffer.id);
  }

  /**
   * Get all buffer IDs
   */
  getAllBufferIds(): string[] {
    return this.bufferManager.getBufferIds();
  }
}

// Export singleton instance
export const nvimClient = NvimEmbedClient.getInstance();