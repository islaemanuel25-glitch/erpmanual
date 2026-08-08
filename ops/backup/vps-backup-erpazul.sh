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
set -euo pipefail

DIR="/srv/produccion/backups"
CONTENEDOR="erpazul_db"
USUARIO_DB="erpazul"
BASE="erpazul"

RETENER_DIARIOS=30
RETENER_SEMANALES=12
RETENER_MENSUALES=12

FECHA="$(date +%Y%m%d_%H%M%S)"
DIA_SEMANA="$(date +%u)"   # 7 = domingo
DIA_MES="$(date +%d)"
MES="$(date +%Y%m)"

ARCHIVO="${DIR}/diario-${FECHA}.sql.gz"

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

log "fin: $(listar 'diario-*.sql.gz' | wc -l) diarios, $(listar 'semanal-*.sql.gz' | wc -l) semanales, $(listar 'mensual-*.sql.gz' | wc -l) mensuales"
