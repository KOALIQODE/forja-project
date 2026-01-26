/**
 * Buffer Strategy Factory - Creates appropriate buffer strategies
 */

import { BUFFER_IDS } from '../../nvim/contentIds';
import type { BufferStrategy } from './buffers/baseBuffer';

// Import individual buffer strategies
import { WelcomeScreenBufferStrategy } from './buffers/welcomeScreenBuffer';
import { FileExplorerBufferStrategy } from './buffers/fileExplorerBuffer';

// Re-export types and interfaces for backward compatibility
export type { NvimBuffer, BufferStrategy } from './buffers/baseBuffer';

/**
 * Buffer Factory - Creates appropriate buffer strategies
 */
export class BufferFactory {
  static createStrategy(type: string, options?: any): BufferStrategy {
    switch (type) {
      case BUFFER_IDS.WELCOME_SCREEN:
        return new WelcomeScreenBufferStrategy();
      case BUFFER_IDS.FILE_EXPLORER:
        return new FileExplorerBufferStrategy(options?.files);
      default:
        throw new Error(`Unknown buffer type: ${type}`);
    }
  }
}