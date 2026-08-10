# DEC-0005 — El VPS no construye la imagen

**Estado:** Vigente

## Contexto

El VPS compilaba la aplicación en cada despliegue. Un deploy típico tardaba
**10-11 minutos**, dominados por `next build`, y mientras corría **el ERP se
ponía lento**: el build competía por CPU y disco con la aplicación y con
PostgreSQL, en la misma máquina y en horario de uso.

Se intentó atacarlo por el lado del cache y no funcionó: Turbopack no reaprovecha
`.next/cache`, así que ningún cache mount lo arreglaba.

## Decisión

**GitHub Actions construye y publica; el VPS solo descarga.** La imagen va a
`ghcr.io/islaemanuel25-glitch/erpmanual:<SHA_COMPLETO>`.

Reglas duras que salieron con la decisión:

- **Nunca `latest`, nunca SHA corto.** Solo el SHA completo de 40 caracteres.
- Cinco valores tienen que coincidir siempre: `origin/main`, HEAD del VPS, tag de
  la imagen, `APP_BUILD_ID` y `/api/version`.
- Nada de `docker build` ni `up --build` en el VPS.
- Nunca `docker compose down`, nunca recrear PostgreSQL: siempre `--no-deps app`.

## Motivo

El costo estaba medido, no supuesto: el perfilado mostró que el build dominaba el
tiempo del deploy y degradaba el servicio mientras corría. Después del cambio, el
build pasó a **3 m 09 s en el runner de GitHub y 0 s de CPU del VPS**; en el VPS
quedan `pull` 57 s + `up` 3 s + 5 s de recuperación del endpoint.

Lo de nunca `latest`: una etiqueta móvil impide saber qué versión corre y volver a
una anterior.

## Consecuencias

- El rollback de código pasa a ser gratis: apuntar `APP_IMAGE` a la referencia
  fija anterior y recrear. Sin compilar. **Este camino se usó.**
- Hay que **registrar el image ID o el RepoTag fijo antes de cada despliegue**, o
  no hay a dónde volver.
- `pull_policy: missing` en el compose es lo que impide construir por accidente.
- El build local queda como camino de emergencia y **falla a propósito** si no
  recibe `APP_BUILD_ID`.

## Evidencia

- Commit `50cd64a` *ci: construir imagen de producción en GHCR*.
- `.github/workflows/build-imagen.yml` y `docker-compose.prod.yml:41`.
- Tiempos medidos en `docs/RELEASE-CHECKLIST.md` §4.
- Procedimiento ejecutable: skill `/deploy`.
