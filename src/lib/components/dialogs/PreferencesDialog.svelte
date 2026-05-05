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

  $effect(() => {
    activeSection = initialSection;
  });

  function handleBackdropClose(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      closeDialog();
    }
  }

  function programFontLabel(value: string) {
    return PROGRAM_FONT_OPTIONS.find((option) => option.value === value)?.label ?? "Custom";
  }
</script>

<div
  class="fixed inset-0 z-[120] flex items-center justify-center p-6"
  role="button"
  tabindex="0"
  onclick={handleBackdropClose}
  onkeydown={(event) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      closeDialog();
    }
  }}
>
  <div class="flex h-[min(760px,88vh)] w-full max-w-6xl overflow-hidden border border-white/10 bg-[#090909] shadow-[0_40px_120px_rgba(0,0,0,0.9)]">
    <aside class="flex w-[280px] shrink-0 flex-col border-r border-white/8 bg-[radial-gradient(circle_at_top,#1d352c,transparent_45%),linear-gradient(180deg,#111111_0%,#0a0a0a_100%)] p-5">
      <div class="mb-6 flex items-start justify-between gap-3">
        <div>
          <p class="mb-2 text-[10px] font-black uppercase tracking-[0.32em] text-emerald-400/70">Preferences</p>
          <h2 class="m-0 text-2xl font-semibold tracking-tight text-white">Studio Settings</h2>
          <p class="mt-2 text-sm leading-relaxed text-zinc-400">
            Separadas entre la interfaz del programa y el comportamiento del buffer.
          </p>
        </div>

        <button
          type="button"
          class="border border-white/8 bg-white/5 p-2 text-zinc-400 transition-all hover:bg-white/10 hover:text-white"
          title="Close"
          onclick={closeDialog}
        >
          <X size={18} />
        </button>
      </div>

      <div class="space-y-2">
        <button
          type="button"
          class={`group flex w-full items-start gap-3 border px-4 py-3 text-left transition-all ${
            activeSection === "program"
              ? "border-emerald-500/40 bg-emerald-500/10 text-white shadow-[0_18px_35px_rgba(16,185,129,0.12)]"
              : "border-white/5 bg-white/[0.03] text-zinc-400 hover:border-white/10 hover:bg-white/[0.05] hover:text-zinc-200"
          }`}
          onclick={() => (activeSection = "program")}
        >
          <div class={`mt-0.5 p-2 ${activeSection === "program" ? "bg-emerald-500/15 text-emerald-300" : "bg-black/30 text-zinc-500"}`}>
            <MonitorCog size={18} />
          </div>
          <div>
            <div class="text-sm font-semibold tracking-tight">Programa</div>
            <div class="mt-1 text-[11px] leading-relaxed opacity-70">
              Tipografía de interfaz, ancho del explorer y movimiento.
            </div>
          </div>
        </button>

        <button
          type="button"
          class={`group flex w-full items-start gap-3 border px-4 py-3 text-left transition-all ${
            activeSection === "buffer"
              ? "border-emerald-500/40 bg-emerald-500/10 text-white shadow-[0_18px_35px_rgba(16,185,129,0.12)]"
              : "border-white/5 bg-white/[0.03] text-zinc-400 hover:border-white/10 hover:bg-white/[0.05] hover:text-zinc-200"
          }`}
          onclick={() => (activeSection = "buffer")}
        >
          <div class={`mt-0.5 p-2 ${activeSection === "buffer" ? "bg-emerald-500/15 text-emerald-300" : "bg-black/30 text-zinc-500"}`}>
            <FileCode2 size={18} />
          </div>
          <div>
            <div class="text-sm font-semibold tracking-tight">Buffer</div>
            <div class="mt-1 text-[11px] leading-relaxed opacity-70">
              Fuente del editor, línea, números y Vim mode.
            </div>
          </div>
        </button>
      </div>

      <div class="mt-auto border border-white/6 bg-black/25 p-4">
        <p class="mb-2 text-[10px] font-bold uppercase tracking-[0.26em] text-zinc-500">Live Preview</p>
        {#if activeSection === "program"}
          <div class="space-y-2 text-sm text-zinc-300">
            <div class="flex items-center justify-between bg-white/[0.03] px-3 py-2">
              <span>Fuente UI</span>
              <span class="text-zinc-500">{programFontLabel($programPreferences.fontFamily)}</span>
            </div>
            <div class="flex items-center justify-between bg-white/[0.03] px-3 py-2">
              <span>Tamaño UI</span>
              <span class="text-zinc-500">{$programPreferences.fontSize}px</span>
            </div>
          </div>
        {:else}
          <div
            class="border border-emerald-500/15 bg-[#0d0d0d] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
            style={`font-family: ${$bufferPreferences.fontFamily};`}
          >
            <p class="m-0 text-[10px] font-bold uppercase tracking-[0.28em] text-zinc-500">Buffer Sample</p>
            <p class="mt-3 text-zinc-200" style={`font-size: ${$bufferPreferences.fontSize}px; line-height: ${$bufferPreferences.lineHeight}px;`}>
              const forge = workflow.select("precision");
            </p>
          </div>
        {/if}
      </div>
    </aside>

    <section class="flex min-w-0 flex-1 flex-col bg-[linear-gradient(180deg,#0c0c0c_0%,#070707_100%)]">
      <div class="border-b border-white/6 px-8 py-6">
        {#if activeSection === "program"}
          <p class="mb-2 text-[10px] font-black uppercase tracking-[0.32em] text-zinc-500">App Layer</p>
          <h3 class="m-0 text-[28px] font-semibold tracking-tight text-white">Preferencias del programa</h3>
          <p class="mt-2 text-sm leading-relaxed text-zinc-400">
            Ajustes globales para la interfaz y el comportamiento visual del shell.
          </p>
        {:else}
          <p class="mb-2 text-[10px] font-black uppercase tracking-[0.32em] text-zinc-500">Editor Layer</p>
          <h3 class="m-0 text-[28px] font-semibold tracking-tight text-white">Preferencias del buffer</h3>
          <p class="mt-2 text-sm leading-relaxed text-zinc-400">
            Tipografía del editor, densidad de lectura y controles de edición modal.
          </p>
        {/if}
      </div>

      <div class="flex-1 overflow-y-auto px-8 py-7 custom-scrollbar">
        {#if activeSection === "program"}
          <div class="grid gap-5 lg:grid-cols-2">
            <div class="border border-white/6 bg-white/[0.03] p-5">
              <div class="mb-5 flex items-center gap-3">
                <div class="bg-emerald-500/10 p-2 text-emerald-300">
                  <Type size={18} />
                </div>
                <div>
                  <h4 class="m-0 text-sm font-semibold tracking-tight text-white">Tipografía de interfaz</h4>
                  <p class="mt-1 text-xs leading-relaxed text-zinc-500">
                    Define la voz visual del shell: titlebar, explorer, pantallas y modales.
                  </p>
                </div>
              </div>

              <label for="program-font-family" class="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Fuente</label>
              <select
                id="program-font-family"
                class="w-full border border-white/8 bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none transition-all focus:border-emerald-500/40"
                value={$programPreferences.fontFamily}
                onchange={(event) =>
                  setProgramPreference("fontFamily", (event.currentTarget as HTMLSelectElement).value)}
              >
                {#each PROGRAM_FONT_OPTIONS as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>

              <div class="mt-5 flex items-center justify-between">
                <label for="program-font-size" class="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Tamaño</label>
                <span class="border border-white/8 bg-white/[0.03] px-2.5 py-1 text-xs text-zinc-300">
                  {$programPreferences.fontSize}px
                </span>
              </div>
              <input
                id="program-font-size"
                class="mt-3 h-2 w-full cursor-pointer appearance-none bg-white/8 accent-emerald-500"
                type="range"
                min="10"
                max="18"
                step="1"
                value={$programPreferences.fontSize}
                oninput={(event) =>
                  setProgramPreference("fontSize", Number((event.currentTarget as HTMLInputElement).value))}
              />
            </div>

            <div class="border border-white/6 bg-white/[0.03] p-5">
              <div class="mb-5 flex items-center gap-3">
                <div class="bg-emerald-500/10 p-2 text-emerald-300">
                  <PanelLeftClose size={18} />
                </div>
                <div>
                  <h4 class="m-0 text-sm font-semibold tracking-tight text-white">Explorer</h4>
                  <p class="mt-1 text-xs leading-relaxed text-zinc-500">
                    Controla el ancho base del panel lateral para proyectos grandes o compactos.
                  </p>
                </div>
              </div>

              <div class="flex items-center justify-between">
                <label for="program-explorer-width" class="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Ancho inicial</label>
                <span class="border border-white/8 bg-white/[0.03] px-2.5 py-1 text-xs text-zinc-300">
                  {$programPreferences.explorerWidth}px
                </span>
              </div>
              <input
                id="program-explorer-width"
                class="mt-3 h-2 w-full cursor-pointer appearance-none bg-white/8 accent-emerald-500"
                type="range"
                min="220"
                max="420"
                step="10"
                value={$programPreferences.explorerWidth}
                oninput={(event) =>
                  setProgramPreference("explorerWidth", Number((event.currentTarget as HTMLInputElement).value))}
              />
            </div>

            <div class="border border-white/6 bg-white/[0.03] p-5 lg:col-span-2">
              <div class="flex items-start justify-between gap-4">
                <div class="flex items-start gap-3">
                  <div class="bg-emerald-500/10 p-2 text-emerald-300">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h4 class="m-0 text-sm font-semibold tracking-tight text-white">Reduce motion</h4>
                    <p class="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">
                      Desactiva animaciones largas y transiciones cuando prefieras una interfaz más seca y rápida.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  class={`inline-flex h-8 w-14 items-center border px-1 transition-all ${
                    $programPreferences.reduceMotion
                      ? "border-emerald-500/50 bg-emerald-500/20 justify-end"
                      : "border-white/8 bg-white/[0.03] justify-start"
                  }`}
                  aria-label="Toggle reduce motion"
                  aria-pressed={$programPreferences.reduceMotion}
                  onclick={() => setProgramPreference("reduceMotion", !$programPreferences.reduceMotion)}
                >
                  <span class={`h-6 w-6 transition-all ${$programPreferences.reduceMotion ? "bg-emerald-400" : "bg-zinc-500"}`}></span>
                </button>
              </div>
            </div>
          </div>
        {:else}
          <div class="grid gap-5 lg:grid-cols-2">
            <div class="border border-white/6 bg-white/[0.03] p-5">
              <div class="mb-5 flex items-center gap-3">
                <div class="bg-emerald-500/10 p-2 text-emerald-300">
                  <Type size={18} />
                </div>
                <div>
                  <h4 class="m-0 text-sm font-semibold tracking-tight text-white">Fuente del editor</h4>
                  <p class="mt-1 text-xs leading-relaxed text-zinc-500">
                    Aplica sobre el buffer real y la lectura del código.
                  </p>
                </div>
              </div>

              <label for="buffer-font-family" class="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Fuente</label>
              <select
                id="buffer-font-family"
                class="w-full border border-white/8 bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none transition-all focus:border-emerald-500/40"
                value={$bufferPreferences.fontFamily}
                onchange={(event) =>
                  setBufferPreference("fontFamily", (event.currentTarget as HTMLSelectElement).value)}
              >
                {#each BUFFER_FONT_OPTIONS as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>

              <div class="mt-5 flex items-center justify-between">
                <label for="buffer-font-size" class="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Tamaño</label>
                <span class="border border-white/8 bg-white/[0.03] px-2.5 py-1 text-xs text-zinc-300">
                  {$bufferPreferences.fontSize}px
                </span>
              </div>
              <input
                id="buffer-font-size"
                class="mt-3 h-2 w-full cursor-pointer appearance-none bg-white/8 accent-emerald-500"
                type="range"
                min="11"
                max="24"
                step="1"
                value={$bufferPreferences.fontSize}
                oninput={(event) =>
                  setBufferPreference("fontSize", Number((event.currentTarget as HTMLInputElement).value))}
              />
            </div>

            <div class="border border-white/6 bg-white/[0.03] p-5">
              <div class="mb-5 flex items-center gap-3">
                <div class="bg-emerald-500/10 p-2 text-emerald-300">
                  <Rows3 size={18} />
                </div>
                <div>
                  <h4 class="m-0 text-sm font-semibold tracking-tight text-white">Ritmo de lectura</h4>
                  <p class="mt-1 text-xs leading-relaxed text-zinc-500">
                    Separa más o menos cada línea según el tipo de archivo y densidad que quieras.
                  </p>
                </div>
              </div>

              <div class="flex items-center justify-between">
                <label for="buffer-line-height" class="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Line height</label>
                <span class="border border-white/8 bg-white/[0.03] px-2.5 py-1 text-xs text-zinc-300">
                  {$bufferPreferences.lineHeight}px
                </span>
              </div>
              <input
                id="buffer-line-height"
                class="mt-3 h-2 w-full cursor-pointer appearance-none bg-white/8 accent-emerald-500"
                type="range"
                min="18"
                max="34"
                step="1"
                value={$bufferPreferences.lineHeight}
                oninput={(event) =>
                  setBufferPreference("lineHeight", Number((event.currentTarget as HTMLInputElement).value))}
              />
            </div>

            <div class="border border-white/6 bg-white/[0.03] p-5">
              <div class="mb-5 flex items-center gap-3">
                <div class="bg-emerald-500/10 p-2 text-emerald-300">
                  <Keyboard size={18} />
                </div>
                <div>
                  <h4 class="m-0 text-sm font-semibold tracking-tight text-white">Vim mode</h4>
                  <p class="mt-1 text-xs leading-relaxed text-zinc-500">
                    Activa navegación modal y comandos básicos desde el buffer.
                  </p>
                </div>
              </div>

              <button
                type="button"
                class={`inline-flex h-9 w-16 items-center border px-1 transition-all ${
                  $bufferPreferences.vimModeEnabled
                    ? "border-emerald-500/50 bg-emerald-500/20 justify-end"
                    : "border-white/8 bg-white/[0.03] justify-start"
                  }`}
                aria-label="Toggle vim mode"
                aria-pressed={$bufferPreferences.vimModeEnabled}
                onclick={() => setBufferPreference("vimModeEnabled", !$bufferPreferences.vimModeEnabled)}
              >
                <span class={`h-7 w-7 transition-all ${$bufferPreferences.vimModeEnabled ? "bg-emerald-400" : "bg-zinc-500"}`}></span>
              </button>
            </div>

            <div class="border border-white/6 bg-white/[0.03] p-5">
              <div class="mb-5 flex items-center gap-3">
                <div class="bg-emerald-500/10 p-2 text-emerald-300">
                  <Hash size={18} />
                </div>
                <div>
                  <h4 class="m-0 text-sm font-semibold tracking-tight text-white">Lectura visual</h4>
                  <p class="mt-1 text-xs leading-relaxed text-zinc-500">
                    Ajusta el gutter y la pista visual de la línea activa.
                  </p>
                </div>
              </div>

              <div class="space-y-3">
                <button
                  type="button"
                  class="flex w-full items-center justify-between border border-white/8 bg-black/20 px-4 py-3 text-left transition-all hover:border-white/12 hover:bg-black/30"
                  onclick={() => setBufferPreference("showLineNumbers", !$bufferPreferences.showLineNumbers)}
                >
                  <div>
                    <div class="text-sm font-medium text-zinc-100">Mostrar números de línea</div>
                    <div class="mt-1 text-xs text-zinc-500">Mantén o limpia el gutter del buffer.</div>
                  </div>
                  <span class={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${$bufferPreferences.showLineNumbers ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-zinc-500"}`}>
                    {$bufferPreferences.showLineNumbers ? "ON" : "OFF"}
                  </span>
                </button>

                <button
                  type="button"
                  class="flex w-full items-center justify-between border border-white/8 bg-black/20 px-4 py-3 text-left transition-all hover:border-white/12 hover:bg-black/30"
                  onclick={() =>
                    setBufferPreference("highlightActiveLine", !$bufferPreferences.highlightActiveLine)}
                >
                  <div>
                    <div class="text-sm font-medium text-zinc-100">Resaltar línea activa</div>
                    <div class="mt-1 text-xs text-zinc-500">Mejora el seguimiento del cursor en archivos extensos.</div>
                  </div>
                  <span class={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${$bufferPreferences.highlightActiveLine ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-zinc-500"}`}>
                    {$bufferPreferences.highlightActiveLine ? "ON" : "OFF"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <div class="flex items-center justify-between border-t border-white/6 bg-white/[0.02] px-8 py-4">
        <p class="m-0 text-[11px] text-zinc-500">
          Los cambios se aplican inmediatamente y quedan persistidos localmente.
        </p>

        <div class="flex items-center gap-3">
          {#if activeSection === "program"}
            <button
              type="button"
              class="inline-flex items-center gap-2 border border-white/8 bg-white/[0.03] px-4 py-2 text-sm text-zinc-300 transition-all hover:border-white/12 hover:bg-white/[0.06] hover:text-white"
              onclick={resetProgramPreferences}
            >
              <RotateCcw size={14} />
              Reset programa
            </button>
          {:else}
            <button
              type="button"
              class="inline-flex items-center gap-2 border border-white/8 bg-white/[0.03] px-4 py-2 text-sm text-zinc-300 transition-all hover:border-white/12 hover:bg-white/[0.06] hover:text-white"
              onclick={resetBufferPreferences}
            >
              <RotateCcw size={14} />
              Reset buffer
            </button>
          {/if}

          <button
            type="button"
            class="bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition-all hover:bg-emerald-400"
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
  .custom-scrollbar::-webkit-scrollbar {
    width: 8px;
  }

  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
  }

  .custom-scrollbar:hover::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.14);
  }
</style>
