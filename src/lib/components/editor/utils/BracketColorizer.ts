/**
 * Debounced bracket-pair colorizer.
 * Encapsulates the 400 ms debounce, the text-source selection logic, and the
 * IPC call to bracket-provider plugins — keeping EditorBuffer lean.
 */

import { invoke } from '@tauri-apps/api/core';
import { get } from 'svelte/store';
import { pluginRunBracketProviders } from '$lib/utils/shared/pluginClient';
import { bracketRangesToColors } from '$lib/utils/shared/themeEngine';
import { bracketRanges, activeTheme } from '$lib/stores/pluginStore';

export type BracketColor = { start: number; finish: number; color: string };

const DEFAULT_BRACKET_PALETTE = [
    '#f7768e', '#e0af68', '#9ece6a', '#7aa2f7', '#bb9af7', '#2ac3de',
];

export interface BracketScheduleDeps {
    /** Read at fire-time so stale captures are avoided. */
    getLineCache: () => Map<number, string>;
    getTotalLines: () => number;
    getIsDirty: () => boolean;
    filePath: string;
    language: string;
    onColors: (colors: BracketColor[]) => void;
    onQueueRedraw: () => void;
}

export class BracketColorizer {
    private handle: ReturnType<typeof setTimeout> | null = null;

    /**
     * Schedule (or re-schedule) a bracket analysis run.
     * Any previous pending run is cancelled first.
     *
     * Text source priority:
     *  1. All lines cached in-memory → use them (reflects unsaved edits).
     *  2. Large clean file → read full content from disk for complete analysis.
     *  3. Large dirty file → use partial cache as-is (acceptable tradeoff).
     */
    schedule(deps: BracketScheduleDeps): void {
        if (this.handle !== null) clearTimeout(this.handle);
        this.handle = setTimeout(async () => {
            this.handle = null;
            try {
                const lineCache = deps.getLineCache();
                const totalLines = deps.getTotalLines();
                let text: string;

                if (lineCache.size >= totalLines) {
                    const lines: string[] = [];
                    for (let i = 0; i < totalLines; i++) lines.push(lineCache.get(i) ?? '');
                    text = lines.join('\n');
                } else if (!deps.getIsDirty()) {
                    text = await invoke<string>('read_file', { path: deps.filePath });
                } else {
                    const lines: string[] = [];
                    for (let i = 0; i < totalLines; i++) lines.push(lineCache.get(i) ?? '');
                    text = lines.join('\n');
                }

                if (!text.trim()) return;

                const ranges = await pluginRunBracketProviders(text, deps.language);
                console.log('[bracket] ranges:', ranges.length, 'lang:', deps.language, 'textLen:', text.length);
                bracketRanges.set(ranges);

                const palette = get(activeTheme)?.brackets?.length
                    ? get(activeTheme)!.brackets
                    : DEFAULT_BRACKET_PALETTE;

                deps.onColors(bracketRangesToColors(ranges, palette));
                deps.onQueueRedraw();
            } catch (e) {
                console.warn('[bracket] update failed:', e);
            }
        }, 400);
    }

    cancel(): void {
        if (this.handle !== null) {
            clearTimeout(this.handle);
            this.handle = null;
        }
    }
}
