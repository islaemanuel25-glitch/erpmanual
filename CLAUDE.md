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

## Despliegue a producción

El procedimiento completo está en `docs/RELEASE-CHECKLIST.md` §3.bis. Reglas que no se
negocian:

- **El VPS no construye la imagen.** La construye GitHub Actions y la publica en
  `ghcr.io/islaemanuel25-glitch/erpmanual:<SHA_COMPLETO>`. El VPS solo descarga.
- **Nunca `latest`** ni SHA corto. Producción despliega siempre por SHA completo.
- Deben coincidir: SHA de `origin/main`, HEAD del VPS, tag de la imagen, `APP_BUILD_ID`
  y `/api/version`. Si alguno difiere, parar.
- Nada de `docker build`, `docker compose up --build` ni `docker compose down` en el VPS.
  Nunca recrear PostgreSQL: siempre `--no-deps app`.
- `APP_IMAGE` va en el `.env` de Compose del VPS, **nunca en `.env.prod`**.
- Migraciones con `prisma migrate deploy` (**sin `npx`**) en un container one-off de la
  imagen nueva, *antes* de recrear la app.
- Backup validado antes de cualquier despliegue. Registrar el RepoTag fijo o el image ID
  exacto de la imagen anterior y conservarlo: es la referencia de rollback. Nunca usar
  `latest` para volver atrás.

⚠️ **Nunca imprimir secretos**: `docker compose config` sin filtrar vuelca
`POSTGRES_PASSWORD` en claro. Tampoco `DATABASE_URL` ni el contenido de `.env.prod`.

## Convenciones

- Español en toda la documentación y comentarios de usuario
- Fechas en formato ISO: YYYY-MM-DD HH:mm
- Commits en español con prefijo: feat:, fix:, docs:, refactor:
- Componentes UI usar la librería Sunmi (SunmiCard, SunmiButton, SunmiInput, etc.)
- No usar `<select>` ni `<input>` nativos — usar SunmiSelectAdv y SunmiInput

## Scripts que tocan la base

Reglas que no se negocian. Vienen de un caso real: `new PrismaClient()` sin
argumentos no falla cuando falta `DATABASE_URL` — usa la del `.env`. Había 23
scripts que escribían en `erpazul_dev` creyendo que trabajaban en otro lado, y 19
que hacían `TRUNCATE` de todas las tablas protegidos solamente por que la palabra
"test" no aparecía en el nombre de esa base.

- **Ningún script de `scripts/` construye `PrismaClient` directo.** Todos piden el
  cliente a `scripts/lib/clientePrisma.mjs`, que exige la URL de forma explícita y
  aborta con código 2 si falta, en vez de heredarla. La única excepción es la
  fábrica misma. Tres niveles: `LECTURA` (URL explícita), `ESCRITURA` (además host
  local y `NODE_ENV` distinto de production) y `DESTRUCTIVO` (además nombre exacto
  en lista blanca y `SEED_DESTRUCTIVO` igual a ese nombre). El nivel sigue al
  **modo**, no al script: uno con dry-run pide `LECTURA` al simular y `ESCRITURA`
  al aplicar, así la simulación puede auditar producción sin habilitar escrituras.
- **La fábrica se importa ANTES que cualquier cosa que arrastre a Prisma.** En la
  práctica, primero de todo. `@prisma/client` carga el `.env` al importarse, y la
  fábrica distingue "la puso el operador" de "la puso el archivo" capturando la
  variable antes de que eso ocurra. Si algo carga Prisma antes, esa distinción se
  pierde en silencio.
- **Un paso de datos que corre en producción va como migración de Prisma, nunca
  como script.** Las migraciones ya tienen su lugar en el despliegue, quedan
  registradas y se aplican una sola vez; un script suelto no. Corolario: si algo
  necesita correr en el VPS, no es un script — es una migración.
