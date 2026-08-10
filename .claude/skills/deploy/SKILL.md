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

**Entre el segundo y el tercero va el chequeo de migraciones**, que está más
abajo y puede frenar el deploy. No se saltea aunque el despliegue "no traiga
migraciones": eso es justamente lo que el chequeo comprueba.

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
corre es el viejo**. Son segundos, pero existen y hay tráfico real: la app vieja
sigue atendiendo pedidos contra el esquema nuevo.

**LA REGLA (decidida el 2026-08-09, obligatoria desde acá):** toda migración que
se despliegue mientras la versión anterior sigue atendiendo tráfico tiene que ser
**compatible hacia atrás con esa versión** durante toda la ventana. Las
migraciones destructivas o incompatibles **no pasan por este flujo**: necesitan
estrategia por fases —agregar, desplegar el código que usa lo nuevo, y recién en
un despliegue posterior borrar lo viejo— y se planean aparte.

**LO OBSERVADO, que es distinto y no la respalda:** el repo tiene 81 migraciones
y **14 contienen sentencias destructivas** —`DROP COLUMN` sobre `Proveedor` y
sobre `AuditoriaBitacora`, `DROP INDEX`, cambios de tipo de columna—, enumeradas
con `grep -l -iE 'DROP (COLUMN|TABLE|CONSTRAINT|INDEX|TYPE)|RENAME (COLUMN|TO)|SET NOT NULL|ALTER COLUMN .* TYPE|TRUNCATE|DELETE FROM' prisma/migrations/*/migration.sql`.
Todas se desplegaron por este mismo flujo como si fueran aditivas. No rompió
nada visible, pero eso es suerte y poco tráfico, no una garantía. La regla existe
justamente porque la costumbre **no** era la que se creía.

### El chequeo que frena el deploy — antes de migrar

Una regla que solo vive en un documento se viola en silencio la primera vez.
Antes del `migrate deploy`, clasificar lo que este despliegue introduce:

```bash
SHA_VPS="$(ssh vps-erp 'cd /srv/produccion/erpazul && git rev-parse HEAD')"
git diff --name-only "$SHA_VPS"..HEAD -- prisma/migrations | grep 'migration.sql$' | while read -r f; do
  if grep -q -iE 'DROP (COLUMN|TABLE|CONSTRAINT|INDEX|TYPE)|RENAME (COLUMN|TO)|SET NOT NULL|ALTER COLUMN .* TYPE|TRUNCATE|DELETE FROM|^UPDATE ' "$f"; then
    echo "NO ADITIVA: $f"; else echo "aditiva:    $f"; fi
done
```

El rango se saca del HEAD del VPS, no de `migrate status`: son exactamente las
migraciones que este despliegue introduce sobre lo que hoy corre.

**Si aparece una sola línea `NO ADITIVA`, el deploy se frena acá.** No se
continúa por criterio propio: se le informa a Emanuel qué migración es, qué
sentencia la marcó y por qué rompería a la versión que está atendiendo, y se
espera confirmación explícita. Puede ser un falso positivo —un `DROP INDEX IF
EXISTS` sobre un índice que ya no usa nadie lo es— y confirmarlo es de él, no del
que está desplegando.

**El clasificador es por patrón de texto y no es confiable.** No entiende
contexto: no distingue un `DROP COLUMN` de una columna muerta de uno de una
columna en uso, no lee `UPDATE` dentro de un bloque `DO $$`, y no ve una
migración incompatible que no use ninguna de estas palabras —un `CREATE UNIQUE
INDEX` sobre datos con duplicados, por ejemplo, falla y no aparece acá—. Sirve
para frenar, no para autorizar. **Que dé todo "aditiva" no es un permiso**: si
hay cualquier duda sobre una migración, se frena igual y se pregunta.

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
paso de recrear. Sin compilar, sin `build`. Este camino sí se usó.

### Rollback de una migración: NUNCA SE EJECUTÓ

El procedimiento existe y está en `docs/RELEASE-CHECKLIST.md` §3: identificar el
`migration.sql` aplicado, escribir el SQL inverso, ejecutarlo contra la base,
borrar la entrada de `_prisma_migrations` y recién ahí revertir el código.

**No es un mecanismo probado.** Nunca se ejecutó ni se verificó de punta a punta,
ni en producción ni en una copia. Está escrito, no está validado, y la diferencia
importa el día que haga falta: los cuatro pasos tienen orden y un error en
`_prisma_migrations` deja la base en un estado que `migrate deploy` no sabe
resolver.

Antes de considerarlo confiable necesita una prueba segura: restaurar un dump en
una base descartable, aplicar la migración, revertirla siguiendo los cuatro pasos
y comprobar que `migrate status` queda coherente y que la versión anterior
levanta. **Esa prueba no se hace en producción**, y hasta que se haga, el
rollback de código es la única vuelta atrás con evidencia.

## Referencia larga

`docs/RELEASE-CHECKLIST.md` — §3.bis tiene el procedimiento oficial con la
justificación de cada regla, §3 el rollback con migración aplicada, y §4 los
tiempos reales medidos y el camino de emergencia con build local (solo si Actions
o GHCR no están disponibles; el build **debe** recibir `APP_BUILD_ID` o falla a
propósito). Leerlo cuando algo se sale de la secuencia de arriba.
