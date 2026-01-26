/**
 * Buffer Manager - Manages multiple nvim buffers dynamically
 */

import type { NvimBuffer, BufferStrategy } from './bufferStrategies';
import { BufferFactory } from './bufferStrategies';
import { CONTENT_DISPLAY_MAP, getDisplayText, NVIM_MODES, type NvimMode } from '../../nvim/contentIds';

export class BufferManager {
  private buffers: Map<string, NvimBuffer> = new Map();
  private currentBufferId: string | null = null;

  /**
   * Create or switch to a buffer
   */
  async createBuffer(type: string, nvim: any, options?: any): Promise<NvimBuffer> {
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
   * Switch to existing buffer
   */
  async switchToBuffer(bufferId: string, nvim: any): Promise<NvimBuffer | null> {
    const buffer = this.buffers.get(bufferId);
    if (!buffer) {
      return null;
    }

    this.currentBufferId = bufferId;
    await this.setupNvimBuffer(nvim, buffer);
    
    return buffer;
  }

  /**
   * Get current buffer
   */
  getCurrentBuffer(): NvimBuffer | null {
    if (!this.currentBufferId) return null;
    return this.buffers.get(this.currentBufferId) || null;
  }

  /**
   * Update buffer cursor position
   */
  updateBufferCursor(bufferId: string, cursor: { line: number; col: number }): void {
    const buffer = this.buffers.get(bufferId);
    if (buffer) {
      buffer.cursorPosition = cursor;
    }
  }

  /**
   * Get buffer navigation bounds
   */
  getNavigationBounds(bufferId: string): { minLine: number; maxLine: number } {
    const buffer = this.buffers.get(bufferId);
    return {
      minLine: 1,
      maxLine: buffer?.maxLines || 1
    };
  }

  /**
   * Setup nvim buffer with content
   */
  private async setupNvimBuffer(nvim: any, buffer: NvimBuffer): Promise<void> {
    // Create new buffer
    await nvim.command('enew');
    
    // Set buffer content (convert content IDs to display strings)
    const displayContent = this.convertToDisplayContent(buffer.content);
    console.log('Setting buffer content:', displayContent, 'Length:', displayContent.length);
    
    const nvimBuffer = await nvim.buffer;
    // Set lines more explicitly - replace all content
    await nvimBuffer.setLines(displayContent, { start: 0, end: displayContent.length, strictIndexing: false });
    
    // Verify lines were set correctly
    const verifyLines = await nvimBuffer.lines;
    console.log('Buffer lines after setting:', verifyLines, 'Count:', verifyLines.length);
    
    // Set mode
    await this.setNvimMode(nvim, buffer.mode);
    
    // Set cursor position
    await nvim.command(`normal! ${buffer.cursorPosition.line}G${buffer.cursorPosition.col}|`);
  }

  /**
   * Convert content IDs to display strings using centralized constants
   */
  private convertToDisplayContent(content: string[]): string[] {
    console.log('Original content:', content);
    const mapped = content.map(item => getDisplayText(item));
    console.log('Mapped content:', mapped);
    return mapped;
  }

  /**
   * Set nvim mode
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
   * Get all buffer IDs
   */
  getBufferIds(): string[] {
    return Array.from(this.buffers.keys());
  }

  /**
   * Remove buffer
   */
  removeBuffer(bufferId: string): void {
    this.buffers.delete(bufferId);
    if (this.currentBufferId === bufferId) {
      this.currentBufferId = null;
    }
  }

  /**
   * Get strategy for component (to access navigation methods)
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
   * Clear all buffers
   */
  clearAllBuffers(): void {
    this.buffers.clear();
    this.currentBufferId = null;
  }
}