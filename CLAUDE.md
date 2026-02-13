# ERP Azul - Instrucciones para Claude Code

## Auto-documentación

Al finalizar CADA sesión donde se hayan modificado archivos del proyecto, ejecutar:

1. `node scripts/update-docs.js` — Actualiza docs de módulos afectados, CHANGELOG.md y ULTIMA-ACTUALIZACION.md
2. Verificar que los docs generados sean correctos
3. Commit con mensaje: `docs: auto-update [módulos afectados]`

### Cuándo NO ejecutar
- Si solo se modificaron archivos de documentación (docs/)
- Si solo se modificaron archivos de configuración (.env, package.json)
- Si la sesión fue solo de consulta/lectura

## Estructura del proyecto

- **Framework:** Next.js (App Router) + React + Tailwind CSS
- **Base de datos:** PostgreSQL + Prisma ORM
- **UI:** Sistema de componentes Sunmi (custom)
- **Módulos:** app/modulos/[nombre]/page.jsx
- **APIs:** app/api/[nombre]/[accion]/route.js
- **Componentes:** components/[nombre]/

## Convenciones

- Español en toda la documentación y comentarios de usuario
- Fechas en formato ISO: YYYY-MM-DD HH:mm
- Commits en español con prefijo: feat:, fix:, docs:, refactor:
- Componentes UI usar la librería Sunmi (SunmiCard, SunmiButton, SunmiInput, etc.)
- No usar `<select>` ni `<input>` nativos — usar SunmiSelectAdv y SunmiInput
