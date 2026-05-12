<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog';
  import {
    Download,
    FolderOpen,
    Loader2,
    ShieldAlert,
    ShieldCheck,
    X,
  } from '@lucide/svelte';
  import { onMount } from 'svelte';

  import { activeUITheme } from '$lib/stores/uiThemeStore';
  import { closeDialog } from '$lib/stores/dialogStore';
  import { openProject } from '$lib/stores/projectStore';
  import {
    activeCloneSessionId,
    cleanupCloneSession,
    cloneError,
    cloneProgress,
    installResults,
    isCloning,
    isInstalling,
    isSaving,
    resetCloneRepositoryFlow,
    saveValidatedProject,
    startCloneAndValidate,
    validationResult,
    installValidatedTargets,
    type CloneValidationResult,
    type InstallTarget,
  } from '$lib/stores/cloneRepositoryStore';

  let gitUrl = $state('');
  let destinationRoot = $state('');
  let expandedManifest = $state<string | null>(null);
  let localError = $state<string | null>(null);
  let autofix = $state(false);
  let dialogEl: HTMLElement | null = $state(null);

  let themeStyle = $derived(
    Object.entries($activeUITheme.vars).map(([key, value]) => `${key}:${value}`).join(';')
  );

  let isBusy = $derived($isCloning || $isSaving || $isInstalling);
  let canReview = $derived(!!$validationResult);
  let canStartClone = $derived(gitUrl.trim().length > 0 && !$isCloning);

  onMount(() => {
    dialogEl?.focus();
  });

  async function requestClose() {
    if ($isCloning || $isSaving || $isInstalling) {
      return;
    }

    if ($activeCloneSessionId) {
      await cleanupCloneSession($activeCloneSessionId);
    } else {
      resetCloneRepositoryFlow();
    }

    closeDialog();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      void requestClose();
      return;
    }

    if (event.key === 'Enter' && !canReview && canStartClone) {
      event.preventDefault();
      void handleClone();
    }
  }

  async function handleClone() {
    localError = null;

    try {
      await startCloneAndValidate(gitUrl.trim(), undefined, autofix);
    } catch (value: unknown) {
      localError = value instanceof Error ? value.message : String(value);
    }
  }

  async function pickDestinationRoot() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Destination Folder',
      });

      if (selected && typeof selected === 'string') {
        destinationRoot = selected;
      }
    } catch (value: unknown) {
      localError = value instanceof Error ? value.message : String(value);
    }
  }

  function manifestRelativePath(result: CloneValidationResult, manifestPath: string) {
    const prefix = `${result.temp_path}/`;
    if (manifestPath.startsWith(prefix)) {
      return manifestPath.slice(prefix.length);
    }
    if (manifestPath.startsWith(result.temp_path)) {
      return manifestPath.slice(result.temp_path.length).replace(/^[/\\]+/, '');
    }
    return manifestPath.split('/').pop() ?? manifestPath;
  }

  function buildInstallTargets(result: CloneValidationResult): InstallTarget[] {
    const seen = new Set<string>();
    const targets: InstallTarget[] = [];

    for (const scan of result.scans) {
      const manifestRelPath = manifestRelativePath(result, scan.manifest_path);
      const key = `${scan.ecosystem}:${manifestRelPath}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      targets.push({
        ecosystem: scan.ecosystem,
        manifest_rel_path: manifestRelPath,
      });
    }

    return targets;
  }

  async function handleSaveOnly() {
    if (!$validationResult || !destinationRoot.trim()) {
      localError = 'Choose a destination folder before saving.';
      return;
    }

    localError = null;

    try {
      const saveResult = await saveValidatedProject(
        $validationResult.session_id,
        destinationRoot.trim(),
        $validationResult.project_name
      );

      openProject(saveResult.final_path);
      await cleanupCloneSession(saveResult.session_id);
      closeDialog();
    } catch (value: unknown) {
      localError = value instanceof Error ? value.message : String(value);
    }
  }

  async function handleSaveAndInstall() {
    if (!$validationResult || !destinationRoot.trim()) {
      localError = 'Choose a destination folder before saving.';
      return;
    }

    localError = null;

    try {
      const saveResult = await saveValidatedProject(
        $validationResult.session_id,
        destinationRoot.trim(),
        $validationResult.project_name
      );

      openProject(saveResult.final_path);

      const targets = buildInstallTargets($validationResult);
      if (targets.length === 0) {
        await cleanupCloneSession(saveResult.session_id);
        closeDialog();
        return;
      }

      const results = await installValidatedTargets(
        $validationResult.session_id,
        saveResult.final_path,
        targets,
        'safe'
      );

      if (results.every((result) => result.success)) {
        await cleanupCloneSession(saveResult.session_id);
        closeDialog();
      } else {
        localError = 'Safe install finished with one or more failures. Review the results below.';
      }
    } catch (value: unknown) {
      localError = value instanceof Error ? value.message : String(value);
    }
  }
</script>

<div
  class="fixed inset-0 z-[3000] flex items-start justify-center pt-12"
  onclick={() => void requestClose()}
  onkeydown={handleKeyDown}
  role="presentation"
>
  <div
    bind:this={dialogEl}
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    aria-labelledby="clone-repository-title"
    onclick={(event) => event.stopPropagation()}
    onkeydown={handleKeyDown}
    style={themeStyle}
    class="clone-dialog w-[680px] max-w-[calc(100vw-32px)] overflow-hidden bg-(--forja-ui-picker-bg,#0e0e11) text-(--forja-ui-picker-text,#a1a1aa) outline-none border border-(--forja-ui-picker-border,#2a2a2e) [box-shadow:0_24px_64px_rgba(0,0,0,0.90),0_8px_24px_rgba(0,0,0,0.70)] animate-[picker-in_0.15s_cubic-bezier(0.16,1,0.3,1)]"
    data-dialog-shell
  >
    <header class="flex items-center gap-2 border-b border-(--forja-ui-picker-border,#2a2a2e) px-4 pt-3 pb-2.5">
      <Download size="13" class="shrink-0 text-(--forja-ui-picker-active-text,#34d399)" />
      <span id="clone-repository-title" class="flex-1 text-[10px] font-semibold uppercase tracking-[0.08em]">Clone Repository</span>
      <button
        type="button"
        onclick={() => void requestClose()}
        class="flex items-center justify-center p-1 text-white/30 hover:bg-white/5 hover:text-white/70 transition-colors disabled:opacity-40"
        disabled={isBusy}
        aria-label="Close"
      >
        <X size={12} />
      </button>
    </header>

    <div class="max-h-[72vh] overflow-y-auto px-4 py-4">
      {#if !canReview}
        <div class="space-y-4">
          <div class="space-y-1.5">
            <label for="clone-url" class="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45">
              Repository URL
            </label>
            <input
              id="clone-url"
              type="text"
              bind:value={gitUrl}
              placeholder="https://github.com/org/repo.git or git@github.com:org/repo.git"
              disabled={$isCloning}
              class="w-full border border-white/10 bg-white/4 px-3 py-2 text-sm text-white focus:border-emerald-500/40 focus:outline-none"
            />
            <p class="text-[11px] text-white/40">
              Paste an HTTPS or SSH repository URL. The clone is validated in a temporary sandbox before anything is saved.
            </p>
            <div class="mt-2 flex items-center gap-2">
              <input id="autofix" type="checkbox" bind:checked={autofix} disabled={$isCloning} class="w-4 h-4" />
              <label for="autofix" class="text-[11px] text-white/55">Autofix: remove '^' and '~' and pin exact versions (npm/cargo)</label>
            </div>
          </div>

          {#if $cloneProgress && $isCloning}
            <div class="space-y-2 border border-white/8 bg-white/[0.03] px-3 py-3">
              <div class="flex items-center justify-between text-[11px]">
                <span class="font-semibold uppercase tracking-[0.08em] text-emerald-300">{$cloneProgress.status}</span>
                <span class="text-white/50">{$cloneProgress.progress}%</span>
              </div>
              <div class="h-1.5 overflow-hidden bg-white/7">
                <div
                  class="h-full bg-linear-to-r from-emerald-400 to-cyan-400 transition-all duration-300"
                  style="width: {$cloneProgress.progress}%"
                ></div>
              </div>
              <p class="text-[11px] text-white/55">{$cloneProgress.message}</p>
            </div>
          {/if}
        </div>
      {:else if $validationResult}
        <div class="space-y-4">
          <div class="flex items-start gap-3 border px-3 py-3 { $validationResult.can_safe_install ? 'border-emerald-500/18 bg-emerald-500/7' : 'border-amber-500/18 bg-amber-500/7' }">
            {#if $validationResult.can_safe_install}
              <ShieldCheck size="18" class="mt-0.5 shrink-0 text-emerald-400" />
            {:else}
              <ShieldAlert size="18" class="mt-0.5 shrink-0 text-amber-400" />
            {/if}

            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-white">{$validationResult.message}</p>
              <p class="mt-1 text-[11px] text-white/55">
                Project: <span class="font-mono text-white/80">{$validationResult.project_name}</span>
                · Confidence:
                <span class="font-mono uppercase text-white/80">{$validationResult.confidence}</span>
              </p>
              <div class="mt-2 flex flex-wrap gap-2 text-[10px]">
                <span class="bg-white/6 px-2 py-1 text-white/65">{$validationResult.scans.length} manifests</span>
                <span class="bg-red-500/14 px-2 py-1 text-red-300">{$validationResult.critical_vulns} critical</span>
                <span class="bg-orange-500/14 px-2 py-1 text-orange-300">{$validationResult.high_vulns} high</span>
                <span class="bg-sky-500/14 px-2 py-1 text-sky-300">{$validationResult.total_vulnerabilities} total findings</span>
              </div>
            </div>
          </div>

          <div class="space-y-2">
            <div class="space-y-1.5">
              <label for="clone-destination-root" class="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45">
                Save Location
              </label>
              <div class="flex gap-2">
                <input
                  id="clone-destination-root"
                  type="text"
                  bind:value={destinationRoot}
                  readonly
                  placeholder="Choose a destination folder"
                  class="min-w-0 flex-1 border border-white/10 bg-white/4 px-3 py-2 text-sm text-white/80 focus:outline-none"
                />
                <button
                  type="button"
                  onclick={pickDestinationRoot}
                  class="flex items-center gap-2 border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-medium text-white/70 transition-colors hover:bg-white/8 hover:text-white"
                >
                  <FolderOpen size="13" />
                  Browse
                </button>
              </div>
            </div>
          </div>

          <div class="space-y-2">
            {#if $validationResult.scans.length === 0}
              <div class="border border-white/8 bg-white/[0.03] px-3 py-3 text-[12px] text-white/55">
                This repository does not expose any supported dependency manifests. You can still save it.
              </div>
            {:else}
              {#each $validationResult.scans as scan}
                <div class="border border-white/8 bg-white/[0.03]">
                  <button
                    type="button"
                    onclick={() => expandedManifest = expandedManifest === scan.manifest_path ? null : scan.manifest_path}
                    class="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03]"
                  >
                    <span class="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/75">
                      {scan.ecosystem}
                    </span>
                    <span class="min-w-0 flex-1 truncate text-[11px] text-white/45">
                      {manifestRelativePath($validationResult, scan.manifest_path)}
                    </span>
                    <span class="shrink-0 bg-white/6 px-2 py-1 text-[10px] text-white/55">{scan.summary.total} deps</span>
                    <span class="shrink-0 bg-red-500/14 px-2 py-1 text-[10px] text-red-300">{scan.summary.critical} C</span>
                    <span class="shrink-0 bg-orange-500/14 px-2 py-1 text-[10px] text-orange-300">{scan.summary.high} H</span>
                  </button>

                  {#if expandedManifest === scan.manifest_path}
                    <div class="space-y-2 border-t border-white/8 px-3 py-3">
                      {#if scan.errors.length > 0}
                        <div class="space-y-1">
                          {#each scan.errors as error}
                            <p class="text-[11px] text-amber-300/80">{error}</p>
                          {/each}
                        </div>
                      {/if}

                      {#if scan.dependencies.some((dep) => dep.vulnerabilities.length > 0)}
                        <div class="space-y-2">
                          {#each scan.dependencies.filter((dep) => dep.vulnerabilities.length > 0) as dep}
                            <div class="border border-white/6 bg-black/20 px-3 py-2">
                              <div class="flex flex-wrap items-center gap-2">
                                <span class="text-[12px] font-semibold text-white">{dep.name}</span>
                                <span class="font-mono text-[10px] text-white/45">{dep.version}</span>
                                {#if dep.latest}
                                  <span class="text-[10px] text-sky-300">latest {dep.latest}</span>
                                {/if}
                              </div>
                              <div class="mt-2 space-y-1.5">
                                {#each dep.vulnerabilities as vulnerability}
                                  <div class="border-l-2 border-red-400/40 bg-white/[0.02] px-2 py-1.5 text-[11px] text-white/70">
                                    <span class="font-semibold uppercase text-red-300">{vulnerability.severity}</span>
                                    <span class="ml-2 text-white/80">{vulnerability.title}</span>
                                    {#if vulnerability.patched_versions}
                                      <span class="ml-2 text-emerald-300/80">fix {vulnerability.patched_versions}</span>
                                    {/if}
                                  </div>
                                {/each}
                              </div>
                            </div>
                          {/each}
                        </div>
                      {:else}
                        <p class="text-[11px] text-white/50">No vulnerability entries were produced for this manifest.</p>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>

          {#if $installResults.length > 0}
            <div class="space-y-2 border border-white/8 bg-white/[0.03] px-3 py-3">
              <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45">Safe Install Results</p>
              {#each $installResults as result}
                <div class="border-l-2 px-2 py-1.5 {result.success ? 'border-emerald-400/40' : 'border-red-400/40'}">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-[11px] font-semibold uppercase text-white/75">{result.ecosystem}</span>
                    <span class="text-[11px] text-white/50">{result.manifest_rel_path}</span>
                    <span class="text-[10px] {result.success ? 'text-emerald-300' : 'text-red-300'}">{result.message}</span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      {#if localError || $cloneError}
        <div class="mt-4 border border-red-500/18 bg-red-500/8 px-3 py-2 text-[11px] text-red-300">
          {localError || $cloneError}
        </div>
      {/if}
    </div>

    <footer class="flex gap-2 border-t border-(--forja-ui-picker-border,#2a2a2e) px-4 py-3">
      {#if !canReview}
        <button
          type="button"
          onclick={() => void requestClose()}
          class="flex-1 border border-white/10 bg-white/4 px-3 py-2 text-[12px] font-medium text-white/55 transition-colors hover:bg-white/7 hover:text-white/75"
          disabled={$isCloning}
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={() => void handleClone()}
          class="flex flex-1 items-center justify-center gap-2 border border-emerald-500/24 bg-emerald-500/14 px-3 py-2 text-[12px] font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:opacity-45"
          disabled={!canStartClone}
        >
          {#if $isCloning}
            <Loader2 size="13" class="animate-spin" />
            Validating...
          {:else}
            <Download size="13" />
            Clone & Validate
          {/if}
        </button>
      {:else}
        <button
          type="button"
          onclick={() => void requestClose()}
          class="flex-1 border border-white/10 bg-white/4 px-3 py-2 text-[12px] font-medium text-white/55 transition-colors hover:bg-white/7 hover:text-white/75 disabled:opacity-45"
          disabled={isBusy}
        >
          Close
        </button>
        <button
          type="button"
          onclick={() => void handleSaveOnly()}
          class="flex-1 border border-white/10 bg-white/6 px-3 py-2 text-[12px] font-medium text-white/80 transition-colors hover:bg-white/10 disabled:opacity-45"
          disabled={!$validationResult?.can_save || !destinationRoot.trim() || isBusy}
        >
          {#if $isSaving && !$isInstalling}
            Saving...
          {:else}
            Save Only
          {/if}
        </button>
        <button
          type="button"
          onclick={() => void handleSaveAndInstall()}
          class="flex-1 border border-emerald-500/24 bg-emerald-500/14 px-3 py-2 text-[12px] font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:opacity-45"
          disabled={!$validationResult?.can_safe_install || !destinationRoot.trim() || isBusy}
        >
          {#if $isInstalling}
            Safe Installing...
          {:else}
            Save + Safe Install
          {/if}
        </button>
      {/if}
    </footer>
  </div>
</div>

<style>
  @keyframes picker-in {
    from { opacity: 0; transform: translateY(-8px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
</style>
