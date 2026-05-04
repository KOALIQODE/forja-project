<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { onDestroy } from 'svelte';

  type Status = 'idle' | 'downloading' | 'compiling' | 'ready' | 'error';

  interface CompilationState {
    parser: string;
    status: Status;
    progress: number;
    message: string;
  }

  export let parserName: string = '';

  let state: CompilationState = {
    parser: parserName,
    status: 'idle',
    progress: 0,
    message: '',
  };

  const unlisteners: Array<() => void> = [];

  async function compileParser() {
    state = { parser: parserName, status: 'downloading', progress: 10, message: 'Downloading source...' };

    const listeners = await Promise.all([
      listen(`download-${parserName}`, (event: any) => {
        state = { ...state, status: 'downloading', progress: Math.round(event.payload.percentage * 0.5), message: `Downloading ${event.payload.percentage.toFixed(0)}%...` };
      }),
      listen('parser-compiling', (event: any) => {
        if (event.payload?.parser === parserName) {
          state = { ...state, status: 'compiling', progress: 60, message: 'Compiling C code...' };
        }
      }),
      listen('parser-ready', (event: any) => {
        if (event.payload === parserName || event.payload?.parser === parserName) {
          state = { ...state, status: 'ready', progress: 100, message: 'Ready!' };
        }
      }),
      listen('parser-error', (event: any) => {
        if (event.payload?.parser === parserName) {
          state = { ...state, status: 'error', message: event.payload.error };
        }
      }),
    ]);
    unlisteners.push(...listeners);

    try {
      await invoke('pm_download_or_compile_parser', { parserName });
    } catch (e) {
      state = { ...state, status: 'error', message: String(e) };
    }
  }

  onDestroy(() => unlisteners.forEach(fn => fn()));
</script>

<div class="compiler-card" class:ready={state.status === 'ready'} class:error={state.status === 'error'}>
  <div class="header">
    <span class="name">{parserName}</span>
    {#if state.status === 'ready'}
      <span class="badge ready">✅ Compiled</span>
    {:else if state.status === 'error'}
      <span class="badge error">❌ Error</span>
    {:else if state.status === 'idle'}
      <button class="btn-compile" on:click={compileParser}>Compile</button>
    {/if}
  </div>

  {#if state.status !== 'idle' && state.status !== 'ready'}
    <div class="progress-container">
      <div class="progress-bar">
        <div class="progress-fill" style="width: {state.progress}%"></div>
      </div>
      <span class="status-msg">{state.message}</span>
    </div>
  {/if}

  {#if state.status === 'error'}
    <p class="error-msg">{state.message}</p>
  {/if}
</div>

<style>
  .compiler-card { padding: 1rem; border: 2px solid var(--border, #333); border-radius: 8px; transition: border-color 0.3s; }
  .compiler-card.ready { border-color: #4caf50; }
  .compiler-card.error { border-color: #e57373; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .name { font-weight: 600; text-transform: capitalize; }
  .badge { font-size: 0.8rem; }
  .progress-container { display: flex; flex-direction: column; gap: 0.35rem; }
  .progress-bar { width: 100%; height: 8px; background: var(--border, #333); border-radius: 4px; overflow: hidden; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, #4caf50, #81c784); transition: width 0.3s ease; }
  .status-msg { font-size: 0.8rem; color: var(--muted, #888); }
  .error-msg { font-size: 0.8rem; color: #e57373; margin: 0.25rem 0 0; }
  .btn-compile { padding: 0.3rem 0.75rem; font-size: 0.8rem; border-radius: 4px; border: 1px solid var(--accent, #4caf50); color: var(--accent, #4caf50); background: transparent; cursor: pointer; }
  .btn-compile:hover { background: var(--accent, #4caf50); color: #fff; }
</style>
