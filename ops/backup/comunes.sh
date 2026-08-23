# LAS PIEZAS QUE COMPARTEN EL RESPALDO DE LA BASE Y EL DE LAS FOTOS.
#
# Se cargan con `source`. Estaban adentro de `vps-backup-erpazul.sh` y salieron
# acá cuando el respaldo de fotos se separó a su propio archivo: sin esto, la
# única forma de que las fotos rotaran igual que la base era copiar `rotar` al
# lado, y una copia no la atrapa ningún candado — las dos andarían, y el día que
# una se arregle la otra se queda con el defecto.
#
# Esperan que `DIR` esté definido.

log() { echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] $*"; }

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

# ── Punteros ───────────────────────────────────────────────────────────────
# La tarea de Windows los lee en vez de adivinar el nombre del día. Siempre se
# escriben, aunque queden vacíos: que el archivo exista y esté vacío es
# información —"todavía no hay semanal"—, y su ausencia sería ambigua con un
# fallo de conexión.
puntero() {
  local patron="$1" destino="$2" primero
  primero="$(listar "$patron" | head -1 || true)"
  if [ -n "$primero" ]; then basename "$primero" > "$destino"; else : > "$destino"; fi
}
