# EL RESPALDO DEL VOLUMEN DE FOTOS DE PRODUCTO.
#
# Esto NO se ejecuta solo: lo carga `vps-backup-erpazul.sh` con `source`. Está en
# su propio archivo por una razón concreta y no por prolijidad — así el
# procedimiento de restauración puede cargarlo y correr LA MISMA función que
# corre en producción, en vez de una copia parecida escrita en un test.
#
# Espera que quien lo cargue ya haya definido `log`, `listar`, `rotar` y
# `puntero`, que son de `comunes.sh`.
#
# ── LAS DOS FORMAS DE LLEGAR AL VOLUMEN ────────────────────────────────────
#
# En el VPS el volumen es de Docker y se lee con un contenedor descartable. En la
# máquina donde se PRUEBA la restauración puede no haber Docker, y ahí el
# "volumen" es un directorio común.
#
# La diferencia está aislada en dos funciones y nada más. Todo lo que importa
# —las cuatro verificaciones, la huella, el enlace duro, la rotación y los
# punteros— es el mismo código en los dos casos. Sin esta separación, probar la
# restauración obligaba a reescribir el respaldo al lado, que es exactamente la
# copia que ningún candado atrapa.
#
# `FOTOS_DIR_DIRECTO` es lo que elige el camino: con valor, se lee ese directorio;
# vacío, se usa Docker. En producción NUNCA se define.

# ── VARIABLES, TODAS CON DEFAULT DE PRODUCCIÓN ─────────────────────────────
#
# Se pueden pisar desde afuera para poder ejercer esto sin tocar nada real. El
# default es el de producción, así que el script del VPS no necesita declararlas.
: "${DIR:=/srv/produccion/backups}"
: "${VOLUMEN_FOTOS:=erpazul_fotos_productos}"
: "${CENTINELA_FOTOS:=.volumen-fotos-productos}"
: "${FOTOS_DIR_DIRECTO:=}"
: "${RETENER_DIARIOS_FOTOS:=14}"
: "${RETENER_SEMANALES_FOTOS:=8}"
: "${RETENER_MENSUALES_FOTOS:=12}"

# El patrón de un nombre de foto. Tiene que ser el mismo que
# `esNombreDeFotoValido` de `lib/productos/fotoProducto.js`, y hay un candado que
# los compara caso por caso.
#
# ── NO SE ESCRIBE CON `${VAR:=...}`, Y ES UN DEFECTO YA COMETIDO ──────────
#
# La primera versión decía `: "${PATRON_FOTO:=^\./p[0-9]+-[0-9a-f]{8}\....}"`, y
# bash CORTA ese default en la primera llave de cierre — la de `{8}`. El patrón
# quedaba en `^\./p[0-9]+-[0-9a-f]{8` y no matcheaba ningún nombre.
#
# Eso no rompía nada visible: el respaldo se hacía igual, el paquete quedaba bien
# y el log decía "paquete con 0 foto(s)" para siempre. O sea que la verificación
# de la restauración compararía 0 contra 0 y daría verde sobre un volumen lleno.
# Lo encontró la prueba de restauración, no la lectura.
if [ -z "${PATRON_FOTO:-}" ]; then
  PATRON_FOTO='^\./p[0-9]+-[0-9a-f]{8}\.(webp|jpg|png)$'
fi

# ¿El volumen existe y se puede leer?
volumen_disponible() {
  if [ -n "$FOTOS_DIR_DIRECTO" ]; then
    [ -d "$FOTOS_DIR_DIRECTO" ]
    return
  fi
  docker volume inspect "$VOLUMEN_FOTOS" >/dev/null 2>&1
}

# ¿Está el centinela adentro? Es lo único que distingue un volumen montado de un
# directorio vacío: Docker crea el punto de montaje igual.
centinela_presente() {
  if [ -n "$FOTOS_DIR_DIRECTO" ]; then
    [ -f "${FOTOS_DIR_DIRECTO}/${CENTINELA_FOTOS}" ]
    return
  fi
  docker run --rm -v "${VOLUMEN_FOTOS}:/vol:ro" alpine \
    test -f "/vol/${CENTINELA_FOTOS}" 2>/dev/null
}

# Emite el tar.gz del volumen por la salida estándar.
#
# `-C <raíz> .` en los dos caminos: adentro del tar las rutas son relativas, así
# restaurar no depende de dónde estaba montado.
empaquetar_volumen() {
  if [ -n "$FOTOS_DIR_DIRECTO" ]; then
    tar -czf - -C "$FOTOS_DIR_DIRECTO" .
    return
  fi
  docker run --rm -v "${VOLUMEN_FOTOS}:/vol:ro" alpine tar -czf - -C /vol . 2>/dev/null
}

# ════════════════════════════════════════════════════════════════════════════
# EL RESPALDO
# ════════════════════════════════════════════════════════════════════════════
#
# ── POR QUÉ ESTO NO PUEDE MATAR EL BACKUP DE LA BASE ───────────────────────
#
# El que lo llama lo hace DESPUÉS de que el dump ya está verificado y rotado. Si
# el volumen no está montado, o el tar falla, se registra y se devuelve 1 — pero
# el dump del día ya quedó bueno en disco. Al revés se cambiaría un riesgo chico
# por el más grande que hay.
respaldar_fotos() {
  local FOTOS="${DIR}/fotos-diario-${FECHA}.tar.gz"

  # ── 1. EL VOLUMEN TIENE QUE ESTAR, Y CON SU CENTINELA ───────────────────
  #
  # Sin este chequeo el backup empaquetaría una carpeta vacía todos los días: el
  # archivo existiría, pesaría unos bytes y no tendría nada adentro. Es la peor
  # forma de fallar, porque parece que hay respaldo.
  if ! volumen_disponible; then
    log "FOTOS ERROR: el volumen ${VOLUMEN_FOTOS} no existe. No hay respaldo de fotos."
    return 1
  fi
  if ! centinela_presente; then
    log "FOTOS ERROR: falta el centinela ${CENTINELA_FOTOS}: el volumen no está montado o está vacío."
    return 1
  fi

  # ── 2. EL PAQUETE ────────────────────────────────────────────────────────
  if ! empaquetar_volumen > "$FOTOS"; then
    log "FOTOS ERROR: el tar falló. Se borra el archivo parcial."
    rm -f "$FOTOS"
    return 1
  fi

  # ── 3. VERIFICACIÓN, ANTES DE ROTAR NADA ─────────────────────────────────
  #
  # Las mismas tres preguntas que se le hacen al dump, traducidas: que el gzip
  # esté entero, que el contenido sea el que se cree, y que la cantidad tenga
  # sentido. `gzip -t` solo NO alcanza — un tar vacío está perfectamente bien
  # comprimido, y eso está ejercido en el candado.
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
  CUANTAS="$(printf '%s\n' "$LISTADO" | grep -cE "$PATRON_FOTO" || true)"
  log "FOTOS: paquete con ${CUANTAS} foto(s), $(stat -c %s "$FOTOS") bytes"

  # CERO FOTOS NO ES UN ERROR: es lo que hay antes de que alguien cargue la
  # primera. Se registra y el paquete se guarda igual — con el centinela adentro
  # es un respaldo válido de un volumen vacío, que es distinto de no tener nada.
  if [ "$CUANTAS" -eq 0 ]; then
    log "FOTOS: todavía no hay ninguna foto cargada. El paquete es válido igual."
  fi

  # ── 4. SI NADA CAMBIÓ, ES UN ENLACE DURO Y NO OCUPA ──────────────────────
  #
  # Las fotos no se pisan nunca —el nombre lleva un azar adentro— así que de un
  # día para el otro el volumen casi siempre es idéntico. Guardar catorce copias
  # completas sería respaldar lo mismo catorce veces.
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

# ════════════════════════════════════════════════════════════════════════════
# LA RESTAURACIÓN
# ════════════════════════════════════════════════════════════════════════════
#
# Está acá, al lado del respaldo, y no solo escrita en el runbook. El motivo es
# el de siempre: un procedimiento que solo vive en prosa no se puede correr, y
# uno que no se corre no se sabe si anda. Teniéndolo acá, la prueba ejerce ESTO y
# no una transcripción de los pasos.
#
# `destino` es un directorio; en el VPS se le pasa el punto de montaje de un
# volumen descartable. NO crea el volumen ni lo monta: eso es del que la llama.
restaurar_fotos() {
  local paquete="$1" destino="$2"
  if [ ! -f "$paquete" ]; then
    log "RESTAURAR ERROR: no existe el paquete ${paquete}"
    return 1
  fi
  mkdir -p "$destino"
  if ! tar -xzf "$paquete" -C "$destino"; then
    log "RESTAURAR ERROR: no se pudo extraer ${paquete}"
    return 1
  fi
  return 0
}

# ¿La restauración quedó bien? Devuelve el conteo por la salida estándar y 1 si
# algo no cierra.
#
# ── LO QUE HACE QUE ESTO VALGA ────────────────────────────────────────────
#
# Que el `tar -xzf` salga con 0 no dice nada: un paquete cortado a la mitad
# tampoco falla al extraer, deja los archivos que alcanzó y se va. Por eso se
# cuenta y se compara contra el número que el respaldo registró.
verificar_restauracion() {
  local destino="$1" esperadas="$2" cuantas
  if [ ! -f "${destino}/${CENTINELA_FOTOS}" ]; then
    log "RESTAURAR ERROR: falta el centinela en lo restaurado"
    return 1
  fi
  cuantas="$(cd "$destino" && ls -1 2>/dev/null | grep -cE "$(printf '%s' "$PATRON_FOTO" | sed 's#\^\\\./#^#')" || true)"
  if [ "$cuantas" != "$esperadas" ]; then
    log "RESTAURAR ERROR: se restauraron ${cuantas} foto(s) y el respaldo registró ${esperadas}"
    return 1
  fi
  log "RESTAURAR: ${cuantas} foto(s) y el centinela, contra las ${esperadas} que registró el respaldo"
  printf '%s\n' "$cuantas"
  return 0
}
