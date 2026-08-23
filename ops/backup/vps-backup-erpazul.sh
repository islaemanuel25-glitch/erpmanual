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

# ── LAS PIEZAS COMPARTIDAS Y EL RESPALDO DE FOTOS ──────────────────────────
#
# `comunes.sh` trae log, listar, rotar y puntero. `respaldar-fotos.sh` trae
# respaldar_fotos, restaurar_fotos y verificar_restauracion.
#
# Están en archivos aparte por una razón concreta: así la PRUEBA de restauración
# carga y corre LAS MISMAS funciones que corren acá, en vez de una copia parecida
# escrita en un test. Una copia no la atrapa ningún candado — las dos andarían.
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ops/backup/comunes.sh
. "${AQUI}/comunes.sh"
# shellcheck source=ops/backup/respaldar-fotos.sh
. "${AQUI}/respaldar-fotos.sh"

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


rotar "diario-*.sql.gz"  "$RETENER_DIARIOS"   "diarios"
rotar "semanal-*.sql.gz" "$RETENER_SEMANALES" "semanales"
rotar "mensual-*.sql.gz" "$RETENER_MENSUALES" "mensuales"

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
