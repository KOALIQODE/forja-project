<script lang="ts">
  import { Shield, ShieldAlert, ShieldCheck, X, Puzzle, Palette } from "@lucide/svelte";
  import type { PluginPreflightInfo } from "../../utils/pluginClient";

  interface Props {
    info: PluginPreflightInfo;
    onApprove: () => void;
    onDeny: () => void;
  }

  let { info, onApprove, onDeny }: Props = $props();

  function riskIcon(risk: string) {
    if (risk === "high")   return ShieldAlert;
    if (risk === "medium") return Shield;
    return ShieldCheck;
  }

  function riskClass(risk: string): string {
    if (risk === "high")   return "text-rose-400 bg-rose-500/10 border-rose-500/20";
    if (risk === "medium") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  }

  function riskLabel(risk: string): string {
    if (risk === "high")   return "High risk";
    if (risk === "medium") return "Medium risk";
    return "Low risk";
  }

  // Highest risk level among all permissions
  let overallRisk = $derived(
    info.permissions.some(p => p.risk === "high")   ? "high"   :
    info.permissions.some(p => p.risk === "medium") ? "medium" : "low"
  );
</script>

<!-- Backdrop — clicks outside do nothing (force explicit choice) -->
<div
  class="fixed inset-0 z-[200] flex items-center justify-center"
  role="dialog"
  aria-modal="true"
  aria-label="Plugin permission consent"
>
  <!-- Panel -->
  <div class="flex w-full max-w-md flex-col overflow-hidden bg-[#0d0d0d] shadow-[0_32px_64px_rgba(0,0,0,0.95)]">

    <!-- Header -->
    <div class="flex items-center justify-between border-b border-white/5 px-6 py-5">
      <div class="flex items-center gap-3">
        <div class="{riskClass(overallRisk)} border p-2">
          {#if overallRisk === "high"}
            <ShieldAlert size={20} />
          {:else if overallRisk === "medium"}
            <Shield size={20} />
          {:else}
            <ShieldCheck size={20} />
          {/if}
        </div>
        <div>
          <p class="text-[9px] font-bold uppercase tracking-widest text-white/30">Permission Request</p>
          <h2 class="text-base font-semibold text-white">{info.name}</h2>
        </div>
      </div>
      <button
        onclick={onDeny}
        class="p-1.5 text-white/20 transition-colors hover:bg-white/5 hover:text-white"
        aria-label="Deny"
      >
        <X size={16} />
      </button>
    </div>

    <!-- Plugin meta -->
    <div class="flex items-center gap-3 border-b border-white/5 bg-white/[0.02] px-6 py-3">
      <div class="flex h-8 w-8 items-center justify-center bg-black/40 text-white/30">
        {#if info.kind === "theme"}
          <Palette size={16} />
        {:else}
          <Puzzle size={16} />
        {/if}
      </div>
      <div class="text-xs text-white/40">
        <span class="capitalize">{info.kind}</span>
        <span class="mx-1.5 text-white/15">·</span>
        <span>v{info.version}</span>
      </div>
    </div>

    <!-- Permissions list -->
    <div class="px-6 py-5">
      {#if info.permissions.length === 0}
        <div class="flex items-center gap-3 border border-emerald-500/20 bg-emerald-500/5 p-4">
          <ShieldCheck size={18} class="shrink-0 text-emerald-400" />
          <p class="text-xs text-emerald-300">This plugin requests no permissions — it runs in a fully isolated sandbox.</p>
        </div>
      {:else}
        <p class="mb-3 text-[10px] uppercase tracking-widest text-white/30">
          This plugin requests {info.permissions.length} permission{info.permissions.length === 1 ? '' : 's'}:
        </p>
        <ul class="flex flex-col gap-2">
          {#each info.permissions as perm}
            {@const RiskIcon = riskIcon(perm.risk)}
            <li class="perm-item group relative flex w-full items-start gap-3 px-3 py-2.5 {riskClass(perm.risk)}">
              <div class="perm-icon mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center">
                <RiskIcon size={15} />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <code class="font-mono text-[10px] font-bold">{perm.id}</code>
                  <span class="shrink-0 border px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider {riskClass(perm.risk)}">
                    {riskLabel(perm.risk)}
                  </span>
                </div>
                <p class="mt-0.5 text-[11px] opacity-70">{perm.description}</p>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Warning for high-risk plugins -->
    {#if overallRisk === "high"}
      <div class="mx-6 mb-4 flex items-start gap-2 border border-rose-500/20 bg-rose-500/5 px-4 py-3">
        <ShieldAlert size={14} class="mt-0.5 shrink-0 text-rose-400" />
        <p class="text-[10px] text-rose-300">This plugin requests high-risk permissions. Only install it if you trust the source.</p>
      </div>
    {/if}

    <!-- Action buttons -->
    <div class="flex gap-3 border-t border-white/5 bg-white/[0.02] px-6 py-4">
      <button
        onclick={onDeny}
        class="flex flex-1 items-center justify-center gap-2 border border-white/10 bg-white/5 py-2.5 text-xs font-medium text-white/60 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
      >
        <X size={13} />
        Deny
      </button>
      <button
        onclick={onApprove}
        class="flex flex-1 items-center justify-center gap-2 py-2.5 text-xs font-semibold transition-all
          {overallRisk === 'high'
            ? 'border border-rose-500/30 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
            : 'bg-violet-600 text-white hover:bg-violet-500'}"
      >
        <ShieldCheck size={13} />
        {overallRisk === "high" ? "Allow anyway" : "Allow"}
      </button>
    </div>

  </div>
</div>

<style>
  .perm-item { border-radius: 8px; transition: background 0.12s, transform 0.06s; }
  .perm-item + .perm-item { margin-top: 6px; }
  .perm-item:hover { background: color-mix(in srgb, var(--forja-ui-btn-hover-bg, rgba(255,255,255,0.04)) 60%, transparent); transform: translateY(-1px); }
</style>
