import { describe, it, expect } from 'vitest';
import {
  GIT_STATUS_COLORS,
  GIT_STATUS_LABELS,
  getBreadcrumbIcon,
} from '$lib/utils/explorerHelpers';

describe('GIT_STATUS_COLORS', () => {
  it('has color for modified', () => {
    expect(GIT_STATUS_COLORS.modified).toBeTruthy();
  });

  it('has color for added', () => {
    expect(GIT_STATUS_COLORS.added).toBeTruthy();
  });

  it('has color for untracked', () => {
    expect(GIT_STATUS_COLORS.untracked).toBeTruthy();
  });

  it('has color for renamed', () => {
    expect(GIT_STATUS_COLORS.renamed).toBeTruthy();
  });

  it('has color for deleted', () => {
    expect(GIT_STATUS_COLORS.deleted).toBeTruthy();
  });

  it('all values are Tailwind CSS class strings', () => {
    for (const val of Object.values(GIT_STATUS_COLORS)) {
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
    }
  });
});

describe('GIT_STATUS_LABELS', () => {
  it('modified → M', () => {
    expect(GIT_STATUS_LABELS.modified).toBe('M');
  });

  it('added → A', () => {
    expect(GIT_STATUS_LABELS.added).toBe('A');
  });

  it('untracked → U', () => {
    expect(GIT_STATUS_LABELS.untracked).toBe('U');
  });

  it('renamed → R', () => {
    expect(GIT_STATUS_LABELS.renamed).toBe('R');
  });

  it('deleted → D', () => {
    expect(GIT_STATUS_LABELS.deleted).toBe('D');
  });
});

describe('getBreadcrumbIcon', () => {
  it('returns ƒ for function_item', () => {
    expect(getBreadcrumbIcon('function_item')).toBe('ƒ');
  });

  it('returns ƒ for arrow_function', () => {
    expect(getBreadcrumbIcon('arrow_function')).toBe('ƒ');
  });

  it('returns ƒ for method_definition', () => {
    expect(getBreadcrumbIcon('method_definition')).toBe('ƒ');
  });

  it('returns ⧬ for impl_item', () => {
    expect(getBreadcrumbIcon('impl_item')).toBe('⧬');
  });

  it('returns 📦 for module', () => {
    expect(getBreadcrumbIcon('module')).toBe('📦');
  });

  it('returns 🏛 for class_declaration', () => {
    expect(getBreadcrumbIcon('class_declaration')).toBe('🏛');
  });

  it('returns 🏛 for class_expression', () => {
    expect(getBreadcrumbIcon('class_expression')).toBe('🏛');
  });

  it('returns S for struct_item', () => {
    expect(getBreadcrumbIcon('struct_item')).toBe('S');
  });

  it('returns E for enum_item', () => {
    expect(getBreadcrumbIcon('enum_item')).toBe('E');
  });

  it('returns E for enum_declaration', () => {
    expect(getBreadcrumbIcon('enum_declaration')).toBe('E');
  });

  it('returns {} for pair', () => {
    expect(getBreadcrumbIcon('pair')).toBe('{}');
  });

  it('returns T for type_alias_declaration', () => {
    expect(getBreadcrumbIcon('type_alias_declaration')).toBe('T');
  });

  it('returns ◈ for trait_item', () => {
    expect(getBreadcrumbIcon('trait_item')).toBe('◈');
  });

  it('returns • for unknown kind', () => {
    expect(getBreadcrumbIcon('unknown_thing')).toBe('•');
    expect(getBreadcrumbIcon('')).toBe('•');
  });

  it('returns ƒ for generator_function_declaration', () => {
    expect(getBreadcrumbIcon('generator_function_declaration')).toBe('ƒ');
  });
});
