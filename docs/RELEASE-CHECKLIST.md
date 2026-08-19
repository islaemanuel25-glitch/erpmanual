# Checklist de Release — ERP Azul

## 1. Pre-release (dev)

- [ ] `git status` limpio (sin cambios sin commitear)
- [ ] `npx prisma migrate dev` — aplica migraciones pendientes en dev
- [ ] `npx prisma generate` — regenera el cliente Prisma
- [ ] `npm run lint` — sin errores ni warnings críticos

### Smoke tests manuales

- [ ] **Clientes:** listado, detalle, crear, editar
- [ ] **Cuenta Corriente:** ver saldo + movimientos, registrar pago, registrar ajuste
- [ ] **Puntos:** ver saldo, canjear puntos (si activo en el local)
- [ ] **POS Venta contado:** buscar producto, agregar al carrito, cobrar efectivo
- [ ] **POS Venta fiado:** cobrar como Cuenta Corriente → verificar movimiento CC generado
- [ ] **Analytics:** ranking facturación/frecuencia, inactivos con/sin compras
- [ ] **Import/Export:** importar preview + apply, exportar Excel, exportar PDF
- [ ] **Merge clientes:** unificar duplicados, verificar transferencia de ventas/CC/puntos/tags

## 2. Producción

- [ ] Leer [deploy/MIGRACIONES-SIN-APLICAR.md](deploy/MIGRACIONES-SIN-APLICAR.md)
      **antes del backup**: es la lista de migraciones que están en `main` y no
      en producción. Vacía = despliegue de solo código. El clasificador del paso 4
      las encuentra igual, pero para entonces el backup ya está sacado y la imagen
      construida — que es el peor momento para enterarse de que hay algo que
      decidir. Cuando una se aplica, se borra de esa lista.
- [ ] Backup de PostgreSQL validado **antes** de cualquier cosa (ver §3.bis)
- [ ] Migraciones aplicadas con un container one-off de la **imagen nueva**, ANTES de
      recrear la app — no con `docker exec` sobre el container viejo:
      `docker compose -f docker-compose.prod.yml run --rm --no-deps app prisma migrate deploy`
      (el CLI de prisma viene en la imagen: **sin `npx`**)
- [ ] Verificar endpoints críticos:
  - `GET /api/clientes/listar`
  - `GET /api/clientes/[id]/cuenta-corriente`
  - `GET /api/clientes/[id]/puntos`
  - `POST /api/pos-ventas/crear`
- [ ] Verificar que el login funciona correctamente
- [ ] Verificar que el sidebar muestra todos los módulos

## 3. Rollback

### Solo código (sin migración nueva)

```bash
git revert <hash-del-commit>
```

### Con migración aplicada

El rollback de migraciones Prisma es **manual**. Pasos:

1. Identificar el migration.sql aplicado
2. Escribir SQL inverso (DROP TABLE, DROP COLUMN, etc.)
3. Ejecutar el SQL inverso directamente en la base de datos
4. Eliminar la entrada de `_prisma_migrations` correspondiente
5. Revertir el commit de código

> **Importante:** Siempre hacer backup de la base de datos antes de aplicar migraciones en producción.

## 3.bis Despliegue a producción — procedimiento OFICIAL

**El VPS no construye la imagen.** La construye GitHub Actions
(`.github/workflows/build-imagen.yml`) y la publica en
`ghcr.io/islaemanuel25-glitch/erpmanual:<SHA_COMPLETO>`. El VPS solo descarga.

### Reglas duras

1. **Nunca `latest`**, nunca SHA corto. Solo el SHA completo de 40 caracteres: una
   etiqueta móvil impide saber qué versión corre y volver a una anterior.
2. Estos cinco valores **deben coincidir siempre**: SHA de `origin/main`, HEAD del VPS,
   tag de la imagen, `APP_BUILD_ID` dentro del container y lo que devuelve
   `/api/version`. Si alguno difiere, el despliegue está mal — parar.
3. **No ejecutar `docker build` ni `docker compose up --build` en el VPS.** Lo que lo
   impide es `pull_policy: missing`: cuando un servicio declara `build:`, el default de
   Compose es construir la imagen si falta.
4. **No `docker compose down`, no recrear PostgreSQL.** Siempre `--no-deps app`.
5. `APP_IMAGE` se define de forma persistente en `/srv/produccion/erpazul/.env`
   (el `.env` de Compose, permisos 600, gitignored). **Nunca en `.env.prod`**: ese es el
   `env_file` del container, sus variables no interpolan el compose y además terminarían
   dentro de la aplicación. Comprobable con
   `docker exec erpazul_app env | grep -c APP_IMAGE` → debe dar **0**.
6. **Conservar la imagen anterior** para poder volver atrás sin compilar.

### Secuencia

1. Backup de PostgreSQL y validarlo: `pg_dump` exit 0, `gzip -t`, encabezado, marca de
   cierre, conteo de `CREATE TABLE` y SHA-256. Va a `/srv/produccion/backups/`.
2. `git push origin main` normal, sin force.
3. Esperar que el workflow termine en **success**.
4. Validar la imagen **contra el registry**, no contra el log del workflow: tag, digest,
   `linux/amd64`, `APP_BUILD_ID` y label `org.opencontainers.image.revision`.
5. En el VPS, con árbol limpio y **solo fast-forward**: `git merge --ff-only origin/main`
6. `docker compose -f docker-compose.prod.yml pull app`
7. `docker compose -f docker-compose.prod.yml run --rm --no-deps app prisma migrate deploy`
8. `docker compose -f docker-compose.prod.yml up -d --no-deps app`
9. Verificar: PostgreSQL healthy, 0 reinicios, logs sin errores, `/login` 200 y
   `/api/version` igual al SHA desplegado.

### Rollback sin compilar

**Antes de cada despliegue hay que registrar el RepoTag fijo o el image ID exacto de la
imagen que está corriendo**, y conservarlos. Esa referencia fija es el único puntero
confiable para volver atrás:

```bash
docker inspect erpazul_app --format '{{.Image}}'          # image ID exacto
docker image inspect <ID> --format '{{.RepoTags}}'        # tags fijos disponibles
```

**No usar `erpazul-app:latest`** ni ninguna otra etiqueta móvil como referencia de
rollback: apunta a lo último que se construyó y mañana puede señalar otra imagen. Es la
misma razón por la que producción despliega solo por SHA completo.

El rollback es apuntar `APP_IMAGE` a esa referencia fija y repetir el paso 8 — sin
compilar. Por ejemplo, con el tag fijo vigente al escribir esto:

```bash
# en /srv/produccion/erpazul/.env
APP_IMAGE=erpazul-app:candidate-a563514
```

La rotación de credenciales **no** se revierte: la versión anterior debe levantar con la
contraseña nueva.

### Camino de emergencia — build local

Solo si GitHub Actions o GHCR no están disponibles. El build **debe** recibir el SHA del
commit: es la identidad que usa el guard de versión para detectar pestañas con un bundle
viejo (ver `lib/version/compararBuild.js`).

```bash
APP_BUILD_ID="$(git rev-parse HEAD)" \
  docker compose -f docker-compose.prod.yml build app
```

Sin la variable el build **falla** con un mensaje explícito: `docker-compose.prod.yml`
pasa `REQUIRE_BUILD_ID=1` y el `Dockerfile` corta antes de compilar. Es a
propósito — un guard inactivo por un argumento olvidado da falsa sensación de
protección.

El mismo valor viaja a los dos lados:

| Destino | Variable | Cuándo |
|---|---|---|
| Bundle del navegador | `NEXT_PUBLIC_BUILD_ID` | build time, etapa *builder* |
| Proceso del servidor | `APP_BUILD_ID` | runtime, etapa *runner* |

Verificación post-deploy (ambos deben devolver el SHA desplegado):

```bash
curl -s http://127.0.0.1:3000/api/version
docker exec erpazul_app sh -c 'grep -c "$(git -C /srv/produccion/erpazul rev-parse HEAD)" /app/.next/static/chunks/*.js | grep -v ":0" | head'
```

En desarrollo local la variable no existe y el guard queda inactivo: no molesta.

## 4. Notas de deploy

- **Tiempos reales medidos** en el primer despliegue por GHCR (commit `d2854dd`):
  build en el runner de GitHub **3 m 09 s** (con cache `type=gha`) y **0 s de CPU del
  VPS**; en el VPS, `pull` **57 s** + `up` **3 s** + recuperación del endpoint **5 s**.
- Antes, cuando el VPS compilaba, un deploy típico tardaba **~10-11 min** dominados por
  `next build` (Turbopack no reaprovecha `.next/cache`, así que ningún cache mount lo
  arreglaba) y el ERP se ponía lento porque el build competía por CPU y disco con la app
  y con PostgreSQL. Ese es el problema que resolvió la migración a GHCR.
- `docker compose -f docker-compose.prod.yml up -d --no-deps app` recrea el
  container con ~3-5 s de corte (502 vía nginx mientras Next arranca).
- El warning `The "POSTGRES_PASSWORD" variable is not set` es un **pendiente conocido de
  interpolación de Compose**. Mientras no se resuelva correctamente, **no ejecutar
  operaciones que creen o recreen el servicio `db`**. No silenciarlo duplicando el
  secreto en el `.env` de Compose. Los despliegues normales deben limitarse a
  `--no-deps app`.
- `docker compose run` **sin `-T` consume stdin**: si el comando llega por heredoc de
  `ssh`, se come el resto del script. Usar `-T` o redirigir `</dev/null`.
- **Nunca ejecutar `docker compose config` sin filtrar**: resuelve la interpolación y
  vuelca `POSTGRES_PASSWORD` en claro. Usar `config --images`, o filtrar la salida.
