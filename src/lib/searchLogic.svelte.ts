import { invoke } from "@tauri-apps/api/core";
import { get } from 'svelte/store';
import { closeDialog } from "$lib/stores/dialogStore";
import { currentProject } from "$lib/stores/projectStore";
import { openBuffer } from "$lib/stores/bufferStore";
import { activeTheme } from "$lib/stores/pluginStore";
import { TOKEN_COLORS } from "$lib/utils/constants";

export function createSearchState(mode: 'files' | 'grep' | 'buffers') {
  let query = $state('');
  let results = $state<any[]>([]);
  let selectedIdx = $state(0);
  let isLoading = $state(false);
  let previewHighlightedHtml = $state('');
  let previewLoading = $state(false);

  async function updatePreview() {
    const selected = results[selectedIdx];
    if (!selected) {
      previewHighlightedHtml = '';
      return;
    }

    previewLoading = true;
    try {
      const start = selected.is_grep ? Math.max(0, (selected.line_num || 0) - 10) : 0;
      const end = start + 50;

      const lines = await invoke<string[]>("read_file_lines", {
        path: selected.path,
        startLine: start,
        endLine: end,
      });

      const text = lines.join('\n');

      try {
        const lang = await invoke<string>('detect_language', { filePath: selected.path });
        if (lang && lang !== 'unknown') {
          const result = await invoke<{ tokens: Array<{ text: string; token_type: string }> }>(
            'highlight_syntax',
            { content: text, language: lang }
          );
          previewHighlightedHtml = renderTokensToHtml(result.tokens);
        } else {
          previewHighlightedHtml = escapeHtml(text);
        }
      } catch {
        previewHighlightedHtml = escapeHtml(text);
      }
    } catch (e) {
      previewHighlightedHtml = 'Error loading preview';
    } finally {
      previewLoading = false;
    }
  }

  function confirmSelection() {
    const selected = results[selectedIdx];
    if (selected) {
      openBuffer(selected.path);
      closeDialog();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIdx = (selectedIdx + 1) % results.length;
      updatePreview();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIdx = (selectedIdx - 1 + results.length) % results.length;
      updatePreview();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      confirmSelection();
    }
  }

  return {
    get query() { return query; },
    set query(v) { query = v; },
    get results() { return results; },
    set results(v) { results = v; },
    get selectedIdx() { return selectedIdx; },
    set selectedIdx(v) { selectedIdx = v; },
    get isLoading() { return isLoading; },
    set isLoading(v) { isLoading = v; },
    get previewHighlightedHtml() { return previewHighlightedHtml; },
    get previewLoading() { return previewLoading; },
    updatePreview,
    handleKeydown,
    confirmSelection
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTokensToHtml(tokens: Array<{ text: string; token_type: string }>): string {
  const s = get(activeTheme)?.syntax;
  const colors = s ? {
    ...TOKEN_COLORS,
    Keyword:     s.keyword       ?? TOKEN_COLORS.Keyword,
    Function:    s.function_name ?? TOKEN_COLORS.Function,
    Type:        s.type          ?? TOKEN_COLORS.Type,
    String:      s.string        ?? TOKEN_COLORS.String,
    Comment:     s.comment       ?? TOKEN_COLORS.Comment,
    Number:      s.number        ?? TOKEN_COLORS.Number,
    Punctuation: s.punctuation   ?? TOKEN_COLORS.Punctuation,
    Operator:    s.operator      ?? TOKEN_COLORS.Operator,
    Variable:    s.variable      ?? TOKEN_COLORS.Variable,
    Property:    s.variable      ?? TOKEN_COLORS.Property,
    Constant:    s.constant      ?? TOKEN_COLORS.Constant,
    Attribute:   s.attribute     ?? TOKEN_COLORS.Attribute,
    Boolean:     s.constant      ?? TOKEN_COLORS.Boolean,
  } : TOKEN_COLORS;

  return tokens.map(token => {
    const safe = escapeHtml(token.text);
    const color = (colors as Record<string, string>)[token.token_type] ?? TOKEN_COLORS.Unknown;
    return `<span style="color:${color}">${safe}</span>`;
  }).join('');
}
