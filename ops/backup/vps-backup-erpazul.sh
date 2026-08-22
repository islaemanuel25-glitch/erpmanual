#!/usr/bin/env bash
# Backup diario de la base de producción del ERP.
#
# Corre en el VPS por un timer de systemd de USUARIO (no root, no cron). Ver
# ops/backup/vps-backup-erpazul.timer y docs/RESTAURACION-BACKUP.md.
#
# ── QUÉ HACE ────────────────────────────────────────────────────────────────
# Saca un pg_dump comprimido, LO VERIFICA, y recién entonces rota los viejos.
# Si la verificación falla no borra nada y sale con error, para que el backup
# roto no desplace a uno bueno. Un backup que falla en silencio es peor que no
# tenerlo, porque uno cree que está cubierto.
#
# ── LAS TRES SERIES ─────────────────────────────────────────────────────────
# Se saca UN dump por día. Los domingos y el día 1 de cada mes ese mismo archivo
# recibe además un nombre de la serie correspondiente, con un ENLACE DURO: no se
# copia, así que no ocupa el doble, y borrar el diario no se lleva los datos
# mientras quede el semanal apuntando a ellos.
#
#   diario-*   los últimos 30
#   semanal-*  los últimos 12 (domingos)
#   mensual-*  los últimos 12 (día 1)
#
# Solo el semanal y el mensual salen del VPS hacia el repo cifrado; el diario
# queda acá y en la notebook.
#
# ── Y DESDE 2026-08-22, TAMBIÉN LAS FOTOS DE PRODUCTO ───────────────────────
#
# El volumen `erpazul_fotos_productos` entra a esta misma cadena, con su propio
# archivo y su propia rotación. NO se mezcla con el de comprobantes y no es una
# contradicción con DEC-0008: aquéllas se borran a los siete días por diseño y
# respaldarlas sería guardar lo que ya decidimos tirar. Éstas no se borran nunca
# y son parte del catálogo — si se pierde el volumen hay que sacar todas las
# fotos de nuevo, una por una. Está escrito en DEC-0009.
set -euo pipefail

DIR="/srv/produccion/backups"
CONTENEDOR="erpazul_db"
USUARIO_DB="erpazul"
BASE="erpazul"

# El volumen de fotos y el centinela que prueba que está montado. Los mismos
# nombres que usa `lib/productos/fotoProducto.js`: si se separan, el backup
# empaqueta un directorio vacío y nadie se entera.
VOLUMEN_FOTOS="erpazul_fotos_productos"
CENTINELA_FOTOS=".volumen-fotos-productos"

RETENER_DIARIOS=30
RETENER_SEMANALES=12
RETENER_MENSUALES=12

# ── LAS FOTOS RETIENEN MENOS COPIAS, Y POR UNA RAZÓN DE TAMAÑO ─────────────
#
# El dump de la base pesa unos 2,7 MB. El paquete de fotos crece con el catálogo:
# a 300 KB por foto, dos mil productos son unos 600 MB. Con 30 diarios serían 18
# GB en un VPS que no los tiene.
#
# Lo que hace que esto igual alcance es que las fotos NO CAMBIAN: el nombre lleva
# un azar adentro, así que una foto nueva es un archivo nuevo y ninguna se pisa.
# Cuando el volumen no cambió, el paquete del día es un ENLACE DURO al anterior y
# no ocupa nada. Ver "el paquete de fotos" más abajo.
RETENER_DIARIOS_FOTOS=14
RETENER_SEMANALES_FOTOS=8
RETENER_MENSUALES_FOTOS=12

FECHA="$(date +%Y%m%d_%H%M%S)"
DIA_SEMANA="$(date +%u)"   # 7 = domingo
DIA_MES="$(date +%d)"
MES="$(date +%Y%m)"

ARCHIVO="${DIR}/diario-${FECHA}.sql.gz"
FOTOS="${DIR}/fotos-diario-${FECHA}.tar.gz"

log() { echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] $*"; }

log "inicio: base ${BASE} en contenedor ${CONTENEDOR}"

# --no-owner/--no-acl: el dump se puede restaurar en cualquier instancia sin
# depender de que existan los mismos roles que en producción.
if ! docker exec "$CONTENEDOR" pg_dump -U "$USUARIO_DB" -d "$BASE" --no-owner --no-acl \
     | gzip -9 > "$ARCHIVO"; then
  log "ERROR: pg_dump falló. Se borra el archivo parcial."
  rm -f "$ARCHIVO"
  exit 1
fi

# ── Verificación, antes de rotar nada ──────────────────────────────────────
if ! gzip -t "$ARCHIVO" 2>/dev/null; then
  log "ERROR: el gzip está corrupto o truncado. No se rota."
  exit 1
fi

# pg_dump 16 cierra con la marca y después un token \unrestrict, así que se
# busca en las últimas líneas y no solo en la última.
if ! zcat "$ARCHIVO" | tail -20 | grep -q "PostgreSQL database dump complete"; then
  log "ERROR: falta la marca de cierre: el dump quedó incompleto. No se rota."
  exit 1
fi

TABLAS="$(zcat "$ARCHIVO" | grep -c '^CREATE TABLE' || true)"
if [ "$TABLAS" -lt 40 ]; then
  log "ERROR: solo ${TABLAS} tablas en el dump, se esperaban 50 o más. No se rota."
  exit 1
fi

BYTES="$(stat -c %s "$ARCHIVO")"
log "dump OK: ${BYTES} bytes, ${TABLAS} tablas"

# ── Series semanal y mensual, por enlace duro ──────────────────────────────
if [ "$DIA_SEMANA" = "7" ]; then
  ln -f "$ARCHIVO" "${DIR}/semanal-${FECHA}.sql.gz"
  log "marcado como semanal: semanal-${FECHA}.sql.gz"
fi
if [ "$DIA_MES" = "01" ]; then
  ln -f "$ARCHIVO" "${DIR}/mensual-${MES}.sql.gz"
  log "marcado como mensual: mensual-${MES}.sql.gz"
fi

# ── Listado seguro ─────────────────────────────────────────────────────────
# `ls` sale con error cuando el patrón no coincide con nada, y con `set -e` más
# `pipefail` eso mata el script. Pasa el primer día, cuando todavía no existe
# ningún semanal ni ningún mensual. El `|| true` es lo que lo evita.
listar() {
  # shellcheck disable=SC2012
  ls -1t ${DIR}/$1 2>/dev/null || true
}

# ── Rotación ───────────────────────────────────────────────────────────────
# `ls -1t` ordena por fecha de modificación; se conservan los N primeros.
rotar() {
  local patron="$1" cuantos="$2" nombre="$3" borrados=0
  for viejo in $(listar "$patron" | tail -n "+$((cuantos + 1))" || true); do
    rm -f "$viejo"
    borrados=$((borrados + 1))
  done
  [ "$borrados" -gt 0 ] && log "rotación ${nombre}: ${borrados} eliminados" || true
}
rotar "diario-*.sql.gz"  "$RETENER_DIARIOS"   "diarios"
rotar "semanal-*.sql.gz" "$RETENER_SEMANALES" "semanales"
rotar "mensual-*.sql.gz" "$RETENER_MENSUALES" "mensuales"

# ════════════════════════════════════════════════════════════════════════════
# EL PAQUETE DE FOTOS DE PRODUCTO
# ════════════════════════════════════════════════════════════════════════════
#
# ── POR QUÉ ESTO NO PUEDE MATAR EL BACKUP DE LA BASE ───────────────────────
#
# Va DESPUÉS de que el dump ya está verificado y rotado. Si el volumen de fotos
# no está montado, o el tar falla, se registra y se sale con un código propio —
# pero el dump del día ya quedó bueno en disco. Sin este orden, un problema con
# las fotos dejaría a la base sin backup, que es cambiar un riesgo chico por el
# más grande que hay.
respaldar_fotos() {
  # ── 1. EL VOLUMEN TIENE QUE ESTAR, Y CON SU CENTINELA ───────────────────
  #
  # El centinela es lo único que distingue un volumen montado de un directorio
  # vacío: Docker crea el punto de montaje igual. Sin este chequeo, el backup
  # empaquetaría una carpeta vacía todos los días y el archivo existiría, pesaría
  # unos bytes y no tendría nada adentro. Es la peor forma de fallar: parece que
  # hay respaldo.
  if ! docker volume inspect "$VOLUMEN_FOTOS" >/dev/null 2>&1; then
    log "FOTOS ERROR: el volumen ${VOLUMEN_FOTOS} no existe. No hay respaldo de fotos."
    return 1
  fi
  if ! docker run --rm -v "${VOLUMEN_FOTOS}:/vol:ro" alpine \
       test -f "/vol/${CENTINELA_FOTOS}" 2>/dev/null; then
    log "FOTOS ERROR: falta el centinela ${CENTINELA_FOTOS}: el volumen no está montado o está vacío."
    return 1
  fi

  # ── 2. EL PAQUETE ────────────────────────────────────────────────────────
  #
  # Se empaqueta desde un contenedor descartable en solo lectura. `-C /vol .`
  # para que adentro del tar las rutas sean relativas: restaurarlo no depende de
  # dónde estaba montado.
  if ! docker run --rm -v "${VOLUMEN_FOTOS}:/vol:ro" alpine \
       tar -czf - -C /vol . > "$FOTOS" 2>/dev/null; then
    log "FOTOS ERROR: el tar falló. Se borra el archivo parcial."
    rm -f "$FOTOS"
    return 1
  fi

  # ── 3. VERIFICACIÓN, ANTES DE ROTAR NADA ─────────────────────────────────
  #
  # Las mismas tres preguntas que se le hacen al dump, traducidas: que el gzip
  # esté entero, que el contenido sea el que se cree, y que la cantidad tenga
  # sentido. `gzip -t` solo no alcanza — un tar vacío está perfectamente bien
  # comprimido.
  if ! gzip -t "$FOTOS" 2>/dev/null; then
    log "FOTOS ERROR: el gzip está corrupto o truncado. No se rota."
    rm -f "$FOTOS"
    return 1
  fi

  local LISTADO CUANTAS
  if ! LISTADO="$(tar -tzf "$FOTOS" 2>/dev/null)"; then
    log "FOTOS ERROR: el tar no se puede listar: quedó incompleto. No se rota."
    rm -f "$FOTOS"
    return 1
  fi

  # EL CENTINELA TIENE QUE ESTAR ADENTRO DEL PAQUETE. Es la marca de cierre del
  # dump traducida a este formato: prueba que se empaquetó el volumen de verdad
  # y no un directorio que se le parecía.
  if ! printf '%s\n' "$LISTADO" | grep -q "${CENTINELA_FOTOS}\$"; then
    log "FOTOS ERROR: el paquete no contiene el centinela: se empaquetó otra cosa. No se rota."
    rm -f "$FOTOS"
    return 1
  fi

  # Y las fotos se cuentan por su FORMA, no por "todo lo que no sea el
  # centinela": un archivo suelto que alguien dejó ahí no es una foto.
  CUANTAS="$(printf '%s\n' "$LISTADO" | grep -cE '^\./p[0-9]+-[0-9a-f]{8}\.(webp|jpg|png)$' || true)"
  log "FOTOS: paquete con ${CUANTAS} foto(s), $(stat -c %s "$FOTOS") bytes"

  # CERO FOTOS NO ES UN ERROR y no se trata como tal: es lo que hay antes de que
  # alguien cargue la primera. Se registra para que se vea en el log, y el
  # paquete igual se guarda — con el centinela adentro es un respaldo válido de
  # un volumen vacío, que es distinto de no tener respaldo.
  if [ "$CUANTAS" -eq 0 ]; then
    log "FOTOS: todavía no hay ninguna foto cargada. El paquete es válido igual."
  fi

  # ── 4. SI NADA CAMBIÓ, ES UN ENLACE DURO Y NO OCUPA ──────────────────────
  #
  # Las fotos no se pisan nunca —el nombre lleva un azar adentro— así que de un
  # día para el otro el volumen casi siempre es idéntico. Guardar 14 copias
  # completas de 600 MB sería 8 GB para respaldar lo mismo catorce veces.
  #
  # Se compara el LISTADO, no el archivo: dos tar del mismo contenido no dan
  # bytes idénticos —llevan la fecha adentro— así que compararlos por hash del
  # .gz diría "cambió" siempre.
  local HUELLA HUELLA_PREVIA ANTERIOR
  HUELLA="$(printf '%s\n' "$LISTADO" | sort | sha256sum | cut -d' ' -f1)"
  HUELLA_PREVIA="$(cat "${DIR}/FOTOS_HUELLA.txt" 2>/dev/null || true)"
  ANTERIOR="$(listar 'fotos-diario-*.tar.gz' | sed -n 2p || true)"

  if [ -n "$ANTERIOR" ] && [ "$HUELLA" = "$HUELLA_PREVIA" ]; then
    rm -f "$FOTOS"
    ln -f "$ANTERIOR" "$FOTOS"
    log "FOTOS: sin cambios desde el anterior; el paquete del día es un enlace duro."
  fi
  printf '%s\n' "$HUELLA" > "${DIR}/FOTOS_HUELLA.txt"

  # ── 5. Series y rotación, con el mismo criterio que la base ──────────────
  if [ "$DIA_SEMANA" = "7" ]; then
    ln -f "$FOTOS" "${DIR}/fotos-semanal-${FECHA}.tar.gz"
    log "FOTOS: marcado como semanal"
  fi
  if [ "$DIA_MES" = "01" ]; then
    ln -f "$FOTOS" "${DIR}/fotos-mensual-${MES}.tar.gz"
    log "FOTOS: marcado como mensual"
  fi

  rotar "fotos-diario-*.tar.gz"  "$RETENER_DIARIOS_FOTOS"   "fotos diarias"
  rotar "fotos-semanal-*.tar.gz" "$RETENER_SEMANALES_FOTOS" "fotos semanales"
  rotar "fotos-mensual-*.tar.gz" "$RETENER_MENSUALES_FOTOS" "fotos mensuales"

  puntero "fotos-diario-*.tar.gz"  "${DIR}/ULTIMO_FOTOS_DIARIO.txt"
  puntero "fotos-semanal-*.tar.gz" "${DIR}/ULTIMO_FOTOS_SEMANAL.txt"
  puntero "fotos-mensual-*.tar.gz" "${DIR}/ULTIMO_FOTOS_MENSUAL.txt"
  return 0
}

# La invocación va AL FINAL DEL ARCHIVO, no acá. `respaldar_fotos` usa `puntero`,
# que se define más abajo, y en bash una función tiene que estar definida antes
# de llamarla — llamarla acá moriría con "puntero: command not found" justo en la
# parte que escribe los punteros, o sea después de haber empaquetado bien.

# ── Punteros para la notebook ──────────────────────────────────────────────
# La tarea de Windows lee estos archivos en vez de adivinar el nombre del día.
# Siempre se escriben los tres, aunque queden vacíos: que el archivo exista y
# esté vacío es información —"todavía no hay semanal"—, y su ausencia sería
# ambigua con un fallo de conexión.
puntero() {
  local patron="$1" destino="$2" primero
  primero="$(listar "$patron" | head -1 || true)"
  if [ -n "$primero" ]; then basename "$primero" > "$destino"; else : > "$destino"; fi
}
puntero "diario-*.sql.gz"  "${DIR}/ULTIMO_DIARIO.txt"
puntero "semanal-*.sql.gz" "${DIR}/ULTIMO_SEMANAL.txt"
puntero "mensual-*.sql.gz" "${DIR}/ULTIMO_MENSUAL.txt"

# ── LAS FOTOS, ÚLTIMAS Y SIN PODER ARRUINAR LO ANTERIOR ────────────────────
#
# Acá el dump ya está sacado, verificado, rotado y con sus punteros escritos. Si
# el volumen de fotos no está o el tar falla, esto devuelve 1 y el servicio queda
# en rojo —que es lo que corresponde— pero el backup de la base del día ya está
# bueno en disco. Al revés, un problema con las fotos dejaría a la base sin
# respaldo: se cambiaría un riesgo chico por el más grande que hay.
FALLO_FOTOS=0
respaldar_fotos || FALLO_FOTOS=1

log "fin: $(listar 'diario-*.sql.gz' | wc -l) diarios, $(listar 'semanal-*.sql.gz' | wc -l) semanales, $(listar 'mensual-*.sql.gz' | wc -l) mensuales"
log "fin fotos: $(listar 'fotos-diario-*.tar.gz' | wc -l) diarios, $(listar 'fotos-semanal-*.tar.gz' | wc -l) semanales, $(listar 'fotos-mensual-*.tar.gz' | wc -l) mensuales"

if [ "$FALLO_FOTOS" -ne 0 ]; then
  log "ERROR: el backup de la base salió bien, pero el de fotos NO. Ver arriba el motivo."
  exit 3
fi
