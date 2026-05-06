<script lang="ts">
  import {
    MonitorCog,
    FileCode2,
    Type,
    Rows3,
    Keyboard,
    Hash,
    Sparkles,
    PanelLeftClose,
    RotateCcw,
    X,
  } from "@lucide/svelte";
  import { closeDialog } from "../../stores/dialogStore";
  import { activeUITheme } from "../../stores/uiThemeStore";
  import {
    BUFFER_FONT_OPTIONS,
    PROGRAM_FONT_OPTIONS,
    bufferPreferences,
    programPreferences,
    resetBufferPreferences,
    resetProgramPreferences,
    setBufferPreference,
    setProgramPreference,
  } from "../../stores/preferencesStore";

  interface Props {
    initialSection?: "program" | "buffer";
  }

  let { initialSection = "program" }: Props = $props();

  let activeSection = $state<"program" | "buffer">("program");

  let themeStyle = $derived(
    Object.entries($activeUITheme.vars).map(([k, v]) => `${k}:${v}`).join(';')
  );

  $effect(() => {
    activeSection = initialSection;
  });

  function programFontLabel(value: string) {
    return PROGRAM_FONT_OPTIONS.find((option) => option.value === value)?.label ?? "Custom";
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-[120] flex items-center justify-center p-8"
  onclick={(e) => e.target === e.currentTarget && closeDialog()}
  onkeydown={(e) => e.key === 'Escape' && closeDialog()}
  style={themeStyle}
  data-program-ui
>
  <div class="pref-shell flex h-full max-h-[680px] w-full max-w-4xl overflow-hidden" data-dialog-shell>

    <!-- Sidebar -->
    <aside class="sidebar flex w-[200px] shrink-0 flex-col">

      <!-- Sidebar header -->
      <div class="header-row flex items-center gap-3 px-4 py-2.5">
        <span class="mode-label">PREFERENCES</span>
        <div class="sep-v ml-auto"></div>
        <button onclick={closeDialog} class="close-btn flex h-6 w-6 items-center justify-center">
          <X size={14} />
        </button>
      </div>

      <!-- Nav -->
      <nav class="flex flex-col py-1">
        <button
          type="button"
          class="nav-item flex items-center gap-2.5 px-4 py-2.5 text-left"
          class:nav-item--active={activeSection === "program"}
          onclick={() => (activeSection = "program")}
        >
          <MonitorCog size={13} class="shrink-0" />
          <div class="min-w-0">
            <div class="nav-item-label text-[11px] font-bold uppercase tracking-[0.14em]">Programa</div>
            <div class="nav-item-desc mt-0.5 text-[9px] leading-tight">UI, fuentes, explorer</div>
          </div>
        </button>

        <button
          type="button"
          class="nav-item flex items-center gap-2.5 px-4 py-2.5 text-left"
          class:nav-item--active={activeSection === "buffer"}
          onclick={() => (activeSection = "buffer")}
        >
          <FileCode2 size={13} class="shrink-0" />
          <div class="min-w-0">
            <div class="nav-item-label text-[11px] font-bold uppercase tracking-[0.14em]">Buffer</div>
            <div class="nav-item-desc mt-0.5 text-[9px] leading-tight">Editor, vim, lectura</div>
          </div>
        </button>
      </nav>

      <!-- Live preview -->
      <div class="preview-box mx-3 mt-auto mb-3 p-3">
        <p class="preview-title mb-2 text-[9px] font-bold uppercase tracking-[0.2em]">Preview</p>
        {#if activeSection === "program"}
          <div class="space-y-1.5">
            <div class="preview-row flex items-center justify-between text-[10px]">
              <span>Fuente UI</span>
              <span class="preview-val">{programFontLabel($programPreferences.fontFamily)}</span>
            </div>
            <div class="preview-row flex items-center justify-between text-[10px]">
              <span>Tamaño</span>
              <span class="preview-val">{$programPreferences.fontSize}px</span>
            </div>
            <div class="preview-row flex items-center justify-between text-[10px]">
              <span>Explorer</span>
              <span class="preview-val">{$programPreferences.explorerWidth}px</span>
            </div>
          </div>
        {:else}
          <div
            class="preview-code-block p-2 font-mono"
            style={`font-family: ${$bufferPreferences.fontFamily};`}
          >
            <p class="preview-title mb-1.5 text-[8px]">Buffer Sample</p>
            <p class="preview-code" style={`font-size: ${$bufferPreferences.fontSize}px; line-height: ${$bufferPreferences.lineHeight}px;`}>
              const x = fn();
            </p>
          </div>
        {/if}
      </div>

    </aside>

    <!-- Main panel -->
    <section class="main-panel flex min-w-0 flex-1 flex-col">

      <!-- Section header -->
      <div class="header-row flex items-center gap-3 px-5 py-2.5">
        {#if activeSection === "program"}
          <MonitorCog size={13} style="color: var(--forja-ui-gradient-from, #34d399); flex-shrink: 0;" />
          <span class="section-title text-[11px] font-bold uppercase tracking-[0.14em]">Preferencias del programa</span>
        {:else}
          <FileCode2 size={13} style="color: var(--forja-ui-gradient-from, #34d399); flex-shrink: 0;" />
          <span class="section-title text-[11px] font-bold uppercase tracking-[0.14em]">Preferencias del buffer</span>
        {/if}
      </div>

      <!-- Settings content -->
      <div class="custom-scrollbar flex-1 overflow-y-auto">

        {#if activeSection === "program"}

          <div class="section-label flex items-center gap-2 px-5 py-2 text-[9px] uppercase tracking-[0.18em]">
            <Type size={9} /><span>Tipografía de interfaz</span>
          </div>

          <!-- Program font family -->
          <div class="setting-row flex items-center gap-4 px-5 py-3">
            <div class="min-w-0 flex-1">
              <div class="setting-label text-[11px] font-bold uppercase tracking-[0.14em]">Fuente</div>
              <div class="setting-desc mt-0.5 text-[10px]">Define la voz visual del shell.</div>
            </div>
            <select
              id="program-font-family"
              class="pref-select text-[11px] px-3 py-1.5 outline-none"
              value={$programPreferences.fontFamily}
              onchange={(e) => setProgramPreference("fontFamily", (e.currentTarget as HTMLSelectElement).value)}
            >
              {#each PROGRAM_FONT_OPTIONS as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>

          <!-- Program font size -->
          <div class="setting-row px-5 py-3">
            <div class="flex items-center justify-between">
              <div class="setting-label text-[11px] font-bold uppercase tracking-[0.14em]">Tamaño UI</div>
              <span class="value-badge text-[10px] px-2 py-0.5">{$programPreferences.fontSize}px</span>
            </div>
            <input
              id="program-font-size"
              class="pref-range mt-2 h-1 w-full cursor-pointer appearance-none"
              type="range" min="10" max="18" step="1"
              value={$programPreferences.fontSize}
              oninput={(e) => setProgramPreference("fontSize", Number((e.currentTarget as HTMLInputElement).value))}
            />
          </div>

          <div class="section-label flex items-center gap-2 px-5 py-2 text-[9px] uppercase tracking-[0.18em]">
            <PanelLeftClose size={9} /><span>Explorer</span>
          </div>

          <!-- Explorer width -->
          <div class="setting-row px-5 py-3">
            <div class="flex items-center justify-between">
              <div class="setting-label text-[11px] font-bold uppercase tracking-[0.14em]">Ancho inicial</div>
              <span class="value-badge text-[10px] px-2 py-0.5">{$programPreferences.explorerWidth}px</span>
            </div>
            <input
              id="program-explorer-width"
              class="pref-range mt-2 h-1 w-full cursor-pointer appearance-none"
              type="range" min="220" max="420" step="10"
              value={$programPreferences.explorerWidth}
              oninput={(e) => setProgramPreference("explorerWidth", Number((e.currentTarget as HTMLInputElement).value))}
            />
          </div>

          <div class="section-label flex items-center gap-2 px-5 py-2 text-[9px] uppercase tracking-[0.18em]">
            <Sparkles size={9} /><span>Animaciones</span>
          </div>

          <!-- Reduce motion -->
          <div class="setting-row flex items-center justify-between gap-4 px-5 py-3">
            <div class="min-w-0">
              <div class="setting-label text-[11px] font-bold uppercase tracking-[0.14em]">Reduce motion</div>
              <div class="setting-desc mt-0.5 text-[10px]">Desactiva transiciones y animaciones largas.</div>
            </div>
            <button
              type="button"
              class="pref-toggle shrink-0 inline-flex items-center px-1"
              class:pref-toggle--on={$programPreferences.reduceMotion}
              aria-label="Toggle reduce motion"
              aria-pressed={$programPreferences.reduceMotion}
              onclick={() => setProgramPreference("reduceMotion", !$programPreferences.reduceMotion)}
            >
              <span class="toggle-thumb"></span>
            </button>
          </div>

        {:else}

          <div class="section-label flex items-center gap-2 px-5 py-2 text-[9px] uppercase tracking-[0.18em]">
            <Type size={9} /><span>Fuente del editor</span>
          </div>

          <!-- Buffer font family -->
          <div class="setting-row flex items-center gap-4 px-5 py-3">
            <div class="min-w-0 flex-1">
              <div class="setting-label text-[11px] font-bold uppercase tracking-[0.14em]">Fuente</div>
              <div class="setting-desc mt-0.5 text-[10px]">Aplica sobre el buffer y la lectura del código.</div>
            </div>
            <select
              id="buffer-font-family"
              class="pref-select text-[11px] px-3 py-1.5 outline-none"
              value={$bufferPreferences.fontFamily}
              onchange={(e) => setBufferPreference("fontFamily", (e.currentTarget as HTMLSelectElement).value)}
            >
              {#each BUFFER_FONT_OPTIONS as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>

          <!-- Buffer font size -->
          <div class="setting-row px-5 py-3">
            <div class="flex items-center justify-between">
              <div class="setting-label text-[11px] font-bold uppercase tracking-[0.14em]">Tamaño</div>
              <span class="value-badge text-[10px] px-2 py-0.5">{$bufferPreferences.fontSize}px</span>
            </div>
            <input
              id="buffer-font-size"
              class="pref-range mt-2 h-1 w-full cursor-pointer appearance-none"
              type="range" min="11" max="24" step="1"
              value={$bufferPreferences.fontSize}
              oninput={(e) => setBufferPreference("fontSize", Number((e.currentTarget as HTMLInputElement).value))}
            />
          </div>

          <div class="section-label flex items-center gap-2 px-5 py-2 text-[9px] uppercase tracking-[0.18em]">
            <Rows3 size={9} /><span>Ritmo de lectura</span>
          </div>

          <!-- Buffer line height -->
          <div class="setting-row px-5 py-3">
            <div class="flex items-center justify-between">
              <div class="setting-label text-[11px] font-bold uppercase tracking-[0.14em]">Line height</div>
              <span class="value-badge text-[10px] px-2 py-0.5">{$bufferPreferences.lineHeight}px</span>
            </div>
            <input
              id="buffer-line-height"
              class="pref-range mt-2 h-1 w-full cursor-pointer appearance-none"
              type="range" min="18" max="34" step="1"
              value={$bufferPreferences.lineHeight}
              oninput={(e) => setBufferPreference("lineHeight", Number((e.currentTarget as HTMLInputElement).value))}
            />
          </div>

          <div class="section-label flex items-center gap-2 px-5 py-2 text-[9px] uppercase tracking-[0.18em]">
            <Keyboard size={9} /><span>Modal editing</span>
          </div>

          <!-- Vim mode -->
          <div class="setting-row flex items-center justify-between gap-4 px-5 py-3">
            <div class="min-w-0">
              <div class="setting-label text-[11px] font-bold uppercase tracking-[0.14em]">Vim mode</div>
              <div class="setting-desc mt-0.5 text-[10px]">Navegación modal y comandos desde el buffer.</div>
            </div>
            <button
              type="button"
              class="pref-toggle shrink-0 inline-flex items-center px-1"
              class:pref-toggle--on={$bufferPreferences.vimModeEnabled}
              aria-label="Toggle vim mode"
              aria-pressed={$bufferPreferences.vimModeEnabled}
              onclick={() => setBufferPreference("vimModeEnabled", !$bufferPreferences.vimModeEnabled)}
            >
              <span class="toggle-thumb"></span>
            </button>
          </div>

          <div class="section-label flex items-center gap-2 px-5 py-2 text-[9px] uppercase tracking-[0.18em]">
            <Hash size={9} /><span>Lectura visual</span>
          </div>

          <!-- Show line numbers -->
          <div class="setting-row flex items-center justify-between gap-4 px-5 py-3">
            <div class="min-w-0">
              <div class="setting-label text-[11px] font-bold uppercase tracking-[0.14em]">Números de línea</div>
              <div class="setting-desc mt-0.5 text-[10px]">Mantén o limpia el gutter del buffer.</div>
            </div>
            <button
              type="button"
              onclick={() => setBufferPreference("showLineNumbers", !$bufferPreferences.showLineNumbers)}
              class="badge-toggle text-[9px] font-bold uppercase tracking-wider px-2 py-0.5"
              class:badge-toggle--on={$bufferPreferences.showLineNumbers}
            >
              {$bufferPreferences.showLineNumbers ? "ON" : "OFF"}
            </button>
          </div>

          <!-- Highlight active line -->
          <div class="setting-row flex items-center justify-between gap-4 px-5 py-3">
            <div class="min-w-0">
              <div class="setting-label text-[11px] font-bold uppercase tracking-[0.14em]">Línea activa</div>
              <div class="setting-desc mt-0.5 text-[10px]">Resalta el cursor en archivos extensos.</div>
            </div>
            <button
              type="button"
              onclick={() => setBufferPreference("highlightActiveLine", !$bufferPreferences.highlightActiveLine)}
              class="badge-toggle text-[9px] font-bold uppercase tracking-wider px-2 py-0.5"
              class:badge-toggle--on={$bufferPreferences.highlightActiveLine}
            >
              {$bufferPreferences.highlightActiveLine ? "ON" : "OFF"}
            </button>
          </div>

        {/if}
      </div>

      <!-- Footer -->
      <div class="footer-row flex items-center justify-between px-5 py-1.5">
        <span class="footer-hint text-[9px] uppercase tracking-[0.12em]">
          Los cambios se aplican inmediatamente.
        </span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="action-btn flex items-center gap-1.5 px-3 py-1 text-[9px] font-bold uppercase tracking-widest"
            onclick={activeSection === "program" ? resetProgramPreferences : resetBufferPreferences}
          >
            <RotateCcw size={11} />
            Reset
          </button>
          <button
            type="button"
            class="action-btn-primary px-3 py-1 text-[9px] font-bold uppercase tracking-widest"
            onclick={closeDialog}
          >
            Cerrar
          </button>
        </div>
      </div>

    </section>
  </div>
</div>

<style>
  .pref-shell {
    background: var(--forja-ui-picker-bg, #0e0e11);
    /* border removed for cleaner look */
    box-shadow: 0 24px 64px rgba(0,0,0,0.90), 0 8px 24px rgba(0,0,0,0.70);
  }

  /* Sidebar */
  .sidebar {
    border-right: 1px solid var(--forja-ui-btn-border, #27272a);
    background: var(--forja-ui-explorer-bg, #0a0a0a);
  }

  /* Shared header row */
  .header-row {
    border-bottom: 1px solid var(--forja-ui-btn-border, #27272a);
  }

  .mode-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--forja-ui-gradient-from, #34d399);
    white-space: nowrap;
  }

  .sep-v {
    width: 1px;
    height: 12px;
    flex-shrink: 0;
    background: var(--forja-ui-btn-border, #27272a);
  }

  .close-btn { color: var(--forja-ui-text-muted, #b4b4c0); }
  .close-btn:hover { color: var(--forja-ui-text-primary, #f4f4f5); }

  /* Nav */
  .nav-item {
    color: var(--forja-ui-text-muted, #b4b4c0);
    border-left: 2px solid transparent;
  }
  .nav-item:hover { background: var(--forja-ui-btn-hover-bg, rgba(255,255,255,0.03)); }
  .nav-item--active {
    color: var(--forja-ui-text-primary, #f4f4f5);
    border-left-color: var(--forja-ui-gradient-from, #34d399);
    background: var(--forja-ui-picker-active, rgba(52,211,153,0.08));
  }
  .nav-item-label { color: inherit; }
  .nav-item-desc { color: var(--forja-ui-text-muted, #b4b4c0); opacity: 0.8; }

  /* Preview box */
  .preview-box {
    border: 1px solid var(--forja-ui-btn-border, #27272a);
    background: var(--forja-ui-picker-bg, #0e0e11);
  }
  .preview-title { color: var(--forja-ui-text-muted, #b4b4c0); }
  .preview-row { color: var(--forja-ui-text-secondary, #dedee2); }
  .preview-val { color: var(--forja-ui-text-muted, #b4b4c0); }
  .preview-code-block {
    border: 1px solid var(--forja-ui-btn-border, #27272a);
  }
  .preview-code { color: var(--forja-ui-text-primary, #f4f4f5); }

  /* Main panel */
  .main-panel { }

  .section-title { color: var(--forja-ui-text-primary, #f4f4f5); }

  /* Section label (divider) */
  .section-label {
    color: var(--forja-ui-text-muted, #b4b4c0);
    background: var(--forja-ui-explorer-bg, #0a0a0a);
    border-bottom: 1px solid var(--forja-ui-btn-border, #27272a);
  }

  /* Setting rows */
  .setting-row {
    border-bottom: 1px solid var(--forja-ui-btn-border, #27272a);
  }
  .setting-row:hover { background: var(--forja-ui-btn-hover-bg, rgba(255,255,255,0.03)); }
  .setting-label { color: var(--forja-ui-text-primary, #f4f4f5); }
  .setting-desc { color: var(--forja-ui-text-muted, #b4b4c0); }

  /* Value badge */
  .value-badge {
    color: var(--forja-ui-text-muted, #b4b4c0);
    background: var(--forja-ui-btn-hover-bg, rgba(255,255,255,0.03));
    border: 1px solid var(--forja-ui-btn-border, #27272a);
  }

  /* Select */
  .pref-select {
    color: var(--forja-ui-text-primary, #f4f4f5);
    background: var(--forja-ui-picker-bg, #0e0e11);
    border: 1px solid var(--forja-ui-btn-border, #27272a);
    min-width: 160px;
  }
  .pref-select:focus {
    border-color: var(--forja-ui-gradient-from, #34d399);
    outline: none;
  }
  .pref-select option {
    background: var(--forja-ui-picker-bg, #0e0e11);
  }

  /* Range */
  .pref-range {
    background: var(--forja-ui-btn-border, #27272a);
    accent-color: var(--forja-ui-gradient-from, #34d399);
  }

  /* Toggle */
  .pref-toggle {
    width: 44px;
    height: 20px;
    border: 1px solid var(--forja-ui-btn-border, #27272a);
    background: var(--forja-ui-btn-hover-bg, rgba(255,255,255,0.03));
    justify-content: flex-start;
    transition: background 0.1s, border-color 0.1s;
  }
  .pref-toggle--on {
    border-color: rgba(52,211,153,0.40);
    background: rgba(52,211,153,0.12);
    justify-content: flex-end;
  }
  .toggle-thumb {
    display: block;
    width: 14px;
    height: 14px;
    background: var(--forja-ui-text-muted, #b4b4c0);
    transition: background 0.1s;
  }
  .pref-toggle--on .toggle-thumb {
    background: var(--forja-ui-gradient-from, #34d399);
  }

  /* Badge toggle (ON/OFF) */
  .badge-toggle {
    border: 1px solid var(--forja-ui-btn-border, #27272a);
    color: var(--forja-ui-text-muted, #b4b4c0);
    background: var(--forja-ui-btn-hover-bg, rgba(255,255,255,0.03));
    min-width: 36px;
    text-align: center;
  }
  .badge-toggle--on {
    color: var(--forja-ui-gradient-from, #34d399);
    border-color: rgba(52,211,153,0.25);
    background: rgba(52,211,153,0.08);
  }

  /* Footer */
  .footer-row {
    border-top: 1px solid var(--forja-ui-btn-border, #27272a);
  }
  .footer-hint { color: var(--forja-ui-text-muted, #b4b4c0); }

  .action-btn {
    color: var(--forja-ui-text-muted, #b4b4c0);
    border: 1px solid var(--forja-ui-btn-border, #27272a);
    background: var(--forja-ui-btn-hover-bg, rgba(255,255,255,0.03));
  }
  .action-btn:hover { color: var(--forja-ui-text-primary, #f4f4f5); }

  .action-btn-primary {
    color: var(--forja-ui-picker-bg, #0e0e11);
    background: var(--forja-ui-gradient-from, #34d399);
    font-weight: 700;
  }
  .action-btn-primary:hover {
    opacity: 0.9;
  }

  /* Scrollbar */
  .custom-scrollbar::-webkit-scrollbar { width: 3px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--forja-ui-explorer-scrollbar, #1e1e1e);
  }
  .custom-scrollbar:hover::-webkit-scrollbar-thumb {
    background: var(--forja-ui-explorer-scrollbar-hover, #2e2e2e);
  }
</style>
