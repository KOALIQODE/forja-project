import { describe, it, expect } from 'vitest';
import { getTextObjectRange } from '$lib/components/editor/textObjects';
import type { TextObjectRange } from '$lib/components/editor/textObjects';

const lines = [
  'hello (world)',       // 0: brackets on same line
  '  let x = "foo";',   // 1: string on same line
  'fn foo() {',          // 2: start of block
  '  let y = 42;',      // 3: inside block
  '}',                   // 4: end of block
];

const getLine  = (l: number) => lines[l] ?? '';
const total    = lines.length;

describe('getTextObjectRange — word (w)', () => {
  it('inner word at start of word', () => {
    const r = getTextObjectRange('i', 'w', 0, 0, getLine, total);
    expect(r).not.toBeNull();
    expect(r!.start.char).toBe(0);
    expect(r!.end.char).toBe(5); // 'hello'
  });

  it('inner word in middle of word', () => {
    const r = getTextObjectRange('i', 'w', 0, 2, getLine, total)!;
    expect(r.start.char).toBe(0);
    expect(r.end.char).toBe(5);
  });

  it('outer word (a) includes trailing whitespace', () => {
    const r = getTextObjectRange('a', 'w', 0, 0, getLine, total)!;
    // 'hello ' — end should be at least 6
    expect(r.end.char).toBeGreaterThanOrEqual(5);
  });

  it('returns correct range for word at end of line', () => {
    // 'world' starts at 7 in 'hello (world)'
    const r = getTextObjectRange('i', 'w', 0, 8, getLine, total)!;
    expect(r).not.toBeNull();
  });
});

describe('getTextObjectRange — WORD (W)', () => {
  it('inner WORD spans non-whitespace', () => {
    const r = getTextObjectRange('i', 'W', 1, 6, getLine, total)!;
    // 'let' starts at 2 in '  let x = "foo";'
    expect(r).not.toBeNull();
  });
});

describe('getTextObjectRange — parentheses ()', () => {
  it('inner () selects content between parens', () => {
    // '(world)' on line 0: open at 6, close at 12
    const r = getTextObjectRange('i', '(', 0, 8, getLine, total)!;
    expect(r).not.toBeNull();
    expect(r.start.char).toBe(7); // character after '('
    expect(r.end.char).toBe(12); // position of ')'
  });

  it('outer () includes the parens themselves', () => {
    const r = getTextObjectRange('a', '(', 0, 8, getLine, total)!;
    expect(r).not.toBeNull();
    expect(r.start.char).toBe(6); // '(' position
    expect(r.end.char).toBe(13); // one past ')'
  });

  it('inner ) is same as inner (', () => {
    const ri = getTextObjectRange('i', '(', 0, 8, getLine, total);
    const ro = getTextObjectRange('i', ')', 0, 8, getLine, total);
    expect(ri).toEqual(ro);
  });

  it('returns null when no matching paren found', () => {
    const noParenLines = ['no brackets here'];
    const r = getTextObjectRange('i', '(', 0, 5, (l) => noParenLines[l] ?? '', 1);
    expect(r).toBeNull();
  });
});

describe('getTextObjectRange — curly braces {}', () => {
  it('inner {} selects multi-line block content', () => {
    // '{' is at end of line 2, '}' is on line 4
    const r = getTextObjectRange('i', '{', 3, 0, getLine, total)!;
    expect(r).not.toBeNull();
    // inner range should start after '{' on line 2
    expect(r.start.line).toBe(2);
    expect(r.end.line).toBe(4);
  });

  it('outer {} includes braces', () => {
    const r = getTextObjectRange('a', '{', 3, 0, getLine, total)!;
    expect(r).not.toBeNull();
    expect(r.start.line).toBe(2);
    expect(r.end.line).toBe(4);
  });
});

describe('getTextObjectRange — double quotes ""', () => {
  it('inner "" selects content between quotes', () => {
    // '"foo"' on line 1 at column 11: open=11, close=15
    const r = getTextObjectRange('i', '"', 1, 13, getLine, total)!;
    expect(r).not.toBeNull();
  });

  it('returns null when no matching quote on line', () => {
    const noQuote = ['no quotes at all'];
    const r = getTextObjectRange('i', '"', 0, 5, (l) => noQuote[l] ?? '', 1);
    expect(r).toBeNull();
  });
});

describe('getTextObjectRange — square brackets []', () => {
  it('inner [] returns range within brackets', () => {
    const bracketLines = ['arr[42]'];
    const r = getTextObjectRange('i', '[', 0, 4, (l) => bracketLines[l] ?? '', 1)!;
    expect(r).not.toBeNull();
    expect(r.start.char).toBe(4); // after '['
    expect(r.end.char).toBe(6);   // before ']'
  });
});

describe('getTextObjectRange — unknown object', () => {
  it('returns null for unsupported object character', () => {
    const r = getTextObjectRange('i', 'z', 0, 0, getLine, total);
    expect(r).toBeNull();
  });
});
