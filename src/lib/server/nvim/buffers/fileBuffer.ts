/**
 * File Buffer Strategy - Handling real code files
 */

import { NVIM_MODES, type NvimMode } from '../../../nvim/contentIds';
import type { BufferStrategy, NvimBuffer } from './baseBuffer';

export class FileBufferStrategy implements BufferStrategy {
  private filePath: string;
  private content: string[];

  constructor(filePath: string, content: string = "") {
    this.filePath = filePath;
    this.content = content.split('\n');
  }

  createBuffer(): NvimBuffer {
    return {
      id: this.filePath, // Usamos la ruta completa como ID único
      content: this.content,
      mode: NVIM_MODES.NORMAL,
      cursorPosition: { line: 1, col: 0 },
      maxLines: Math.max(1, this.content.length),
      isVirtual: false
    };
  }

  getBufferId(): string {
    return this.filePath;
  }

  getDefaultMode(): NvimMode {
    return NVIM_MODES.NORMAL;
  }

  getMaxLines(): number {
    return this.content.length;
  }

  /**
   * File navigation is handled by standard nvim movements
   */
  handleNavigation(): () => void {
    const { NavigationBuilder } = require('../../nvim/navigations/baseNavigation');
    
    return NavigationBuilder.create()
      .withVertical(true)
      .withHorizontal(true)
      .withEscape(true)
      .withEnter(true)
      .build();
  }
}
