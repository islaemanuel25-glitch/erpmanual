// lib/productos/camposTarjeta.js
//
// QUÉ MUESTRA LA TARJETA DE PRODUCTO EN EL CELULAR, y en qué orden.
//
// ── TRES FIJOS QUE NO SE PUEDEN APAGAR ──────────────────────────────────────
//
// Nombre, precio del POS y Editar. No es una restricción de la implementación:
// una tarjeta sin nombre no se puede identificar, una sin precio no contesta la
// pregunta por la que se abre el catálogo, y una sin Editar deja al producto sin
// forma de arreglarse desde el celular — que es exactamente lo que esta pantalla
// existe para hacer.
//
// Por eso los fijos NO están en la lista de opcionales ni en el estado guardado.
// Si estuvieran, alguien podría dejarlos en `false` —a mano, en el
// `localStorage`, o con un error de código— y la tarjeta quedaría inservible sin
// que nada avise.
//
// ── EL ORDEN ES POR REGIÓN, Y ESTÁ DECIDIDO ─────────────────────────────────
//
// El issue pide soportar el orden de los opcionales **"si no rompe layout"**, y
// esa condición es la que manda acá.
//
// La tarjeta no es una lista de renglones: tiene regiones con forma propia.
//   · el proveedor va PEGADO al nombre, porque son el mismo dato leído en dos
//     renglones;
//   · el costo y el margen viven en el hueco a la IZQUIERDA del precio, que es
//     lo único que permite mostrarlos sin gastar un renglón — y gastar un
//     renglón cuesta la tercera tarjeta a 390 px, que está medido;
//   · los dos códigos van en el pie monoespaciado, uno a cada punta;
//   · la equivalencia es una franja con fondo propio.
//
// Mover un opcional de región a región no lo reordena: lo saca de la forma que
// lo hace legible. Así que el orden se soporta DENTRO de cada región, que es
// donde no rompe nada, y entre regiones la tarjeta conserva su estructura.
//
// Lo que esto habilita de verdad: elegir si el código interno va antes o después
// del de barras, y si el costo va arriba o abajo del margen. Lo que no: poner el
// código de barras arriba del nombre.

/** Los identificadores de campo. Se guardan en `localStorage`, así que son estables. */
export const CAMPO = {
  PROVEEDOR: "proveedor",
  COSTO: "costo",
  MARGEN: "margen",
  EQUIVALENCIA: "equivalencia",
  CODIGO_BARRA: "codigoBarra",
  CODIGO_INTERNO: "codigoInterno",
};

/**
 * Las regiones de la tarjeta. El orden se resuelve dentro de cada una.
 *
 * PROVEEDOR y EQUIVALENCIA son regiones de UNO. No es un descuido de modelado:
 * cada uno tiene una posición estructural propia —el proveedor pegado al nombre,
 * la equivalencia como franja debajo del precio— y no hay nada con qué
 * intercambiarlos. Declararlas así hace que `moverCampo` conteste la verdad
 * —"no se puede"— en vez de aceptar un movimiento que después no se ve.
 */
export const REGION = {
  PROVEEDOR: "proveedor",
  MARCA: "marca",
  EQUIVALENCIA: "equivalencia",
  PIE: "pie",
};

/**
 * Los opcionales, con su región y su rótulo.
 *
 * El orden de este array es el DEFAULT y coincide con la tarjeta de hoy, así que
 * un usuario que nunca abra "Personalizar card" ve exactamente lo que veía.
 */
export const CAMPOS_OPCIONALES = [
  { id: CAMPO.PROVEEDOR, etiqueta: "Proveedor", region: REGION.PROVEEDOR },
  { id: CAMPO.COSTO, etiqueta: "Costo", region: REGION.MARCA },
  { id: CAMPO.MARGEN, etiqueta: "Margen / regla", region: REGION.MARCA },
  { id: CAMPO.EQUIVALENCIA, etiqueta: "Equivalencia", region: REGION.EQUIVALENCIA },
  { id: CAMPO.CODIGO_BARRA, etiqueta: "Código de barras", region: REGION.PIE },
  { id: CAMPO.CODIGO_INTERNO, etiqueta: "Código interno", region: REGION.PIE },
];

/** Los tres que no se pueden apagar. Se listan para poder MOSTRARLOS como fijos. */
export const CAMPOS_FIJOS = [
  { id: "nombre", etiqueta: "Nombre" },
  { id: "precioPos", etiqueta: "Precio POS" },
  { id: "editar", etiqueta: "Editar" },
];

export const IDS_OPCIONALES = CAMPOS_OPCIONALES.map((c) => c.id);

/**
 * La configuración de fábrica: todo visible, en el orden del array.
 *
 * Todo en `true` y no una selección "mínima" porque es lo que la tarjeta muestra
 * HOY. Estrenar la personalización escondiendo datos sería cambiarle la pantalla
 * a alguien que no pidió nada.
 */
export function configuracionPorDefecto() {
  return {
    visibles: Object.fromEntries(IDS_OPCIONALES.map((id) => [id, true])),
    orden: [...IDS_OPCIONALES],
  };
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
 * La normalización hace tres cosas y siempre las tres:
 *   · un campo nuevo que el guardado no conoce aparece VISIBLE y al final —así,
 *     agregar un opcional no lo deja escondido para todos los que ya guardaron;
 *   · un id que ya no existe se descarta, en vez de dibujar un renglón vacío;
 *   · un `orden` incompleto se completa, en vez de perder los que falten.
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

  const pedido = Array.isArray(guardado.orden) ? guardado.orden.filter((id) => IDS_OPCIONALES.includes(id)) : [];
  const orden = [...new Set(pedido)];
  for (const id of IDS_OPCIONALES) {
    if (!orden.includes(id)) orden.push(id);
  }

  return { visibles, orden };
}

/**
 * Los ids visibles de una región, en el orden configurado.
 *
 * Es LA función que consume la pantalla: le pide a una región qué mostrar y en
 * qué orden, y no vuelve a decidir nada. Si cada bloque de la tarjeta resolviera
 * su propio orden, dos de ellos podrían interpretar distinto el mismo guardado.
 */
export function camposVisiblesDe(config, region) {
  const { visibles, orden } = normalizarConfiguracion(config);
  const deLaRegion = new Set(
    CAMPOS_OPCIONALES.filter((c) => c.region === region).map((c) => c.id)
  );
  return orden.filter((id) => deLaRegion.has(id) && visibles[id]);
}

/** ¿Este campo está visible? Atajo para los que no dependen del orden. */
export function campoVisible(config, id) {
  return normalizarConfiguracion(config).visibles[id] === true;
}

/**
 * Mueve un campo un lugar dentro de SU región.
 *
 * Dentro de su región y no en la lista entera: subir el código de barras por
 * encima del costo lo dejaría igual donde está —son regiones distintas— y el
 * botón parecería roto. Devuelve la MISMA configuración cuando el movimiento no
 * es posible, así que quien la use puede comparar por identidad.
 */
export function moverCampo(config, id, direccion) {
  const normalizada = normalizarConfiguracion(config);
  const campo = CAMPOS_OPCIONALES.find((c) => c.id === id);
  if (!campo) return normalizada;

  const hermanos = normalizada.orden.filter(
    (otro) => CAMPOS_OPCIONALES.find((c) => c.id === otro)?.region === campo.region
  );
  const desde = hermanos.indexOf(id);
  const hasta = desde + (direccion === "arriba" ? -1 : 1);
  if (desde < 0 || hasta < 0 || hasta >= hermanos.length) return normalizada;

  const nuevosHermanos = [...hermanos];
  [nuevosHermanos[desde], nuevosHermanos[hasta]] = [nuevosHermanos[hasta], nuevosHermanos[desde]];

  // Se reescribe el orden global reemplazando en su lugar cada posición que
  // pertenecía a la región. Así los campos de las otras regiones no se mueven.
  let i = 0;
  const orden = normalizada.orden.map((otro) =>
    CAMPOS_OPCIONALES.find((c) => c.id === otro)?.region === campo.region
      ? nuevosHermanos[i++]
      : otro
  );

  return { visibles: normalizada.visibles, orden };
}

/** Prende o apaga un opcional. */
export function alternarCampo(config, id) {
  const normalizada = normalizarConfiguracion(config);
  if (!IDS_OPCIONALES.includes(id)) return normalizada;
  return {
    orden: normalizada.orden,
    visibles: { ...normalizada.visibles, [id]: !normalizada.visibles[id] },
  };
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
