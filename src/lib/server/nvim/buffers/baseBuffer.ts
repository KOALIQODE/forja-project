/**
 * Buffer Strategy Interfaces and Types
 */

import type { NvimMode } from '../../../nvim/contentIds';

/**
 * Representación de un buffer tanto virtual como físico.
 */
export interface NvimBuffer {
  id: string;              // ID lógico (ej. 'welcome-screen' o ruta del archivo)
  content: string[];       // Contenido actual del texto (para rehidratación)
  mode: NvimMode;          // Modo actual (Normal, Insert, Visual)
  cursorPosition: { line: number; col: number };
  maxLines: number;        // Límite de líneas (para navegación controlada)
  isVirtual: boolean;      // Indica si el buffer NO está cargado físicamente en Neovim
  nvimBufferId?: number;   // ID real dentro del proceso Neovim (si está cargado)
}

export interface BufferStrategy {
  /**
   * Inicializa un nuevo objeto NvimBuffer con los valores por defecto de la estrategia.
   */
  createBuffer(): NvimBuffer;
  
  /**
   * Obtiene el identificador de tipo de buffer.
   */
  getBufferId(): string;
  
  /**
   * Retorna el modo inicial (generalmente Normal).
   */
  getDefaultMode(): NvimMode;
  
  /**
   * Retorna la cantidad máxima de líneas que permite este buffer especial.
   */
  getMaxLines(): number;
  
  /**
   * Configura los manejadores de eventos de navegación.
   */
  handleNavigation(onNavigateDown?: () => void, onNavigateUp?: () => void, onSelect?: () => void): () => void;
}