// lib/stock/libro/stockDiarioApi.js
//
// LA API DEL STOCK DIARIO, LA PARTE PURA: qué se lee de la URL, qué local se
// mira, cómo se filtra y pagina, qué forma tiene la respuesta y cómo se traduce
// un error. No conoce Prisma ni Next: lo arma `stockDiarioRutas.js`, y las rutas
// de `app/api/stock_locales/diario/` solo exigen el permiso y delegan.
//
// Todo lo que se devuelve sale del motor (`stockDiario.js`, `stockDiarioServer.js`)
// sin recalcular nada: acá se renombra para la pantalla y se decide qué mostrar.
//
// ── LO QUE NO SE PROMETE ─────────────────────────────────────────────────
//
// La identidad es la de HOY si el producto existe, o la que congeló su BAJA si
// no; el libro no guarda los cambios de nombre ni de categoría. Por eso la
// categoría se llama `categoriaActualId` y la identidad dice su `fuente`. Una
// apertura que no se conoce viaja con su existencia y su motivo, y la cantidad en
// null: nunca como cero.

import {
  ErrorStockDiario,
  EXISTENCIA,
  PAGINA,
  UNIDAD_DE_PERIODO,
  esDiaValido,
  exigirPagina,
  deMilesimas,
} from "./stockDiario.js";
import { TIPO_MOVIMIENTO } from "./libroStock.js";
import { aPesos, tieneValorQueMirar } from "./valorDelStock.js";

const { ALTA, CAMBIO, BAJA } = TIPO_MOVIMIENTO;

/** El mismo texto que devuelve `resolveVistaOperativa` para un local ajeno. */
export const ERROR_FUERA_DE_ALCANCE = "Local fuera de tu alcance.";

/**
 * El admin en vista global todavía no eligió ubicación. Sigue siendo un 400 —no
 * se suma nada ni se elige una por él—, pero con un código propio para que la
 * pantalla lo distinga de un error y ofrezca elegir entre `ubicaciones`.
 */
export const CODIGO_FALTA_UBICACION = "FALTA_UBICACION";

/**
 * LAS UBICACIONES QUE UN ADMIN EN VISTA GLOBAL PUEDE MIRAR: las del grupo activo
 * que ya da `resolveVistaOperativa` (`vista.localIds`, locales y depósito), ni
 * una más. Activas, el depósito primero y después por nombre.
 */
export function ubicacionesApi(locales, vista) {
  const permitidos = new Set((vista?.localIds || []).map(Number));
  return locales
    .filter((l) => permitidos.has(Number(l.id)) && l.activo !== false)
    .map((l) => ({ id: Number(l.id), nombre: l.nombre ?? null, esDeposito: l.es_deposito === true }))
    .sort((a, b) => (a.esDeposito === b.esDeposito ? String(a.nombre ?? "").localeCompare(String(b.nombre ?? ""), "es") : a.esDeposito ? -1 : 1));
}

export const FILTRO_PRODUCTOS = Object.freeze({
  TODOS: "todos",
  CON_MOVIMIENTOS: "con_movimientos",
  // Los que explican el cambio de VALOR: se movieron, se revalorizaron, o no se
  // pudieron valorizar. Ordenados por el tamaño de su variación (ver
  // `paginaDeProductosPorValor`). Es el listado del Valor del Stock.
  CON_VALOR: "con_valor",
  APARECEN: "aparecen",
  DESAPARECEN: "desaparecen",
  REINTERPRETADOS: "reinterpretados",
  SIN_CLASIFICAR: "sin_clasificar",
});

const UNIDADES_PEDIBLES = [UNIDAD_DE_PERIODO.DIA, UNIDAD_DE_PERIODO.SEMANA, UNIDAD_DE_PERIODO.MES, UNIDAD_DE_PERIODO.ANIO];

// ════════════════════════════════════════════════════════════════════════════
// Lo que se lee de la URL
// ════════════════════════════════════════════════════════════════════════════

const vacio = (v) => v === null || v === undefined || v === "";

/**
 * EL PERÍODO PEDIDO: `unidad` (DIA, SEMANA, MES o ANIO) más una `fecha` que la
 * contiene —sin fecha, hoy según la base—, o `desde` y `hasta` para un rango.
 * Las dos formas juntas son un error: no hay forma de saber cuál quiso.
 */
export function leerPedidoDePeriodo(sp) {
  const unidadCruda = sp.get("unidad");
  const fecha = sp.get("fecha");
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");
  const conRango = !vacio(desde) || !vacio(hasta);

  if (conRango) {
    if (!vacio(unidadCruda) || !vacio(fecha)) {
      throw new ErrorStockDiario("PERIODO_INVALIDO", "Pedí el período con unidad y fecha, o con desde y hasta; no con las dos formas.");
    }
    if (!esDiaValido(desde) || !esDiaValido(hasta)) {
      throw new ErrorStockDiario("DIA_INVALIDO", `desde y hasta tienen que ser días "YYYY-MM-DD": recibí ${JSON.stringify({ desde, hasta })}`);
    }
    if (hasta < desde) throw new ErrorStockDiario("RANGO_INVALIDO", `El período termina (${hasta}) antes de empezar (${desde}).`);
    return { unidad: UNIDAD_DE_PERIODO.RANGO, fecha: null, desde, hasta };
  }

  const unidad = vacio(unidadCruda) ? UNIDAD_DE_PERIODO.DIA : String(unidadCruda).toUpperCase();
  if (!UNIDADES_PEDIBLES.includes(unidad)) {
    throw new ErrorStockDiario("UNIDAD_INVALIDA", `unidad tiene que ser ${UNIDADES_PEDIBLES.join(", ")}: recibí ${JSON.stringify(unidadCruda)}`);
  }
  if (!vacio(fecha) && !esDiaValido(fecha)) {
    throw new ErrorStockDiario("DIA_INVALIDO", `fecha tiene que ser un día "YYYY-MM-DD": recibí ${JSON.stringify(fecha)}`);
  }
  return { unidad, fecha: vacio(fecha) ? null : fecha, desde: null, hasta: null };
}

/** `page` y `pageSize`, con el default y el tope del motor. */
export function leerPagina(sp) {
  return exigirPagina({
    page: vacio(sp.get("page")) ? 1 : sp.get("page"),
    pageSize: vacio(sp.get("pageSize")) ? PAGINA.DEFECTO : sp.get("pageSize"),
  });
}

/** Un id entero positivo pedido por la URL, obligatorio u opcional. */
export function leerId(sp, nombre, { obligatorio = false } = {}) {
  const v = sp.get(nombre);
  if (vacio(v)) {
    if (obligatorio) throw new ErrorStockDiario("ID_INVALIDO", `Falta ${nombre}.`);
    return null;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorStockDiario("ID_INVALIDO", `${nombre} tiene que ser un entero positivo: recibí ${JSON.stringify(v)}`);
  return n;
}

/** Los filtros del listado de productos. */
export function leerFiltroProductos(sp) {
  const filtro = vacio(sp.get("filtro")) ? FILTRO_PRODUCTOS.TODOS : sp.get("filtro");
  if (!Object.values(FILTRO_PRODUCTOS).includes(filtro)) {
    throw new ErrorStockDiario("FILTRO_INVALIDO", `filtro tiene que ser ${Object.values(FILTRO_PRODUCTOS).join(", ")}: recibí ${JSON.stringify(filtro)}`);
  }
  const q = vacio(sp.get("q")) ? null : String(sp.get("q")).trim() || null;
  return { filtro, q, categoriaId: leerId(sp, "categoriaId") };
}

// ════════════════════════════════════════════════════════════════════════════
// Qué local se mira
// ════════════════════════════════════════════════════════════════════════════

/**
 * EL LOCAL DE LA CONSULTA, según la vista operativa (`resolveVistaOperativa`).
 *
 *   LOCAL  → el de la vista y ningún otro. Un `localId` distinto en la URL es
 *            403: no se ignora en silencio, porque quien lo pidió creería estar
 *            mirando otra ubicación. Un depósito es un local más: ve el suyo.
 *   GLOBAL → `localId` obligatorio, y tiene que ser uno de los locales del grupo
 *            activo. No se suma nada: el Stock Diario es de UNA ubicación, y
 *            sumar mezclaría los bultos del depósito con las unidades de los
 *            locales.
 */
export function localDeLaVista(vista, localIdPedido) {
  const pedido = vacio(localIdPedido) ? null : Number(localIdPedido);
  if (pedido !== null && (!Number.isInteger(pedido) || pedido <= 0)) {
    return { status: 400, error: `localId tiene que ser un entero positivo: recibí ${JSON.stringify(localIdPedido)}` };
  }
  if (vista.modo === "LOCAL") {
    if (pedido !== null && pedido !== Number(vista.localId)) return { status: 403, error: ERROR_FUERA_DE_ALCANCE };
    return { localId: Number(vista.localId) };
  }
  if (vista.modo === "GLOBAL") {
    if (pedido === null) return { status: 400, codigo: CODIGO_FALTA_UBICACION, error: "En la vista global hay que elegir una ubicación: falta localId." };
    if (!(vista.localIds || []).map(Number).includes(pedido)) return { status: 403, error: ERROR_FUERA_DE_ALCANCE };
    return { localId: pedido };
  }
  return { status: 403, error: "Sin alcance autorizado." };
}

// ════════════════════════════════════════════════════════════════════════════
// Filtrar, contar, ordenar y paginar productos
// ════════════════════════════════════════════════════════════════════════════

// Los movimientos de verdad: el punto de partida (ESTADO_INICIAL) es el estado
// que el libro encontró al activarse, no algo que le pasó al producto.
const movimientosReales = (c) => (c.porTipo?.[ALTA] ?? 0) + (c.porTipo?.[CAMBIO] ?? 0) + (c.porTipo?.[BAJA] ?? 0);

const PREDICADOS = Object.freeze({
  [FILTRO_PRODUCTOS.TODOS]: () => true,
  [FILTRO_PRODUCTOS.CON_MOVIMIENTOS]: (c) => movimientosReales(c) > 0,
  // Sin la valorización pegada (`c.valor`) no hay nada que decir de su valor: el
  // filtro solo se usa sobre cadenas a las que la ruta ya les pegó su valor.
  [FILTRO_PRODUCTOS.CON_VALOR]: (c) => movimientosReales(c) > 0 || (c.valor ? tieneValorQueMirar(c.valor) && (c.valor.variacion !== 0 || !c.valor.completa) : false),
  [FILTRO_PRODUCTOS.APARECEN]: (c) => (c.porTipo?.[ALTA] ?? 0) > 0,
  [FILTRO_PRODUCTOS.DESAPARECEN]: (c) => (c.porTipo?.[BAJA] ?? 0) > 0,
  [FILTRO_PRODUCTOS.REINTERPRETADOS]: (c) => c.reinterpretada === true,
  [FILTRO_PRODUCTOS.SIN_CLASIFICAR]: (c) => (c.sinClasificar ?? 0) > 0,
});

/** ¿La cadena pasa el filtro? Una sola definición para filtrar y para contar. */
export function pasaFiltro(cadena, filtro) {
  const p = PREDICADOS[filtro];
  if (!p) throw new ErrorStockDiario("FILTRO_INVALIDO", `filtro desconocido: ${JSON.stringify(filtro)}`);
  return p(cadena);
}

/** Minúsculas y sin tildes: "Azúcar" se encuentra con "azucar". */
export const normalizarTexto = (t) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** ¿El texto buscado está en el nombre o en el código que se muestra? */
export function coincideTexto(identidad, q) {
  if (!q) return true;
  const buscado = normalizarTexto(q);
  return [identidad?.nombre, identidad?.codigoBarra].some((campo) => normalizarTexto(campo).includes(buscado));
}

/**
 * ¿La cadena termina el período con mercadería en tránsito? Se mira el CIERRE,
 * que en un período en curso es el estado de ahora (provisional) y en uno
 * completo el del último día. Un cierre que no existe —el producto se dio de
 * baja— no tiene tránsito; uno desconocido no se cuenta como si no tuviera: el
 * resumen fuera de historia ni siquiera trae conteos.
 */
export const terminaEnTransito = (c) => c.cierre?.existencia === EXISTENCIA.EXISTE && Number(c.cierre.enTransito) > 0;

/** Los conteos del resumen, con los mismos predicados que los filtros. */
export function conteosDeCadenas(cadenas) {
  const contar = (filtro) => cadenas.filter((c) => pasaFiltro(c, filtro)).length;
  return {
    productos: cadenas.length,
    conMovimientos: contar(FILTRO_PRODUCTOS.CON_MOVIMIENTOS),
    aparecen: contar(FILTRO_PRODUCTOS.APARECEN),
    desaparecen: contar(FILTRO_PRODUCTOS.DESAPARECEN),
    reinterpretados: contar(FILTRO_PRODUCTOS.REINTERPRETADOS),
    sinClasificar: contar(FILTRO_PRODUCTOS.SIN_CLASIFICAR),
    // Productos con tránsito AL FINAL del período, no con tránsito movido en él.
    conTransitoAlCierre: cadenas.filter(terminaEnTransito).length,
  };
}

/** Por nombre y, a igual nombre o sin nombre, por `productoLocalId`: un orden estable entre páginas. */
export function ordenarCadenas(cadenas) {
  return [...cadenas].sort((a, b) => {
    const na = a.identidad?.nombre ?? null;
    const nb = b.identidad?.nombre ?? null;
    if (na !== nb) {
      if (na === null) return 1;
      if (nb === null) return -1;
      const c = normalizarTexto(na).localeCompare(normalizarTexto(nb), "es");
      if (c !== 0) return c;
    }
    return a.productoLocalId - b.productoLocalId;
  });
}

/**
 * EL ORDEN DEL VALOR DEL STOCK: primero las que no se pudieron valorizar —son
 * las que hacen incompleto el total—, después por el tamaño de la variación, sin
 * importar el signo, y a igual variación por nombre. Lo que más movió el
 * capital arriba.
 */
export function ordenarPorValor(cadenas) {
  const porNombre = ordenarCadenas(cadenas);
  const lugar = new Map(porNombre.map((c, i) => [c, i]));
  return porNombre.sort((a, b) => {
    const fa = a.valor?.completa === false ? 0 : 1;
    const fb = b.valor?.completa === false ? 0 : 1;
    if (fa !== fb) return fa - fb;
    const va = Math.abs(a.valor?.variacion ?? 0);
    const vb = Math.abs(b.valor?.variacion ?? 0);
    if (va !== vb) return vb - va;
    return lugar.get(a) - lugar.get(b);
  });
}

/** Filtra, ordena y corta la página. La cantidad de cadenas es la del local, no la del libro. */
export function paginaDeProductos(cadenas, { filtro, q, categoriaId }, pagina) {
  const ordenar = filtro === FILTRO_PRODUCTOS.CON_VALOR ? ordenarPorValor : ordenarCadenas;
  const elegidas = ordenar(
    cadenas.filter(
      (c) => pasaFiltro(c, filtro) && coincideTexto(c.identidad, q) && (categoriaId === null || c.identidad?.categoriaActualId === categoriaId)
    )
  );
  const total = elegidas.length;
  const inicio = (pagina.page - 1) * pagina.pageSize;
  return {
    total,
    page: pagina.page,
    pageSize: pagina.pageSize,
    totalPages: Math.max(1, Math.ceil(total / pagina.pageSize)),
    items: elegidas.slice(inicio, inicio + pagina.pageSize),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// La forma de la respuesta
// ════════════════════════════════════════════════════════════════════════════

export const localApi = (local) => ({ id: local.id, nombre: local.nombre ?? null, esDeposito: local.es_deposito === true });

/** La identidad con los nombres del contrato. Sin identidad, solo la cadena física. */
export function identidadApi(identidad, productoLocalId) {
  return {
    productoLocalId,
    productoBaseId: identidad?.productoBaseId ?? null,
    nombre: identidad?.nombre ?? null,
    codigo: identidad?.codigoBarra ?? null,
    unidad: identidad?.unidadMedida ?? null,
    // Cómo se LEE la cantidad, que está en unidades físicas: factor, peso y
    // modos actuales. Null si el producto ya no existe.
    escala: identidad?.escala ?? null,
    fuente: identidad?.fuente ?? "DESCONOCIDA",
    productoEliminado: identidad?.productoEliminado ?? null,
    categoriaActualId: identidad?.categoriaActualId ?? null,
    categoriaActualNombre: identidad?.categoriaActualNombre ?? null,
  };
}

/** Una apertura o un cierre: la existencia manda; sin EXISTE, los números van en null. */
export function saldoApi(e) {
  const existe = e.existencia === EXISTENCIA.EXISTE;
  return {
    existencia: e.existencia,
    motivo: e.motivo ?? null,
    cantidad: existe ? e.cantidad : null,
    enTransito: existe ? e.enTransito : null,
    provisional: e.provisional === true,
  };
}

export const reinterpretacionApi = (r) => ({
  entidad: r.entidad,
  entidadId: r.entidadId,
  campo: r.campo,
  valorAnterior: r.valorAnterior ?? null,
  valorNuevo: r.valorPosterior ?? null,
  dia: r.dia,
  instante: r.instante,
  filasConStock: r.filasConStock,
});

/**
 * EL VALOR DE UN PRODUCTO EN EL PERÍODO, para su detalle: cantidades en
 * unidades físicas (la pantalla las lee con la presentación de Stock Locales),
 * costos por unidad física congelados, y los importes en pesos. Sin costo, los
 * importes van en null y `faltante` dice qué día y por qué: nunca un cero.
 */
export function valorDeCadenaApi(v) {
  if (!v) return null;
  return {
    completo: v.completa,
    faltante: v.faltante,
    stockNegativo: v.stockNegativo,
    cantidadInicial: deMilesimas(v.cantidadInicial),
    cantidadFinal: deMilesimas(v.cantidadFinal),
    costoInicial: v.costoInicial,
    costoFinal: v.costoFinal,
    unidadFisica: v.unidadFisica ?? null,
    anomaliasDeCosto: v.anomaliasDeCosto ?? [],
    nacioEnElPeriodo: v.nacioEnElPeriodo === true,
    inicial: aPesos(v.inicial),
    final: aPesos(v.final),
    variacion: aPesos(v.variacion),
    fisico: aPesos(v.fisico),
    revalorizacion: aPesos(v.revalorizacion),
    reexpresion: aPesos(v.reexpresion),
  };
}

/** Lo que se sabe del tránsito en una punta, en pesos. */
const transitoApi = (t) =>
  t
    ? {
        valor: aPesos(t.valor),
        completo: t.completo && t.noConciliado.length === 0,
        lineas: t.lineas,
        transferencias: t.transferencias,
        lineasSinValor: t.sinValor.length,
        productosNoConciliados: t.noConciliado.length,
      }
    : null;

/**
 * EL VALOR DEL STOCK DEL PERÍODO, arriba de todo en la pantalla. Todo lo que no
 * se pudo valorizar se cuenta y se nombra; nada se suma como cero.
 *
 * @param {object} v   lo de `valorDelPeriodo`; los faltantes se nombran con la
 *   identidad de su cadena.
 */
export function valorApi(v) {
  const a = v.alcance;
  const t = v.totales;
  const nombreDe = new Map(v.cadenas.map((c) => [c.productoLocalId, c.identidad?.nombre ?? null]));
  return {
    estado: a.estado,
    motivo: a.motivo,
    primerDiaValorizable: a.primerDia,
    desde: a.desdeValorizado,
    hasta: a.hastaValorizado,
    recortado: a.recortado,
    enCurso: a.enCurso,
    completo: t ? t.completo : false,
    inicial: t ? aPesos(t.inicial) : null,
    final: t ? aPesos(t.final) : null,
    variacion: t ? aPesos(t.variacion) : null,
    fisico: t ? aPesos(t.fisico) : null,
    revalorizacion: t ? aPesos(t.revalorizacion) : null,
    reexpresion: t ? aPesos(t.reexpresion) : null,
    cuadra: t ? t.cuadra : null,
    evolucion: t ? t.evolucion.map((e) => ({ dia: e.dia, valor: aPesos(e.valor) })) : [],
    productosValorizados: t ? t.cadenasValorizadas : 0,
    productosConStockNegativo: t ? t.cadenasConStockNegativo : 0,
    faltantes: t ? t.faltantes.map((f) => ({ ...f, nombre: nombreDe.get(f.productoLocalId) ?? null })) : [],
    transito: v.transito ? { alAbrir: transitoApi(v.transito.alAbrir), alCerrar: transitoApi(v.transito.alCerrar) } : null,
    explicacion: t?.explicacion ? explicacionApi(t.explicacion) : null,
  };
}

/**
 * ¿POR QUÉ CAMBIÓ? El movimiento físico por categoría de origen, en pesos, con
 * las entradas y las salidas de cada una por separado y la identidad contra el
 * movimiento físico. Las categorías van todas, en su orden: la pantalla decide
 * cuáles esconde.
 */
export function explicacionApi(e) {
  return {
    cuadra: e.cuadra,
    total: aPesos(e.total),
    desvioMaximoDeRedondeo: aPesos(e.desvioMaximoDeRedondeo ?? 0),
    sinClasificar: { movimientos: e.sinClasificar.movimientos, efecto: aPesos(e.sinClasificar.efecto) },
    categorias: e.categorias.map((c) => ({
      categoria: c.categoria,
      neto: aPesos(c.neto),
      entradas: aPesos(c.entradas),
      salidas: aPesos(c.salidas),
      movimientos: c.movimientos,
      movimientosDeEntrada: c.movimientosDeEntrada,
      movimientosDeSalida: c.movimientosDeSalida,
      origenes: c.origenes,
    })),
  };
}

/**
 * Un movimiento del detalle de una categoría: el delta físico y su efecto en pesos.
 * `unidad`, `escala` y `esDepositoDelMomento` son los del Libro de Costos en el
 * instante del movimiento, no los de hoy: un pack x6 de ayer se lee x6. Si el
 * libro no los tiene, quedan los actuales y `esDepositoDelMomento` va en null.
 */
export const movimientoDeCategoriaApi = (m) => ({
  id: m.id,
  instante: m.instante,
  dia: m.dia,
  tipo: m.tipo,
  origen: m.origen,
  origenRef: m.origenRef,
  categoria: m.categoria,
  ...identidadApi(m.identidad, m.productoLocalId),
  ...(m.escalaDelMomento
    ? { unidad: m.escalaDelMomento.unidadMedida ?? null, escala: m.escalaDelMomento.escala, esDepositoDelMomento: m.escalaDelMomento.esDeposito === true }
    : { esDepositoDelMomento: null }),
  delta: deMilesimas(m.delta),
  costo: m.costo,
  efecto: aPesos(m.efecto),
});

/** Una fila del listado, o el producto del detalle (`conDetalle`: las reinterpretaciones una por una). */
export function cadenaApi(c, { conDetalle = false } = {}) {
  return {
    ...identidadApi(c.identidad, c.productoLocalId),
    valor: valorDeCadenaApi(c.valor),
    apertura: saldoApi(c.apertura),
    cierre: saldoApi(c.cierre),
    cantidad: c.cantidad,
    enTransito: c.enTransito,
    movimientos: c.movimientos,
    porTipo: c.porTipo,
    sinClasificar: c.sinClasificar,
    cuadra: c.cuadra,
    reinterpretada: c.reinterpretada,
    reinterpretaciones: conDetalle ? c.reinterpretaciones.map(reinterpretacionApi) : c.reinterpretaciones.length,
  };
}

/** Un movimiento: todo lo del motor, sin cambiar un número. */
export const movimientoApi = (m) => ({
  id: m.id,
  instante: m.instante,
  dia: m.dia,
  tipo: m.tipo,
  efecto: m.efecto,
  productoLocalId: m.productoLocalId,
  productoBaseId: m.productoBaseId,
  stockLocalId: m.stockLocalId,
  cantidad: m.cantidad,
  enTransito: m.enTransito,
  puntoDePartida: m.puntoDePartida,
  apareceCon: m.apareceCon,
  desapareceCon: m.desapareceCon,
  origen: m.origen,
  origenRef: m.origenRef,
  sinClasificar: m.sinClasificar,
  clasificacion: m.origenLegible,
  identidadCongelada: m.identidadCongelada,
});

export const paginaDeMovimientosApi = (p) => ({ ...p, items: p.items.map(movimientoApi) });

/**
 * LO QUE SE SABE DEL PERÍODO, arriba de todo, más cómo se pidió. `semana` trae
 * la vigencia que se usó (o que no había configuración).
 */
export function periodoApi({ periodo, puntoCero, hoy }, rango) {
  return {
    periodo: {
      unidad: rango.unidad,
      fecha: rango.fecha ?? null,
      desde: periodo.desde,
      hasta: periodo.hasta,
      semana: rango.semana ?? null,
    },
    puntoCero: puntoCero ?? null,
    hoy,
    estado: periodo.estado,
    desdeEfectivo: periodo.desdeEfectivo,
    hastaEfectivo: periodo.hastaEfectivo,
    parcial: periodo.parcial,
    enCurso: periodo.enCurso,
    recortadoAHoy: periodo.recortadoAHoy,
  };
}

function totalDeUnLado(t) {
  return {
    apertura: t.apertura.total,
    cierre: t.cierre.total,
    entradas: t.entradas,
    salidas: t.salidas,
    // CUÁNTOS movimientos entraron y salieron, no cuánto: `entradas` y
    // `salidas` son cantidades y suman UNIDAD con KG; éstos son conteos de los
    // mismos movimientos (ver `CONTEOS_DEL_MOVIDO`).
    movimientosDeEntrada: t.movimientosDeEntrada,
    movimientosDeSalida: t.movimientosDeSalida,
    cambioNeto: t.cambioNeto,
    apareceCon: t.apareceCon,
    desapareceCon: t.desapareceCon,
    puntoDePartida: t.puntoDePartida,
    // Cuántas cadenas sostienen cada total: con una sola desconocida, el total
    // es null y no la suma de las conocidas.
    aperturaDetalle: { existen: t.apertura.existen, noExisten: t.apertura.noExisten, desconocidas: t.apertura.desconocidas },
    cierreDetalle: { existen: t.cierre.existen, noExisten: t.cierre.noExisten, desconocidas: t.cierre.desconocidas },
  };
}

/** Los totales del motor, cantidad y tránsito separados. Fuera de historia: null. */
export function totalesApi(totales) {
  if (!totales) return null;
  return {
    movimientos: totales.movimientos,
    movimientosSinClasificar: totales.sinClasificar,
    cantidad: totalDeUnLado(totales.cantidad),
    enTransito: totalDeUnLado(totales.enTransito),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Errores
// ════════════════════════════════════════════════════════════════════════════

/**
 * UN ERROR, COMO LO VE EL CLIENTE.
 *
 * Los de la pregunta —día mal escrito o futuro, rango al revés, unidad, filtro,
 * página, id— son 400 con el texto del motor, que es nuestro y no trae nada de
 * la base.
 *
 * Cualquier otro es 500 y NO lleva el `message` crudo: el de Prisma puede traer
 * el SQL, el nombre de la base o el host (`Can't reach database server at …`). Se
 * devuelve qué pasó en palabras nuestras y, si Prisma lo dio, su código (P2010,
 * P1001…), que alcanza para buscarlo en los logs sin exponer nada. El detalle
 * completo queda en el log del servidor.
 */
export function respuestaDeError(err) {
  if (err instanceof ErrorStockDiario || err?.name === "ErrorStockDiario") {
    return { status: 400, body: { ok: false, error: err.message, codigo: err.codigo } };
  }
  const codigo = typeof err?.code === "string" && /^P\d{4}$/.test(err.code) ? err.code : null;
  return {
    status: 500,
    body: {
      ok: false,
      error: codigo
        ? `No se pudo armar el Stock Diario: falló la consulta a la base (${codigo}).`
        : "No se pudo armar el Stock Diario: falló el servidor al calcularlo.",
      codigo,
    },
  };
}
