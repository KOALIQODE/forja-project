<script lang="ts">
  import {
    availableEcosystems,
    globalSummary,
    hasDependencies,
    hasDetectedManifests,
    installDep,
    isScanning,
    lastScanTime,
    rescanManifest,
    scanAll,
    scanResults,
    selectManifest,
    selectedManifest,
    selectedManifestPath,
    watcherActive,
    type Dependency,
  } from "$lib/stores/DepsStore";

  let { projectRoot = "" } = $props();

  let activeTab = $state<"overview" | "vulns" | "outdated" | "install">(
    "overview",
  );
  let search = $state("");
  let filterEcosystem = $state("");
  let pkgName = $state("");
  let pkgVersion = $state("");
  let pkgDev = $state(false);
  let installing = $state(false);
  let installOutput = $state("");
  let expandedDep = $state<string | null>(null);

  let allDeps = $derived(
    $scanResults.flatMap((result) =>
      result.dependencies.map((dependency) => ({
        ...dependency,
        ecosystem: result.ecosystem,
        language: result.language,
        manifest: result.manifest_path,
      })),
    ),
  );

  let filtered = $derived(
    allDeps.filter((dependency) => {
      const query = search.toLowerCase();
      const matchesSearch =
        !query || dependency.name.toLowerCase().includes(query);
      const matchesEcosystem =
        !filterEcosystem || dependency.ecosystem === filterEcosystem;
      return matchesSearch && matchesEcosystem;
    }),
  );

  let vulnDeps = $derived(
    allDeps
      .filter((dependency) => dependency.vulnerabilities.length > 0)
      .sort((left, right) => maxSeverity(right) - maxSeverity(left)),
  );

  let outdatedDeps = $derived(
    allDeps.filter((dependency) => dependency.is_outdated),
  );

  let selectedManifestName = $derived(
    $selectedManifest?.manifest_path.split("/").pop() ?? "No manifest selected",
  );

  let canInstallIntoManifest = $derived(!!$selectedManifest);

  function maxSeverity(dep: Dependency) {
    const scores: Record<string, number> = {
      critical: 4,
      high: 3,
      moderate: 2,
      low: 1,
      unknown: 0,
    };
    return Math.max(
      ...dep.vulnerabilities.map(
        (vulnerability) => scores[vulnerability.severity] ?? 0,
      ),
      0,
    );
  }

  function severityColor(severity: string) {
    const colors: Record<string, string> = {
      critical: "#E24B4A",
      high: "#EF9F27",
      moderate: "#378ADD",
      low: "#639922",
    };
    return colors[severity] ?? "#888";
  }

  async function handleInstall() {
    const manifestPath = $selectedManifest?.manifest_path;
    if (!manifestPath || !pkgName.trim()) {
      return;
    }

    installing = true;
    installOutput = "";

    try {
      installOutput = await installDep(
        manifestPath,
        pkgName.trim(),
        pkgVersion || null,
        pkgDev,
      );
      await rescanManifest(manifestPath);
    } catch (value: unknown) {
      installOutput = value instanceof Error ? value.message : String(value);
    } finally {
      installing = false;
    }
  }

  const ECO_ICONS: Record<string, string> = {
    npm: "⬡",
    cargo: "🦀",
    pip: "🐍",
    go: "🐹",
    maven: "☕",
    bundler: "💎",
    nuget: "⬡",
    composer: "🐘",
    cpp: "⚙",
    gradle: "🐘",
  };
  let tabs = $derived([
    { id: "overview", label: "all", count: allDeps.length, danger: false },
    {
      id: "vulns",
      label: "vulnerabilities",
      count: vulnDeps.length,
      danger: vulnDeps.length > 0,
    },
    {
      id: "outdated",
      label: "outdated",
      count: outdatedDeps.length,
      danger: false,
    },
    { id: "install", label: "install", count: null, danger: false },
  ] as const);

  function setActiveTab(tab: "overview" | "vulns" | "outdated" | "install") {
    activeTab = tab;
  }
</script>

<div class="deps-panel" data-program-ui>
  <header class="panel-header">
    <div class="header-left">
      <span class="watcher-dot" class:active={$watcherActive}></span>
      <span class="panel-title">dependency scanner</span>
      {#if $lastScanTime}
        <span class="scan-time">last scan {$lastScanTime}</span>
      {/if}
    </div>
    <div class="header-right">
      <select
        bind:value={filterEcosystem}
        class="eco-filter"
        disabled={$availableEcosystems.length === 0}
      >
        <option value="">all ecosystems</option>
        {#each $availableEcosystems as ecosystem}
          <option value={ecosystem}>{ecosystem}</option>
        {/each}
      </select>
      <button
        class="btn"
        onclick={() => scanAll(projectRoot)}
        disabled={!projectRoot || $isScanning}
      >
        {#if $isScanning}
          <span class="spinner"></span> scanning...
        {:else}
          ↻ re-scan
        {/if}
      </button>
    </div>
  </header>

  {#if !projectRoot}
    <div class="empty-panel">
      <p class="empty-title">Open a project to inspect dependency manifests.</p>
    </div>
  {:else if $isScanning && !$hasDetectedManifests}
    <div class="empty-panel">
      <p class="empty-title">Detecting dependency manifests…</p>
    </div>
  {:else if !$hasDetectedManifests}
    <div class="empty-panel">
      <p class="empty-title">
        No supported dependency manifests were detected.
      </p>
      <p class="empty-copy">
        Nothing was sent to npm, cargo, or any other audit tool for this
        project.
      </p>
    </div>
  {:else}
    <div class="summary-grid">
      <div class="stat-card">
        <div class="stat-label">manifests</div>
        <div class="stat-val">{$globalSummary.manifests}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">total deps</div>
        <div class="stat-val">{$globalSummary.total}</div>
      </div>
      <div class="stat-card danger">
        <div class="stat-label">critical / high</div>
        <div class="stat-val">
          {$globalSummary.critical + $globalSummary.high}
        </div>
      </div>
      <div class="stat-card warn">
        <div class="stat-label">moderate / low</div>
        <div class="stat-val">
          {$globalSummary.moderate + $globalSummary.low}
        </div>
      </div>
      <div class="stat-card info">
        <div class="stat-label">outdated</div>
        <div class="stat-val">{$globalSummary.outdated}</div>
      </div>
    </div>

    <div class="manifest-row">
      {#each $scanResults as result}
        <button
          class="manifest-pill"
          class:active={result.manifest_path === $selectedManifestPath}
          onclick={() => selectManifest(result.manifest_path)}
          type="button"
        >
          <span class="eco-icon">{ECO_ICONS[result.ecosystem] ?? "📦"}</span>
          <span>{result.manifest_path.split("/").pop()}</span>
          <span class="manifest-meta">{result.dependencies.length} deps</span>
          {#if result.summary.critical > 0}
            <span class="vuln-badge critical">{result.summary.critical}</span>
          {/if}
        </button>
      {/each}
    </div>

    {#if !$hasDependencies}
      <div class="empty-banner">
        <p>
          Manifests were detected, but they do not declare dependencies yet.
          Audit and outdated checks are skipped until packages exist.
        </p>
      </div>
    {/if}

    <div class="tab-bar">
      {#each tabs as tab}
        <button
          class="tab"
          class:active={activeTab === tab.id}
          onclick={() => setActiveTab(tab.id)}
          type="button"
        >
          {tab.label}
          {#if tab.count !== null}
            <span class="tab-count" class:danger={tab.danger}>{tab.count}</span>
          {/if}
        </button>
      {/each}
    </div>

    {#if activeTab === "overview"}
      <div class="search-row">
        <input
          type="text"
          bind:value={search}
          placeholder="search packages..."
        />
      </div>
      <div class="dep-list">
        {#each filtered as dep (`${dep.manifest}:${dep.name}`)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="dep-item"
            class:has-vuln={dep.vulnerabilities.length > 0}
            class:outdated={dep.is_outdated && dep.vulnerabilities.length === 0}
            onclick={() =>
              (expandedDep =
                expandedDep === `${dep.manifest}:${dep.name}`
                  ? null
                  : `${dep.manifest}:${dep.name}`)}
          >
            <div class="dep-main">
              <span class="dep-name">{dep.name}</span>
              <span class="dep-ver">{dep.version}</span>
              {#if dep.is_outdated}
                <span class="dep-latest">→ {dep.latest}</span>
              {/if}
              <span class="dep-type">{dep.dep_type}</span>
              <span class="dep-eco">{dep.ecosystem}</span>
              {#each dep.vulnerabilities as vulnerability}
                <span
                  class="sev-badge"
                  style="background-color: {severityColor(
                    vulnerability.severity,
                  )}22; color: {severityColor(vulnerability.severity)}"
                >
                  {vulnerability.severity}
                </span>
              {/each}
            </div>
            {#if expandedDep === `${dep.manifest}:${dep.name}` && dep.vulnerabilities.length > 0}
              <div class="vuln-list">
                {#each dep.vulnerabilities as vulnerability}
                  <div class="vuln-row">
                    <span class="vuln-id">{vulnerability.id}</span>
                    <span class="vuln-title">{vulnerability.title}</span>
                    {#if vulnerability.patched_versions}
                      <span class="fix-hint"
                        >fix: {vulnerability.patched_versions}</span
                      >
                    {/if}
                    {#if vulnerability.url}
                      <a
                        href={vulnerability.url}
                        target="_blank"
                        rel="noopener"
                        class="vuln-link">↗</a
                      >
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
        {#if filtered.length === 0}
          <div class="empty-state">
            {$hasDependencies
              ? "No packages matched the current filters."
              : "No dependencies declared yet."}
          </div>
        {/if}
      </div>
    {:else if activeTab === "vulns"}
      <div class="dep-list">
        {#each vulnDeps as dep (`${dep.manifest}:${dep.name}`)}
          <div class="dep-item has-vuln">
            <div class="dep-main">
              <span class="dep-name">{dep.name}</span>
              <span class="dep-ver">{dep.version}</span>
              <span class="dep-eco">{dep.ecosystem}</span>
              {#each dep.vulnerabilities as vulnerability}
                <span
                  class="sev-badge"
                  style="background-color: {severityColor(
                    vulnerability.severity,
                  )}22; color: {severityColor(vulnerability.severity)}"
                >
                  {vulnerability.severity}
                </span>
              {/each}
            </div>
            <div class="vuln-list">
              {#each dep.vulnerabilities as vulnerability}
                <div class="vuln-row">
                  <span class="vuln-id">{vulnerability.id}</span>
                  <span class="vuln-title">{vulnerability.title}</span>
                  {#if vulnerability.patched_versions}
                    <span class="fix-hint"
                      >patched in {vulnerability.patched_versions}</span
                    >
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/each}
        {#if vulnDeps.length === 0}
          <div class="empty-state">✓ no vulnerabilities found</div>
        {/if}
      </div>
    {:else if activeTab === "outdated"}
      <div class="dep-list">
        {#each outdatedDeps as dep (`${dep.manifest}:${dep.name}`)}
          <div class="dep-item outdated">
            <div class="dep-main">
              <span class="dep-name">{dep.name}</span>
              <span class="dep-ver">{dep.version}</span>
              <span class="dep-latest">→ {dep.latest}</span>
              <span class="dep-eco">{dep.ecosystem}</span>
            </div>
          </div>
        {/each}
        {#if outdatedDeps.length === 0}
          <div class="empty-state">✓ all packages are up to date</div>
        {/if}
      </div>
    {:else}
      <div class="install-box">
        <div class="install-target">
          <span>Target manifest:</span>
          <strong>{$selectedManifest?.ecosystem ?? "n/a"}</strong>
          <code>{selectedManifestName}</code>
        </div>
        <div class="install-form">
          <input type="text" bind:value={pkgName} placeholder="package name" />
          <input
            type="text"
            bind:value={pkgVersion}
            placeholder="version (optional)"
          />
          <label class="dev-toggle">
            <input type="checkbox" bind:checked={pkgDev} /> dev dependency
          </label>
          <button
            class="btn primary"
            onclick={handleInstall}
            disabled={!canInstallIntoManifest || installing || !pkgName.trim()}
          >
            {installing ? "installing..." : "⬇ install"}
          </button>
        </div>
        {#if installOutput}
          <pre class="install-output">{installOutput}</pre>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .deps-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 1rem;
    color: var(--forja-ui-text-secondary, #a1a1aa);
    font-family: var(--font-sans, system-ui);
  }
  .panel-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .header-left,
  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .panel-title {
    font-size: 15px;
    font-weight: 500;
  }
  .scan-time {
    font-size: 12px;
    color: #888;
  }
  .watcher-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #888;
  }
  .watcher-dot.active {
    background: #639922;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
    gap: 8px;
  }
  .stat-card {
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.03);
    padding: 10px 12px;
  }
  .stat-label {
    margin-bottom: 4px;
    color: #888;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .stat-val {
    color: #f4f4f5;
    font-size: 22px;
    font-weight: 500;
  }
  .stat-card.danger .stat-val {
    color: #e24b4a;
  }
  .stat-card.warn .stat-val {
    color: #ba7517;
  }
  .stat-card.info .stat-val {
    color: #185fa5;
  }

  .manifest-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .manifest-pill {
    display: flex;
    align-items: center;
    gap: 5px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 99px;
    background: transparent;
    padding: 4px 10px;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
  }
  .manifest-pill.active {
    border-color: rgba(99, 153, 34, 0.45);
    background: rgba(99, 153, 34, 0.12);
    color: #d9f0b4;
  }
  .manifest-pill:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  .manifest-meta {
    color: #71717a;
    font-size: 10px;
  }
  .vuln-badge {
    border-radius: 99px;
    background: #fcebeb;
    padding: 1px 5px;
    color: #e24b4a;
    font-size: 10px;
  }

  .empty-banner {
    background: rgba(24, 95, 165, 0.08);
    border: 1px solid rgba(24, 95, 165, 0.2);
    padding: 10px 12px;
    color: #9cc3ea;
    font-size: 12px;
    line-height: 1.5;
  }
  .empty-panel,
  .empty-state {
    display: flex;
    min-height: 180px;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 8px;
    color: #71717a;
    text-align: center;
  }
  .empty-title {
    color: #d4d4d8;
    font-size: 13px;
    font-weight: 500;
  }
  .empty-copy {
    max-width: 34ch;
    line-height: 1.5;
    font-size: 12px;
  }

  .tab-bar {
    display: flex;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: -1px;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    padding: 7px 14px;
    color: #888;
    cursor: pointer;
    font-size: 13px;
  }
  .tab.active {
    border-bottom-color: #639922;
    color: #f4f4f5;
  }
  .tab-count {
    border-radius: 99px;
    background: rgba(255, 255, 255, 0.08);
    padding: 1px 6px;
    color: inherit;
    font-size: 11px;
  }
  .tab-count.danger {
    background: rgba(226, 75, 74, 0.12);
    color: #e24b4a;
  }

  .search-row input,
  .install-form input,
  .eco-filter {
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.03);
    padding: 8px 10px;
    color: #f4f4f5;
    font-size: 12px;
  }
  .search-row input:focus,
  .install-form input:focus,
  .eco-filter:focus {
    outline: none;
    border-color: rgba(99, 153, 34, 0.45);
  }

  .dep-list {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 8px;
    overflow: auto;
  }
  .dep-item {
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.02);
    padding: 10px 12px;
    color: inherit;
    text-align: left;
  }
  .dep-item.has-vuln {
    border-color: rgba(226, 75, 74, 0.2);
    background: rgba(226, 75, 74, 0.05);
  }
  .dep-item.outdated {
    border-color: rgba(24, 95, 165, 0.2);
    background: rgba(24, 95, 165, 0.05);
  }
  .dep-main {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .dep-name {
    color: #f4f4f5;
    font-weight: 600;
  }
  .dep-ver,
  .dep-latest,
  .dep-type,
  .dep-eco,
  .sev-badge,
  .fix-hint {
    font-size: 11px;
  }
  .dep-latest {
    color: #9cc3ea;
  }
  .dep-type,
  .dep-eco {
    border-radius: 99px;
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 8px;
    color: #a1a1aa;
  }
  .sev-badge {
    border-radius: 99px;
    padding: 2px 8px;
    text-transform: uppercase;
  }
  .vuln-list {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .vuln-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 11px;
  }
  .vuln-id {
    color: #f4f4f5;
    font-family: ui-monospace, SFMono-Regular, monospace;
  }
  .vuln-title {
    color: #d4d4d8;
  }
  .vuln-link {
    color: #9cc3ea;
    text-decoration: none;
  }

  .install-box {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .install-target {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    color: #a1a1aa;
    font-size: 12px;
  }
  .install-target strong {
    color: #f4f4f5;
    text-transform: uppercase;
  }
  .install-target code {
    color: #9cc3ea;
  }
  .install-form {
    display: grid;
    gap: 8px;
  }
  .dev-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .install-output {
    overflow: auto;
    background: rgba(0, 0, 0, 0.25);
    padding: 12px;
    color: #d4d4d8;
    font-size: 11px;
    white-space: pre-wrap;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    padding: 8px 12px;
    color: #f4f4f5;
    cursor: pointer;
    font-size: 12px;
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .btn.primary {
    border-color: rgba(99, 153, 34, 0.4);
    background: rgba(99, 153, 34, 0.16);
  }
  .spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-top-color: rgba(255, 255, 255, 0.9);
    border-radius: 999px;
    animation: pulse 0.9s linear infinite;
  }
</style>
