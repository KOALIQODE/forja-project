import type { ThemeDefinition } from "$lib/utils/pluginClient";

/**
 * Apply a ThemeDefinition to the document root as CSS custom properties.
 * All editor components consume these vars — no direct style overrides needed.
 */
export function applyTheme(theme: ThemeDefinition): void {
    const root = document.documentElement;
    const { colors, syntax, brackets } = theme;

    // ── Editor palette ────────────────────────────────────────────────────
    if (colors.bg)          root.style.setProperty("--editor-bg",          colors.bg);
    if (colors.fg)          root.style.setProperty("--editor-fg",          colors.fg);
    if (colors.cursor)      root.style.setProperty("--editor-cursor",      colors.cursor);
    if (colors.selection)   root.style.setProperty("--editor-selection",   colors.selection);
    if (colors.line_number) root.style.setProperty("--editor-line-number", colors.line_number);
    if (colors.gutter_bg)   root.style.setProperty("--editor-gutter-bg",   colors.gutter_bg);
    if (colors.border)      root.style.setProperty("--editor-border",      colors.border);
    if (colors.active_line) root.style.setProperty("--editor-active-line", colors.active_line);

    // ── Syntax token colors ───────────────────────────────────────────────
    if (syntax.keyword)       root.style.setProperty("--syntax-keyword",       syntax.keyword);
    if (syntax.string)        root.style.setProperty("--syntax-string",        syntax.string);
    if (syntax.function_name) root.style.setProperty("--syntax-function",      syntax.function_name);
    if (syntax.variable)      root.style.setProperty("--syntax-variable",      syntax.variable);
    if (syntax.type)          root.style.setProperty("--syntax-type",          syntax.type);
    if (syntax.constant)      root.style.setProperty("--syntax-constant",      syntax.constant);
    if (syntax.comment)       root.style.setProperty("--syntax-comment",       syntax.comment);
    if (syntax.operator)      root.style.setProperty("--syntax-operator",      syntax.operator);
    if (syntax.number)        root.style.setProperty("--syntax-number",        syntax.number);
    if (syntax.punctuation)   root.style.setProperty("--syntax-punctuation",   syntax.punctuation);
    if (syntax.attribute)     root.style.setProperty("--syntax-attribute",     syntax.attribute);
    if (syntax.tag)           root.style.setProperty("--syntax-tag",           syntax.tag);
    if (syntax.namespace)     root.style.setProperty("--syntax-namespace",     syntax.namespace);

    // ── Bracket pair colors (depth 1 → index 0) ──────────────────────────
    brackets.forEach((color, i) => {
        root.style.setProperty(`--bracket-depth-${i + 1}`, color);
    });
}

/**
 * Remove all theme CSS vars from the root (reset to defaults).
 */
export function clearTheme(): void {
    const root = document.documentElement;
    const vars = [
        "--editor-bg", "--editor-fg", "--editor-cursor", "--editor-selection",
        "--editor-line-number", "--editor-gutter-bg", "--editor-border", "--editor-active-line",
        "--syntax-keyword", "--syntax-string", "--syntax-function", "--syntax-variable",
        "--syntax-type", "--syntax-constant", "--syntax-comment", "--syntax-operator",
        "--syntax-number", "--syntax-punctuation", "--syntax-attribute", "--syntax-tag",
        "--syntax-namespace",
    ];
    vars.forEach((v) => root.style.removeProperty(v));
    // Remove bracket depth vars (up to 20 depths)
    for (let i = 1; i <= 20; i++) {
        root.style.removeProperty(`--bracket-depth-${i}`);
    }
}

/**
 * Convert BracketRanges to colored spans for canvas-based editors.
 * Returns an array of { start, finish, color } for the renderer.
 */
export function bracketRangesToColors(
    ranges: Array<{ start: number; finish: number; depth: number }>,
    bracketPalette: string[]
): Array<{ start: number; finish: number; color: string }> {
    return ranges.map(({ start, finish, depth }) => {
        const index = (depth - 1) % bracketPalette.length;
        return { start, finish, color: bracketPalette[index] };
    });
}
