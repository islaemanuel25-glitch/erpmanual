# Despliegue y build

**Cómo está armado.** Para **ejecutar** un despliegue está la skill `/deploy`, y
para restaurar un backup está `/backup` más
[../RESTAURACION-BACKUP.md](../RESTAURACION-BACKUP.md). Este documento no repite
los comandos.

---

## El principio: el VPS no construye

GitHub Actions (`.github/workflows/build-imagen.yml`) construye la imagen y la
publica en `ghcr.io/islaemanuel25-glitch/erpmanual:<SHA_COMPLETO>`, solo
`linux/amd64`. El VPS **solo descarga**.

**Por qué:** antes el VPS compilaba, y un despliegue típico tardaba ~10-11 minutos
dominados por `next build`. Turbopack no reaprovecha `.next/cache`, así que ningún
cache mount lo arreglaba, y mientras tanto el ERP se ponía lento porque el build
competía por CPU y disco con la aplicación y con PostgreSQL. Documentado con
tiempos medidos en `docs/RELEASE-CHECKLIST.md` §4.

**Nunca `latest`, nunca SHA corto.** Una etiqueta móvil impide saber qué versión
corre y volver a una anterior.

Lo que impide construir en el VPS es `pull_policy: missing` en
`docker-compose.prod.yml:41`: cuando un servicio declara `build:`, el default de
Compose es construir la imagen si falta.

---

## La identidad de una versión

El mismo SHA viaja a cuatro lugares y **los cinco valores tienen que coincidir**:
`origin/main`, el HEAD del VPS, el tag de la imagen, `APP_BUILD_ID` dentro del
contenedor y lo que devuelve `/api/version`.

Dentro de la aplicación:

| Destino | Variable | Cuándo |
|---|---|---|
| Bundle del navegador | `NEXT_PUBLIC_BUILD_ID` | build, etapa *builder* |
| Proceso del servidor | `APP_BUILD_ID` | runtime, etapa *runner* |

`lib/version/compararBuild.js` y `motorVersion.js` los comparan: es el guard que
detecta una pestaña abierta con un bundle viejo. En desarrollo la variable no
existe y el guard queda inactivo. Candados:
`lib/version/{compararBuild,motorVersion,integracionGuard}.test.mjs`.

El build local de emergencia **falla a propósito** si no recibe `APP_BUILD_ID`
(`REQUIRE_BUILD_ID=1`): un guard inactivo por un argumento olvidado da falsa
sensación de protección.

---

## Los dos contenedores, y por qué uno no se toca

`docker-compose.prod.yml`: `erpazul_app` y `erpazul_db` (PostgreSQL 16).

**El servicio `db` fue creado fuera de Compose** y arrastra un pendiente conocido
de interpolación de `POSTGRES_PASSWORD`. Mientras no se resuelva, **no se puede
ejecutar nada que cree o recree `db`**. Todo despliegue va con `--no-deps app`.

`APP_IMAGE` vive en el `.env` de Compose del VPS, **nunca en `.env.prod`**: ese es
el `env_file` del contenedor, sus variables no interpolan el compose y además
terminarían dentro de la aplicación. Comprobable:
`docker exec erpazul_app env | grep -c APP_IMAGE` debe dar **0**.

---

## La ventana entre migrar y recrear

Las migraciones se aplican con un contenedor descartable **de la imagen nueva**,
antes de recrear la app. Entre esos dos pasos **el esquema ya es el nuevo y el
código que atiende todavía es el viejo**.

**Regla vigente:** toda migración que pase por el flujo normal tiene que ser
compatible hacia atrás con la versión anterior durante esa ventana. Las
destructivas van por fases.

**Lo observado, que no la respalda:** de las 81 migraciones del repo, **14
contienen sentencias destructivas** y se desplegaron por este mismo flujo. No
rompió nada, pero eso es poco tráfico, no una garantía.

Por eso hay un candado real: `scripts/clasificar-migraciones.mjs` clasifica lo que
el despliegue introduce y frena si algo no es aditivo, con un hook `PreToolUse`
que lo dispara solo. **Ese hook cubre un solo camino** —desplegar desde una sesión
de Claude Code en este repo— y la lista de por dónde se saltea está en la skill
`/deploy`.

---

## Vuelta atrás

- **Código:** apuntar `APP_IMAGE` a la referencia fija registrada antes del
  despliegue y recrear. Sin compilar. **Este camino sí se usó.**
- **Migración:** el procedimiento está en `docs/RELEASE-CHECKLIST.md` §3 y
  **nunca se ejecutó ni se verificó de punta a punta**. No es un mecanismo
  probado. Necesita una prueba en una base descartable antes de considerarlo
  confiable.

---

## Backups

Tres destinos efectivos: VPS, notebook y repo privado cifrado con gpg. Un cuarto
—disco externo con etiqueta `BACKUP-ERP`— está previsto en el código y **no
existe**: cada corrida registra `NO CONECTADO`.

**El VPS no empuja: la notebook tira.** Si alguien compromete el VPS se lleva la
base pero **no** los backups: no tiene credenciales hacia afuera. El sentido del
tráfico es parte del diseño.

Detalle completo y las cinco fallas que solo aparecieron ejecutando: skill
`/backup`.
