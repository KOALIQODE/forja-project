<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog';
  import {
    Check,
    Download,
    FolderOpen,
    Loader2,
    ShieldAlert,
    ShieldCheck,
    X,
  } from '@lucide/svelte';
  import { onMount } from 'svelte';

  import { theme } from '$lib/stores/uiThemeStore';
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
    closeCloneRepository,
    type CloneValidationResult,
    type InstallTarget,
  } from '$lib/stores/cloneRepositoryStore';

  let gitUrl = $state('');
  let destinationRoot = $state('');
  let expandedManifest = $state<string | null>(null);
  let localError = $state<string | null>(null);
  let autofix = $state(false);
  let dialogEl: HTMLElement | null = $state(null);

  const GIT_URL_REGEX = /^(?:https?:\/\/|git@|ssh:\/\/|git:\/\/)[^\s]+$/;
  let isUrlValid = $derived(gitUrl.trim().length === 0 || GIT_URL_REGEX.test(gitUrl.trim()));
  let isBusy = $derived($isCloning || $isSaving || $isInstalling);
  let canReview = $derived(!!$validationResult);
  let canStartClone = $derived(gitUrl.trim().length > 0 && isUrlValid && !$isCloning);

  onMount(() => {
    dialogEl?.focus();
  });

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      void closeCloneRepository();
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
      void closeCloneRepository();
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
        void closeCloneRepository();
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
        void closeCloneRepository();
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
  onclick={() => void closeCloneRepository()}
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
    use:theme
    class="w-170 font-semibold max-w-[calc(100vw-32px)] bg-(--color-surface-base) text-(--color-text-primary) outline-none border border-(--color-border) animate-[picker-in_0.15s_cubic-bezier(0.16,1,0.3,1)]"
  >
    <header class="flex items-center gap-3 px-4 py-2.5 border-b border-(--color-border)">
      <div class="flex shrink-0 items-center">
        <span id="clone-repository-title" class="text-(--color-text-primary)">Clone Repository</span>
      </div>
      <div class="w-px h-3 bg-(--color-border) shrink-0"></div>
      
      <div class="flex flex-1 items-center gap-3 px-1">
        {#if $isCloning}
          <Loader2 strokeWidth={2.5} size="1em" class="text-(--color-accent) animate-spin shrink-0" />
          <span class="text-(--color-text-primary)">Clonando...</span>
        {:else if $validationResult}
          <ShieldCheck strokeWidth={2.5} size="1em" class="text-emerald-400 shrink-0" />
          <span class="text-(--color-text-primary)">Validación completada</span>
        {:else}
          <Download strokeWidth={2.5} size="1em" class="text-(--color-text-primary) shrink-0" />
          <span class="text-(--color-text-primary)">Preparar clon</span>
        {/if}
      </div>

      <button onclick={closeCloneRepository} class="flex h-6 w-6 items-center justify-center text-(--color-text-muted) hover:text-(--color-text-primary) transition-colors">
        <X strokeWidth={2.5} size="1.2em" />
      </button>
    </header>

    <div class="max-h-[72vh] overflow-y-auto px-4 py-4">
      {#if !canReview}
        <div class="space-y-4">
          <div class="space-y-1.5">
            <h5>
              Repository URL
            </h5>
            <input
              id="clone-url"
              type="text"
              bind:value={gitUrl}
              placeholder="https://github.com/org/repo.git or git@github.com:org/repo.git"
              disabled={$isCloning}
              class="w-full border px-1 py-1 text-(--color-text-primary) transition-all duration-200 focus:outline-none bg-(--color-surface-base) {!isUrlValid ? 'border-red-500/50 bg-red-500/5 focus:border-red-500' : 'border-(--color-border) focus:border-(--color-accent)'}"
            />
            {#if !isUrlValid}
              <p class="mt-1 font-medium text-red-400">
                Please enter a valid Git URL (HTTPS, SSH, or git://)
              </p>
            {/if}
            <p class="mt-1.5 text-(--color-text-muted)">
              Paste an HTTPS or SSH repository URL. The clone is validated in a temporary sandbox before anything is saved.
            </p>
            <div class="mt-4">
              <label
                class="group relative flex cursor-pointer flex-col gap-1 border border-(--color-border) bg-(--color-surface-base) p-3.5 transition-all duration-200 hover:bg-(--color-hover-bg-subtle) {autofix ? 'border-(--color-accent-border) bg-(--color-accent-fill)' : ''}"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2.5">
                    <div class="relative flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all duration-200 {autofix ? 'border-(--color-border) bg-(--color-accent)' : 'border-(--color-border) bg-(--color-surface-base) group-hover:border-(--color-accent-border)'}">
                      <input
                        id="autofix"
                        type="checkbox"
                        bind:checked={autofix}
                        disabled={$isCloning}
                        class="peer absolute h-full w-full cursor-pointer opacity-0"
                      />
                      {#if autofix}
                        <Check size="14" strokeWidth={3} class="text-(--color-surface-base)" />
                      {/if}
                    </div>
                    <span class="text-(--color-text-primary)">Autofix Manifests</span>
                  </div>
                  {#if autofix}
                    <span class="uppercase text-(--color-accent) opacity-80">Enabled</span>
                  {/if}
                </div>
                <p class="pl-[30px] text-(--color-text-muted) transition-colors group-hover:text-(--color-text-secondary)">
                  Automatically remove '^' and '~' prefixes and pin exact versions in npm and cargo manifests for reproducible clones.
                </p>
              </label>
            </div>
          </div>

          {#if $cloneProgress && $isCloning}
            <div class="space-y-2 border border-(--color-border) bg-(--color-surface-base) px-3 py-3">
              <div class="flex items-center justify-between">
                <span class="font-semibold uppercase text-(--color-accent)">{$cloneProgress.status}</span>
                <span class="text-(--color-text-muted)">{$cloneProgress.progress}%</span>
              </div>
              <div class="h-1.5 overflow-hidden bg-(--color-hover-bg-subtle)">
                <div
                  class="h-full bg-(--color-accent) transition-all duration-300"
                  style="width: {$cloneProgress.progress}%"
                ></div>
              </div>
              <p class="text-(--color-text-muted)">{$cloneProgress.message}</p>
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
              <p class="font-semibold text-(--color-text-primary)">{$validationResult.message}</p>
              <p class="mt-1 text-(--color-text-muted)">
                Project: <span class="font-mono text-(--color-text-secondary)">{$validationResult.project_name}</span>
                · Confidence:
                <span class="font-mono uppercase text-(--color-text-secondary)">{$validationResult.confidence}</span>
              </p>
              <div class="mt-2 flex flex-wrap gap-2">
                <span class="bg-(--color-hover-bg-subtle) px-2 py-1 text-(--color-text-secondary)">{$validationResult.scans.length} manifests</span>
                <span class="bg-red-500/14 px-2 py-1 text-red-300">{$validationResult.critical_vulns} critical</span>
                <span class="bg-orange-500/14 px-2 py-1 text-orange-300">{$validationResult.high_vulns} high</span>
                <span class="bg-sky-500/14 px-2 py-1 text-sky-300">{$validationResult.total_vulnerabilities} total findings</span>
              </div>
            </div>
          </div>

          <div class="space-y-2">
            <div class="space-y-1.5">
              <label for="clone-destination-root" class="text-[10px] font-semibold uppercase text-(--color-text-muted)">
                Save Location
              </label>
              <div class="flex gap-2">
                <input
                  id="clone-destination-root"
                  type="text"
                  bind:value={destinationRoot}
                  readonly
                  placeholder="Choose a destination folder"
                  class="min-w-0 flex-1 border border-(--color-border) bg-(--color-surface-base) px-3 py-2 text-(--color-text-secondary) focus:outline-none"
                />
                <button
                  type="button"
                  onclick={pickDestinationRoot}
                  class="flex items-center gap-2 border border-(--color-border) bg-(--color-hover-bg-subtle) px-3 py-2 font-medium text-(--color-text-secondary) transition-colors hover:bg-(--color-accent-fill) hover:text-(--color-text-primary)"
                >
                  <FolderOpen size="13" />
                  Browse
                </button>
              </div>
            </div>
          </div>

          <div class="space-y-2">
            {#if $validationResult.scans.length === 0}
              <div class="border border-(--color-border) bg-(--color-surface-base) px-3 py-3 text-(--color-text-muted)">
                This repository does not expose any supported dependency manifests. You can still save it.
              </div>
            {:else}
              {#each $validationResult.scans as scan}
                <div class="border border-(--color-border) bg-(--color-surface-base)">
                  <button
                    type="button"
                    onclick={() => expandedManifest = expandedManifest === scan.manifest_path ? null : scan.manifest_path}
                    class="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-(--color-hover-bg-subtle)"
                  >
                    <span class="w-14 shrink-0 font-semibold uppercase text-(--color-text-secondary)">
                      {scan.ecosystem}
                    </span>
                    <span class="min-w-0 flex-1 truncate text-(--color-text-muted)">
                      {manifestRelativePath($validationResult, scan.manifest_path)}
                    </span>
                    <span class="shrink-0 bg-(--color-hover-bg-subtle) px-2 py-1 text-(--color-text-muted)">{scan.summary.total} deps</span>
                    <span class="shrink-0 bg-red-500/14 px-2 py-1 text-red-300">{scan.summary.critical} C</span>
                    <span class="shrink-0 bg-orange-500/14 px-2 py-1 text-orange-300">{scan.summary.high} H</span>
                  </button>

                  {#if expandedManifest === scan.manifest_path}
                    <div class="space-y-2 border-t border-(--color-border) px-3 py-3">
                      {#if scan.errors.length > 0}
                        <div class="space-y-1">
                          {#each scan.errors as error}
                            <p class="text-amber-300/80">{error}</p>
                          {/each}
                        </div>
                      {/if}

                      {#if scan.dependencies.some((dep) => dep.vulnerabilities.length > 0)}
                        <div class="space-y-2">
                          {#each scan.dependencies.filter((dep) => dep.vulnerabilities.length > 0) as dep}
                            <div class="border border-(--color-border) bg-(--color-hover-bg-subtle) px-3 py-2">
                              <div class="flex flex-wrap items-center gap-2">
                                <span class="font-semibold text-(--color-text-primary)">{dep.name}</span>
                                <span class="font-mono text-(--color-text-muted)">{dep.version}</span>
                                {#if dep.latest}
                                  <span class=" text-sky-300">latest {dep.latest}</span>
                                {/if}
                              </div>
                              <div class="mt-2 space-y-1.5">
                                {#each dep.vulnerabilities as vulnerability}
                                  <div class="border-l-2 border-red-400/40 bg-(--color-surface-base) px-2 py-1.5 text-(--color-text-secondary)">
                                    <span class="font-semibold uppercase text-red-300">{vulnerability.severity}</span>
                                    <span class="ml-2 text-(--color-text-primary)">{vulnerability.title}</span>
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
                        <p class="text-(--color-text-muted)">No vulnerability entries were produced for this manifest.</p>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>

          {#if $installResults.length > 0}
            <div class="space-y-2 border border-(--color-border) bg-(--color-surface-base) px-3 py-3">
              <p class="font-semibold uppercase text-(--color-text-muted)">Safe Install Results</p>
              {#each $installResults as result}
                <div class="border-l-2 px-2 py-1.5 {result.success ? 'border-emerald-400/40' : 'border-red-400/40'}">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-semibold uppercase text-(--color-text-secondary)">{result.ecosystem}</span>
                    <span class=" text-(--color-text-muted)">{result.manifest_rel_path}</span>
                    <span class="{result.success ? 'text-emerald-300' : 'text-red-300'}">{result.message}</span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      {#if localError || $cloneError}
        <div class="mt-4 border border-red-500/18 bg-red-500/8 px-3 py-2 text-red-300">
          {localError || $cloneError}
        </div>
      {/if}
    </div>

    <footer class="flex gap-2 border-t border-(--color-border) px-4 py-3 bg-(--color-surface-base)">
      {#if !canReview}
        <button
          type="button"
          onclick={() => void closeCloneRepository()}
          class="flex-1 border border-(--color-border) bg-(--color-surface-base) px-2 py-1.5 text-(--color-text-secondary) font-bold transition-all hover:bg-(--color-hover-bg-subtle) hover:text-(--color-text-primary)"
          disabled={$isCloning}
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={() => void handleClone()}
          class="flex flex-1 items-center justify-center gap-2 border border-(--color-accent) bg-(--color-accent) px-2 py-1.5 text-(--color-surface-base) font-bold transition-all hover:opacity-90 disabled:opacity-45 disabled:grayscale"
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
          onclick={() => void closeCloneRepository()}
          class="flex-1 border border-(--color-border) bg-(--color-surface-base) px-2 py-1.5 text-(--color-text-secondary) font-bold uppercase tracking-widest transition-all hover:bg-(--color-hover-bg-subtle) hover:text-(--color-text-primary) active:scale-[0.98] disabled:opacity-45"
          disabled={isBusy}
        >
          Close
        </button>
        <button
          type="button"
          onclick={() => void handleSaveOnly()}
          class="flex-1 border border-(--color-border) bg-(--color-surface-base) px-2 py-1.5 text-(--color-text-primary) font-bold uppercase tracking-widest transition-all hover:bg-(--color-hover-bg-subtle) active:scale-[0.98] disabled:opacity-45"
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
          class="flex-1 border border-(--color-accent) bg-(--color-accent) px-2 py-1.5 text-(--color-surface-base) font-bold uppercase tracking-widest transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-45 disabled:grayscale"
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
