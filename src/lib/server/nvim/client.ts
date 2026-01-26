/**
 * Nvim Embed Client - Singleton Pattern
 * Manages a single embedded Neovim instance for the entire application
 */

import { attach } from 'neovim';
import { spawn } from 'child_process';
import type { CursorPosition, NvimResponse } from './types';

export class NvimEmbedClient {
  private static instance: NvimEmbedClient | null = null;
  private nvim: any = null;
  private nvimProcess: any = null;
  private isConnected = false;
  private currentCursor: CursorPosition = { line: 1, col: 1 };
  private connectionPromise: Promise<void> | null = null;

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
      // Spawn nvim process with --embed flag
      this.nvimProcess = spawn('nvim', ['--embed'], {});
      
      // Attach to the spawned process
      this.nvim = await attach({ proc: this.nvimProcess });

      this.isConnected = true;

      // Initialize cursor position
      await this.updateCursorPosition();

      // Setup buffer with content for navigation
      await this.nvim.command('enew'); // Create new empty buffer
      
      // Add content to buffer for navigation (3 lines for 3 buttons)
      const bufferContent = [
        'Open Project',
        'New Empty Project', 
        'Recent Projects'
      ];
      
      const buffer = await this.nvim.buffer;
      await buffer.setLines(bufferContent, { start: 0, end: -1 });
      
      // Ensure we're in normal mode
      await this.nvim.input('<Esc>');
      
      // Go to first line and first column
      await this.nvim.command('normal! gg0');
      await this.updateCursorPosition();
      
    } catch (error) {
      console.error('Failed to connect to Neovim:', error);
      this.isConnected = false;
      this.connectionPromise = null;
      throw error;
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
    }
  }

  /**
   * Execute a Neovim command
   */
  async executeCommand(command: string): Promise<NvimResponse> {
    await this.connect();

    try {
      const result = await this.nvim.command(command);
      await this.updateCursorPosition();

      return {
        success: true,
        result,
        cursor: this.currentCursor
      };
    } catch (error) {
      console.error('Neovim command error:', error);
      return {
        success: false,
        cursor: this.currentCursor,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Send input keys to Neovim (for navigation)
   */
  async sendInput(keys: string): Promise<NvimResponse> {
    await this.connect();

    try {
      // Handle navigation with bounds checking for welcome screen (3 lines)
      if (keys === 'j') {
        const currentLine = this.currentCursor.line;
        if (currentLine < 3) {
          await this.nvim.command('normal! j');
        }
      } else if (keys === 'k') {
        const currentLine = this.currentCursor.line;
        if (currentLine > 1) {
          await this.nvim.command('normal! k');
        }
      } else {
        // For other keys, use normal command
        await this.nvim.command(`normal! ${keys}`);
      }
      
      await this.updateCursorPosition();

      return {
        success: true,
        cursor: this.currentCursor
      };
    } catch (error) {
      console.error('Neovim input error:', error);
      return {
        success: false,
        cursor: this.currentCursor,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Update current cursor position
   */
  private async updateCursorPosition(): Promise<void> {
    if (!this.nvim || !this.isConnected) {
      return;
    }

    try {
      const window = await this.nvim.window;
      const cursor = await window.cursor;
      
      this.currentCursor = {
        line: cursor[0],
        col: cursor[1]
      };
    } catch (error) {
      console.warn('Failed to get cursor position:', error);
    }
  }

  /**
   * Get current cursor position
   */
  async getCursorPosition(): Promise<CursorPosition> {
    await this.connect();
    await this.updateCursorPosition();
    return { ...this.currentCursor };
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
}

// Export singleton instance
export const nvimClient = NvimEmbedClient.getInstance();