// lib/transferencias/controlFisico.js
//
// LA RECEPCIÓN COMO CONTROL FÍSICO DE MERCADERÍA.
//
// ── QUÉ CAMBIÓ, Y POR QUÉ NO ES UN CAMBIO DE PANTALLA ─────────────────────
//
// Con 150 productos, recorrer el remito en su orden no es una forma de trabajar:
// el operador tiene la mercadería en la mano y va encontrando lo que va
// encontrando. Que "9 de Oro" sea el producto 20, el 97 o el 140 del remito no
// significa nada para él.
//
// Así que la unidad de trabajo pasa a ser: encontrar el producto —escaneando o
// buscando—, contarlo, marcarlo revisado, y que desaparezca de pendientes.
//
// ── POR QUÉ ESTO ES UN MÓDULO PURO Y NO ESTÁ EN LA PANTALLA ───────────────
//
// El resumen de arriba y el listado de abajo tienen que decir LO MISMO. Si la
// card dice "7 faltantes" y al tocarla aparecen 6, uno de los dos cálculos está
// mal y no hay forma de saber cuál. Por eso las cards no son un contador aparte:
// **son el mismo `estadoDeProducto` agrupado**, y el filtro es ese mismo estado
// usado como predicado. Un solo cálculo, dos usos.
//
// Y móvil y escritorio consumen esto, no cada uno el suyo.
//
// ── LA ARITMÉTICA NO SE REIMPLEMENTA ──────────────────────────────────────
//
// Cuántas unidades son sale de `milesimasFisicas`, la misma que usan el servidor
// al confirmar y la validación. Acá no se multiplica por `factor_pack` ni se
// suman sueltas a mano: eso es lo que produce un pack incompleto mal contado en
// una pantalla y bien en la otra.

import { milesimasFisicas } from "./recepcion.js";

/** El estado de un producto del remito, mirado desde el control físico. */
export const ESTADO_PRODUCTO = Object.freeze({
  /** Del remito y todavía sin revisar. */
  PENDIENTE: "pendiente",
  /** Revisado y lo que llegó coincide exactamente con lo enviado. */
  CORRECTO: "correcto",
  /** Revisado y llegó menos. */
  FALTANTE: "faltante",
  /** Revisado y llegó más. */
  SOBRANTE: "sobrante",
  /** No estaba en el remito: apareció al abrir los bultos. */
  NO_DECLARADO: "noDeclarado",
});

/** Los filtros de la pantalla. Cada uno es un predicado sobre el estado. */
export const FILTRO = Object.freeze({
  TODOS: "todos",
  PENDIENTES: "pendientes",
  REVISADOS: "revisados",
  DIFERENCIAS: "diferencias",
  CORRECTOS: "correctos",
  FALTANTES: "faltantes",
  SOBRANTES: "sobrantes",
  NO_DECLARADOS: "noDeclarados",
});

/** Lo que se muestra cuando un producto no tiene categoría asignada. */
export const SIN_CATEGORIA = Object.freeze({ id: "sin-categoria", nombre: "Sin categoría" });

/** Milésimas físicas de lo ENVIADO. El remito nunca sale con packs incompletos. */
export function enviadoFisicoM(d = {}) {
  return milesimasFisicas({
    cantidad: d.cantidadEnviada,
    sueltas: 0,
    unidad: d.unidadEnviada,
    factorPack: d.factorPack,
  });
}

/**
 * Milésimas físicas de lo RECIBIDO, o `null` si todavía no se contó.
 *
 * `cantidadRecibida == null` es "nadie cargó nada" y no es lo mismo que 0. El 0
 * es un dato: no llegó ninguna unidad.
 */
export function recibidoFisicoM(d = {}) {
  if (d.cantidadRecibida === null || d.cantidadRecibida === undefined) return null;
  return milesimasFisicas({
    cantidad: d.cantidadRecibida,
    sueltas: d.recibidoUnidadesSueltas,
    unidad: d.unidadEnviada,
    factorPack: d.factorPack,
  });
}

/**
 * EL ESTADO DE UN PRODUCTO. De acá salen las cards Y el filtro.
 *
 * El orden de las preguntas importa: primero la PROCEDENCIA. Un producto
 * agregado en recepción no es "un sobrante": no estaba en el remito, así que no
 * pertenece a ninguna de las cuatro categorías del control y va aparte.
 *
 * Después la REVISIÓN. Un producto con cantidad cargada pero sin revisar sigue
 * siendo pendiente: alguien empezó a contarlo y no terminó, y darlo por correcto
 * sería cerrar un conteo que nadie cerró.
 */
export function estadoDeProducto(d = {}) {
  if (d.agregadoEnRecepcion === true) return ESTADO_PRODUCTO.NO_DECLARADO;
  if (d.revisadoEnRecepcion !== true) return ESTADO_PRODUCTO.PENDIENTE;

  const env = enviadoFisicoM(d);
  const rec = recibidoFisicoM(d);
  // Revisado sin cantidad legible no debería existir —la ruta valida antes de
  // marcar— pero si pasara, no se inventa: se lo trata como pendiente en vez de
  // contarlo como correcto.
  if (env === null || rec === null) return ESTADO_PRODUCTO.PENDIENTE;

  if (rec === env) return ESTADO_PRODUCTO.CORRECTO;
  return rec < env ? ESTADO_PRODUCTO.FALTANTE : ESTADO_PRODUCTO.SOBRANTE;
}

/**
 * EL RESUMEN DE ARRIBA.
 *
 * ── EL DENOMINADOR SON LOS PRODUCTOS DEL REMITO ───────────────────────────
 *
 * `totalRemito` cuenta solo los originales. Un producto agregado en recepción NO
 * entra en el denominador: si entrara, agregar uno haría que "149 / 150" pasara
 * a "149 / 151" y el operador vería aparecer un pendiente que no existe.
 *
 * Por eso la suma que tiene que cerrar es:
 *
 *     correctos + faltantes + sobrantes = revisados
 *     revisados + pendientes            = totalRemito
 *
 * y `noDeclarados` queda aparte, con su propia card.
 *
 * Ejemplo del pedido: 149/150 revisados, 139 correctos, 7 faltantes, 3
 * sobrantes, 1 no declarado. 139 + 7 + 3 = 149. Diferencias = 10. El no
 * declarado no suma a las diferencias del remito.
 */
export function resumenDeRecepcion(items = []) {
  let totalRemito = 0;
  let correctos = 0;
  let faltantes = 0;
  let sobrantes = 0;
  let noDeclarados = 0;
  let pendientes = 0;

  for (const d of items) {
    const estado = estadoDeProducto(d);
    if (estado === ESTADO_PRODUCTO.NO_DECLARADO) {
      noDeclarados += 1;
      continue;
    }
    totalRemito += 1;
    if (estado === ESTADO_PRODUCTO.PENDIENTE) pendientes += 1;
    else if (estado === ESTADO_PRODUCTO.CORRECTO) correctos += 1;
    else if (estado === ESTADO_PRODUCTO.FALTANTE) faltantes += 1;
    else if (estado === ESTADO_PRODUCTO.SOBRANTE) sobrantes += 1;
  }

  return {
    totalRemito,
    revisados: correctos + faltantes + sobrantes,
    pendientes,
    correctos,
    faltantes,
    sobrantes,
    diferencias: faltantes + sobrantes,
    noDeclarados,
  };
}

/** ¿Este producto entra en este filtro? Mismo estado que alimenta las cards. */
export function pasaFiltro(d, filtro) {
  const estado = estadoDeProducto(d);
  const esDelRemito = estado !== ESTADO_PRODUCTO.NO_DECLARADO;

  switch (filtro) {
    case FILTRO.PENDIENTES:
      return estado === ESTADO_PRODUCTO.PENDIENTE;
    case FILTRO.REVISADOS:
      return esDelRemito && estado !== ESTADO_PRODUCTO.PENDIENTE;
    case FILTRO.DIFERENCIAS:
      return estado === ESTADO_PRODUCTO.FALTANTE || estado === ESTADO_PRODUCTO.SOBRANTE;
    case FILTRO.CORRECTOS:
      return estado === ESTADO_PRODUCTO.CORRECTO;
    case FILTRO.FALTANTES:
      return estado === ESTADO_PRODUCTO.FALTANTE;
    case FILTRO.SOBRANTES:
      return estado === ESTADO_PRODUCTO.SOBRANTE;
    case FILTRO.NO_DECLARADOS:
      return estado === ESTADO_PRODUCTO.NO_DECLARADO;
    case FILTRO.TODOS:
    default:
      // "Todos" son los del remito. Los agregados tienen su propia card: si
      // aparecieran acá, el listado no coincidiría con el "150" de arriba.
      return esDelRemito;
  }
}

/** La categoría de presentación de un producto. Nunca inventa una en la base. */
export function categoriaDeProducto(d = {}) {
  if (d.categoria?.id != null) return { id: String(d.categoria.id), nombre: d.categoria.nombre };
  return { ...SIN_CATEGORIA };
}

/**
 * Las categorías del filtro salen ÚNICAMENTE de los productos de este remito.
 *
 * Cargar el catálogo entero pondría cientos de chips de los cuales el operador
 * no puede usar ninguno: si "Limpieza" no vino en esta transferencia, filtrar
 * por Limpieza da una lista vacía y no ayuda a nadie.
 */
export function categoriasDelRemito(items = []) {
  const vistas = new Map();
  for (const d of items) {
    const c = categoriaDeProducto(d);
    if (!vistas.has(c.id)) vistas.set(c.id, { ...c, cantidad: 0 });
    vistas.get(c.id).cantidad += 1;
  }
  const lista = [...vistas.values()];
  // Alfabético, con "Sin categoría" al final: es un estado de presentación, no
  // una categoría más, y arriba de todo distraería.
  lista.sort((a, b) => {
    if (a.id === SIN_CATEGORIA.id) return 1;
    if (b.id === SIN_CATEGORIA.id) return -1;
    return String(a.nombre).localeCompare(String(b.nombre), "es");
  });
  return lista;
}

// ── BÚSQUEDA DENTRO DEL REMITO ────────────────────────────────────────────
//
// Son ~150 productos ya cargados: buscar acá no necesita una consulta por tecla.
// El servidor solo entra cuando el producto NO está en el remito, que es el
// camino de excepción.

/** Los códigos escaneables de una línea, con la MISMA definición del resto del ERP. */
export function codigosDeLinea(d = {}) {
  return [d.codigoBarraPropio, d.codigoBarra, d.codigoBarraSecundario].filter(Boolean);
}

const normalizar = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * COINCIDENCIA EXACTA POR CÓDIGO. Es lo que usa el scanner.
 *
 * Exacta y no "contiene": un código escaneado identifica un producto o no lo
 * identifica. Una coincidencia parcial abriría la ficha del producto equivocado
 * con la mercadería en la mano.
 */
export function buscarPorCodigoExacto(items = [], codigo) {
  const c = String(codigo || "").trim();
  if (!c) return null;
  return items.find((d) => codigosDeLinea(d).some((x) => String(x).trim() === c)) || null;
}

/** Búsqueda tecleada: por nombre o por cualquiera de los tres códigos. */
export function buscarEnRemito(items = [], texto) {
  const q = normalizar(texto);
  if (!q) return items;
  return items.filter((d) => {
    if (normalizar(d.nombre).includes(q)) return true;
    return codigosDeLinea(d).some((x) => normalizar(x).includes(q));
  });
}

/**
 * EL LISTADO, con todo aplicado. Es lo único que las dos presentaciones dibujan.
 *
 * El orden: los revisados van por `revisadoEnRecepcionAt`, que es el orden real
 * en que apareció la mercadería —así el operador reconoce lo que acaba de
 * contar—. Los pendientes NO se ordenan por eso: todavía no tienen fecha, y
 * fingir un orden de llegada sería inventar un dato.
 */
export function productosVisibles(items = [], { filtro = FILTRO.TODOS, categoriaId = null, texto = "" } = {}) {
  let lista = items.filter((d) => pasaFiltro(d, filtro));

  if (categoriaId) {
    lista = lista.filter((d) => categoriaDeProducto(d).id === String(categoriaId));
  }

  if (texto) lista = buscarEnRemito(lista, texto);

  return [...lista].sort((a, b) => {
    const ra = a.revisadoEnRecepcionAt ? new Date(a.revisadoEnRecepcionAt).getTime() : null;
    const rb = b.revisadoEnRecepcionAt ? new Date(b.revisadoEnRecepcionAt).getTime() : null;
    if (ra !== null && rb !== null) return rb - ra; // lo último revisado, primero
    if (ra !== null) return -1;
    if (rb !== null) return 1;
    // Sin revisar: el orden del remito, que es el único que existe.
    return Number(a.id) - Number(b.id);
  });
}
