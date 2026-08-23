#!/usr/bin/env bash
# LA PRUEBA DE LA RESTAURACIÓN DE FOTOS, DE PUNTA A PUNTA.
#
# ── QUÉ EJERCE, Y POR QUÉ NO ES UNA TRANSCRIPCIÓN DEL RUNBOOK ──────────────
#
# Carga `respaldar-fotos.sh` —el MISMO archivo que carga el backup de
# producción— y llama a `respaldar_fotos`, `restaurar_fotos` y
# `verificar_restauracion`. No reescribe los pasos: los corre.
#
# Es la diferencia entre un procedimiento escrito y uno probado, que es la misma
# distinción que este repo ya tiene anotada para el rollback de migraciones.
#
# ── LO QUE NO EJERCE, Y SE DICE ────────────────────────────────────────────
#
# El envoltorio de Docker. En producción el volumen se lee con
# `docker run --rm -v vol:/vol:ro alpine tar ...`; acá se lee un directorio
# directo, por `FOTOS_DIR_DIRECTO`. Son las dos ramas de tres funciones cortas
# —`volumen_disponible`, `centinela_presente`, `empaquetar_volumen`— y lo único
# que cambia entre ellas es cómo se llega a los bytes: el `-C <raíz> .` y todo lo
# que viene después es el mismo código.
#
# Queda dicho para que nadie lea "restauración ejercida" y crea que también se
# probó el montaje del volumen. Eso se prueba en el VPS, la primera vez.
#
# NO TOCA PRODUCCIÓN: todo pasa en un directorio temporal que se borra al final.
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BANCO="$(mktemp -d)"
export DIR="${BANCO}/backups"
export FOTOS_DIR_DIRECTO="${BANCO}/volumen"
export CENTINELA_FOTOS=".volumen-fotos-productos"
export VOLUMEN_FOTOS="prueba_fotos_descartable"
mkdir -p "$DIR" "$FOTOS_DIR_DIRECTO"

# El entorno descartable se borra pase lo que pase, incluso si algo falla en el
# medio. Sin esto una corrida rota deja basura y la próxima arranca sucia.
limpiar() { rm -rf "$BANCO"; }
trap limpiar EXIT

FECHA="$(date +%Y%m%d_%H%M%S)"
DIA_SEMANA="$(date +%u)"
DIA_MES="$(date +%d)"
MES="$(date +%Y%m)"

# shellcheck source=ops/backup/comunes.sh
. "${AQUI}/comunes.sh"
# shellcheck source=ops/backup/respaldar-fotos.sh
. "${AQUI}/respaldar-fotos.sh"

fallas=0
afirmar() {
  if [ "$1" = "0" ]; then
    echo "  OK    $2"
  else
    echo "  ROJO  $2"
    [ -n "${3:-}" ] && echo "        $3"
    fallas=$((fallas + 1))
  fi
}

# ── EL VOLUMEN DE MENTIRA, CON FOTOS DE VERDAD ─────────────────────────────
#
# Los archivos son PNG reales de 1×1: llevan la firma del formato adentro, así
# que "es una imagen" se puede comprobar mirando los bytes y no el nombre. Con
# archivos de texto llamados `.png` la verificación de integridad no probaría
# nada — es la misma trampa que un tar vacío que pasa `gzip -t`.
PNG_1X1_B64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

touch "${FOTOS_DIR_DIRECTO}/${CENTINELA_FOTOS}"
NOMBRES=(
  "p1-0a1b2c3d.png"
  "p2-1122aabb.png"
  "p2023-ffffffff.png"
  "p777-00112233.png"
  "p31-deadbeef.png"
)
for n in "${NOMBRES[@]}"; do
  printf '%s' "$PNG_1X1_B64" | base64 -d > "${FOTOS_DIR_DIRECTO}/${n}"
done
# Y un archivo que NO es una foto: tiene que quedar afuera del conteo.
echo "notas sueltas" > "${FOTOS_DIR_DIRECTO}/leeme.txt"

echo ""
echo "PRUEBA DE RESTAURACIÓN DE FOTOS — banco descartable en ${BANCO}"
echo ""

# ── 1. EL RESPALDO, CON LA FUNCIÓN DE PRODUCCIÓN ───────────────────────────
SALIDA="$(respaldar_fotos 2>&1)" || true
echo "$SALIDA" | sed 's/^/    /'

REGISTRADAS="$(printf '%s\n' "$SALIDA" | sed -n 's/.*paquete con \([0-9]*\) foto.*/\1/p' | head -1)"
afirmar "$([ "$REGISTRADAS" = "5" ] && echo 0 || echo 1)" \
  "1 · el respaldo registró 5 fotos y dejó afuera el archivo que no lo es" \
  "registró: ${REGISTRADAS:-nada}"

PAQUETE="$(ls -1t "${DIR}"/fotos-diario-*.tar.gz 2>/dev/null | head -1 || true)"
afirmar "$([ -n "$PAQUETE" ] && [ -s "$PAQUETE" ] && echo 0 || echo 1)" \
  "2 · el paquete existe y no está vacío" "no se generó ningún fotos-diario-*.tar.gz"
[ -n "$PAQUETE" ] || { echo ""; echo "ROJO · sin paquete no se puede seguir."; exit 1; }

# ── 2. LA RESTAURACIÓN, EN UN DESTINO DESCARTABLE ──────────────────────────
DESTINO="${BANCO}/restaurado"
if restaurar_fotos "$PAQUETE" "$DESTINO"; then
  afirmar 0 "3 · el paquete se extrajo en un destino descartable"
else
  afirmar 1 "3 · el paquete se extrajo en un destino descartable" "restaurar_fotos devolvió error"
fi

# ── 3. LA VERIFICACIÓN: CANTIDAD CONTRA LA REGISTRADA, Y CENTINELA ─────────
#
# Es el paso que hace que esto valga. Que `tar -xzf` salga con 0 no dice nada: un
# paquete cortado a la mitad tampoco falla al extraer — deja los archivos que
# alcanzó y se va.
if verificar_restauracion "$DESTINO" "$REGISTRADAS" >/dev/null 2>&1; then
  afirmar 0 "4 · la cantidad restaurada coincide con la que registró el respaldo (${REGISTRADAS})"
else
  afirmar 1 "4 · la cantidad restaurada coincide con la que registró el respaldo" \
    "$(verificar_restauracion "$DESTINO" "$REGISTRADAS" 2>&1 | tail -1)"
fi

afirmar "$([ -f "${DESTINO}/${CENTINELA_FOTOS}" ] && echo 0 || echo 1)" \
  "5 · el centinela está en lo restaurado" "sin centinela la aplicación se niega a escribir"

# ── 4. INTEGRIDAD DE VARIOS ARCHIVOS, NO DE UNO ────────────────────────────
#
# Dos preguntas por archivo, y las dos hacen falta:
#
#   · que los BYTES sean los mismos que los del original — un archivo con el
#     nombre correcto y el contenido truncado pasa cualquier conteo;
#   · que siga siendo una IMAGEN, comprobado por su firma y no por la extensión.
#     Un `.png` lleno de texto tiene extensión de imagen y no se puede dibujar.
malos=0
detalle=""
for n in "${NOMBRES[@]}"; do
  origen="${FOTOS_DIR_DIRECTO}/${n}"
  copia="${DESTINO}/${n}"
  if [ ! -f "$copia" ]; then
    malos=$((malos + 1)); detalle="${detalle} ${n}:falta"; continue
  fi
  if [ "$(sha256sum < "$origen" | cut -d' ' -f1)" != "$(sha256sum < "$copia" | cut -d' ' -f1)" ]; then
    malos=$((malos + 1)); detalle="${detalle} ${n}:bytes-distintos"; continue
  fi
  # La firma del PNG: los primeros ocho bytes. Se leen en hexadecimal para no
  # depender de que `file` esté instalado.
  firma="$(head -c 8 "$copia" | od -An -tx1 | tr -d ' \n')"
  if [ "$firma" != "89504e470d0a1a0a" ]; then
    malos=$((malos + 1)); detalle="${detalle} ${n}:no-es-png"
  fi
done
afirmar "$([ "$malos" -eq 0 ] && echo 0 || echo 1)" \
  "6 · los ${#NOMBRES[@]} archivos restaurados son idénticos al original y siguen siendo imágenes" \
  "fallaron:${detalle}"

# ── 5. LO QUE NO ERA FOTO VIAJÓ IGUAL, Y ESO ESTÁ BIEN ─────────────────────
#
# El respaldo empaqueta el volumen ENTERO; lo que el patrón filtra es el CONTEO,
# no lo que se guarda. Si el filtro se aplicara al empaquetado, un archivo que
# alguien dejó ahí se perdería sin avisar.
afirmar "$([ -f "${DESTINO}/leeme.txt" ] && echo 0 || echo 1)" \
  "7 · el respaldo guarda el volumen entero, no solo lo que cuenta"

# ── 6. Y LA VERIFICACIÓN SE PONE ROJA CUANDO CORRESPONDE ───────────────────
#
# Sin esto, los pasos 4 y 5 podrían estar devolviendo 0 siempre. Se rompe a
# propósito: se borra una foto de lo restaurado y la cuenta tiene que fallar.
rm -f "${DESTINO}/${NOMBRES[0]}"
if verificar_restauracion "$DESTINO" "$REGISTRADAS" >/dev/null 2>&1; then
  afirmar 1 "8 · CONTRAPRUEBA: con una foto de menos, la verificación falla" \
    "dio por buena una restauración incompleta"
else
  afirmar 0 "8 · CONTRAPRUEBA: con una foto de menos, la verificación falla"
fi

rm -f "${DESTINO}/${CENTINELA_FOTOS}"
if verificar_restauracion "$DESTINO" "$((REGISTRADAS - 1))" >/dev/null 2>&1; then
  afirmar 1 "9 · CONTRAPRUEBA: sin centinela, la verificación falla" \
    "dio por buena una restauración sin centinela"
else
  afirmar 0 "9 · CONTRAPRUEBA: sin centinela, la verificación falla"
fi

echo ""
if [ "$fallas" -gt 0 ]; then
  echo "ROJO · ${fallas} afirmación(es) no se cumplen."
  exit 1
fi
echo "VERDE · el respaldo de fotos se restaura y lo restaurado es lo que se guardó."
echo "         El entorno descartable se borra al salir."
