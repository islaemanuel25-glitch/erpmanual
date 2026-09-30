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

import { EXISTENCIA, ESTADO_DEL_DIA } from "./stockDiario.js";
import { FILTRO_PRODUCTOS } from "./stockDiarioApi.js";
import { UNIDADES, rotuloDelRango, sumarDias } from "@/lib/transferencias/periodoDePago";
import { CLAVE_OTRO } from "@/components/transferencias/ChipsDePeriodo";
import { fechaLargaAR, horaAR } from "@/lib/fechas/formatearFechaHora";

import { RUTA_STOCK_DIARIO } from "./rutasStockDiario.js";

export { PERMISO_STOCK_DIARIO, RUTA_STOCK_DIARIO } from "./rutasStockDiario.js";
/** El listado es el de los productos que se movieron, como lo cuenta el resumen. */
export const FILTRO_DE_LA_LISTA = FILTRO_PRODUCTOS.CON_MOVIMIENTOS;
export const PRODUCTOS_POR_PAGINA = 50;
/**
 * La búsqueda va al servidor (`q`, sobre nombre y código, todo el local) un
 * momento después de la última tecla: el patrón de los buscadores de pedidos,
 * de clientes y de Gastos. En la pantalla no se filtra nada: la página cargada
 * no es el conjunto.
 */
export const ESPERA_BUSQUEDA_MS = 350;

const UNIDADES_DE_LA_PANTALLA = [UNIDADES.DIA, UNIDADES.SEMANA, UNIDADES.MES, CLAVE_OTRO];
const esDia = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// ── EL CONTEXTO, EN LA URL ───────────────────────────────────────────────

/** `unidad` (DIA por defecto), `fecha` que el período contiene, o `desde`/`hasta` en Otro. */
export function parseContextoStockDiario(input) {
  const get = (k) => (typeof input?.get === "function" ? input.get(k) : input?.[k]) ?? null;
  const cruda = String(get("unidad") ?? "").toUpperCase();
  const unidad = UNIDADES_DE_LA_PANTALLA.includes(cruda) ? cruda : UNIDADES.DIA;
  if (unidad === CLAVE_OTRO) {
    const desde = esDia(get("desde")) ? get("desde") : null;
    const hasta = esDia(get("hasta")) ? get("hasta") : null;
    return { unidad, fecha: null, desde, hasta };
  }
  return { unidad, fecha: esDia(get("fecha")) ? get("fecha") : null, desde: null, hasta: null };
}

export function urlDeStockDiario(ctx = {}) {
  const qs = new URLSearchParams();
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

/** "214 con movimiento hoy", "41 con movimiento". */
export function datoDeLaLista(total, r) {
  const hoy = r?.estado === ESTADO_DEL_DIA.EN_CURSO && esUnDia(r) ? " hoy" : "";
  return `${total} con movimiento${hoy}`;
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
 * Una cantidad del libro, que guarda hasta tres decimales: entera sin
 * decimales, y si no, con los tres —"4,350"—, que es la precisión de la columna.
 */
export function cantidadDelLibro(n) {
  if (Number.isInteger(n)) return n.toLocaleString("es-AR");
  return n.toLocaleString("es-AR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

const unidadDe = (item) => (item?.unidad ? String(item.unidad).toUpperCase() : "");
const conUnidad = (n, item) => [cantidadDelLibro(n), unidadDe(item)].filter(Boolean).join(" ");

export const TEXTO_NO_DISPONIBLE = "No disponible";
export const TEXTO_NO_EXISTE = "No existe";

/** Un saldo como se lee: el número con su unidad, o por qué no hay número. */
export function saldoLegible(saldo, item) {
  if (saldo?.existencia === EXISTENCIA.EXISTE && typeof saldo.cantidad === "number") return conUnidad(saldo.cantidad, item);
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

/** "+4", "−0,550", "0": el signo que se lee, con el menos tipográfico. */
export function variacionLegible(v) {
  if (v === null) return null;
  if (v > 0) return `+${cantidadDelLibro(v)}`;
  if (v < 0) return `−${cantidadDelLibro(-v)}`;
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
  const ladoFinal = r?.enCurso ? "Ahora" : "Cierre";
  const linea = `Apertura ${saldoLegible(item.apertura, item)} → ${ladoFinal} ${saldoLegible(item.cierre, item)}`;
  const v = variacionDe(item);
  const avisos = [];
  if (item.apertura?.existencia === EXISTENCIA.DESCONOCIDA) avisos.push("Sin variación: falta la apertura");
  if (item.productoEliminado) avisos.push("Producto eliminado");
  else if (item.cierre?.existencia === EXISTENCIA.NO_EXISTE) avisos.push("Se dio de baja en el período");
  if (item.apertura?.existencia === EXISTENCIA.NO_EXISTE && item.cierre?.existencia === EXISTENCIA.EXISTE) avisos.push("Apareció en el período");
  if (item.cierre?.existencia === EXISTENCIA.EXISTE && typeof item.cierre.enTransito === "number" && item.cierre.enTransito > 0) {
    avisos.push(`En tránsito ${conUnidad(item.cierre.enTransito, item)}`);
  }
  if (item.sinClasificar > 0) avisos.push(`${item.sinClasificar} ${plural(item.sinClasificar, "movimiento sin clasificar", "movimientos sin clasificar")}`);
  if (item.reinterpretada) avisos.push("Reinterpretado en el período");
  return {
    nombre: item.nombre ?? "Producto sin nombre registrado",
    linea,
    avisos,
    variacion: variacionLegible(v),
    unidad: unidadDe(item),
  };
}
