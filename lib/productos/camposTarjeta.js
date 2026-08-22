// lib/productos/camposTarjeta.js
//
// QUÉ MUESTRA LA TARJETA DE PRODUCTO EN EL CELULAR.
//
// ── TRES FIJOS QUE NO SE PUEDEN APAGAR ──────────────────────────────────────
//
// Nombre, precio con su presentación, y Editar. No es una restricción de la
// implementación: una tarjeta sin nombre no se puede identificar, una sin precio
// no contesta la pregunta por la que se abre el catálogo, y una sin Editar deja
// al producto sin forma de arreglarse desde el celular — que es exactamente lo
// que esta pantalla existe para hacer.
//
// Por eso los fijos NO están en la lista de opcionales ni en el estado guardado.
// Si estuvieran, alguien podría dejarlos en `false` —a mano, en el
// `localStorage`, o con un error de código— y la tarjeta quedaría inservible sin
// que nada avise.
//
// ── ACÁ SE PRENDE Y SE APAGA. NO SE REORDENA. ──────────────────────────────
//
// La versión anterior permitía mover los opcionales dentro de su región, con
// flechas de subir y bajar. **Eso se sacó por decisión de diseño**: la posición
// de cada dato la define el layout aprobado, no el usuario.
//
// No es una simplificación de la implementación, es lo que hace que la tarjeta
// siga siendo reconocible: veinticinco tarjetas iguales se recorren sin leer
// justamente porque cada dato está siempre en el mismo lugar. Un orden por
// usuario rompía eso a cambio de una preferencia que casi nadie iba a tocar.
//
// Con el orden se fueron `REGION`, `camposVisiblesDe` y `moverCampo`. Lo que
// queda es una pregunta booleana por campo.
//
// ── Y "EQUIVALENCIA" DEJÓ DE SER UN CAMPO ──────────────────────────────────
//
// Era el opcional que prendía o apagaba la franja de conversión. Esa franja no
// existe más: la presentación pasó a ser parte del precio —"$31.200 · PACK X 24"—
// y la otra escala vive en el dorso de la tarjeta.
//
// Un guardado viejo que traiga `equivalencia: false` se ignora, y con eso no
// pasa nada: no hay nada que apagar. Lo que NO puede pasar es que ese `false`
// esconda otra cosa, y por eso los ids desconocidos se descartan en vez de
// mezclarse.

/** Los identificadores de campo. Se guardan en `localStorage`, así que son estables. */
export const CAMPO = {
  PROVEEDOR: "proveedor",
  COSTO: "costo",
  MARGEN: "margen",
  CODIGO_BARRA: "codigoBarra",
  CODIGO_INTERNO: "codigoInterno",
};

/**
 * Los opcionales, con su rótulo.
 *
 * El orden de este array es el de la HOJA de personalización, no el de la
 * tarjeta: en la tarjeta cada dato tiene su lugar fijo por diseño. Se listan
 * agrupados como se leen —quién lo vende, cuánto cuesta, con qué se identifica—
 * para que la hoja se recorra sin pensar.
 */
export const CAMPOS_OPCIONALES = [
  { id: CAMPO.PROVEEDOR, etiqueta: "Proveedor" },
  { id: CAMPO.COSTO, etiqueta: "Costo" },
  { id: CAMPO.MARGEN, etiqueta: "Margen / regla" },
  { id: CAMPO.CODIGO_BARRA, etiqueta: "Código de barras" },
  // El nombre largo es a propósito: "Código interno" a secas se confundía con el
  // id del producto y con el SKU, y de hecho la tarjeta llegó a mostrar el id.
  // Este campo es el código que EL PROVEEDOR le da al producto.
  { id: CAMPO.CODIGO_INTERNO, etiqueta: "Código interno por proveedor" },
];

/** Los tres que no se pueden apagar. Se listan para poder MOSTRARLOS como fijos. */
export const CAMPOS_FIJOS = [
  { id: "nombre", etiqueta: "Nombre" },
  { id: "precioPos", etiqueta: "Precio y presentación" },
  { id: "editar", etiqueta: "Editar" },
];

export const IDS_OPCIONALES = CAMPOS_OPCIONALES.map((c) => c.id);

/**
 * La configuración de fábrica: todos los opcionales visibles.
 *
 * Todo en `true` y no una selección "mínima" porque es lo que la tarjeta muestra
 * HOY. Estrenar la personalización escondiendo datos sería cambiarle la pantalla
 * a alguien que no pidió nada.
 */
export function configuracionPorDefecto() {
  return { visibles: Object.fromEntries(IDS_OPCIONALES.map((id) => [id, true])) };
}

/**
 * Normaliza lo que venga de `localStorage`.
 *
 * ── POR QUÉ NO SE CONFÍA EN LO GUARDADO ────────────────────────────────────
 *
 * Es texto en el navegador del usuario: puede venir de una versión anterior con
 * otros campos, de una que todavía no existía, o editado a mano. Los tres casos
 * llegan como un objeto de forma razonable y ninguno se puede distinguir del
 * bueno mirando el tipo.
 *
 * ── LO QUE HACE, Y SIEMPRE LAS TRES ────────────────────────────────────────
 *
 *   · un campo nuevo que el guardado no conoce aparece VISIBLE — así, agregar un
 *     opcional no lo deja escondido para todos los que ya guardaron;
 *   · un id que ya no existe se descarta. Es el caso de `equivalencia`, que era
 *     un opcional hasta esta tanda: un guardado que lo traiga apagado no puede
 *     apagar nada, porque el campo no existe;
 *   · el `orden` guardado se IGNORA. Ya no hay orden configurable, y arrastrarlo
 *     dejaría en el estado una llave que nadie lee — la clase de resto que dentro
 *     de seis meses alguien interpreta como si significara algo.
 *
 * Y lo que se CONSERVA es lo que importa para no romperle la pantalla a nadie:
 * las preferencias visible/oculto de los campos que siguen existiendo.
 */
export function normalizarConfiguracion(guardado) {
  const base = configuracionPorDefecto();
  if (!guardado || typeof guardado !== "object") return base;

  const visibles = { ...base.visibles };
  if (guardado.visibles && typeof guardado.visibles === "object") {
    for (const id of IDS_OPCIONALES) {
      if (typeof guardado.visibles[id] === "boolean") visibles[id] = guardado.visibles[id];
    }
  }

  return { visibles };
}

/** ¿Este campo está visible? */
export function campoVisible(config, id) {
  return normalizarConfiguracion(config).visibles[id] === true;
}

/** Prende o apaga un opcional. */
export function alternarCampo(config, id) {
  const normalizada = normalizarConfiguracion(config);
  if (!IDS_OPCIONALES.includes(id)) return normalizada;
  return { visibles: { ...normalizada.visibles, [id]: !normalizada.visibles[id] } };
}

/**
 * La clave de `localStorage`, por ubicación.
 *
 * Por ubicación porque la tarjeta útil no es la misma en el depósito que en un
 * local: en el depósito el número grande ES el costo, así que el opcional
 * "Costo" repite y molesta. Una preferencia única obligaría a reconfigurar cada
 * vez que se cambia de contexto.
 */
export function claveDeConfiguracion(localId) {
  return `productos:tarjeta:${localId || 0}`;
}
