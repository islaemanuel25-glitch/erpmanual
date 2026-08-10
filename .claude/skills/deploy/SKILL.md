---
name: deploy
description: Despliegue a producción por GHCR — backup validado, referencia de rollback, pull, migración en contenedor descartable, recrear solo app y verificación de cierre.
disable-model-invocation: true
allowed-tools: Bash, Read, Grep
---

# Desplegar a producción

**El VPS no construye la imagen.** La construye GitHub Actions
(`.github/workflows/build-imagen.yml`) y la publica en
`ghcr.io/islaemanuel25-glitch/erpmanual:<SHA_COMPLETO>`. El VPS solo descarga.

Datos del entorno: alias ssh `vps-erp`, directorio `/srv/produccion/erpazul`,
compose `docker-compose.prod.yml`, contenedores `erpazul_app` y `erpazul_db`,
dominio `https://operix.cloud`, backups en `/srv/produccion/backups/`.

## Las seis reglas duras

1. **Nunca `latest`, nunca SHA corto.** Solo el SHA completo de 40 caracteres.
   Una etiqueta móvil impide saber qué versión corre y volver a una anterior.
2. **Cinco valores tienen que coincidir siempre**: SHA de `origin/main`, HEAD del
   VPS, tag de la imagen, `APP_BUILD_ID` dentro del contenedor y lo que devuelve
   `/api/version`. Si alguno difiere, el despliegue está mal — parar.
3. **Nunca `docker build` ni `docker compose up --build` en el VPS.** Lo que hoy
   lo impide es `pull_policy: missing`: cuando un servicio declara `build:`, el
   default de Compose es construir la imagen si falta.
4. **Nunca `docker compose down`. Nunca recrear PostgreSQL.** Siempre
   `--no-deps app`. El servicio `db` fue creado fuera de Compose y hay un
   pendiente conocido de interpolación de `POSTGRES_PASSWORD`: recrearlo lo
   levantaría sin contraseña.
5. `APP_IMAGE` va en `/srv/produccion/erpazul/.env` (el `.env` de Compose,
   permisos 600, gitignored). **Nunca en `.env.prod`**: ese es el `env_file` del
   contenedor, sus variables no interpolan el compose y además terminarían
   dentro de la aplicación.
6. **Registrar la referencia de rollback antes de tocar nada**, y conservarla.

## Antes de empezar

- Árbol limpio y todo commiteado. `git status` de la máquina local.
- Suite en verde: `git ls-files "*.test.mjs"` para enumerar, y correrlos con
  `node --import ./scripts/alias-loader.mjs --test <archivos>`.
- Si se tocó `prisma/schema.prisma`, `npx prisma generate` local antes de probar
  nada: ni el build ni los candados lo ven.
- `npm run build` compila sin errores.

## Paso 1 — Backup validado

Antes de cualquier otra cosa, y no se saltea. El procedimiento de backup y sus
trampas están en el skill `/backup`; acá alcanza con sacar uno y validarlo:

```bash
ssh vps-erp 'docker exec erpazul_db pg_dump -U erpazul -d erpazul --no-owner --no-acl \
  | gzip -9 > /srv/produccion/backups/pre-<SHA_CORTO>_$(date +%Y%m%d_%H%M%S).sql.gz'
```

Y validarlo en el VPS, los cuatro chequeos: `pg_dump` salió con 0, `gzip -t` sin
salida, la marca `PostgreSQL database dump complete` en las últimas 20 líneas
(pg_dump 16 cierra con la marca y después un token `\unrestrict`, así que buscar
solo en la última línea da falso negativo), y 40 tablas o más con
`grep -c '^CREATE TABLE'`.

## Paso 2 — Registrar la referencia de rollback

```bash
ssh vps-erp 'docker inspect erpazul_app --format "{{.Image}}"'
ssh vps-erp 'docker image inspect <ID> --format "{{.RepoTags}}"'
```

Anotar el **image ID exacto o el RepoTag fijo** en el informe. **No sirve
`erpazul-app:latest`** ni ninguna etiqueta móvil: apunta a lo último que se
construyó y mañana puede señalar otra imagen. Es la misma razón por la que
producción despliega solo por SHA completo.

## Paso 3 — Publicar la imagen

```bash
git push origin main          # normal, sin force
gh run list --limit 3         # esperar success, no seguir antes
```

Validar la imagen **contra el registry**, no contra el log del workflow: tag,
digest, `linux/amd64`, `APP_BUILD_ID` y el label
`org.opencontainers.image.revision`.

## Paso 4 — Desplegar en el VPS

Cuatro comandos, en este orden. Cada uno con `-T` o `</dev/null` si viaja por
heredoc de ssh (ver trampas).

```bash
ssh vps-erp 'cd /srv/produccion/erpazul && git merge --ff-only origin/main'
ssh vps-erp 'cd /srv/produccion/erpazul && docker compose -f docker-compose.prod.yml pull app'
ssh vps-erp 'cd /srv/produccion/erpazul && docker compose -f docker-compose.prod.yml run --rm -T --no-deps app prisma migrate deploy'
ssh vps-erp 'cd /srv/produccion/erpazul && docker compose -f docker-compose.prod.yml up -d --no-deps app'
```

Antes del cuarto, actualizar `APP_IMAGE` en `/srv/produccion/erpazul/.env` al SHA
completo nuevo.

`git merge --ff-only`: si el VPS tiene algo que no está en `origin/main`, el
merge falla en vez de fabricar un commit de merge en producción.

Sobre `prisma migrate deploy`: **sin `npx`** — el CLI viene en la imagen — y en
un contenedor descartable **de la imagen nueva**, nunca con `docker exec` sobre
el contenedor viejo, que tiene el cliente Prisma anterior.

### La ventana entre migrar y recrear

Entre el paso de migrar y el de recrear, **el esquema es nuevo y el código que
corre es el viejo**. Son segundos, pero existen y hay tráfico real.

Por eso las migraciones son aditivas en la práctica de este repo: columnas
nullable, `ALTER TYPE ... ADD VALUE IF NOT EXISTS`, índices nuevos. Una columna
borrada o un `NOT NULL` sin default rompen al código viejo durante esa ventana.

Si una migración **no** es aditiva, esta secuencia no alcanza y hay que
planearla aparte. No está escrito como regla en ningún lado del repo: es lo que
hacen todas las migraciones existentes.

## Paso 5 — Verificación de cierre

No se cierra el despliegue sin esto. Los cinco valores tienen que dar el **mismo
SHA completo**:

```bash
git rev-parse origin/main
ssh vps-erp 'cd /srv/produccion/erpazul && git rev-parse HEAD'
ssh vps-erp 'docker inspect erpazul_app --format "{{.Config.Image}}"'
ssh vps-erp 'docker exec erpazul_app printenv APP_BUILD_ID'
curl -s https://operix.cloud/api/version
```

Y el estado del sistema:

```bash
ssh vps-erp 'docker ps --filter name=erpazul --format "{{.Names}} {{.Status}}"'
ssh vps-erp 'docker inspect erpazul_app --format "{{.RestartCount}}"'      # 0
ssh vps-erp 'docker logs erpazul_app --since 10m 2>&1 | grep -iE "error|fatal" | head'
ssh vps-erp 'cd /srv/produccion/erpazul && docker compose -f docker-compose.prod.yml run --rm -T --no-deps app prisma migrate status'
curl -s -o /dev/null -w "%{http_code}\n" https://operix.cloud/login   # 200
ssh vps-erp 'cd /srv/produccion/erpazul && git status --porcelain'    # vacío
```

PostgreSQL healthy, 0 reinicios, logs sin errores, migraciones al día, `/login`
en 200 y el árbol del VPS limpio. Si algo de esto no da, se informa — no se
maquilla.

## Trampas ya conocidas

- **`docker compose run` sin `-T` consume stdin.** Si el comando llega por
  heredoc de `ssh`, se come el resto del script y los pasos siguientes no
  corren. Usar `-T` o redirigir `</dev/null`.
- **Nunca `docker compose config` sin filtrar**: resuelve la interpolación y
  vuelca `POSTGRES_PASSWORD` en claro. Usar `config --images` o filtrar. Tampoco
  imprimir `DATABASE_URL` ni el contenido de `.env.prod`.
- **El warning `The "POSTGRES_PASSWORD" variable is not set`** es el pendiente
  conocido de interpolación. Mientras no se resuelva, **no ejecutar nada que
  cree o recree el servicio `db`**, y no silenciarlo duplicando el secreto en el
  `.env` de Compose.
- **`APP_IMAGE` dentro del contenedor tiene que dar 0**:
  `docker exec erpazul_app env | grep -c APP_IMAGE`. Si da 1, está en el archivo
  equivocado.
- **Un 404 de `curl` contra un servidor recién levantado no distingue "no existe
  la ruta" de "no llegaste bien".** Confirmar que el proceso terminó de arrancar
  antes de sacar conclusiones.
- La rotación de credenciales **no** se revierte con el rollback: la versión
  anterior tiene que levantar con la contraseña nueva.

## Rollback sin compilar

Apuntar `APP_IMAGE` a la referencia fija registrada en el paso 2 y repetir el
paso de recrear. Sin compilar, sin `build`.

Si hubo migración aplicada, el rollback de Prisma es **manual**: escribir el SQL
inverso, ejecutarlo, borrar la entrada de `_prisma_migrations` y recién ahí
revertir el código.

## Referencia larga

`docs/RELEASE-CHECKLIST.md` — §3.bis tiene el procedimiento oficial con la
justificación de cada regla, §3 el rollback con migración aplicada, y §4 los
tiempos reales medidos y el camino de emergencia con build local (solo si Actions
o GHCR no están disponibles; el build **debe** recibir `APP_BUILD_ID` o falla a
propósito). Leerlo cuando algo se sale de la secuencia de arriba.
