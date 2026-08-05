// lib/proveedores/listas/macheo.js
//
// CÓMO SE MACHEÓ CADA FILA, contado en grupos que no se pisan.
//
// La pantalla mostraba estados —listos, sin vincular, revisar armado— que dicen
// qué se puede hacer con una fila, pero no CÓMO se llegó a ese producto. Con
// 917 filas y un fallback por terminación numérica, "625 sin vincular" no
// alcanza para confiar: hace falta saber cuántas machearon exacto y cuántas por
// una coincidencia de cuatro dígitos, que es mucho más débil.
//
// ── DOS UNIVERSOS QUE NO HAY QUE MEZCLAR ────────────────────────────────────
//
// FILAS DEL EXCEL: cada línea del archivo del proveedor. Una fila tiene
// exactamente un resultado de macheo.
//
// PRODUCTOS DEL ERP: los que tienen a este proveedor asociado en alguna de sus
// tres relaciones. Es un número independiente del archivo, y sirve para saber
// qué proporción del catálogo tocó esta lista.
//
// Los dos números casi nunca coinciden, y presentarlos juntos sin aclarar cuál
// es cuál fue parte del problema original.
//
// ── LOS GRUPOS SON EXCLUYENTES POR CONSTRUCCIÓN ─────────────────────────────
//
// Cada fila guarda UN solo `tipoCoincidencia`, que el motor asigna deteniéndose
// en el primer criterio que encuentra algo: exacto, después sin ceros, después
// la escalera de sufijos de 8 a 4, y por último el código de barras. Este módulo
// no vuelve a decidir nada: traduce ese valor único a un grupo. Por eso una fila
// no puede contarse dos veces, y la suma de los grupos es igual al total.
//
// La prioridad se afirma igual en las pruebas: si algún día el motor empezara a
// devolver más de un criterio por fila, el doble conteo aparecería acá y no en
// un informe que alguien mira tres meses después.

import { TIPO_COINCIDENCIA } from "./conciliarLista.js";

/**
 * Los grupos, EN ORDEN DE PRECISIÓN. Cuanto más arriba, más fuerte la
 * afirmación de que el producto es el correcto.
 */
export const GRUPOS_MACHEO = [
  {
    id: "exactas",
    tipo: TIPO_COINCIDENCIA.CODIGO_INTERNO,
    etiqueta: "Coincidencia exacta",
    clase: "exacta",
    detalle: "El código del archivo es idéntico al código de Arcor guardado en el producto.",
    vista: "exactas",
  },
  {
    id: "sinCeros",
    tipo: TIPO_COINCIDENCIA.CODIGO_INTERNO_SIN_CEROS,
    etiqueta: "Coincidencia sin ceros iniciales",
    clase: "exacta",
    detalle: "Los códigos son iguales salvo por ceros a la izquierda que se perdieron al exportar.",
    vista: "sinCeros",
  },
  {
    id: "sufijo8",
    tipo: TIPO_COINCIDENCIA.SUFIJO_8,
    digitos: 8,
    etiqueta: "Coincidencia por 8 dígitos",
    clase: "parcial",
    detalle: "Coinciden los últimos 8 dígitos del código.",
    vista: "sufijo8",
  },
  {
    id: "sufijo7",
    tipo: TIPO_COINCIDENCIA.SUFIJO_7,
    digitos: 7,
    etiqueta: "Coincidencia por 7 dígitos",
    clase: "parcial",
    detalle: "Coinciden los últimos 7 dígitos del código.",
    vista: "sufijo7",
  },
  {
    id: "sufijo6",
    tipo: TIPO_COINCIDENCIA.SUFIJO_6,
    digitos: 6,
    etiqueta: "Coincidencia por 6 dígitos",
    clase: "parcial",
    detalle: "Coinciden los últimos 6 dígitos del código.",
    vista: "sufijo6",
  },
  {
    id: "sufijo5",
    tipo: TIPO_COINCIDENCIA.SUFIJO_5,
    digitos: 5,
    etiqueta: "Coincidencia por 5 dígitos",
    clase: "parcial",
    detalle: "Coinciden los últimos 5 dígitos del código.",
    vista: "sufijo5",
  },
  {
    id: "sufijo4",
    tipo: TIPO_COINCIDENCIA.SUFIJO_4,
    digitos: 4,
    etiqueta: "Coincidencia por 4 dígitos",
    clase: "parcial",
    detalle: "Coinciden solo los últimos 4 dígitos. Es la coincidencia más débil: conviene revisarla.",
    vista: "sufijo4",
  },
  {
    id: "codigoBarra",
    tipo: TIPO_COINCIDENCIA.CODIGO_BARRA,
    etiqueta: "Coincidencia por código de barras",
    clase: "parcial",
    detalle: "El código de barras del archivo coincide con el del producto.",
    vista: "codigoBarra",
  },
  {
    id: "ambiguas",
    tipo: TIPO_COINCIDENCIA.AMBIGUA,
    etiqueta: "Coincidencias ambiguas",
    clase: "ambigua",
    detalle: "Más de un producto podía ser. No se eligió ninguno: hay que resolverlo a mano.",
    vista: "ambiguas",
  },
  {
    id: "sinCoincidencia",
    tipo: TIPO_COINCIDENCIA.NINGUNA,
    etiqueta: "Sin coincidencia",
    clase: "ninguna",
    detalle: "Ningún producto de Arcor en el ERP tiene un código que corresponda a esta fila.",
    vista: "sinVincular",
  },
];

/** Índice tipo → grupo, para no recorrer la lista por cada fila. */
const GRUPO_POR_TIPO = new Map(GRUPOS_MACHEO.map((g) => [g.tipo, g]));

/**
 * A qué grupo pertenece una fila. Exactamente uno, siempre.
 *
 * Una fila vinculada A MANO se cuenta como exacta: alguien la miró y la
 * confirmó, que es la afirmación más fuerte que existe, más que cualquier
 * coincidencia de códigos.
 */
export function grupoDeFila(fila) {
  if (!fila) return "sinCoincidencia";
  if (fila.vinculadoPorUsuarioId) return "manual";
  const g = GRUPO_POR_TIPO.get(fila.tipoCoincidencia);
  return g ? g.id : "sinCoincidencia";
}

/** El grupo de las vinculadas a mano, que no sale de un tipo de coincidencia. */
export const GRUPO_MANUAL = {
  id: "manual",
  etiqueta: "Vinculadas a mano",
  clase: "exacta",
  detalle: "Alguien eligió el producto y confirmó el vínculo desde la pantalla.",
  vista: "manuales",
};

/**
 * El resumen del macheo de una importación.
 *
 * @param filas  filas persistidas, con `tipoCoincidencia`, `productoBaseId` y
 *               `vinculadoPorUsuarioId`
 * @param opciones.productosDelProveedor  tamaño del universo del ERP
 *
 * @returns { totalFilas, productosDelProveedor, grupos[], suma, cierra }
 */
export function resumirMacheo(filas = [], { productosDelProveedor = null } = {}) {
  const conteo = new Map();
  const productosPorGrupo = new Map();

  for (const f of filas) {
    const id = grupoDeFila(f);
    conteo.set(id, (conteo.get(id) ?? 0) + 1);
    // Productos DISTINTOS por grupo: dos filas del archivo pueden apuntar al
    // mismo producto, y contar filas no es contar productos.
    if (f?.productoBaseId !== null && f?.productoBaseId !== undefined) {
      if (!productosPorGrupo.has(id)) productosPorGrupo.set(id, new Set());
      productosPorGrupo.get(id).add(f.productoBaseId);
    }
  }

  const definiciones = [GRUPOS_MACHEO[0], GRUPO_MANUAL, ...GRUPOS_MACHEO.slice(1)];
  const grupos = definiciones.map((g) => ({
    id: g.id,
    etiqueta: g.etiqueta,
    clase: g.clase,
    detalle: g.detalle,
    vista: g.vista,
    digitos: g.digitos ?? null,
    filas: conteo.get(g.id) ?? 0,
    productos: (productosPorGrupo.get(g.id) ?? new Set()).size,
  }));

  const suma = grupos.reduce((a, g) => a + g.filas, 0);

  // Productos del ERP distintos alcanzados por la lista, sin importar el camino.
  const alcanzados = new Set();
  for (const f of filas) {
    if (f?.productoBaseId !== null && f?.productoBaseId !== undefined) alcanzados.add(f.productoBaseId);
  }

  return {
    totalFilas: filas.length,
    productosDelProveedor,
    productosAlcanzados: alcanzados.size,
    grupos,
    suma,
    /** Invariante: ninguna fila se cuenta dos veces ni se pierde. */
    cierra: suma === filas.length,
  };
}

// ── Progreso por tandas ─────────────────────────────────────────────────────

/**
 * En qué va la importación, para poder aplicarla en tandas.
 *
 * Antes la pantalla mostraba estados de conciliación —listos, sin vincular— que
 * no dicen nada del avance: después de aplicar 101 filas seguía diciendo "101
 * listos", como si no hubiera pasado nada.
 *
 * Una fila EXCLUIDA a mano no está pendiente: alguien ya decidió sobre ella.
 * Una SIN_CAMBIOS o con ERROR tampoco: no hay decisión que tomar. Por eso
 * "pendiente" no es simplemente "no aplicada".
 */
export function resumirProgreso(filas = []) {
  let aplicadas = 0;
  let listasPendientes = 0;
  let requierenRevision = 0;
  let sinVincular = 0;
  let ambiguas = 0;
  let excluidas = 0;

  for (const f of filas) {
    if (f?.aplicada === true) { aplicadas++; continue; }
    if (f?.excluidaManual === true) { excluidas++; continue; }
    switch (f?.estado) {
      case "LISTO_PARA_ACTUALIZAR": listasPendientes++; break;
      case "FACTOR_DUDOSO": requierenRevision++; break;
      case "NO_MACHEADO": sinVincular++; break;
      case "CODIGO_DUPLICADO": ambiguas++; break;
      default: break; // SIN_CAMBIOS, EXCLUIDO, ERROR: nada que decidir
    }
  }

  const pendientes = listasPendientes + requierenRevision + sinVincular + ambiguas;

  return {
    aplicadas,
    listasPendientes,
    requierenRevision,
    sinVincular,
    ambiguas,
    excluidas,
    pendientes,
    /** Sin pendientes, la importación puede cerrarse sola. */
    puedeCerrarse: pendientes === 0,
  };
}
