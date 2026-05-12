import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { derived, get, writable } from 'svelte/store'
import { sidebarState, SIDEBAR_IDS, openSidebar, closeSidebar } from './sidebarStore'

export interface Vulnerability {
  id: string
  severity: 'critical' | 'high' | 'moderate' | 'low' | 'unknown'
  title: string
  description?: string
  url?: string
  patched_versions?: string
}

export interface Dependency {
  name: string
  version: string
  dep_type: string
  latest?: string
  is_outdated: boolean
  vulnerabilities: Vulnerability[]
  ecosystem?: string
  language?: string
  manifest?: string
}

export interface ScanResult {
  manifest_path: string
  ecosystem: string
  language: string
  dependencies: Dependency[]
  summary: {
    total: number
    critical: number
    high: number
    moderate: number
    low: number
    outdated: number
    vulnerable: number
  }
  scanned_at: string
  errors: string[]
}

const VALIDATABLE_ECOSYSTEMS = new Set(['npm', 'cargo'])

export const scanResults = writable<ScanResult[]>([])
export const isScanning = writable(false)
export const lastScanTime = writable<string | null>(null)
export const watcherActive = writable(false)
export const isDepsSidebarOpen = writable(false)
export const activeProjectRoot = writable<string | null>(null)
export const selectedManifestPath = writable<string | null>(null)

// Sync with sidebarStore
sidebarState.subscribe(state => {
  const isOpen = state.openSidebars.has(SIDEBAR_IDS.DEPS);
  if (get(isDepsSidebarOpen) !== isOpen) {
    isDepsSidebarOpen.set(isOpen);
  }
});

let watcherRoot: string | null = null
let depsChangedUnlisten: (() => void) | null = null
let scanRequestId = 0

function normalizeRoot(projectRoot: string | null | undefined): string | null {
  const value = projectRoot?.trim()
  return value ? value : null
}

function syncSelectedManifest(results: ScanResult[]) {
  const current = get(selectedManifestPath)
  if (results.length === 0) {
    selectedManifestPath.set(null)
    return
  }

  if (current && results.some((result) => result.manifest_path === current)) {
    return
  }

  selectedManifestPath.set(results[0].manifest_path)
}

async function ensureDepsChangedListener() {
  if (depsChangedUnlisten) {
    return
  }

  depsChangedUnlisten = await listen<string>('deps:changed', async (event) => {
    const projectRoot = get(activeProjectRoot)
    if (!projectRoot || !event.payload.startsWith(projectRoot)) {
      return
    }

    await rescanManifest(event.payload)
  })
}

export function toggleDepsSidebar() {
  const isOpen = get(isDepsSidebarOpen);
  if (isOpen) {
    closeSidebar(SIDEBAR_IDS.DEPS);
  } else {
    openSidebar(SIDEBAR_IDS.DEPS);
  }
}

export function closeDepsSidebar() {
  closeSidebar(SIDEBAR_IDS.DEPS);
}

export function selectManifest(manifestPath: string | null) {
  selectedManifestPath.set(manifestPath)
}

export const hasDetectedManifests = derived(scanResults, ($results) => $results.length > 0)

export const hasDependencies = derived(
  scanResults,
  ($results) => $results.some((result) => result.dependencies.length > 0)
)

export const availableEcosystems = derived(scanResults, ($results) =>
  [...new Set($results.map((result) => result.ecosystem))].sort()
)

export const validatableEcosystems = derived(availableEcosystems, ($ecosystems) =>
  $ecosystems.filter((ecosystem) => VALIDATABLE_ECOSYSTEMS.has(ecosystem))
)

export const selectedManifest = derived(
  [scanResults, selectedManifestPath],
  ([$results, $selectedManifestPath]) =>
    $results.find((result) => result.manifest_path === $selectedManifestPath) ?? null
)

export const globalSummary = derived(scanResults, ($results) => ({
  total: $results.reduce((sum, result) => sum + result.summary.total, 0),
  critical: $results.reduce((sum, result) => sum + result.summary.critical, 0),
  high: $results.reduce((sum, result) => sum + result.summary.high, 0),
  moderate: $results.reduce((sum, result) => sum + result.summary.moderate, 0),
  low: $results.reduce((sum, result) => sum + result.summary.low, 0),
  outdated: $results.reduce((sum, result) => sum + result.summary.outdated, 0),
  vulnerable: $results.reduce((sum, result) => sum + result.summary.vulnerable, 0),
  manifests: $results.length,
}))

export async function clearDepsState() {
  scanRequestId += 1
  scanResults.set([])
  isScanning.set(false)
  lastScanTime.set(null)
  selectedManifestPath.set(null)
  activeProjectRoot.set(null)
  watcherActive.set(false)
  watcherRoot = null

  try {
    await invoke('stop_watcher')
  } catch {
    // Ignore watcher shutdown failures while resetting UI state.
  }
}

export async function scanAll(projectRoot: string) {
  const root = normalizeRoot(projectRoot)
  const requestId = ++scanRequestId

  if (!root) {
    await clearDepsState()
    return []
  }

  const previousRoot = get(activeProjectRoot)
  if (previousRoot !== root) {
    scanResults.set([])
    selectedManifestPath.set(null)
    lastScanTime.set(null)
  }

  activeProjectRoot.set(root)
  isScanning.set(true)

  try {
    const results = await invoke<ScanResult[] | null>('scan_all', { root })
    if (requestId !== scanRequestId) {
      return []
    }

    const orderedResults = [...(Array.isArray(results) ? results : [])].sort((left, right) =>
      left.manifest_path.localeCompare(right.manifest_path)
    )

    scanResults.set(orderedResults)
    syncSelectedManifest(orderedResults)
    lastScanTime.set(new Date().toLocaleTimeString())
    return orderedResults
  } finally {
    if (requestId === scanRequestId) {
      isScanning.set(false)
    }
  }
}

export async function rescanManifest(manifestPath: string) {
  const result = await invoke<ScanResult>('scan_manifest', { manifestPath })

  scanResults.update((results) => {
    const nextResults = [...results]
    const index = nextResults.findIndex((entry) => entry.manifest_path === manifestPath)

    if (index >= 0) {
      nextResults[index] = result
    } else {
      nextResults.push(result)
    }

    nextResults.sort((left, right) => left.manifest_path.localeCompare(right.manifest_path))
    syncSelectedManifest(nextResults)
    return nextResults
  })

  lastScanTime.set(new Date().toLocaleTimeString())
  return result
}

export async function installDep(
  manifestPath: string,
  pkg: string,
  version: string | null,
  dev: boolean
) {
  return invoke<string>('install_dep', {
    manifestPath,
    package: pkg,
    version: version || null,
    dev,
  })
}

export async function startWatcher(projectRoot: string) {
  const root = normalizeRoot(projectRoot)
  if (!root) {
    await clearDepsState()
    return
  }

  await ensureDepsChangedListener()

  if (watcherRoot === root && get(watcherActive)) {
    return
  }

  await invoke('start_watcher', { root })
  watcherRoot = root
  watcherActive.set(true)
}

export async function syncProjectDependencies(projectRoot: string | null | undefined) {
  const root = normalizeRoot(projectRoot)
  if (!root) {
    await clearDepsState()
    return []
  }

  const results = await scanAll(root)
  await startWatcher(root)
  return results
}
