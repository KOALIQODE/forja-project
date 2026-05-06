<script lang="ts">
  import { ShieldAlert, ShieldCheck, X, ChevronDown, ChevronUp, TriangleAlert, PackageX } from '@lucide/svelte';
  import {
    auditReport, hasSecurityIssues, criticalCount, highCount,
    clearAuditReport, affectedEcosystems, scannedEcosystems, nestedReports,
    type EcosystemReport, type VulnEntry
  } from '$lib/stores/securityStore';
  import { auditDependencies } from '$lib/utils/securityClient';
  import { currentProject } from '$lib/stores/projectStore';
  import { activeUITheme } from '$lib/stores/uiThemeStore';

  let expanded = $state(false);
  let dismissed = $state(false);
  let rescanning = $state(false);

  $effect(() => {
    if ($hasSecurityIssues) dismissed = false;
  });

  $effect(() => {
    $currentProject;
    dismissed = false;
    expanded = false;
  });

  async function rescan() {
    if (!$currentProject) return;
    rescanning = true;
    try {
      await auditDependencies($currentProject);
    } finally {
      rescanning = false;
    }
  }

  function dismiss() {
    dismissed = true;
    expanded = false;
  }

  // Track which per-project panels are expanded
  let expandedProjects = $state<string[]>([]);
  function toggleProject(path: string) {
    if (expandedProjects.includes(path)) {
      expandedProjects = expandedProjects.filter((p) => p !== path);
    } else {
      expandedProjects = [...expandedProjects, path];
    }
  }

  const ECOSYSTEM_ICON: Record<string, string> = {
    npm: '⬢', yarn: '🧶', pnpm: '⚡', cargo: '⚙', python: '🐍', go: '🐹', ruby: '💎',
  };

  const severityColor: Record<string, string> = {
    critical: 'text-red-400', high: 'text-orange-400',
    moderate: 'text-amber-400', medium: 'text-amber-400',
    low: 'text-yellow-300', info: 'text-sky-400',
  };

  // Remove border classes to comply with UI rules (no rounded borders)
  const severityBg: Record<string, string> = {
    critical: 'bg-red-500/10',
    high: 'bg-orange-500/10',
    moderate: 'bg-amber-500/10',
    medium: 'bg-amber-500/10',
    low: 'bg-yellow-400/10',
    info: 'bg-sky-500/10',
  };

  const FIX_COMMANDS: Record<string, string> = {
    npm: 'npm audit fix && npm install',
    yarn: 'yarn audit fix && yarn install',
    pnpm: 'pnpm audit --fix && pnpm install',
    cargo: 'cargo update -p <package> ; cargo audit',
    python: 'pip-audit --fix (or pip install --upgrade <package>)',
    go: 'go get <module>@latest ; go vet',
    ruby: 'bundle update <gem> && bundle-audit check',
  };

  let themeStyle = $derived(
    Object.entries($activeUITheme.vars).map(([k, v]) => `${k}: ${v}`).join('; ')
  );

  let visible = $derived($auditReport && !dismissed);
  let hasIssues = $derived($hasSecurityIssues);
  let report = $derived($auditReport);

  // All vulns flattened across ecosystems, for the expanded view
  let allVulns = $derived(
    report?.ecosystems.flatMap((e) =>
      e.vulnerabilities.map((v) => ({ ...v, ecosystem: e.ecosystem }))
    ) ?? []
  );

  let missingTools = $derived(
    report?.ecosystems.filter((e) => e.tool_missing) ?? []
  );

  let projectName = $derived(report?.project_path.split('/').pop() ?? '');
</script>

{#if visible}
  <div
    class="pointer-events-auto fixed bottom-8 right-4 z-50 w-80 {hasIssues ? 'bg-red-950/80' : 'bg-emerald-950/80'}"
    style="backdrop-filter: blur(12px); {themeStyle}"
    data-program-ui
  >
    <!-- Header -->
    <div class="flex items-center gap-2 px-3 py-2.5">
      {#if hasIssues}
        <ShieldAlert size={15} class="shrink-0 text-red-400" />
      {:else}
        <ShieldCheck size={15} class="shrink-0 text-emerald-400" />
      {/if}

      <div class="flex-1 min-w-0">
        {#if hasIssues}
          <p class="text-[11px] font-semibold text-red-300 leading-tight">
            Vulnerabilities detected
          </p>
          <p class="text-[10px] text-red-400/70 leading-tight mt-0.5">
            {#if $criticalCount > 0}{$criticalCount} critical{/if}
            {#if $criticalCount > 0 && $highCount > 0} · {/if}
            {#if $highCount > 0}{$highCount} high{/if}
            &nbsp;— {projectName}
          </p>
        {:else}
          <p class="text-[11px] font-semibold text-emerald-300 leading-tight">No vulnerabilities found</p>
          <p class="text-[10px] text-emerald-400/70 leading-tight mt-0.5">{projectName} is clean</p>
        {/if}
      </div>

      <div class="flex shrink-0 items-center gap-1">
        {#if hasIssues || missingTools.length > 0}
          <button
            class="flex items-center justify-center p-1 text-red-400/60 hover:text-red-300 hover:bg-white/5 transition-colors"
            onclick={() => (expanded = !expanded)}
            title={expanded ? 'Collapse' : 'Show details'}
            type="button"
          >
            {#if expanded}<ChevronUp size={12} />{:else}<ChevronDown size={12} />{/if}
          </button>
        {/if}
        <button
          class="flex items-center justify-center p-1 text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors"
          onclick={dismiss}
          title="Dismiss"
          type="button"
        >
          <X size={12} />
        </button>
      </div>
    </div>

    <!-- Ecosystem badges -->
    {#if report && report.ecosystems.length > 0}
      <div class="flex flex-wrap gap-1 px-3 pb-1.5">
        {#each report.ecosystems as eco (eco.ecosystem)}
          <span class={"inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono " + (eco.counts.critical > 0 ? 'bg-red-500/20 text-red-300' : eco.counts.high > 0 ? 'bg-orange-500/20 text-orange-300' : eco.counts.total > 0 ? 'bg-amber-500/20 text-amber-300' : eco.tool_missing ? 'bg-zinc-700/50 text-zinc-400' : 'bg-emerald-500/15 text-emerald-400')} >
            {ECOSYSTEM_ICON[eco.ecosystem] ?? '📦'} {eco.ecosystem}
            {#if eco.counts.total > 0}({eco.counts.total}){/if}
            {#if eco.tool_missing}(missing){/if}
          </span>
        {/each}
      </div>
    {/if}

    <!-- Expanded: vuln list per ecosystem -->
    {#if expanded && report}
      <div class="max-h-56 overflow-y-auto px-3 py-2 space-y-2">

        <!-- Missing tools warning -->
        {#each missingTools as eco (eco.ecosystem)}
          <div class="flex items-start gap-2 bg-zinc-800/40 px-2 py-1.5">
            <PackageX size={10} class="mt-0.5 shrink-0 text-zinc-400" />
            <span class="text-[9px] text-zinc-400">
              <span class="font-semibold text-zinc-300">{eco.ecosystem}</span> audit tool not installed. Run the install command for your OS.
            </span>
          </div>
        {/each}

        <!-- Project breakdown (nested reports) -->
        {#if $nestedReports && $nestedReports.length > 0}
          <div class="px-2 py-1 text-[10px] text-white/80">
            <p class="mb-1 text-[9px] text-white/60">Projects scanned:</p>
            {#each $nestedReports as nr (nr.project_path)}
              <div class="mb-1 px-2 py-1 bg-zinc-900/30">
                <div class="flex items-center justify-between">
                  <div class="text-[10px] font-mono min-w-0">
                    <strong class="block truncate max-w-[40ch] break-words">{nr.project_path}</strong>
                    <span class="ml-0 text-[9px] text-white/60">({nr.total_counts.total} vuln)</span>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    {#if nr.total_counts.critical > 0}
                      <span class="text-[9px] text-red-300">{nr.total_counts.critical}C</span>
                    {/if}
                    {#if nr.total_counts.high > 0}
                      <span class="text-[9px] text-orange-300">{nr.total_counts.high}H</span>
                    {/if}
                    <button class="text-[9px] text-white/60 hover:text-white/80" type="button" onclick={() => toggleProject(nr.project_path)}>
                      {expandedProjects.includes(nr.project_path) ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                {#if expandedProjects.includes(nr.project_path)}
                  <div class="mt-2 text-[9px] text-white/70 font-mono">
                    {#each nr.ecosystems as eco (eco.lockfile)}
                      <div class="mb-1 break-words">
                        <strong class="font-mono">{eco.ecosystem}</strong> — {eco.counts.total} vuln
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        <!-- Quick fix suggestions per ecosystem -->
        <div class="px-2 py-1 text-[10px] text-white/80">
          <p class="mb-1 text-[9px] text-white/60">Quick fix suggestions:</p>
          {#each report.ecosystems as eco (eco.ecosystem)}
            {#if eco.counts.total > 0}
              <div class="mb-1 text-[10px]">
                <strong class="font-mono">{eco.ecosystem}:</strong>
                <span class="ml-2 font-mono">{FIX_COMMANDS[eco.ecosystem] ?? 'Check advisory and update package'}</span>
              </div>
            {/if}
          {/each}
        </div>

        <!-- Vulnerabilities grouped by ecosystem -->
        {#each (report?.ecosystems.filter(e => e.vulnerabilities.length > 0) ?? []) as eco (eco.ecosystem)}
          <div>
            <p class="mb-1 text-[9px] font-semibold uppercase tracking-widest text-white/30">
              {ECOSYSTEM_ICON[eco.ecosystem] ?? '📦'} {eco.ecosystem}
            </p>
            {#each eco.vulnerabilities as vuln (vuln.name + vuln.severity)}
              <div class="mb-1 flex items-start gap-2 px-2 py-1.5 {severityBg[vuln.severity] ?? 'bg-white/5'}">
                <TriangleAlert size={10} class="mt-0.5 shrink-0 {severityColor[vuln.severity] ?? 'text-white/50'}" />
                <div class="min-w-0">
                  <span class="block truncate text-[10px] font-mono font-semibold text-white/80">{vuln.name}</span>
                  <span class="text-[9px] {severityColor[vuln.severity] ?? 'text-white/40'} uppercase tracking-wide">
                    {vuln.severity}
                    {#if vuln.advisory_id}&nbsp;· {vuln.advisory_id}{/if}
                    {#if vuln.fix_available}&nbsp;· fix available{/if}
                  </span>
                  {#if vuln.fix_available}
                    <div class="mt-1 text-[9px] text-white/70 font-mono">Suggested: {FIX_COMMANDS[eco.ecosystem] ?? 'Update package / run audit fix'}</div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/each}
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between px-3 py-1.5">
        <span class="text-[9px] text-white/60">Follow the quick fix suggestions above for each ecosystem; re-run the audit after updating.</span>
        <button
          class="text-[9px] text-white/70 hover:text-white/90 underline underline-offset-2 transition-colors disabled:opacity-40"
          onclick={rescan}
          disabled={rescanning}
          type="button"
        >
          {rescanning ? 'Scanning…' : 'Re-scan'}
        </button>
      </div>
    {/if}

    {#if !hasIssues}
      <div class="flex items-center justify-end px-3 py-1.5">
        <button
          class="text-[9px] text-white/60 hover:text-white/80 underline underline-offset-2 transition-colors disabled:opacity-40"
          onclick={rescan}
          disabled={rescanning}
          type="button"
        >
          {rescanning ? 'Scanning…' : 'Re-scan'}
        </button>
      </div>
    {/if}
  </div>
{/if}
