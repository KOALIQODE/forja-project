import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

import {
  applyTheme,
  bracketRangesToColors,
  clearTheme,
  resolveTokenColors,
} from '$lib/utils/themeEngine';
import type { ThemeDefinition } from '$lib/utils/pluginClient';

const root = document.documentElement;

const baseColors = {
  Keyword: '#1',
  Function: '#2',
  Type: '#3',
  String: '#4',
  Comment: '#5',
  Number: '#6',
  Punctuation: '#7',
  Operator: '#8',
  Variable: '#9',
  Constant: '#10',
  Attribute: '#11',
};

describe('themeEngine', () => {
  beforeEach(() => {
    clearTheme();
  });

  it('resolveTokenColors returns the same base object when syntax is null or undefined', () => {
    expect(resolveTokenColors(null, baseColors)).toBe(baseColors);
    expect(resolveTokenColors(undefined, baseColors)).toBe(baseColors);
  });

  it('resolveTokenColors maps syntax tokens onto the editor token palette', () => {
    const resolved = resolveTokenColors(
      {
        keyword: '#a',
        function_name: '#b',
        type: '#c',
        string: '#d',
        comment: '#e',
        number: '#f',
        punctuation: '#g',
        operator: '#h',
        variable: '#i',
        constant: '#j',
        attribute: '#k',
      },
      baseColors,
    );

    expect(resolved).toEqual({
      ...baseColors,
      Keyword: '#a',
      Function: '#b',
      Type: '#c',
      String: '#d',
      Comment: '#e',
      Number: '#f',
      Punctuation: '#g',
      Operator: '#h',
      Variable: '#i',
      Constant: '#j',
      Attribute: '#k',
    });
  });

  it('bracketRangesToColors maps nesting depth cyclically across the palette', () => {
    expect(
      bracketRangesToColors(
        [
          { start: 0, finish: 1, depth: 1 },
          { start: 2, finish: 3, depth: 2 },
          { start: 4, finish: 5, depth: 4 },
        ],
        ['#111', '#222', '#333'],
      ),
    ).toEqual([
      { start: 0, finish: 1, color: '#111' },
      { start: 2, finish: 3, color: '#222' },
      { start: 4, finish: 5, color: '#111' },
    ]);
  });

  it('applyTheme sets editor, syntax, and bracket CSS variables', () => {
    const theme: ThemeDefinition = {
      name: 'test-theme',
      colors: {
        bg: '#000000',
        fg: '#ffffff',
        cursor: '#00ff00',
        selection: '#333333',
        line_number: '#999999',
        gutter_bg: '#111111',
        border: '#222222',
        active_line: '#444444',
      },
      syntax: {
        keyword: '#a',
        string: '#b',
        function_name: '#c',
        variable: '#d',
        type: '#e',
        constant: '#f',
        comment: '#g',
        operator: '#h',
        number: '#i',
        punctuation: '#j',
        attribute: '#k',
        tag: '#l',
        namespace: '#m',
      },
      brackets: ['#101010', '#202020', '#303030'],
    };

    applyTheme(theme);

    expect(root.style.getPropertyValue('--editor-bg')).toBe('#000000');
    expect(root.style.getPropertyValue('--editor-fg')).toBe('#ffffff');
    expect(root.style.getPropertyValue('--editor-cursor')).toBe('#00ff00');
    expect(root.style.getPropertyValue('--editor-selection')).toBe('#333333');
    expect(root.style.getPropertyValue('--editor-line-number')).toBe('#999999');
    expect(root.style.getPropertyValue('--editor-gutter-bg')).toBe('#111111');
    expect(root.style.getPropertyValue('--editor-border')).toBe('#222222');
    expect(root.style.getPropertyValue('--editor-active-line')).toBe('#444444');
    expect(root.style.getPropertyValue('--syntax-keyword')).toBe('#a');
    expect(root.style.getPropertyValue('--syntax-string')).toBe('#b');
    expect(root.style.getPropertyValue('--syntax-function')).toBe('#c');
    expect(root.style.getPropertyValue('--syntax-variable')).toBe('#d');
    expect(root.style.getPropertyValue('--syntax-type')).toBe('#e');
    expect(root.style.getPropertyValue('--syntax-constant')).toBe('#f');
    expect(root.style.getPropertyValue('--syntax-comment')).toBe('#g');
    expect(root.style.getPropertyValue('--syntax-operator')).toBe('#h');
    expect(root.style.getPropertyValue('--syntax-number')).toBe('#i');
    expect(root.style.getPropertyValue('--syntax-punctuation')).toBe('#j');
    expect(root.style.getPropertyValue('--syntax-attribute')).toBe('#k');
    expect(root.style.getPropertyValue('--syntax-tag')).toBe('#l');
    expect(root.style.getPropertyValue('--syntax-namespace')).toBe('#m');
    expect(root.style.getPropertyValue('--bracket-depth-1')).toBe('#101010');
    expect(root.style.getPropertyValue('--bracket-depth-2')).toBe('#202020');
    expect(root.style.getPropertyValue('--bracket-depth-3')).toBe('#303030');
  });

  it('applyTheme skips falsy and undefined theme properties', () => {
    const theme: ThemeDefinition = {
      name: 'sparse-theme',
      colors: {
        bg: '#010101',
        fg: undefined,
        cursor: undefined,
        selection: undefined,
        line_number: undefined,
        gutter_bg: undefined,
        border: undefined,
        active_line: undefined,
      },
      syntax: {
        keyword: '#123123',
        string: undefined,
        function_name: undefined,
        variable: undefined,
        type: undefined,
        constant: undefined,
        comment: undefined,
        operator: undefined,
        number: undefined,
        punctuation: undefined,
        attribute: undefined,
        tag: '',
        namespace: undefined,
      },
      brackets: [],
    };

    applyTheme(theme);

    expect(root.style.getPropertyValue('--editor-bg')).toBe('#010101');
    expect(root.style.getPropertyValue('--editor-fg')).toBe('');
    expect(root.style.getPropertyValue('--editor-cursor')).toBe('');
    expect(root.style.getPropertyValue('--syntax-keyword')).toBe('#123123');
    expect(root.style.getPropertyValue('--syntax-tag')).toBe('');
  });

  it('clearTheme removes all editor and syntax variables from the root', () => {
    root.style.setProperty('--editor-bg', '#000');
    root.style.setProperty('--syntax-keyword', '#fff');
    root.style.setProperty('--bracket-depth-1', '#abc');

    clearTheme();

    expect(root.style.getPropertyValue('--editor-bg')).toBe('');
    expect(root.style.getPropertyValue('--syntax-keyword')).toBe('');
    expect(root.style.getPropertyValue('--bracket-depth-1')).toBe('');
  });
});
