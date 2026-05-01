<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { onMount, onDestroy } from 'svelte';

  interface Parser {
    name: string;
    language: string;
    version: string;
    source_url: string;
    installed: boolean;
  }

  interface DownloadProgress {
    parser: string;
    downloaded: number;
    total: number;
    percentage: number;
    status: string;
  }

  let parsers: Parser[] = [];
  let downloading = new Map<string, number>();
  let error: string | null = null;
  const unlisteners: Array<() => void> = [];

  async function loadParsers() {
    try {
      parsers = await invoke<Parser[]>('pm_list_parsers');
    } catch (e) {
      error = String(e);
    }
  }

  async function downloadParser(parser: Parser) {
    downloading.set(parser.language, 0);
    downloading = downloading;
    error = null;

    const progressUnlisten = await listen<DownloadProgress>(
      `download-${parser.language}`,
      (event) => {
        downloading.set(event.payload.parser, event.payload.percentage);
        downloading = downloading;
      }
    );
    unlisteners.push(progressUnlisten);

    try {
      await invoke('pm_download_or_compile_parser', { parserName: parser.language });
      await loadParsers();
    } catch (e) {
      error = String(e);
    } finally {
      downloading.delete(parser.language);
      downloading = downloading;
    }
  }

  onMount(() => loadParsers());

  onDestroy(() => {
    unlisteners.forEach(fn => fn());
  });
</script>

<div class="parser-manager">
  <h2>Parser Manager</h2>

  {#if error}
    <div class="error">{error}</div>
  {/if}

  <div class="parsers-grid">
    {#each parsers as parser (parser.language)}
      <div class="parser-item">
        <div class="parser-info">
          <span class="language">{parser.language}</span>
          <span class="name">{parser.name}</span>
        </div>

        {#if parser.installed}
          <span class="badge installed">✓ Installed</span>
        {:else if downloading.has(parser.language)}
          <div class="progress-wrapper">
            <div class="progress-bar">
              <div
                class="progress-fill"
                style="width: {downloading.get(parser.language)?.toFixed(0) ?? 0}%"
              ></div>
            </div>
            <span class="pct">{downloading.get(parser.language)?.toFixed(0) ?? 0}%</span>
          </div>
        {:else}
          <button class="btn-install" on:click={() => downloadParser(parser)}>
            Install
          </button>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .parser-manager { display: flex; flex-direction: column; gap: 1rem; padding: 1rem; }
  h2 { font-size: 1.1rem; font-weight: 600; margin: 0; }
  .error { color: #e57373; font-size: 0.85rem; padding: 0.5rem; background: rgba(229,115,115,0.1); border-radius: 4px; }
  .parsers-grid { display: flex; flex-direction: column; gap: 0.5rem; }
  .parser-item {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0.75rem 1rem; border: 1px solid var(--border, #333);
    border-radius: 6px; background: var(--surface, #1e1e1e);
  }
  .parser-info { display: flex; flex-direction: column; gap: 2px; }
  .language { font-weight: 600; font-size: 0.9rem; text-transform: capitalize; }
  .name { font-size: 0.75rem; color: var(--muted, #888); }
  .badge.installed { color: #81c784; font-size: 0.8rem; }
  .progress-wrapper { display: flex; align-items: center; gap: 0.5rem; }
  .progress-bar { width: 120px; height: 6px; background: var(--border, #333); border-radius: 3px; overflow: hidden; }
  .progress-fill { height: 100%; background: #4caf50; transition: width 0.2s ease; }
  .pct { font-size: 0.75rem; color: var(--muted, #888); min-width: 32px; text-align: right; }
  .btn-install {
    padding: 0.3rem 0.75rem; font-size: 0.8rem; border-radius: 4px;
    border: 1px solid var(--accent, #4caf50); color: var(--accent, #4caf50);
    background: transparent; cursor: pointer; transition: all 0.15s;
  }
  .btn-install:hover { background: var(--accent, #4caf50); color: #fff; }
</style>
