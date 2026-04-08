/**
 * NvimEmbedClient - Singleton Pattern with Dynamic Buffer Management
 * 
 * Este cliente es el responsable de gestionar el ciclo de vida de la instancia
 * de Neovim embebida. Actúa como el puente principal entre las peticiones del 
 * usuario y el motor de Neovim.
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

  /**
   * Constructor privado para asegurar el patrón Singleton.
   */
  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Obtiene la instancia única (Singleton) del cliente.
   * @returns {NvimEmbedClient} La instancia del cliente.
   */
  static getInstance(): NvimEmbedClient {
    if (!NvimEmbedClient.instance) {
      NvimEmbedClient.instance = new NvimEmbedClient();
    }
    return NvimEmbedClient.instance;
  }

  /**
   * Inicia la conexión con el proceso embebido de Neovim si no está ya conectado.
   * Maneja internamente la sincronización si hay múltiples llamadas simultáneas.
   * @returns {Promise<void>}
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

  /**
   * Lógica interna para spawnear el proceso nvim y adjuntar el cliente RPC.
   * @private
   * @throws {Error} Si Neovim no está instalado o falla la conexión.
   */
  private async _doConnect(): Promise<void> {
    try {
      // Import child_process dynamically (server-side only)
      const { spawn } = await import('node:child_process');
      
      // Spawn nvim process with --embed flag
      this.nvimProcess = spawn('nvim', ['--embed'], {});
      
      // Handle early process errors (like ENOENT)
      this.nvimProcess.on('error', (err: any) => {
        console.error('Neovim process error:', err);
        if (err.code === 'ENOENT') {
          console.error('CRITICAL ERROR: Neovim ("nvim") binary NOT FOUND in PATH.');
          console.error('Please install Neovim and ensure it is available in your system PATH.');
        }
      });
      
      // Attach to the spawned process
      try {
        this.nvim = await attach({ proc: this.nvimProcess });
      } catch (attachError: any) {
        throw new Error(`Failed to attach to Neovim: ${attachError.message || String(attachError)}`);
      }

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
   * Crea o cambia a un buffer asociado a un componente específico.
   * @param {string} componentType El tipo de componente (ej. 'welcome', 'editor').
   * @param {any} [options] Opciones adicionales para la creación del buffer.
   * @returns {Promise<NvimResponse>} Resultado de la operación con la posición del cursor inicial.
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
   * Cambia el buffer activo actual en Neovim.
   * @param {string} bufferId ID del buffer al que se desea cambiar.
   * @returns {Promise<NvimResponse>}
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
   * Cierra la conexión con Neovim y termina el proceso.
   * @returns {Promise<void>}
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
   * Ejecuta un comando arbitrario de Neovim (modo Ex).
   * @param {string} command Comando a ejecutar (ej. 'set number').
   * @returns {Promise<NvimResponse>}
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
   * Envía teclas de entrada (input) directamente a Neovim.
   * Al usar nvim.input, permitimos que Neovim gestione el movimiento, 
   * los modos y los límites de forma nativa y ultra rápida.
   * @param {string} keys Teclas a enviar (ej. 'j', '5w', '<Esc>').
   * @returns {Promise<NvimResponse>}
   */
  async sendInput(keys: string): Promise<NvimResponse> {
    await this.connect();

    try {
      // Traducir teclas especiales si es necesario
      let inputKeys = keys;
      if (keys === 'Escape') inputKeys = '<Esc>';
      if (keys === 'Enter') inputKeys = '<CR>';
      if (keys === 'Backspace') inputKeys = '<BS>';

      // Enviar directamente al motor de Neovim
      await this.nvim.input(inputKeys);
      
      // Esperar un instante mínimo para que Neovim procese el cambio
      // y luego sincronizar la posición del cursor
      const cursor = await this.updateAndGetCursorPosition();
      
      const currentBuffer = this.bufferManager.getCurrentBuffer();
      if (currentBuffer) {
        this.bufferManager.updateBufferCursor(currentBuffer.id, cursor);
      }

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
   * Actualiza internamente y retorna la posición actual del cursor en la ventana activa.
   * @private
   * @returns {Promise<CursorPosition>}
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
   * Retorna la posición actual del cursor.
   * @returns {Promise<CursorPosition>}
   */
  async getCursorPosition(): Promise<CursorPosition> {
    return await this.updateAndGetCursorPosition();
  }

  /**
   * Verifica si el cliente está conectado a un proceso de Neovim.
   * @returns {boolean}
   */
  isClientConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Obtiene el contenido completo del buffer actual como un array de strings.
   * Útil para depuración y sincronización inicial.
   * @returns {Promise<string[]>}
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
   * Obtiene la información del buffer activo gestionado por el BufferManager.
   * @returns {any}
   */
  getCurrentBufferInfo(): any {
    return this.bufferManager.getCurrentBuffer();
  }

  /**
   * Obtiene la estrategia de navegación aplicada al buffer actual.
   * @returns {any | null}
   */
  getBufferStrategy(): any {
    const currentBuffer = this.bufferManager.getCurrentBuffer();
    if (!currentBuffer) return null;
    
    return this.bufferManager.getStrategy(currentBuffer.id);
  }

  /**
   * Retorna una lista con todos los IDs de buffers gestionados.
   * @returns {string[]}
   */
  getAllBufferIds(): string[] {
    return this.bufferManager.getBufferIds();
  }
}

// Export singleton instance
export const nvimClient = NvimEmbedClient.getInstance();