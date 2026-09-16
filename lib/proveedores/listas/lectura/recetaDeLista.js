// lib/proveedores/listas/lectura/recetaDeLista.js
//
// LO QUE SE GUARDA POR PROVEEDOR PARA NO VOLVER A PREGUNTAR.
//
// La primera vez que llega la lista de un proveedor nuevo, el sistema propone qué
// columna es cada cosa y una persona confirma o corrige. Esa confirmación se
// guarda en `Proveedor.listaRecetaLectura` y desde la segunda lista el archivo se
// lee solo.
//
// ── LA HUELLA ES LA MITAD QUE IMPORTA ───────────────────────────────────────
//
// Guardar el mapa de columnas sin guardar CONTRA QUÉ ARCHIVO se confirmó es
// exactamente la trampa que este módulo existe para evitar. El proveedor agrega
// una columna en octubre, todos los índices se corren en uno, y la receta sigue
// pareciendo válida: apunta a la columna 5 y ahora la 5 es otra cosa. Nada falla.
// Se aplican costos de una columna equivocada sobre el catálogo entero.
//
// Por eso se guarda una HUELLA de la estructura del archivo —cuántas columnas y
// cómo se llaman— y en cada importación se compara. Si cambió, la receta no se
// usa: se vuelve a preguntar.
//
// La huella NO incluye los datos, solo la estructura. Una lista de octubre tiene
// otros precios y otros productos que la de septiembre, y eso no es un cambio de
// formato: si la huella mirara el contenido, habría que confirmar todos los
// meses y la receta no serviría para nada.
//
// ── POR QUÉ LOS NOMBRES Y NO SOLO LA CANTIDAD ───────────────────────────────
//
// Porque hay un cambio que no mueve la cantidad: el proveedor reemplaza la
// columna "NETO" por "NETO C/DESC" y deja todo lo demás igual. Mismo número de
// columnas, mismo orden, otro precio adentro. Con la cantidad sola, la receta
// pasaría.
//
// Módulo puro: sin BD, sin Next. Recibe y devuelve datos.

import { normalizarTitulo } from "./filasDeTexto.js";
import { CAMPO } from "./deteccionDeColumnas.js";

/** La versión del formato de la receta, para poder cambiarla sin romper las guardadas. */
export const VERSION_RECETA = 1;

/** Por qué una receta guardada no se puede usar. */
export const MOTIVO_RECETA = {
  /** No hay ninguna guardada: es la primera lista de este proveedor. */
  SIN_RECETA: "SIN_RECETA",
  /** La guardada es de un formato viejo o está incompleta. */
  RECETA_INVALIDA: "RECETA_INVALIDA",
  /** El archivo tiene otra estructura que el que se confirmó. */
  ESTRUCTURA_CAMBIO: "ESTRUCTURA_CAMBIO",
  /** La receta apunta a columnas que este archivo no tiene. */
  COLUMNA_INEXISTENTE: "COLUMNA_INEXISTENTE",
};

export const TEXTO_MOTIVO_RECETA = {
  SIN_RECETA:
    "Es la primera lista de este proveedor. Revisá qué columna es cada cosa y confirmalo: la próxima vez se lee sola.",
  RECETA_INVALIDA:
    "Lo que estaba guardado sobre cómo leer las listas de este proveedor no se puede usar. Confirmá de nuevo qué columna es cada cosa.",
  ESTRUCTURA_CAMBIO:
    "El archivo tiene otras columnas que el último que confirmaste para este proveedor. Revisá qué columna es cada cosa antes de seguir.",
  COLUMNA_INEXISTENTE:
    "El archivo no tiene alguna de las columnas que quedaron guardadas para este proveedor. Revisá el mapa de columnas.",
};

/**
 * La huella de la estructura de un archivo.
 *
 * Se arma con la CANTIDAD de columnas y sus nombres normalizados, en orden. Los
 * nombres se normalizan igual que en el resto de la lectura —sin tildes, sin
 * signos, en minúscula— para que un cambio de mayúsculas o un acento no dispare
 * una confirmación que no hace falta.
 */
export function huellaDeEstructura(titulos = []) {
  const nombres = titulos.map((t) => normalizarTitulo(t) || "-");
  return `v${VERSION_RECETA}:${nombres.length}:${nombres.join(",")}`;
}

/** Los campos que una receta tiene que nombrar para servir. */
const OBLIGATORIOS = [CAMPO.CODIGO, CAMPO.DESCRIPCION];

/**
 * Normaliza y valida una receta, venga de la pantalla o de la base.
 *
 * @returns { ok: true, receta } | { ok: false, motivo }
 */
export function normalizarReceta(cruda) {
  if (!cruda || typeof cruda !== "object") return { ok: false, motivo: MOTIVO_RECETA.SIN_RECETA };
  if (Number(cruda.version) !== VERSION_RECETA) return { ok: false, motivo: MOTIVO_RECETA.RECETA_INVALIDA };

  // EL NULO SE RECHAZA A MANO Y NO POR `Number()`.
  //
  // `Number(null)` da 0, `Number("")` también, y `Number.isInteger(0)` es true:
  // sin este rechazo explícito, una receta a la que le falta el código se guarda
  // apuntando a la COLUMNA 0 y se lee como si estuviera completa. Es el mismo
  // modo de fallar que ya se cobró `rangoValido`, donde un rango sin cargar se
  // leía como "de 0 a 0" y clasificaba todas las filas con cara de veredicto.
  const indice = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : null;
  };

  const receta = {
    version: VERSION_RECETA,
    codigo: indice(cruda.codigo),
    codigoBarra: indice(cruda.codigoBarra),
    descripcion: indice(cruda.descripcion),
    cantidad: indice(cruda.cantidad),
    descuento: indice(cruda.descuento),
    precios: Array.isArray(cruda.precios) ? cruda.precios.map(indice).filter((x) => x !== null) : [],
    // La columna de precio y el tratamiento del descuento que ganaron la última
    // vez. NO son una orden: el motor los vuelve a probar contra los costos de
    // hoy en cada importación. Se guardan para poder contar qué cambió.
    columnaPrecioElegida: indice(cruda.columnaPrecioElegida),
    descuentoAplicado: typeof cruda.descuentoAplicado === "boolean" ? cruda.descuentoAplicado : null,
  };

  for (const campo of OBLIGATORIOS) {
    if (receta[campo] === null) return { ok: false, motivo: MOTIVO_RECETA.RECETA_INVALIDA };
  }
  if (receta.precios.length === 0) return { ok: false, motivo: MOTIVO_RECETA.RECETA_INVALIDA };

  return { ok: true, receta };
}

/**
 * ¿Se puede usar la receta guardada con ESTE archivo?
 *
 * @param guardada  lo que hay en `Proveedor.listaRecetaLectura`
 * @param huella    lo que hay en `Proveedor.listaRecetaHuella`
 * @param titulos   los títulos del archivo que acaba de llegar
 *
 * @returns { ok: true, receta } | { ok: false, motivo, huellaNueva }
 */
export function recetaAplicable({ guardada, huella, titulos = [] } = {}) {
  const huellaNueva = huellaDeEstructura(titulos);

  const normal = normalizarReceta(guardada);
  if (!normal.ok) return { ok: false, motivo: normal.motivo, huellaNueva };

  if (!huella || huella !== huellaNueva) {
    return { ok: false, motivo: MOTIVO_RECETA.ESTRUCTURA_CAMBIO, huellaNueva };
  }

  // La huella coincide, así que la cantidad de columnas también. Igual se
  // comprueba: una receta guardada con más columnas que el archivo sería un
  // `undefined` leído como precio, y eso no se nota hasta ver un costo absurdo.
  const usados = [
    normal.receta.codigo,
    normal.receta.codigoBarra,
    normal.receta.descripcion,
    normal.receta.cantidad,
    normal.receta.descuento,
    ...normal.receta.precios,
  ].filter((x) => x !== null);
  if (usados.some((i) => i >= titulos.length)) {
    return { ok: false, motivo: MOTIVO_RECETA.COLUMNA_INEXISTENTE, huellaNueva };
  }

  return { ok: true, receta: normal.receta, huellaNueva };
}

/**
 * La receta que se guarda cuando una persona confirma la propuesta.
 *
 * @param mapeo    el mapeo confirmado (la propuesta, con las correcciones)
 * @param titulos  los títulos del archivo con el que se confirmó
 */
export function recetaParaGuardar({ mapeo, titulos = [], columnaPrecioElegida = null, descuentoAplicado = null } = {}) {
  const receta = {
    version: VERSION_RECETA,
    codigo: mapeo?.codigo ?? null,
    codigoBarra: mapeo?.codigoBarra ?? null,
    descripcion: mapeo?.descripcion ?? null,
    cantidad: mapeo?.cantidad ?? null,
    descuento: mapeo?.descuento ?? null,
    precios: Array.isArray(mapeo?.precios) ? mapeo.precios : [],
    columnaPrecioElegida,
    descuentoAplicado,
  };
  const normal = normalizarReceta(receta);
  if (!normal.ok) return { ok: false, motivo: normal.motivo };
  return { ok: true, receta: normal.receta, huella: huellaDeEstructura(titulos) };
}

/**
 * Qué cambió entre la estructura guardada y la que llegó, en castellano.
 *
 * La pantalla necesita poder decir QUÉ cambió y no solo que cambió: "el archivo
 * trae una columna más" es accionable, "la estructura cambió" no.
 */
export function diferenciaDeEstructura({ huella, titulos = [] } = {}) {
  const viejos = nombresDeHuella(huella);
  const nuevos = titulos.map((t) => normalizarTitulo(t) || "-");
  if (viejos === null) return null;

  if (viejos.length !== nuevos.length) {
    return `Antes el archivo traía ${viejos.length} columnas y ahora trae ${nuevos.length}.`;
  }
  const cambiadas = [];
  for (let i = 0; i < nuevos.length; i++) {
    if (viejos[i] !== nuevos[i]) cambiadas.push(`la columna ${i + 1} se llamaba "${viejos[i]}" y ahora "${nuevos[i]}"`);
  }
  if (cambiadas.length === 0) return null;
  return `Cambiaron los nombres: ${cambiadas.join("; ")}.`;
}

function nombresDeHuella(huella) {
  if (typeof huella !== "string") return null;
  const partes = huella.split(":");
  if (partes.length < 3) return null;
  return partes.slice(2).join(":").split(",");
}
