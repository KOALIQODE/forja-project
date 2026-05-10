<script lang="ts">
  import { Loader2, ShieldAlert, X } from '@lucide/svelte';

  import { activeUITheme } from '$lib/stores/uiThemeStore';
  import {
    cloneError,
    cloneProgress,
    cloneWorkflowActive,
    installProgress,
    isCloning,
    isInstalling,
    isSaving,
    resetCloneRepositoryFlow,
  } from '$lib/stores/cloneRepositoryStore';

  let dismissed = $state(false);

  $effect(() => {
    if ($cloneWorkflowActive || $cloneError) {
      dismissed = false;
    }
  });

  let themeStyle = $derived(
    Object.entries($activeUITheme.vars).map(([key, value]) => `${key}: ${value}`).join('; ')
  );

  let activeMessage = $derived(
    $isInstalling
      ? $installProgress?.message
      : $cloneProgress?.message
  );

  let activeProgress = $derived(
    $isInstalling
      ? $installProgress?.progress ?? 0
      : $cloneProgress?.progress ?? 0
  );

  let activeStatus = $derived(
    $isInstalling
      ? $installProgress?.status ?? 'installing'
      : $cloneProgress?.status ?? ($isSaving ? 'saving' : 'cloning')
  );

  let visible = $derived(($cloneWorkflowActive || !!$cloneError) && !dismissed);

  function dismiss() {
    dismissed = true;
    if (!$cloneWorkflowActive) {
      resetCloneRepositoryFlow();
    }
  }
</script>

{#if visible}
  <div
    class="pointer-events-auto fixed right-4 bottom-8 z-[55] w-80 bg-zinc-950/88"
    style="backdrop-filter: blur(12px); {themeStyle}"
    data-program-ui
  >
    <div class="flex items-start gap-2 px-3 py-2.5">
      {#if $cloneError}
        <ShieldAlert size={15} class="mt-0.5 shrink-0 text-red-400" />
      {:else}
        <div class="mt-0.5 flex h-4 w-4 items-center justify-center text-emerald-300">
          <Loader2 size={14} class="animate-spin" />
        </div>
      {/if}

      <div class="min-w-0 flex-1">
        <p class="text-[11px] font-semibold leading-tight text-white">
          {$cloneError ? 'Clone Workflow Error' : 'Repository Workflow'}
        </p>
        <p class="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-white/45">
          {activeStatus}
        </p>
        <p class="mt-1 text-[11px] leading-relaxed text-white/65">
          {$cloneError || activeMessage}
        </p>

        {#if !$cloneError}
          <div class="mt-2 h-1.5 overflow-hidden bg-white/8">
            <div
              class="h-full bg-linear-to-r from-emerald-400 to-cyan-400 transition-all duration-300"
              style="width: {activeProgress}%"
            ></div>
          </div>
          <div class="mt-1 flex items-center justify-between text-[10px] text-white/40">
            <span>{#if $isInstalling}install{/if}{#if !$isInstalling && $isSaving}save{/if}{#if !$isInstalling && !$isSaving}validate{/if}</span>
            <span>{activeProgress}%</span>
          </div>
        {/if}
      </div>

      <button
        type="button"
        onclick={dismiss}
        class="flex items-center justify-center p-1 text-white/30 hover:bg-white/5 hover:text-white/70 transition-colors"
        title="Dismiss"
      >
        <X size={12} />
      </button>
    </div>
  </div>
{/if}
