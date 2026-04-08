/**
 * Buffer Strategy Factory - Creates appropriate buffer strategies
 */

import { BUFFER_IDS } from '../../nvim/contentIds';
import type { BufferStrategy } from './buffers/baseBuffer';

// Import individual buffer strategies
import { WelcomeScreenBufferStrategy } from './buffers/welcomeScreenBuffer';
import { FileBufferStrategy } from './buffers/fileBuffer';

// Re-export types and interfaces for backward compatibility
export type { NvimBuffer, BufferStrategy } from './buffers/baseBuffer';

/**
 * Buffer Factory - Creates appropriate buffer strategies
 */
export class BufferFactory {
  static createStrategy(type: string, options?: any): BufferStrategy {
    // Si el tipo no coincide con un buffer especial, asumimos que es una ruta de archivo
    if (type === BUFFER_IDS.WELCOME_SCREEN) {
      return new WelcomeScreenBufferStrategy();
    }
    
    // Si tenemos una ruta y contenido, creamos un buffer de archivo real
    if (options?.filePath && options?.content !== undefined) {
      return new FileBufferStrategy(options.filePath, options.content);
    }

    // Por defecto, si el ID parece una ruta, lo tratamos como archivo (aunque esté vacío inicialmente)
    return new FileBufferStrategy(type, options?.content || "");
  }
}