<script lang="ts">
  // TODO: TRANSLATE TEXT IN ENGLISH
  import { closeDialog } from "../../stores/dialogStore";
  import DialogWrapper from "../dialogs/core/DialogWrapper.svelte";
  import Select from "../ui/Select.svelte";
  import {
    MonitorCog,
    FileCode2,
    Type,
    Rows3,
    Keyboard,
    Hash,
    Sparkles,
    PanelLeftClose,
    X,
  } from "@lucide/svelte";
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

  function programFontLabel(value: string) {
    return (
      PROGRAM_FONT_OPTIONS.find((option) => option.value === value)?.label ??
      "Custom"
    );
  }

  $effect(() => {
    activeSection = initialSection;
  });
</script>

{#snippet setting(title: string, description: string, content: any)}
  <div
    class="flex items-center justify-between gap-4 px-5 py-3 border-b border-(--color-border) hover:bg-(--color-hover-bg-subtle) transition-colors"
  >
    <div class="min-w-0">
      <div class="font-bold text-(--color-text-primary)">{title}</div>
      <div class="mt-0.5 text-(--color-text-secondary)">{description}</div>
    </div>
    {@render content()}
  </div>
{/snippet}

{#snippet sectionTitle(title: string, Icon: any)}
  <div
    class="flex items-center gap-2 px-5 py-2 text-(--color-text-secondary) bg-(--color-surface-base) border-b border-(--color-border)"
  >
    <Icon strokeWidth={2.5} size="1em" /><span>{title}</span>
  </div>
{/snippet}

<DialogWrapper onClose={closeDialog} position="center" zIndex={120}>
  <div
    class="flex h-full max-h-170 w-full max-w-4xl flex-col overflow-hidden bg-(--color-surface-base) border border-(--color-border)"
  >
    <header
      class="flex items-center gap-3 px-4 py-2.5 border-b border-(--color-border)"
    >
      <div class="flex w-43 shrink-0 items-center">
        <span class="text-(--color-text-primary)">Preferences System</span>
      </div>
      <div class="w-px h-3 bg-(--color-border) shrink-0"></div>
      <div class="flex flex-1 items-center gap-3 px-1">
        {#if activeSection === "program"}
          <MonitorCog
            strokeWidth={2.5}
            size="1em"
            class="text-(--color-accent) shrink-0"
          /><span class="text-(--color-text-primary) font-bold"
            >Preferencias del programa</span
          >
        {:else}
          <FileCode2
            strokeWidth={2.5}
            size="1em"
            class="text-(--color-accent) shrink-0"
          /><span class="text-(--color-text-primary) font-bold"
            >Preferencias del buffer</span
          >
        {/if}
      </div>
      <button
        onclick={closeDialog}
        class="flex h-6 w-6 items-center justify-center text-(--color-text-muted) hover:text-(--color-text-primary) transition-colors"
        ><X strokeWidth={2.5} size="1.2em" /></button
      >
    </header>

    <div class="flex flex-1 overflow-hidden">
      <aside
        class="flex w-50 shrink-0 flex-col bg-(--color-surface-base) border-r border-(--color-border)"
      >
        <nav class="flex flex-col">
          <button
            type="button"
            class="flex items-center gap-2.5 px-5 py-3 text-left transition-colors text-(--color-text-primary) {activeSection ===
            'program'
              ? 'bg-(--color-accent-fill)'
              : 'hover:bg-(--color-hover-bg-subtle)'}"
            onclick={() => (activeSection = "program")}
          >
            <MonitorCog strokeWidth={2.5} size="1em" class="shrink-0" />
            <div class="min-w-0">
              <div class="font-bold">Programa</div>
              <div class="mt-0.5 text-[11px] opacity-80">UI, fuentes, explorer</div>
            </div>
          </button>
          <button
            type="button"
            class="flex items-center gap-2.5 px-5 py-3 text-left transition-colors text-(--color-text-primary) {activeSection ===
            'buffer'
              ? 'bg-(--color-accent-fill)'
              : 'hover:bg-(--color-hover-bg-subtle)'}"
            onclick={() => (activeSection = "buffer")}
          >
            <FileCode2 strokeWidth={2.5} size="1em" class="shrink-0" />
            <div class="min-w-0">
              <div class="font-bold">Buffer</div>
              <div class="mt-0.5 text-[11px] opacity-80">Editor, vim, lectura</div>
            </div>
          </button>
        </nav>

        <div
          class="mx-4 mt-auto mb-4 p-3 border border-(--color-border) bg-(--color-surface-base)"
        >
          <p class="mb-2 font-bold text-(--color-text-secondary)">
            Preview
          </p>
          {#if activeSection === "program"}
            <div class="space-y-1.5">
              <div
                class="flex items-center justify-between text-(--color-text-secondary)"
              >
                <span>Fuente UI</span><span
                  class="text-(--color-text-secondary)"
                  >{programFontLabel($programPreferences.fontFamily)}</span
                >
              </div>
              <div
                class="flex items-center justify-between text-(--color-text-secondary)"
              >
                <span>Tamaño</span><span class="text-(--color-text-secondary)"
                  >{$programPreferences.fontSize}px</span
                >
              </div>
              <div
                class="flex items-center justify-between text-(--color-text-secondary)"
              >
                <span>Explorer</span><span class="text-(--color-text-primary)"
                  >{$programPreferences.explorerWidth}px</span
                >
              </div>
            </div>
          {:else}
            <div
              class="p-2 font-{$bufferPreferences.fontFamily} border border-(--color-border)"
              style={`font-family: ${$bufferPreferences.fontFamily};`}
            >
              <p class="mb-1.5 text-(--color-text-secondary)">Buffer Sample</p>
              <p
                class="text-(--color-text-primary)"
                style={`font-size: ${$bufferPreferences.fontSize}px; line-height: ${$bufferPreferences.lineHeight}px;`}
              >
                const x = fn();
              </p>
            </div>
          {/if}
        </div>
      </aside>

      <section class="flex min-w-0 flex-1 flex-col">
        <div
          class="flex-1 overflow-y-auto [scrollbar-width:thin] scrollbar-thumb-(--color-scrollbar) hover:scrollbar-thumb-(--color-scrollbar-hover)"
        >
          {#if activeSection === "program"}
            {@render sectionTitle("Tipografía de interfaz", Type)}
            {#snippet fontSelect()}
              <Select
                value={$programPreferences.fontFamily}
                options={PROGRAM_FONT_OPTIONS}
                onChange={(v) => setProgramPreference("fontFamily", v)}
              />
            {/snippet}
            {@render setting(
              "Fuente",
              "Define la voz visual del shell.",
              fontSelect,
            )}

            {#snippet fontSizeInput()}
              <input
                type="number"
                min="10"
                max="18"
                class="w-10 px-1.5 py-0.5 text-center outline-none text-(--color-text-primary) bg-(--color-surface-base) border border-(--color-border) focus:border-(--color-accent) transition-colors"
                value={$programPreferences.fontSize}
                onblur={(e) =>
                  setProgramPreference(
                    "fontSize",
                    Number(e.currentTarget.value),
                  )}
              />
            {/snippet}
            {@render setting(
              "Tamaño UI",
              "Ajusta la escala general de la interfaz.",
              fontSizeInput,
            )}

            {@render sectionTitle("Explorer", PanelLeftClose)}

            {#snippet explorerWidthInput()}
              <input
                type="number"
                min="200"
                max="600"
                class="w-10 px-1.5 py-0.5 text-center outline-none text-(--color-text-primary) bg-(--color-surface-base) border border-(--color-border) focus:border-(--color-accent) transition-colors"
                value={$programPreferences.explorerWidth}
                onblur={(e) =>
                  setProgramPreference(
                    "explorerWidth",
                    Number(e.currentTarget.value),
                  )}
              />
            {/snippet}
            {@render setting(
              "Ancho inicial",
              "Ancho predeterminado del explorador de archivos.",
              explorerWidthInput,
            )}

            {@render sectionTitle("Animaciones", Sparkles)}

            {#snippet reduceMotionToggle()}
              <button
                aria-label="Toggle reduce motion"
                class="shrink-0 inline-flex items-center px-1 w-11 h-5 border transition-all duration-200 {$programPreferences.reduceMotion
                  ? 'border-(--color-accent-border) bg-(--color-accent-fill) justify-end'
                  : 'border-(--color-border) bg-(--color-hover-bg-subtle) justify-start'}"
                onclick={() =>
                  setProgramPreference(
                    "reduceMotion",
                    !$programPreferences.reduceMotion,
                  )}
                ><span
                  class="block w-3.5 h-3.5 transition-colors duration-200 {$programPreferences.reduceMotion
                    ? 'bg-(--color-accent)'
                    : 'bg-(--color-text-muted)'}"
                ></span></button
              >
            {/snippet}
            {@render setting(
              "Reduce motion",
              "Desactiva transiciones y animaciones largas.",
              reduceMotionToggle,
            )}
          {:else}
            {@render sectionTitle("Fuente del editor", Type)}

            {#snippet bufferFontSelect()}
              <Select
                value={$bufferPreferences.fontFamily}
                options={BUFFER_FONT_OPTIONS}
                onChange={(v) => setBufferPreference("fontFamily", v)}
              />
            {/snippet}
            {@render setting(
              "Fuente",
              "Aplica sobre el buffer y la lectura del código.",
              bufferFontSelect,
            )}

            {#snippet bufferFontSizeInput()}
              <input
                type="number"
                min="8"
                max="72"
                class="w-10 px-1.5 py-0.5 text-center outline-none text-(--color-text-primary) bg-(--color-surface-base) border border-(--color-border) focus:border-(--color-accent) transition-colors"
                value={$bufferPreferences.fontSize}
                onblur={(e) =>
                  setBufferPreference(
                    "fontSize",
                    Number(e.currentTarget.value),
                  )}
              />
            {/snippet}
            {@render setting(
              "Tamaño",
              "Tamaño de fuente del editor principal.",
              bufferFontSizeInput,
            )}

            {@render sectionTitle("Ritmo de lectura", Rows3)}

            {#snippet lineHeightInput()}
              <input
                type="number"
                min="12"
                max="64"
                class="w-10 px-1.5 py-0.5 text-center outline-none text-(--color-text-primary) bg-(--color-surface-base) border border-(--color-border) focus:border-(--color-accent) transition-colors"
                value={$bufferPreferences.lineHeight}
                onblur={(e) =>
                  setBufferPreference(
                    "lineHeight",
                    Number(e.currentTarget.value),
                  )}
              />
            {/snippet}
            {@render setting(
              "Line height",
              "Espaciado vertical entre líneas de código.",
              lineHeightInput,
            )}

            {@render sectionTitle("Modal editing", Keyboard)}

            {#snippet vimToggle()}
              <button
                aria-label="Toggle Vim mode"
                class="shrink-0 inline-flex items-center px-1 w-11 h-5 border transition-all duration-200 {$bufferPreferences.vimModeEnabled
                  ? 'border-(--color-accent-border) bg-(--color-accent-fill) justify-end'
                  : 'border-(--color-border) bg-(--color-hover-bg-subtle) justify-start'}"
                onclick={() =>
                  setBufferPreference(
                    "vimModeEnabled",
                    !$bufferPreferences.vimModeEnabled,
                  )}
                ><span
                  class="block w-3.5 h-3.5 {$bufferPreferences.vimModeEnabled
                    ? 'bg-(--color-accent)'
                    : 'bg-(--color-text-muted)'}"
                ></span></button
              >
            {/snippet}
            {@render setting(
              "Vim mode",
              "Navegación modal y comandos desde el buffer.",
              vimToggle,
            )}

            {@render sectionTitle("Lectura visual", Hash)}

            {#snippet lineNumbersToggle()}
              <button
                aria-label="Toggle line numbers"
                onclick={() =>
                  setBufferPreference(
                    "showLineNumbers",
                    !$bufferPreferences.showLineNumbers,
                  )}
                class="font-bold uppercase px-2 py-0.5 border transition-colors min-w-9 text-center {$bufferPreferences.showLineNumbers
                  ? 'text-(--color-accent) border-(--color-accent-border) bg-(--color-accent-fill)'
                  : 'text-(--color-text-muted) border-(--color-border) bg-(--color-hover-bg-subtle)'}"
                >{$bufferPreferences.showLineNumbers ? "ON" : "OFF"}</button
              >
            {/snippet}
            {@render setting(
              "Números de línea",
              "Mantén o limpia el gutter del buffer.",
              lineNumbersToggle,
            )}

            {#snippet activeLineToggle()}
              <button
                aria-label="Toggle active line highlighting"
                onclick={() =>
                  setBufferPreference(
                    "highlightActiveLine",
                    !$bufferPreferences.highlightActiveLine,
                  )}
                class="font-bold uppercase px-2 py-0.5 border transition-colors min-w-9 text-center {$bufferPreferences.highlightActiveLine
                  ? 'text-(--color-accent) border-(--color-accent-border) bg-(--color-accent-fill)'
                  : 'text-(--color-text-muted) border-(--color-border) bg-(--color-hover-bg-subtle)'}"
                >{$bufferPreferences.highlightActiveLine ? "ON" : "OFF"}</button
              >
            {/snippet}
            {@render setting(
              "Línea activa",
              "Resalta el cursor en archivos extensos.",
              activeLineToggle,
            )}
          {/if}
        </div>

        <div
          class="flex items-center justify-between px-4 py-3 border-t border-(--color-border) bg-(--color-surface-base)"
        >
          <span class="text-(--color-text-muted)"
            >Los cambios se aplican inmediatamente.</span
          >
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="flex items-center gap-1.5 px-3 py-1.5 font-bold border border-(--color-border) text-(--color-text-secondary) bg-(--color-surface-base) transition-all hover:bg-(--color-hover-bg-subtle) hover:text-(--color-text-primary)"
              onclick={activeSection === "program"
                ? resetProgramPreferences
                : resetBufferPreferences}>Reset</button
            >
            <button
              type="button"
              class="px-4 py-1.5 font-bold border border-(--color-accent) bg-(--color-accent) text-(--color-surface-base) transition-all hover:opacity-90"
              onclick={closeDialog}>Close</button
            >
          </div>
        </div>
      </section>
    </div>
  </div>
</DialogWrapper>

<style>
  input::-webkit-outer-spin-button,
  input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  input[type="number"] {
    -moz-appearance: textfield;
    appearance: textfield;
  }
</style>
