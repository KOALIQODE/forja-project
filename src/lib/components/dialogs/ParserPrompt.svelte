<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { Sparkles, Download, X, CheckCircle2 } from '@lucide/svelte';
  import { activeBuffer } from '$lib/stores/bufferStore';

  interface ParserMetadata {
    language: string;
    installed: boolean;
  }

  const STATUS_PROGRESS: Record<string, number> = {
    'Fetching queries...': 35,
    'Downloading binary...': 80,
    Ready: 100
  };

  let installingParser = $state<string | null>(null);
  let installProgress = $state(0);
  let installMessage = $state('Starting...');
  let installError = $state<string | null>(null);
  let recommendation = $state<string | null>(null);
  let checkedLanguages = new Set<string>();
  let showToast = $state(false);

  function formatError(error: unknown) {
    if (error instanceof Error) return error.message;
    return typeof error === 'string' ? error : 'Unknown parser installation error';
  }

  async function installParser(language: string) {
    installingParser = language;
    installProgress = 5;
    installMessage = 'Starting...';
    installError = null;
    recommendation = null;
    showToast = true;

    let unlistenStatus = () => {};
    let unlistenReady = () => {};

    try {
      unlistenStatus = await listen<[string, string]>('parser-status', (event) => {
        const [eventLanguage, status] = event.payload;
        if (eventLanguage !== language) return;

        installMessage = status;
        installProgress = STATUS_PROGRESS[status] ?? installProgress;
      });

      unlistenReady = await listen<string>('parser-ready', (event) => {
        if (event.payload !== language) return;

        installMessage = 'Ready';
        installProgress = 100;
      });

      await invoke('pm_download_or_compile_parser', { parserName: language });

      installMessage = 'Ready';
      installProgress = 100;
      checkedLanguages.add(language);

      setTimeout(() => {
        if (installingParser === language) {
          installingParser = null;
          showToast = false;
        }
      }, 2000);
    } catch (err) {
      checkedLanguages.delete(language);
      installError = formatError(err);
      installMessage = installError;
      console.error('Failed to install parser:', err);
      installingParser = null;
      recommendation = language;
    } finally {
      unlistenStatus();
      unlistenReady();
    }
  }

  $effect(() => {
    const buffer = $activeBuffer;
    if (buffer && buffer.language && buffer.language !== 'unknown' && !checkedLanguages.has(buffer.language)) {
      checkParser(buffer.language);
    }
  });

  async function checkParser(language: string) {
    try {
      const parsers = await invoke<{ language: string; installed: boolean }[]>('pm_list_parsers');
      const parser = parsers.find(p => p.language === language);
      
      if (parser) {
        checkedLanguages.add(language);

        if (!parser.installed) {
          recommendation = language;
          showToast = true;
        }
      }
    } catch (err) {
      console.error('Error checking parser:', err);
    }
  }

  function dismiss() {
    showToast = false;
    recommendation = null;
    installError = null;
  }
</script>

{#if showToast}
  <div class="fixed bottom-12 right-6 z-[100] w-72 animate-in fade-in slide-in-from-right-4 duration-300">
    <div class="bg-[#121212]/90 border border-white/10 shadow-2xl overflow-hidden">
      {#if installingParser}
        <div class="p-4">
          <div class="flex items-center gap-3 mb-3">
            <div class="flex h-8 w-8 items-center justify-center bg-emerald-500/10 text-emerald-500">
              {#if installProgress === 100}
                <CheckCircle2 size={18} />
              {:else}
                <Download size={18} class="animate-bounce" />
              {/if}
            </div>
            <div class="flex-1">
              <p class="text-[12px] font-bold text-zinc-100">
                {installProgress === 100 ? 'Installed!' : `Installing ${installingParser}...`}
              </p>
              <p class="text-[10px] text-zinc-500">{installMessage}</p>
            </div>
          </div>
          <div class="w-full h-1 bg-white/5 overflow-hidden">
            <div 
              class="h-full bg-emerald-500 transition-all duration-300" 
              style={`width: ${installProgress}%`}
            ></div>
          </div>
        </div>
      {:else if recommendation}
        <div class="p-4">
          <div class="flex items-start gap-3">
            <div class="flex h-8 w-8 items-center justify-center bg-emerald-500/10 text-emerald-500 shrink-0">
              <Sparkles size={18} />
            </div>
            <div class="flex-1">
              <div class="flex justify-between items-start">
                <p class="text-[12px] font-bold text-zinc-100 uppercase tracking-tight">Enhance Editor</p>
                <button onclick={dismiss} class="text-zinc-500 hover:text-white transition-colors cursor-pointer">
                  <X size={14} />
                </button>
              </div>
              <p class="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                Install syntax highlighting for <span class="text-emerald-400 font-bold">{recommendation}</span> to improve your workflow.
              </p>
              {#if installError}
                <p class="mt-2 text-[10px] leading-relaxed text-rose-400">
                  {installError}
                </p>
              {/if}
              <div class="mt-4 flex gap-2">
                <button 
                  onclick={() => installParser(recommendation!)}
                  class="flex-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-black text-[11px] font-bold transition-all cursor-pointer shadow-lg shadow-emerald-500/10"
                >
                  {installError ? 'Retry install' : 'Install Now'}
                </button>
                <button 
                  onclick={dismiss}
                  class="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-300 text-[11px] font-medium transition-all cursor-pointer"
                >
                  Later
                </button>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
