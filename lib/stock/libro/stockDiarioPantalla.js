// lib/stock/libro/stockDiarioPantalla.js
//
// LA PANTALLA DEL STOCK DIARIO, LA PARTE PURA: qué se le pide a la API, cómo se
// navega de un período al otro y qué dice cada renglón. No calcula stock: todo
// número sale de `/api/stock_locales/diario/*`, y acá solo se decide cómo se
// escribe.
//
// ── EL PERÍODO LO DECIDE EL SERVIDOR ─────────────────────────────────────
//
// La pantalla pide `unidad` y una `fecha` que el período contiene, o `desde` y
// `hasta` para "Otro". El servidor devuelve el período que armó —la semana es
// la de Semana Operativa de la ubicación— y la pantalla navega con esas puntas:
// el anterior es el que contiene el día antes de `desde`, el siguiente el que
// contiene el día después de `hasta`. Así ninguna semana se calcula dos veces,
// y una ubicación con corte los lunes se navega de lunes a lunes sin que la
// pantalla lo sepa.
//
// ── LO QUE NO SE SABE NO ES CERO ─────────────────────────────────────────
//
// Una apertura DESCONOCIDA dice "No disponible"; un saldo que NO_EXISTE —el
// producto todavía no estaba, o se dio de baja— dice "No existe". Ninguno de los
// dos es un 0, y con cualquiera de los dos no hay variación: restar contra un
// cero inventado diría que se vendió o que entró algo que el libro no registra.

import { EXISTENCIA, ESTADO_DEL_DIA, UNIDAD_DE_PERIODO } from "./stockDiario.js";
import { FILTRO_PRODUCTOS } from "./stockDiarioApi.js";
import { ESTADO_VALOR, MOTIVO_COSTO_FALTANTE, MOTIVO_SIN_VALOR } from "./valorDelStock.js";
import { UNIDADES, rotuloDelRango, sumarDias } from "@/lib/transferencias/periodoDePago";
import { CLAVE_OTRO } from "@/components/transferencias/ChipsDePeriodo";
import { diaSemanaAR, fechaLargaAR, horaAR } from "@/lib/fechas/formatearFechaHora";
import { presentacionCantidadStock } from "@/lib/stock/presentacion";
import { formatearMoneda } from "@/lib/moneda";

import { RUTA_STOCK_DIARIO } from "./rutasStockDiario.js";

export { NOMBRE_VALOR_DEL_STOCK, PERMISO_STOCK_DIARIO, RUTA_STOCK_DIARIO } from "./rutasStockDiario.js";
/**
 * El listado es el de los productos que explican el cambio de VALOR —se
 * movieron, se revalorizaron o no tienen costo—, ordenados por cuánto lo
 * movieron. El servidor filtra y ordena.
 */
export const FILTRO_DE_LA_LISTA = FILTRO_PRODUCTOS.CON_VALOR;
export const PRODUCTOS_POR_PAGINA = 50;
/**
 * La búsqueda va al servidor (`q`, sobre nombre y código, todo el local) un
 * momento después de la última tecla: el patrón de los buscadores de pedidos,
 * de clientes y de Gastos. En la pantalla no se filtra nada: la página cargada
 * no es el conjunto.
 */
export const ESPERA_BUSQUEDA_MS = 350;

const UNIDADES_DE_LA_PANTALLA = [UNIDADES.DIA, UNIDADES.SEMANA, UNIDADES.MES, UNIDAD_DE_PERIODO.ANIO, CLAVE_OTRO];
const esDia = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// ── EL CONTEXTO, EN LA URL ───────────────────────────────────────────────

/** Un id de ubicación de la URL: entero positivo o nada. */
const idDeUbicacion = (v) => (/^[1-9]\d*$/.test(String(v ?? "")) ? Number(v) : null);

/**
 * `unidad` (DIA por defecto), `fecha` que el período contiene, o `desde`/`hasta`
 * en Otro. Y `localId`: la ubicación que eligió un admin en vista global. Para
 * un usuario con local no hace falta —el servidor usa el suyo— y si viniera uno
 * ajeno el servidor contesta 403: la URL no amplía ningún alcance.
 */
export function parseContextoStockDiario(input) {
  const get = (k) => (typeof input?.get === "function" ? input.get(k) : input?.[k]) ?? null;
  const cruda = String(get("unidad") ?? "").toUpperCase();
  const unidad = UNIDADES_DE_LA_PANTALLA.includes(cruda) ? cruda : UNIDADES.DIA;
  const localId = idDeUbicacion(get("localId"));
  if (unidad === CLAVE_OTRO) {
    const desde = esDia(get("desde")) ? get("desde") : null;
    const hasta = esDia(get("hasta")) ? get("hasta") : null;
    return { unidad, fecha: null, desde, hasta, localId };
  }
  return { unidad, fecha: esDia(get("fecha")) ? get("fecha") : null, desde: null, hasta: null, localId };
}

export function urlDeStockDiario(ctx = {}) {
  const qs = new URLSearchParams();
  if (ctx.localId) qs.set("localId", String(ctx.localId));
  if (ctx.unidad && ctx.unidad !== UNIDADES.DIA) qs.set("unidad", ctx.unidad);
  if (ctx.unidad === CLAVE_OTRO) {
    if (ctx.desde) qs.set("desde", ctx.desde);
    if (ctx.hasta) qs.set("hasta", ctx.hasta);
  } else if (ctx.fecha) qs.set("fecha", ctx.fecha);
  const s = qs.toString();
  return s ? `${RUTA_STOCK_DIARIO}?${s}` : RUTA_STOCK_DIARIO;
}

// ── LO QUE SE LE PIDE A LA API ───────────────────────────────────────────

/**
 * Los parámetros del período, o `null` si todavía no hay período que pedir
 * ("Otro" sin las dos fechas). Sin fecha, el servidor usa hoy.
 */
export function periodoDeLaConsulta(ctx) {
  const qs = new URLSearchParams();
  if (ctx.localId) qs.set("localId", String(ctx.localId));
  if (ctx.unidad === CLAVE_OTRO) {
    if (!ctx.desde || !ctx.hasta) return null;
    qs.set("desde", ctx.desde);
    qs.set("hasta", ctx.hasta);
  } else {
    qs.set("unidad", ctx.unidad);
    if (ctx.fecha) qs.set("fecha", ctx.fecha);
  }
  return qs;
}

export function consultaDelResumen(ctx) {
  const qs = periodoDeLaConsulta(ctx);
  return qs ? qs.toString() : null;
}

export function consultaDeProductos(ctx, { q = "", page = 1 } = {}) {
  const qs = periodoDeLaConsulta(ctx);
  if (!qs) return null;
  qs.set("filtro", FILTRO_DE_LA_LISTA);
  const termino = String(q ?? "").trim();
  if (termino) qs.set("q", termino);
  qs.set("page", String(page));
  qs.set("pageSize", String(PRODUCTOS_POR_PAGINA));
  return qs.toString();
}

// ── LA UBICACIÓN, SOLO EN LA VISTA GLOBAL ────────────────────────────────

/**
 * Las opciones del selector de ubicación, o null si no hay nada que elegir. La
 * lista la manda el SERVIDOR (`ubicaciones`, en la respuesta o en el 400
 * FALTA_UBICACION) y solo a un admin en vista global: son las del grupo activo
 * que `resolveVistaOperativa` ya autoriza. Acá no se agrega ninguna.
 */
export function opcionesDeUbicacion(ubicaciones) {
  if (!Array.isArray(ubicaciones) || ubicaciones.length === 0) return null;
  return ubicaciones.map((u) => ({ valor: String(u.id), texto: u.esDeposito ? `${u.nombre} · depósito` : u.nombre }));
}

// ── NAVEGAR ──────────────────────────────────────────────────────────────

/** El período anterior: el que contiene el día antes de `desde`, según el servidor. */
export function contextoAnterior(ctx, respuesta) {
  return { ...ctx, fecha: sumarDias(respuesta.periodo.desde, -1) };
}

/** El siguiente: el que contiene el día después de `hasta`. */
export function contextoSiguiente(ctx, respuesta) {
  return { ...ctx, fecha: sumarDias(respuesta.periodo.hasta, 1) };
}

/** Un rango elegido a mano no tiene vecinos: se elige otro. */
export function puedeRetroceder(ctx, respuesta) {
  return ctx.unidad !== CLAVE_OTRO && Boolean(respuesta?.periodo?.desde);
}

/** Al futuro no se va: el servidor lo rechaza, y el botón no lo ofrece. */
export function puedeAvanzar(ctx, respuesta) {
  return ctx.unidad !== CLAVE_OTRO && Boolean(respuesta?.periodo?.hasta) && respuesta.periodo.hasta < respuesta.hoy;
}

// ── LOS TEXTOS ───────────────────────────────────────────────────────────

const mayuscula = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
/** Un día `YYYY-MM-DD` es un día argentino: se ancla al mediodía para que la zona no lo mueva. */
const diaLargo = (dia) => fechaLargaAR(`${dia}T12:00:00-03:00`);
const diaCorto = (dia) => rotuloDelRango({ desde: dia, hasta: dia });
const horaDelPuntoCero = (r) => (r?.puntoCero?.instante ? horaAR(r.puntoCero.instante) : null);
const esUnDia = (r) => r?.periodo?.desde === r?.periodo?.hasta;

/** Desde cuándo hay historia en un período parcial: "las 21:19" o "el domingo 27 de septiembre a las 21:19". */
function desdeCuandoHayHistoria(r, { conDia }) {
  const hora = horaDelPuntoCero(r);
  if (!hora) return null;
  return conDia && r.puntoCero?.dia ? `el ${diaLargo(r.puntoCero.dia)} a las ${hora}` : `las ${hora}`;
}

/** El centro del navegador: qué período es y qué se sabe de él. */
export function textosDelNavegador(r) {
  const unDia = esUnDia(r);
  const { desde, hasta } = r.periodo;
  if (r.estado === ESTADO_DEL_DIA.FUERA_DE_HISTORIA) {
    return { titulo: unDia ? mayuscula(diaLargo(desde)) : rotuloDelRango({ desde, hasta }), subtitulo: "fuera de historia" };
  }
  if (r.estado === ESTADO_DEL_DIA.PARCIAL_PUNTO_CERO) {
    const desdeCuando = desdeCuandoHayHistoria(r, { conDia: !unDia });
    const titulo = unDia ? (r.enCurso ? "Hoy · parcial" : mayuscula(diaLargo(desde))) : rotuloDelRango({ desde, hasta });
    return { titulo, subtitulo: desdeCuando ? `parcial · historial desde ${desdeCuando}` : "parcial" };
  }
  if (r.estado === ESTADO_DEL_DIA.EN_CURSO) {
    if (unDia) return { titulo: "Hoy · en curso", subtitulo: `${diaLargo(desde)} · desde las 00:00` };
    return { titulo: rotuloDelRango({ desde, hasta }), subtitulo: r.recortadoAHoy ? `en curso · hasta hoy, ${diaCorto(r.hastaEfectivo)}` : "en curso" };
  }
  return { titulo: unDia ? mayuscula(diaLargo(desde)) : rotuloDelRango({ desde, hasta }), subtitulo: unDia ? "día completo" : "período completo" };
}

const plural = (n, uno, varios) => (n === 1 ? uno : varios);

/**
 * El bloque de actividad: el rótulo, y el aviso de cómo leer las filas cuando
 * no son un cierre —en curso— o no tienen apertura —parcial—.
 */
export function textosDelResumen(r) {
  const unDia = esUnDia(r);
  if (r.estado === ESTADO_DEL_DIA.PARCIAL_PUNTO_CERO) {
    const hora = horaDelPuntoCero(r);
    const desdeCuando = desdeCuandoHayHistoria(r, { conDia: !unDia });
    return {
      rotulo: unDia && hora ? `Actividad desde las ${hora}` : "Actividad del período",
      aviso: `Parcial${desdeCuando ? ` · historial desde ${desdeCuando}` : ""} · la apertura de cada producto no se conoce`,
    };
  }
  if (r.estado === ESTADO_DEL_DIA.EN_CURSO) {
    return {
      rotulo: unDia ? "Actividad de hoy" : "Actividad del período",
      aviso: `${unDia ? "Día" : "Período"} en curso · cada producto muestra Apertura → Ahora, no el cierre`,
    };
  }
  return { rotulo: unDia ? "Actividad del día" : "Actividad del período", aviso: null };
}

/** Las tres columnas: CONTEOS de movimientos y de productos, nunca cantidades sumadas. */
export function columnasDelResumen(r) {
  const c = r.totales?.cantidad;
  const n = (v) => (typeof v === "number" ? v : null);
  const entradas = n(c?.movimientosDeEntrada);
  const salidas = n(c?.movimientosDeSalida);
  const transito = n(r.conteos?.conTransitoAlCierre);
  return [
    { clave: "entradas", rotulo: "Entradas", valor: entradas, unidad: plural(entradas, "movimiento", "movimientos") },
    { clave: "salidas", rotulo: "Salidas", valor: salidas, unidad: plural(salidas, "movimiento", "movimientos") },
    { clave: "transito", rotulo: "En tránsito", valor: transito, unidad: plural(transito, "producto", "productos") },
  ];
}

/** "214 productos", "1 producto": los que explican el cambio de valor. */
export function datoDeLaLista(total) {
  return `${total} ${plural(total, "producto", "productos")}`;
}

/** Fuera de historia: por qué no hay números, y desde cuándo los habría. */
export function textoFueraDeHistoria(r) {
  const hora = horaDelPuntoCero(r);
  const dia = r?.puntoCero?.dia;
  const titulo = esUnDia(r) ? "Sin historial de stock para este día" : "Sin historial de stock para este período";
  if (!dia || !hora) {
    return { titulo, detalle: "El registro de stock todavía no empezó: no hay datos de ningún producto. No es cero." };
  }
  return {
    titulo,
    detalle: `El registro de stock empieza el ${diaLargo(dia).split(" ")[0]} ${diaCorto(dia)} a las ${hora}. Antes de esa hora no hay datos de ningún producto: no es cero.`,
  };
}

// ── UN PRODUCTO ──────────────────────────────────────────────────────────

/**
 * UNA CANTIDAD DEL LIBRO, LEÍDA COMO LA LEE STOCK LOCALES.
 *
 * El libro copia `StockLocal.cantidad`, que está SIEMPRE en unidades físicas:
 * botellas, kilos o piezas, nunca bultos. Hasta el 2026-09-30 esta pantalla le
 * pegaba al número la unidad de medida del producto en mayúsculas, y un pack x6
 * con 36 botellas se leía "36 PACK" —seis veces lo que había—. El número estaba
 * bien; mentía el rótulo.
 *
 * La lectura es la de `presentacionCantidadStock` y ninguna otra: en el depósito
 * un pack o cajón con factor se desglosa en bultos + sueltas, en un local se
 * cuenta en unidades, el kilo en kilos y la pieza del depósito en piezas. Por
 * eso depende de la ubicación (`esDeposito`) y de la escala del producto, que
 * la API manda en `escala`.
 */
export function cantidadLegible(n, item, esDeposito) {
  const p = { stock: n, unidadMedida: item?.unidad ? String(item.unidad).toLowerCase() : null, ...(item?.escala ?? {}) };
  return presentacionCantidadStock(p, esDeposito === true).texto;
}

/** La ubicación que se mira es el depósito: lo dice la respuesta de la API. */
export const esDepositoDe = (r) => r?.local?.esDeposito === true;

export const TEXTO_NO_DISPONIBLE = "No disponible";
export const TEXTO_NO_EXISTE = "No existe";

/** Un saldo como se lee: la cantidad en la presentación del ERP, o por qué no hay número. */
export function saldoLegible(saldo, item, esDeposito) {
  if (saldo?.existencia === EXISTENCIA.EXISTE && typeof saldo.cantidad === "number") return cantidadLegible(saldo.cantidad, item, esDeposito);
  if (saldo?.existencia === EXISTENCIA.NO_EXISTE) return TEXTO_NO_EXISTE;
  return TEXTO_NO_DISPONIBLE;
}

/**
 * Cuánto cambió, SOLO si las dos puntas existen. Se resta en milésimas —la
 * precisión del libro— para que 4,35 − 3,8 dé 0,55 y no 0,5499999.
 */
export function variacionDe(item) {
  const a = item?.apertura;
  const c = item?.cierre;
  if (a?.existencia !== EXISTENCIA.EXISTE || c?.existencia !== EXISTENCIA.EXISTE) return null;
  if (typeof a.cantidad !== "number" || typeof c.cantidad !== "number") return null;
  return (Math.round(c.cantidad * 1000) - Math.round(a.cantidad * 1000)) / 1000;
}

/**
 * "+4 uds", "−1 bultos + 2 uds", "0": el signo que se lee, con el menos
 * tipográfico, delante de la MISMA presentación que el saldo. El signo va
 * afuera y la presentación se arma sobre el valor absoluto: así un "−" no queda
 * repetido adentro del desglose.
 */
export function variacionLegible(v, item, esDeposito) {
  if (v === null) return null;
  if (v > 0) return `+${cantidadLegible(v, item, esDeposito)}`;
  if (v < 0) return `−${cantidadLegible(-v, item, esDeposito)}`;
  return "0";
}

/**
 * EL RENGLÓN DE UN PRODUCTO.
 *
 * @param {object} item     una fila de `/productos`
 * @param {object} r        la respuesta, para saber si el período sigue en curso
 * @returns {{ nombre, linea, avisos: string[], variacion: string|null, unidad: string }}
 */
export function renglonDeProducto(item, r) {
  const dep = esDepositoDe(r);
  const ladoFinal = r?.enCurso ? "Ahora" : "Cierre";
  const linea = `Apertura ${saldoLegible(item.apertura, item, dep)} → ${ladoFinal} ${saldoLegible(item.cierre, item, dep)}`;
  const v = variacionDe(item);
  const avisos = [];
  if (item.apertura?.existencia === EXISTENCIA.DESCONOCIDA) avisos.push("Sin variación: falta la apertura");
  if (item.productoEliminado) avisos.push("Producto eliminado");
  else if (item.cierre?.existencia === EXISTENCIA.NO_EXISTE) avisos.push("Se dio de baja en el período");
  if (item.apertura?.existencia === EXISTENCIA.NO_EXISTE && item.cierre?.existencia === EXISTENCIA.EXISTE) avisos.push("Apareció en el período");
  if (item.cierre?.existencia === EXISTENCIA.EXISTE && typeof item.cierre.enTransito === "number" && item.cierre.enTransito > 0) {
    avisos.push(`En tránsito ${cantidadLegible(item.cierre.enTransito, item, dep)}`);
  }
  if (item.sinClasificar > 0) avisos.push(`${item.sinClasificar} ${plural(item.sinClasificar, "movimiento sin clasificar", "movimientos sin clasificar")}`);
  if (item.reinterpretada) avisos.push("Reinterpretado en el período");
  return {
    nombre: item.nombre ?? "Producto sin nombre registrado",
    linea,
    avisos,
    variacion: variacionLegible(v, item, dep),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// EL VALOR DEL STOCK
// ════════════════════════════════════════════════════════════════════════════
//
// Todo importe sale de la API (`valor` del resumen, `valor` de cada producto):
// acá solo se escribe. Un importe que la API manda en null se escribe "—" —la
// raya de `formatearMoneda`—, nunca "$0,00". Y la pantalla NO habla de
// ganancia ni de pérdida: el valor del stock aumenta o disminuye, por
// movimiento físico o por revalorización. El resultado del negocio es otra
// cuenta, de Finanzas.

/** "+$1.200,00", "−$36,00", "$0,00": el signo que se lee, con el menos tipográfico. */
export function monedaConSigno(v) {
  if (v === null || v === undefined) return formatearMoneda(null);
  if (v > 0) return `+${formatearMoneda(v)}`;
  if (v < 0) return `−${formatearMoneda(-v)}`;
  return formatearMoneda(0);
}

/**
 * UN SALDO: sin "+", pero un negativo se escribe "−$30,00" y no "$-30,00", que
 * es lo que daría `formatearMoneda` con el número tal cual. Un valor de stock
 * negativo existe —hay stock negativo— y no se esconde.
 */
export const saldoEnPesos = (v) => (typeof v === "number" && v < 0 ? monedaConSigno(v) : formatearMoneda(v));

const diaCortoDe = (dia) => rotuloDelRango({ desde: dia, hasta: dia });
/** "Miércoles 30/09". */
export const rotuloDeDia = (dia) => `${mayuscula(diaSemanaAR(`${dia}T12:00:00-03:00`))} ${diaCortoDe(dia)}`;
/** "Septiembre", sacado del mismo formateador de fechas argentino. */
const nombreDelMes = (dia) => mayuscula(String(fechaLargaAR(`${dia}T12:00:00-03:00`)).split(" de ")[1] ?? dia.slice(0, 7));

const TEXTO_MOTIVO_FALTANTE = Object.freeze({
  [MOTIVO_COSTO_FALTANTE.SIN_VERSION]: "sin costo registrado ese día",
  [MOTIVO_COSTO_FALTANTE.SIN_COSTO]: "costo en cero o vacío",
  [MOTIVO_COSTO_FALTANTE.NO_APLICA]: "es un combo con stock propio",
  [MOTIVO_COSTO_FALTANTE.CONVERSION_AMBIGUA]: "unidad de medida sin conversión",
});
const esDistintoDeCero = (n) => typeof n === "number" && n !== 0;

/** Cómo se lee un costo por unidad física: `UNIDAD_FISICA_STOCK` de la escala física. */
const POR_UNIDAD_FISICA = Object.freeze({ UNIDAD: " por unidad", KG: " por kg", PIEZA: " por pieza" });

export const textoDelFaltante = (f) => `${TEXTO_MOTIVO_FALTANTE[f?.motivo] ?? "sin costo"} (${diaCortoDe(f.dia)})`;

/**
 * EL BLOQUE DE ARRIBA: la variación grande, y debajo el valor inicial, el final
 * —"Ahora" si el período sigue—, el movimiento físico y la revalorización. El
 * tránsito va aparte, y el aviso dice todo lo que hace que el número no sea
 * exacto o completo.
 *
 * @returns {null | { rotulo, importe, columnas: {clave, rotulo, valor}[], transito: string|null, aviso: string|null }}
 *   null cuando no hay valor: ver `textoSinValor`.
 */
export function textosDelValor(r) {
  const v = r?.valor;
  if (!v || v.estado === ESTADO_VALOR.NO_DISPONIBLE) return null;
  const enCurso = v.enCurso === true;
  const rotuloInicial = v.recortado ? `Valor al abrir el ${diaCortoDe(v.desde)}` : "Valor inicial";
  const columnas = [
    { clave: "inicial", rotulo: rotuloInicial, valor: saldoEnPesos(v.inicial) },
    { clave: "final", rotulo: enCurso ? "Ahora" : "Valor final", valor: saldoEnPesos(v.final) },
    { clave: "fisico", rotulo: "Movimiento físico", valor: monedaConSigno(v.fisico) },
    { clave: "revalorizacion", rotulo: "Revalorización", valor: monedaConSigno(v.revalorizacion) },
    // Solo cuando hubo: un cambio de factor, unidad o peso es raro, y una
    // columna en cero todos los días sería ruido.
    ...(esDistintoDeCero(v.reexpresion) ? [{ clave: "reexpresion", rotulo: "Reexpresión por escala", valor: monedaConSigno(v.reexpresion) }] : []),
  ];
  const avisos = [];
  if (v.recortado) avisos.push(`Hay costos históricos desde el ${diaCortoDe(v.primerDiaValorizable)}: el período se valoriza desde ahí`);
  if (!v.completo) {
    const n = v.faltantes?.length ?? 0;
    avisos.push(`Incompleto: ${n} ${plural(n, "producto sin costo no está", "productos sin costo no están")} en el total`);
  }
  if (v.productosConStockNegativo > 0) {
    const n = v.productosConStockNegativo;
    avisos.push(`${n} ${plural(n, "producto con stock negativo", "productos con stock negativo")}`);
  }
  if (v.cuadra === false) avisos.push("La cuenta no cierra: final − inicial no es físico + revalorización + reexpresión");
  const t = v.transito?.alCerrar;
  let transito = null;
  if (t && (t.lineas > 0 || t.productosNoConciliados > 0)) {
    transito = `En tránsito, aparte del stock: ${formatearMoneda(t.valor)}`;
    if (!t.completo) transito += " · incompleto";
  }
  return {
    rotulo: v.variacion === null ? "Variación del valor del stock" : v.variacion < 0 ? "El valor del stock disminuyó" : "El valor del stock aumentó",
    importe: monedaConSigno(v.variacion),
    // Los días que se valorizaron, que en un período parcial no son los pedidos.
    subtitulo: v.desde === v.hasta ? rotuloDeDia(v.desde) : rotuloDelRango({ desde: v.desde, hasta: v.hasta }),
    columnas,
    transito,
    aviso: avisos.length ? avisos.join(" · ") : null,
    nota: enCurso ? "Ahora usa el costo de hoy a las 00:00: un cambio de costo de hoy se ve mañana." : null,
  };
}

/** Por qué no hay valor para el período, sin decir cero. */
export function textoSinValor(r) {
  const v = r?.valor;
  const primer = v?.primerDiaValorizable;
  const titulo = "Sin valor para este período";
  if (v?.motivo === MOTIVO_SIN_VALOR.LIBRO_DE_COSTOS_INACTIVO || !primer) {
    return { titulo, detalle: "El historial de costos todavía no empezó: no hay valor de ningún producto. No es cero." };
  }
  return {
    titulo,
    detalle: `El historial de costos permite valorizar desde el ${diaLargo(primer)}. Antes de ese día no hay valor: no es cero.`,
  };
}

/**
 * LA EVOLUCIÓN: el valor al cierre de cada día, como FOTOGRAFÍAS. No se suman:
 * el período abre con el valor inicial y cierra con el último. Más de 31 días
 * —el año— se muestra un cierre por mes, el del último día valorizado de cada
 * mes, para que el celular no liste 365 renglones.
 */
export function filasDeEvolucion(r) {
  const ev = r?.valor?.evolucion ?? [];
  if (ev.length <= 31) return ev.map((e) => ({ clave: e.dia, rotulo: rotuloDeDia(e.dia), importe: saldoEnPesos(e.valor) }));
  const porMes = new Map();
  for (const e of ev) porMes.set(e.dia.slice(0, 7), e);
  return [...porMes.values()].map((e) => ({ clave: e.dia, rotulo: `${nombreDelMes(e.dia)} · al ${diaCortoDe(e.dia)}`, importe: saldoEnPesos(e.valor) }));
}

/** "valor al cierre de cada día", o "de cada mes" en el año. */
export const datoDeLaEvolucion = (r) => ((r?.valor?.evolucion?.length ?? 0) > 31 ? "cierre de cada mes" : "cierre de cada día");

/**
 * UN PRODUCTO EN EL VALOR DEL STOCK: su variación en pesos a la derecha y, al
 * abrirlo, el detalle que explica por qué cambió.
 *
 * @returns {{ nombre, linea, avisos: string[], importe: string, detalle: {rotulo, valor}[] }}
 */
export function renglonDeValor(item, r) {
  const dep = esDepositoDe(r);
  const v = item?.valor ?? null;
  const base = renglonDeProducto(item, r);
  const avisos = [...base.avisos];
  if (v && !v.completo && v.faltante) avisos.unshift(`Sin valor: ${textoDelFaltante(v.faltante)}`);
  if (v?.stockNegativo) avisos.unshift("Stock negativo");
  const cant = (n) => (typeof n === "number" ? cantidadLegible(n, item, dep) : TEXTO_NO_DISPONIBLE);
  const porUnidad = POR_UNIDAD_FISICA[v?.unidadFisica] ?? "";
  const costo = (c) => (c === null || c === undefined ? formatearMoneda(null) : `${formatearMoneda(c)}${porUnidad}`);
  const detalle = v
    ? [
        { rotulo: "Cantidad inicial", valor: cant(v.cantidadInicial) },
        { rotulo: "Cantidad final", valor: cant(v.cantidadFinal) },
        { rotulo: "Costo inicial", valor: costo(v.costoInicial) },
        { rotulo: "Costo final", valor: costo(v.costoFinal) },
        { rotulo: "Valor inicial", valor: saldoEnPesos(v.inicial) },
        { rotulo: "Valor final", valor: saldoEnPesos(v.final) },
        { rotulo: "Movimiento físico", valor: monedaConSigno(v.fisico) },
        { rotulo: "Revalorización", valor: monedaConSigno(v.revalorizacion) },
        ...(esDistintoDeCero(v.reexpresion) ? [{ rotulo: "Reexpresión por escala", valor: monedaConSigno(v.reexpresion) }] : []),
      ]
    : [];
  if (v?.nacioEnElPeriodo) avisos.push("Nació en el período: su primer día vale con el costo de su alta");
  return {
    nombre: base.nombre,
    linea: base.linea,
    avisos,
    importe: v ? (v.completo ? monedaConSigno(v.variacion) : "Sin costo") : base.variacion,
    detalle,
  };
}
