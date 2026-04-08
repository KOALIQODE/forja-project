/**
 * BufferManager - Gestión dinámica de múltiples buffers de Neovim.
 * 
 * Esta clase administra la colección de buffers virtuales y reales, 
 * encargándose de la sincronización entre el estado de la aplicación
 * y el contenido dentro del proceso de Neovim.
 */

import type { NvimBuffer, BufferStrategy } from './bufferStrategies';
import { BufferFactory } from './bufferStrategies';
import { getDisplayText, NVIM_MODES, type NvimMode } from '../../nvim/contentIds';

export class BufferManager {
  private buffers: Map<string, NvimBuffer> = new Map();
  private currentBufferId: string | null = null;

  /**
   * Crea un nuevo buffer basado en una estrategia o cambia a uno existente.
   * Si ya existe un buffer activo, lo virtualiza antes de crear el nuevo.
   * @param {string} type Tipo de buffer (ej. 'welcome').
   * @param {any} nvim Instancia del cliente nvim.
   * @param {any} [options] Opciones adicionales para la estrategia.
   * @returns {Promise<NvimBuffer>} El objeto buffer creado o recuperado.
   */
  async createBuffer(type: string, nvim: any, options?: any): Promise<NvimBuffer> {
    // Virtualizar el buffer actual si existe
    if (this.currentBufferId) {
      const current = this.buffers.get(this.currentBufferId);
      if (current) {
        current.isVirtual = true;
      }
    }

    const strategy = BufferFactory.createStrategy(type, options);
    const buffer = strategy.createBuffer();
    
    // Store buffer
    this.buffers.set(buffer.id, buffer);
    this.currentBufferId = buffer.id;

    // Setup buffer in nvim
    await this.setupNvimBuffer(nvim, buffer);
    
    return buffer;
  }

  /**
   * Cambia el foco al buffer especificado y lo sincroniza con Neovim.
   * Si el buffer es virtual, lo "rehidrata" en el proceso de Neovim.
   * @param {string} bufferId ID del buffer.
   * @param {any} nvim Instancia del cliente nvim.
   * @returns {Promise<NvimBuffer | null>} El buffer si existe, null en caso contrario.
   */
  async switchToBuffer(bufferId: string, nvim: any): Promise<NvimBuffer | null> {
    const buffer = this.buffers.get(bufferId);
    if (!buffer) {
      return null;
    }

    // Virtualizar el buffer actual antes del cambio
    if (this.currentBufferId && this.currentBufferId !== bufferId) {
      const current = this.buffers.get(this.currentBufferId);
      if (current) {
        current.isVirtual = true;
      }
    }

    this.currentBufferId = bufferId;
    buffer.isVirtual = false;
    
    await this.setupNvimBuffer(nvim, buffer);
    
    return buffer;
  }

  /**
   * Retorna el buffer que está actualmente activo.
   * @returns {NvimBuffer | null}
   */
  getCurrentBuffer(): NvimBuffer | null {
    if (!this.currentBufferId) return null;
    return this.buffers.get(this.currentBufferId) || null;
  }

  /**
   * Actualiza la posición registrada del cursor para un buffer específico.
   * @param {string} bufferId ID del buffer.
   * @param {{ line: number; col: number }} cursor Nueva posición del cursor.
   */
  updateBufferCursor(bufferId: string, cursor: { line: number; col: number }): void {
    const buffer = this.buffers.get(bufferId);
    if (buffer) {
      buffer.cursorPosition = cursor;
    }
  }

  /**
   * Obtiene los límites permitidos de navegación para un buffer (línea min y max).
   * Útil para restringir movimientos HJKL en buffers especiales.
   * @param {string} bufferId ID del buffer.
   * @returns {{ minLine: number; maxLine: number }}
   */
  getNavigationBounds(bufferId: string): { minLine: number; maxLine: number } {
    const buffer = this.buffers.get(bufferId);
    return {
      minLine: 1,
      maxLine: buffer?.maxLines || 1
    };
  }

  /**
   * Configura físicamente el buffer dentro de Neovim con su contenido y modo.
   * Implementa la lógica de "Rehidratación" desde el estado virtual.
   * @private
   * @param {any} nvim Instancia del cliente nvim.
   * @param {NvimBuffer} buffer Objeto buffer con los datos a cargar.
   */
  private async setupNvimBuffer(nvim: any, buffer: NvimBuffer): Promise<void> {
    // Create new buffer in nvim
    await nvim.command('enew');
    const nvimBuffer = await nvim.buffer;
    buffer.nvimBufferId = nvimBuffer.id;
    
    // Set buffer content (convert content IDs to display strings)
    const displayContent = this.convertToDisplayContent(buffer.content);
    
    // Set lines more explicitly - replace all content
    await nvimBuffer.setLines(displayContent, { start: 0, end: displayContent.length, strictIndexing: false });
    
    // Set mode
    await this.setNvimMode(nvim, buffer.mode);
    
    // Set cursor position
    await nvim.command(`normal! ${buffer.cursorPosition.line}G${buffer.cursorPosition.col}|`);

    // Limpieza de buffers antiguos en Neovim para evitar saturación
    await this.cleanupNvimBuffers(nvim);
  }

  /**
   * Limpia buffers de Neovim que ya no están marcados como físicos en nuestra app.
   * Esto previene que el proceso de nvim se ralentice con miles de buffers abiertos.
   * @private
   * @param {any} nvim Instancia del cliente nvim.
   */
  private async cleanupNvimBuffers(nvim: any): Promise<void> {
    const activeNvimIds = Array.from(this.buffers.values())
      .filter(b => !b.isVirtual && b.nvimBufferId !== undefined)
      .map(b => b.nvimBufferId);

    // Obtener todos los buffers reales de nvim
    const allBuffers = await nvim.buffers;
    for (const b of allBuffers) {
      if (!activeNvimIds.includes(b.id)) {
        try {
          // Si el buffer no es el que estamos usando, lo borramos del proceso nvim
          // pero mantenemos sus datos en nuestra clase (this.buffers)
          await nvim.command(`bdelete! ${b.id}`);
        } catch (e) {
          // Ignorar errores si el buffer ya no existe
        }
      }
    }
  }

  /**
   * Convierte IDs de contenido simbólico en strings legibles para el usuario.
   * @private
   * @param {string[]} content Array de identificadores de contenido.
   * @returns {string[]} Array de líneas de texto reales.
   */
  private convertToDisplayContent(content: string[]): string[] {
    return content.map(item => getDisplayText(item));
  }

  /**
   * Ajusta el modo actual de Neovim (Normal, Insert, Visual).
   * @private
   * @param {any} nvim Instancia del cliente nvim.
   * @param {NvimMode} mode Modo deseado.
   */
  private async setNvimMode(nvim: any, mode: NvimMode): Promise<void> {
    switch (mode) {
      case NVIM_MODES.NORMAL:
        await nvim.input('<Esc>');
        break;
      case NVIM_MODES.INSERT:
        await nvim.input('i');
        break;
      case NVIM_MODES.VISUAL:
        await nvim.input('v');
        break;
    }
  }

  /**
   * Obtiene una lista con todos los IDs de buffers registrados.
   * @returns {string[]}
   */
  getBufferIds(): string[] {
    return Array.from(this.buffers.keys());
  }

  /**
   * Elimina un buffer de la gestión interna.
   * @param {string} bufferId ID del buffer a eliminar.
   */
  removeBuffer(bufferId: string): void {
    this.buffers.delete(bufferId);
    if (this.currentBufferId === bufferId) {
      this.currentBufferId = null;
    }
  }

  /**
   * Recupera la estrategia de navegación asociada a un buffer.
   * @param {string} bufferId ID del buffer.
   * @returns {BufferStrategy | null}
   */
  getStrategy(bufferId: string): BufferStrategy | null {
    const buffer = this.buffers.get(bufferId);
    if (!buffer) return null;
    
    // Recreate strategy from buffer type
    try {
      return BufferFactory.createStrategy(buffer.id);
    } catch (error) {
      return null;
    }
  }

  /**
   * Limpia todos los buffers registrados y resetea el ID actual.
   */
  clearAllBuffers(): void {
    this.buffers.clear();
    this.currentBufferId = null;
  }
}
