# Contribuir a Forja

Gracias por tu interés en mejorar Forja. Antes de enviar cualquier contribución,
lee este documento completo — especialmente el acuerdo de licencia de contribuidor (CLA).

---

## Acuerdo de Licencia de Contribuidor (CLA)

**Al abrir un Pull Request o enviar cualquier código, documentación, activos u otro
material a este repositorio, aceptas los siguientes términos:**

1. **Cesión de derechos** — Cedes a KOALIQODE todos los derechos, títulos e
   intereses sobre tu contribución, incluyendo todos los derechos de propiedad
   intelectual (copyright, patentes, secretos comerciales, etc.).

2. **Originalidad** — Declaras que tu contribución es trabajo original tuyo y que
   tienes el derecho legal de cederla. Si tu contribución incluye material de
   terceros, lo declaras explícitamente en el PR.

3. **Sin restricciones** — Declaras que no estás sujeto a ningún acuerdo de
   confidencialidad, contrato de empleo u obligación legal que impida la cesión.

4. **Licencia del proyecto** — Entiendes que tu contribución quedará sujeta a la
   [Elastic License 2.0](./LICENSE) y que KOALIQODE puede relicenciarla en el
   futuro bajo otros términos.

5. **Sin compensación** — Las contribuciones se realizan de forma voluntaria y no
   generan derecho a compensación económica, crédito en el producto, ni ninguna
   otra contraprestación, salvo acuerdo escrito previo.

> **Si no aceptas estos términos, no envíes contribuciones.**

---

## Qué puedes contribuir

- 🐛 Corrección de bugs
- ✨ Mejoras de rendimiento
- 📚 Documentación y traducción
- 🎨 Temas y assets visuales
- ✅ Tests

## Qué NO aceptamos

- Cambios que agreguen dependencias con licencias copyleft (GPL, LGPL, AGPL)
- Código generado por IA sin revisión humana documentada
- Cambios de estilo/formato sin issue previo aprobado
- Features grandes sin discusión previa en un issue

---

## Proceso de contribución

1. **Abre un issue primero** — describe el bug o feature. Espera aprobación antes
   de escribir código.
2. **Fork → rama con nombre descriptivo** — `fix/editor-cursor-blink` o
   `feat/theme-preview`.
3. **Sigue el estilo del proyecto** — Svelte 5 runes, TypeScript estricto,
   sin `any` explícito.
4. **Incluye tests** — todo código nuevo debe tener cobertura. Los tests existentes
   no deben romperse.
5. **Abre el PR contra `dev`** — nunca directamente a `main`.
6. **El PR debe pasar CI** — TypeScript check + Vitest. Sin excepciones.

---

## Configuración del entorno

```bash
# Requisitos: Node 20+, Rust 1.77+, Tauri CLI
git clone https://github.com/KOALIQODE/forja-project.git
cd forja-project
npm install

# Desarrollo
npm run tauri dev

# Tests
npm run test

# Type check
npx tsc --noEmit
```

---

## Código de conducta

Se espera trato respetuoso en todos los espacios del proyecto. KOALIQODE se reserva
el derecho de rechazar o revertir contribuciones y de bloquear usuarios sin necesidad
de justificación.

---

Copyright © 2026 KOALIQODE. Todos los derechos reservados.
