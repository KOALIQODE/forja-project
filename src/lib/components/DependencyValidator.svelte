<!-- <script lang="ts">
  import {
    Info,
    Loader2,
    Search,
    ShieldAlert,
    ShieldCheck,
  } from "@lucide/svelte";

  import {
    isScanning as isDepsScanning,
    scanResults,
    validatableEcosystems,
    type Vulnerability,
  } from "$lib/stores/DepsStore";
  import { currentProject } from "$lib/stores/projectStore";
  import { validateDependency } from "$lib/utils/shared/securityClient";

  type EcosystemOption = {
    id: string;
    label: string;
    icon: string;
    packagePlaceholder: string;
    versionPlaceholder: string;
  };

  const ECOSYSTEM_OPTIONS: Record<string, EcosystemOption> = {
    npm: {
      id: "npm",
      label: "NPM",
      icon: "⬢",
      packagePlaceholder: "e.g. lodash",
      versionPlaceholder: "e.g. 4.17.21",
    },
    cargo: {
      id: "cargo",
      label: "Cargo",
      icon: "⚙",
      packagePlaceholder: "e.g. serde",
      versionPlaceholder: "e.g. 1.0",
    },
  };

  let ecosystem = $state("");
  let packageName = $state("");
  let version = $state("");
  let validating = $state(false);
  let results = $state<Vulnerability[] | null>(null);
  let error = $state<string | null>(null);

  let availableEcosystems = $derived(
    $validatableEcosystems
      .map((ecosystemId) => ECOSYSTEM_OPTIONS[ecosystemId])
      .filter(Boolean),
  );

  let emptyStateMessage = $derived.by(() => {
    if (!$currentProject) {
      return "Open a project to validate a dependency before installing it.";
    }

    if ($isDepsScanning && $scanResults.length === 0) {
      return "Detecting dependency manifests for this project...";
    }

    if ($scanResults.length === 0) {
      return "No supported dependency manifests were detected in this project.";
    }

    return "This validation sandbox is available only for npm and cargo right now.";
  });

  $effect(() => {
    if (availableEcosystems.length === 0) {
      ecosystem = "";
      return;
    }

    if (!availableEcosystems.some((option) => option.id === ecosystem)) {
      ecosystem = availableEcosystems[0].id;
    }
  });

  async function handleValidate() {
    if (!packageName || !ecosystem) {
      return;
    }

    validating = true;
    error = null;
    results = null;

    try {
      results = await validateDependency(
        ecosystem,
        packageName,
        version || undefined,
      );
    } catch (value: unknown) {
      error = value instanceof Error ? value.message : "Validation failed";
    } finally {
      validating = false;
    }
  }

  const severityColor: Record<string, string> = {
    critical: "text-red-400",
    high: "text-orange-400",
    moderate: "text-amber-400",
    low: "text-yellow-300",
    unknown: "text-zinc-400",
  };
</script>

<div
  class="flex h-full flex-col border border-zinc-800/50 bg-[#0a0a0a] p-4 font-sans text-zinc-300"
  data-program-ui
>
  <div class="mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
    <ShieldCheck size={18} class="text-emerald-500" />
    <h2 class="text-sm font-semibold uppercase tracking-wider">
      Dependency Validator
    </h2>
  </div>

  {#if availableEcosystems.length === 0}
    <div
      class="flex flex-1 flex-col items-center justify-center gap-3 text-center text-zinc-500"
    >
      <ShieldAlert size={32} class="text-zinc-600" />
      <p class="max-w-[26ch] text-xs leading-relaxed">{emptyStateMessage}</p>
    </div>
  {:else}
    <div class="mb-6 flex flex-col gap-3">
      <div class="flex gap-2">
        {#each availableEcosystems as option}
          <button
            class="flex flex-1 items-center justify-center gap-2 border px-3 py-1.5 text-[11px] font-mono {ecosystem ===
            option.id
              ? 'border-zinc-600 bg-zinc-800 text-white'
              : 'border-zinc-800 text-zinc-500 hover:bg-zinc-900'}"
            onclick={() => (ecosystem = option.id)}
            type="button"
          >
            <span>{option.icon}</span>
            {option.label}
          </button>
        {/each}
      </div>

      <div class="flex flex-col gap-1">
        <label
          for="pkg-name"
          class="text-[10px] uppercase tracking-widest text-zinc-500"
          >Package Name</label
        >
        <input
          id="pkg-name"
          type="text"
          bind:value={packageName}
          placeholder={ECOSYSTEM_OPTIONS[ecosystem]?.packagePlaceholder ??
            "Package name"}
          class="w-full border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs font-mono focus:border-zinc-600 focus:outline-none"
          onkeydown={(event) => event.key === "Enter" && handleValidate()}
        />
      </div>

      <div class="flex flex-col gap-1">
        <label
          for="pkg-ver"
          class="text-[10px] uppercase tracking-widest text-zinc-500"
          >Version (Optional)</label
        >
        <input
          id="pkg-ver"
          type="text"
          bind:value={version}
          placeholder={ECOSYSTEM_OPTIONS[ecosystem]?.versionPlaceholder ??
            "Version"}
          class="w-full border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs font-mono focus:border-zinc-600 focus:outline-none"
          onkeydown={(event) => event.key === "Enter" && handleValidate()}
        />
      </div>

      <button
        class="mt-2 flex w-full items-center justify-center gap-2 bg-emerald-600 py-2 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600"
        onclick={handleValidate}
        disabled={validating || !packageName || !ecosystem}
        type="button"
      >
        {#if validating}
          <Loader2 size={14} class="animate-spin" />
          Validating...
        {:else}
          <Search size={14} />
          Check Vulnerabilities
        {/if}
      </button>
    </div>
  {/if}

  <div class="min-h-0 flex-1 overflow-y-auto">
    {#if error}
      <div
        class="flex items-start gap-2 border border-red-900/50 bg-red-950/30 p-3"
      >
        <ShieldAlert size={16} class="mt-0.5 shrink-0 text-red-500" />
        <p class="text-xs text-red-400">{error}</p>
      </div>
    {:else if results}
      {#if results.length === 0}
        <div
          class="flex flex-col items-center justify-center py-12 text-zinc-600 opacity-60"
        >
          <ShieldCheck size={48} class="mb-3 text-emerald-500/40" />
          <p class="text-xs">No vulnerabilities found</p>
          <p class="mt-1 text-[10px]">Package is clean to install</p>
        </div>
      {:else}
        <div class="space-y-3">
          <div class="mb-2 flex items-center gap-2 text-red-400">
            <ShieldAlert size={16} />
            <span class="text-xs font-semibold"
              >{results.length} Vulnerabilities Found</span
            >
          </div>
          {#each results as vuln}
            <div class="space-y-2 border border-zinc-800/50 bg-zinc-900/40 p-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-mono font-bold text-white"
                  >{packageName}</span
                >
                <span
                  class="bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase {severityColor[
                    vuln.severity
                  ]}"
                >
                  {vuln.severity}
                </span>
              </div>
              <p class="text-[11px] italic leading-relaxed text-zinc-400">
                {vuln.title || "Vulnerability detected in dependency chain"}
              </p>
              <div class="flex flex-wrap gap-2 text-[10px]">
                {#if vuln.id}
                  <span class="text-zinc-500"
                    >ID: <span class="font-mono text-zinc-300">{vuln.id}</span
                    ></span
                  >
                {/if}
                {#if vuln.patched_versions}
                  <span class="text-zinc-500">
                    Fixed in: <span class="font-mono text-emerald-500/80"
                      >{vuln.patched_versions}</span
                    >
                  </span>
                {/if}
              </div>
              {#if vuln.url}
                <a
                  href={vuln.url}
                  target="_blank"
                  rel="noopener"
                  class="block text-[10px] text-emerald-500 hover:underline"
                >
                  View Advisory →
                </a>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  <div class="mt-4 border-t border-zinc-800 pt-4">
    <div class="flex items-start gap-2 text-[10px] italic text-zinc-500">
      <Info size={12} class="mt-0.5 shrink-0" />
      <p>
        This validation creates a temporary sandbox to audit the package without
        modifying your project's manifests.
      </p>
    </div>
  </div>
</div> -->
