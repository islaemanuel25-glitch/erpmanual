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
import { ESTADO_VALOR, MOTIVO_SIN_VALOR } from "./valorDelStock.js";
import { TEXTOS_DE_CATEGORIA } from "./explicacionDelValor.js";
import { UNIDADES, rotuloDelRango, sumarDias } from "@/lib/transferencias/periodoDePago";
import { CLAVE_OTRO } from "@/components/transferencias/ChipsDePeriodo";
import { diaSemanaAR, fechaLargaAR, horaAR } from "@/lib/fechas/formatearFechaHora";
import { presentacionCantidadStock } from "@/lib/stock/presentacion";
import { formatearMoneda } from "@/lib/moneda";
import { hasPermission } from "@/lib/menu/permissions";
import { serializeReturnParams } from "@/lib/reportes-ventas/returnParams";

import { RUTA_STOCK_DIARIO } from "./rutasStockDiario.js";

export { NOMBRE_VALOR_DEL_STOCK, PERMISO_STOCK_DIARIO, RUTA_STOCK_DIARIO } from "./rutasStockDiario.js";
/**
 * La página del detalle por movimiento de una categoría (`consultaDeCategoria`),
 * que queda para auditar. La pantalla NO muestra productos desde el 2026-10-01:
 * "Valor del Stock informa; los otros módulos muestran el detalle".
 */
export const PRODUCTOS_POR_PAGINA = 50;

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
const esDistintoDeCero = (n) => typeof n === "number" && n !== 0;

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

// ════════════════════════════════════════════════════════════════════════════
// ¿POR QUÉ CAMBIÓ?
// ════════════════════════════════════════════════════════════════════════════
//
// El movimiento físico partido por el origen real de cada movimiento, como lo
// manda la API (`valor.explicacion`). Habla del CAPITAL EN MERCADERÍA: una
// compra recibida lo aumenta aunque no se haya pagado. Nada de "gastado" ni de
// "cobrado".

/** El desvío por redondeo a partir del cual se avisa: más que centavos es otra cosa. */
export const DESVIO_QUE_SE_AVISA = 1;

/**
 * QUE TODO ES A COSTO lo dice la píldora "A COSTO" de la tarjeta y el dato "a
 * costo" de la banda; lo que queda en texto es CUÁNDO cuenta una operación, en
 * el pie de las causas, en una línea.
 */
export const TEXTO_CUANDO_CUENTA = "Cada operación cuenta el día en que cambió el stock de esta ubicación.";

/**
 * LOS MOVIMIENTOS SIN ORIGEN, dichos por lo que son: el stock cambió antes de que
 * el ERP registrara el origen de cada movimiento. En el libro siguen diciendo
 * SIN_ORIGEN —no se reclasifican—; acá solo se nombran. No lleva fecha: no hay
 * una fuente en la base que diga desde cuándo se registra el origen, y una
 * fecha escrita en la pantalla sería inventada.
 */
export const ROTULO_ANTERIORES_A_LA_TRAZABILIDAD = "Anteriores a la trazabilidad";

/** Qué es el importe de una transferencia, arriba de la lista. */
export const TEXTO_IMPACTO_TRANSFERENCIA = "Impacto a costo en esta ubicación";

/**
 * A DÓNDE SE VA DESDE CADA CATEGORÍA: al módulo que es dueño de esas
 * operaciones, con el permiso que ESA pantalla exige —el mismo literal de su
 * guarda, que un candado compara—. Lo que no está acá no tiene pantalla propia
 * que liste sus operaciones, y se queda en el resumen.
 *
 *   Ventas     el reporte de ventas, con la ubicación y los días valorizados
 *              (los parámetros que ya entiende `serializeReturnParams`).
 *   Compras    el historial de pedidos: no recibe período ni ubicación.
 *   Ajustes    Stock Locales, donde se ajusta el stock.
 */
const DESTINO_STOCK = Object.freeze({ texto: "Stock", permiso: "stock.ver", ruta: "/modulos/stock_locales" });
export const DESTINO_DE_CATEGORIA = Object.freeze({
  VENTAS: Object.freeze({ texto: "Ventas", permiso: "reportes.ver", ruta: "/modulos/reportes-ventas" }),
  COMPRAS: Object.freeze({ texto: "Compras", permiso: "compras.ver", ruta: "/modulos/compras-proveedor/historial" }),
  AJUSTES: DESTINO_STOCK,
});

/** El detalle real de una transferencia, en su módulo. */
export const DESTINO_DE_TRANSFERENCIA = Object.freeze({ texto: "Ir", permiso: "transferencias.ver", ruta: "/modulos/transferencias" });

/**
 * ¿LA PANTALLA DE DESTINO VA A ABRIR? La misma pregunta que se hacen esas
 * pantallas: tener `*` o el permiso. Un enlace que termina en "sin permisos" no
 * se muestra.
 */
export const puedeAbrir = (perfil, permiso) => hasPermission(perfil, "*") || hasPermission(perfil, permiso);

/** La URL de una categoría con destino, o null si no tiene o no se puede abrir. */
export function enlaceDeCategoria(categoria, r, perfil) {
  const d = DESTINO_DE_CATEGORIA[categoria];
  if (!d || !puedeAbrir(perfil, d.permiso)) return null;
  if (categoria === "VENTAS") {
    const qs = serializeReturnParams({ tab: "venta", fechaDesde: r?.valor?.desde, fechaHasta: r?.valor?.hasta, localId: r?.local?.id });
    return { texto: d.texto, href: qs ? `${d.ruta}?${qs}` : d.ruta };
  }
  return { texto: d.texto, href: d.ruta };
}

/** El enlace al detalle real de una transferencia, o null. */
export function enlaceDeTransferencia(t, perfil) {
  if (!t?.existe || !Number.isInteger(t.id) || !puedeAbrir(perfil, DESTINO_DE_TRANSFERENCIA.permiso)) return null;
  return { texto: DESTINO_DE_TRANSFERENCIA.texto, href: `${DESTINO_DE_TRANSFERENCIA.ruta}/${t.id}` };
}

/** Pesos → centavos enteros, para sumar y comparar sin errores de coma flotante. */
const aCentavos = (pesos) => Math.round(pesos * 100);

/** El cambio del período: final − inicial, en pesos. Null si falta alguno. */
export function cambioDelPeriodo(v) {
  if (typeof v?.inicial !== "number" || typeof v?.final !== "number") return null;
  return (aCentavos(v.final) - aCentavos(v.inicial)) / 100;
}

/**
 * EL % SOBRE LA APERTURA, o null. Solo con una apertura positiva: sobre cero o
 * sobre un capital negativo el porcentaje no dice nada (o dice lo contrario).
 * Una decimal, coma argentina y el menos tipográfico: "+16,8 %", "−0,4 %".
 */
export function porcentajeSobreApertura(inicial, final) {
  if (!(typeof inicial === "number" && inicial > 0) || typeof final !== "number") return null;
  const p = ((final - inicial) / inicial) * 100;
  const texto = Math.abs(p).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (texto === "0,0") return "0,0 %";
  return `${p > 0 ? "+" : "−"}${texto} %`;
}

/**
 * LA TARJETA DEL CAPITAL: el valor de ahora (o el final, si el período cerró),
 * cuánto cambió con su % sobre la apertura, la apertura y el tránsito aparte.
 *
 * @returns {null | { rotuloFinal, final, cambio, porcentaje, apertura, transito }}
 *   null cuando no hay valor: ver `textoSinValor`.
 */
export function textosDelCapital(r) {
  const v = r?.valor;
  if (!v || v.estado === ESTADO_VALOR.NO_DISPONIBLE) return null;
  const rotuloInicial = v.recortado ? `Valor al abrir el ${diaCortoDe(v.desde)}` : "Apertura";
  const t = v.transito?.alCerrar;
  let transito = null;
  if (t && (t.lineas > 0 || t.productosNoConciliados > 0)) {
    transito = `En tránsito, aparte del stock: ${formatearMoneda(t.valor)}`;
    if (!t.completo) transito += " · incompleto";
  }
  return {
    rotuloFinal: v.enCurso === true ? "Ahora" : "Valor final",
    final: saldoEnPesos(v.final),
    cambio: monedaConSigno(cambioDelPeriodo(v)),
    porcentaje: porcentajeSobreApertura(v.inicial, v.final),
    apertura: `${rotuloInicial} ${saldoEnPesos(v.inicial)}`,
    transito,
  };
}

/**
 * LA BARRA DIVERGENTE DE UNA CAUSA: sale del cero, a la derecha si suma y a la
 * izquierda si resta. `fraccion` es la parte de la MEDIA pista que ocupa:
 * |importe| / el mayor |importe| del período. Un importe distinto de cero que
 * daría menos de 2 px se dibuja con 2 px (`BARRA_MINIMA_PX`): se ve que algo
 * hubo. Cero, sin barra.
 */
export const BARRA_MINIMA_PX = 2;
export const ALTO_DE_BARRA_PX = 6;
export function barraDeCausa(importe, mayor) {
  if (typeof importe !== "number" || importe === 0 || !(mayor > 0)) return { lado: null, fraccion: 0 };
  return { lado: importe > 0 ? "derecha" : "izquierda", fraccion: Math.min(1, Math.abs(importe) / mayor) };
}

const REVALORIZACION = "REVALORIZACION";
const REEXPRESION = "REEXPRESION";

/**
 * LAS CAUSAS DEL CAMBIO, una fila cada una: las categorías del movimiento
 * físico con movimientos o con efecto —por su origen real—, la revalorización
 * (cambió el costo del stock que había) y la reexpresión por escala si hubo.
 * Juntas suman final − inicial: el movimiento físico no se muestra aparte, está
 * repartido en sus categorías.
 *
 * Van de mayor a menor |importe|; a igual importe, en el orden de la API. Ninguna
 * fila abre productos ni movimientos: el detalle es del módulo dueño, al que se
 * va con `enlaceDeCategoria`. Solo Transferencias se abre, y muestra
 * transferencias (`abreTransferencias`).
 *
 * @returns {null | { total: string, cambio: number|null, suma: number, mayor: number,
 *   filas: Array<{ clave, rotulo, importe: number, texto: string, detalle: string, abreTransferencias: boolean, barra }> }}
 */
export function causasDelCambio(r) {
  const v = r?.valor;
  const e = v?.explicacion;
  if (!e) return null;
  const filas = e.categorias
    .filter((c) => c.movimientos > 0 || (typeof c.neto === "number" && c.neto !== 0))
    .map((c) => {
      const t = TEXTOS_DE_CATEGORIA[c.categoria] ?? { rotulo: c.categoria, entradas: "entradas", salidas: "salidas" };
      const partes = [];
      if (c.movimientosDeEntrada > 0) partes.push(`${t.entradas} ${monedaConSigno(c.entradas)}`);
      if (c.movimientosDeSalida > 0) partes.push(`${t.salidas} ${monedaConSigno(c.salidas)}`);
      return {
        clave: c.categoria,
        rotulo: c.categoria === "SIN_CLASIFICAR" ? ROTULO_ANTERIORES_A_LA_TRAZABILIDAD : t.rotulo,
        importe: c.neto ?? 0,
        detalle: `${c.movimientos} ${plural(c.movimientos, "movimiento", "movimientos")}${partes.length === 2 ? ` · ${partes.join(" · ")}` : ""}`,
        abreTransferencias: c.categoria === "TRANSFERENCIAS" && c.movimientos > 0,
      };
    });
  if (typeof v.revalorizacion === "number") {
    filas.push({ clave: REVALORIZACION, rotulo: "Revalorización", importe: v.revalorizacion, detalle: "cambió el costo del stock que había", abreTransferencias: false });
  }
  if (esDistintoDeCero(v.reexpresion)) {
    filas.push({ clave: REEXPRESION, rotulo: "Reexpresión por escala", importe: v.reexpresion, detalle: "cambió la escala de un producto", abreTransferencias: false });
  }
  // `sort` es estable: a igual |importe| queda el orden de la API.
  filas.sort((a, b) => Math.abs(b.importe) - Math.abs(a.importe));
  const mayor = filas.reduce((m, f) => Math.max(m, Math.abs(f.importe)), 0);
  const suma = filas.reduce((s, f) => s + aCentavos(f.importe), 0) / 100;
  const cambio = cambioDelPeriodo(v);
  return {
    total: monedaConSigno(cambio),
    cambio,
    suma,
    mayor,
    filas: filas.map((f) => ({ ...f, texto: monedaConSigno(f.importe), barra: barraDeCausa(f.importe, mayor) })),
  };
}

/**
 * ATENCIÓN: lo que hace que el número no sea completo o exacto, uno por fila, con
 * el enlace al módulo donde se resuelve cuando lo hay. Sin nada, lista vacía y no
 * se dibuja la caja.
 *
 *   negativo    → Stock Locales, donde se corrige el stock.
 *   sin costo   → sin enlace: no hay una pantalla que lleve directo a corregir
 *                 el costo de esos productos, y no se inventa una.
 */
export function avisosDeAtencion(r, perfil) {
  const v = r?.valor;
  if (!v || v.estado === ESTADO_VALOR.NO_DISPONIBLE) return [];
  const avisos = [];
  if (v.productosConStockNegativo > 0) {
    const n = v.productosConStockNegativo;
    const enlace = puedeAbrir(perfil, DESTINO_STOCK.permiso) ? { texto: DESTINO_STOCK.texto, href: DESTINO_STOCK.ruta } : null;
    avisos.push({ clave: "negativo", titulo: `${n} ${plural(n, "producto con stock negativo", "productos con stock negativo")}`, explicacion: "Se valorizan como están y restan del total", enlace });
  }
  if (v.completo === false) {
    const n = v.faltantes?.length ?? 0;
    avisos.push({ clave: "sinCosto", titulo: `${n} ${plural(n, "producto sin costo", "productos sin costo")}`, explicacion: "No están sumados en el total", enlace: null });
  }
  if (v.recortado) {
    avisos.push({ clave: "recortado", titulo: `Hay costos históricos desde el ${diaCortoDe(v.primerDiaValorizable)}`, explicacion: "El período se valoriza desde ahí", enlace: null });
  }
  if (v.cuadra === false) {
    avisos.push({ clave: "noCierra", titulo: "La cuenta no cierra", explicacion: "Final − inicial no es físico + revalorización + reexpresión", enlace: null });
  }
  const e = v.explicacion;
  if (e?.cuadra === false) {
    avisos.push({ clave: "origenNoCierra", titulo: "La suma por origen no da el movimiento físico", explicacion: "Avisar: las causas no explican todo el cambio", enlace: null });
  }
  if (Math.abs(e?.desvioMaximoDeRedondeo ?? 0) >= DESVIO_QUE_SE_AVISA) {
    avisos.push({ clave: "desvio", titulo: `Desvío de ${monedaConSigno(e.desvioMaximoDeRedondeo)}`, explicacion: "Un producto tiene movimientos que no suman su cambio de cantidad", enlace: null });
  }
  return avisos;
}

// ── EL GRÁFICO DE EVOLUCIÓN ───────────────────────────────────────────────

export const ALTO_DEL_GRAFICO_PX = 72;
/** El eje Y cubre como mínimo ±3 % de la apertura: un stock estable se ve plano. */
export const ESCALA_MINIMA = 0.03;
/** Y un 10 % de aire arriba y abajo, para que la línea no toque los bordes. */
export const AIRE_DEL_GRAFICO = 0.1;

/**
 * LOS PUNTOS: la apertura primero, después el cierre de cada día —de cada mes si
 * son más de 31, el del último día valorizado del mes—. En un día quedan dos:
 * apertura y ahora. Sin evolución, ninguno: no se dibuja.
 */
export function puntosDeEvolucion(v) {
  const ev = v?.evolucion ?? [];
  if (!ev.length || typeof v.inicial !== "number") return [];
  let cierres = ev;
  if (ev.length > 31) {
    const porMes = new Map();
    for (const e of ev) porMes.set(e.dia.slice(0, 7), e);
    cierres = [...porMes.values()];
  }
  return [v.inicial, ...cierres.map((e) => e.valor).filter((x) => typeof x === "number")];
}

/**
 * LA ESCALA DEL EJE Y: lo que tocan los valores, ampliado hasta cubrir ±3 % de
 * la apertura, más un 10 % de aire. Una apertura en cero o negativa usa su
 * valor absoluto; si todo es cero, un peso de cada lado.
 */
export function escalaDelGrafico(valores, apertura) {
  const base = Math.abs(apertura ?? 0) * ESCALA_MINIMA || 1;
  let min = Math.min(...valores, apertura - base);
  let max = Math.max(...valores, apertura + base);
  const aire = (max - min) * AIRE_DEL_GRAFICO;
  min -= aire;
  max += aire;
  return { min, max };
}

/** Las coordenadas de cada punto en un lienzo de `ancho` × `alto`, con y hacia abajo. */
export function trazoDelGrafico(valores, escala, ancho, alto = ALTO_DEL_GRAFICO_PX) {
  const n = valores.length;
  const y = (x) => alto - ((x - escala.min) / (escala.max - escala.min)) * alto;
  return valores.map((val, i) => ({ x: n === 1 ? ancho : (i / (n - 1)) * ancho, y: y(val) }));
}

/** "dom 27": el día de la semana abreviado y el número. */
const diaDelGrafico = (dia) => `${diaSemanaAR(`${dia}T12:00:00-03:00`).slice(0, 3)} ${Number(dia.slice(8, 10))}`;

/** Las dos puntas debajo del gráfico: el primer día, y "ahora · mié 30" o el último. */
export function puntasDelGrafico(v) {
  if (!v?.desde || !v?.hasta) return null;
  return { desde: diaDelGrafico(v.desde), hasta: v.enCurso === true ? `ahora · ${diaDelGrafico(v.hasta)}` : diaDelGrafico(v.hasta) };
}

/** El pedido de las transferencias de la categoría: el mismo período de la pantalla. */
export function consultaDeTransferencias(ctx) {
  const qs = periodoDeLaConsulta(ctx);
  return qs ? qs.toString() : null;
}

/**
 * UNA TRANSFERENCIA DE LA LISTA: cuál es, de dónde o hacia dónde respecto de la
 * ubicación mirada, cuándo se envió y se recibió —o se canceló—, y su impacto a
 * costo. Sin cabecera (la referencia no resuelve), lo dice.
 */
export function renglonDeTransferencia(t, r) {
  const sinCosto = t.sinCosto > 0 ? ` · ${t.sinCosto} sin costo` : "";
  if (!t.existe) {
    return { titulo: t.id === null ? "Sin transferencia registrada" : `#${t.id}`, linea: `No se encontró la transferencia${sinCosto}`, importe: monedaConSigno(t.neto) };
  }
  const esDestino = t.destino?.id === r?.local?.id;
  const contraparte = esDestino ? `Desde ${t.origen?.nombre ?? "—"}` : `Hacia ${t.destino?.nombre ?? "—"}`;
  const fechas = [];
  if (t.diaEnvio) fechas.push(`Enviada ${diaCortoDe(t.diaEnvio)}`);
  if (t.diaCancelacion) fechas.push(`Cancelada ${diaCortoDe(t.diaCancelacion)}`);
  else fechas.push(t.diaRecepcion ? `Recibida ${diaCortoDe(t.diaRecepcion)}` : "Sin recibir");
  return { titulo: `#${t.id}`, contraparte, linea: `${fechas.join(" · ")}${sinCosto}`, importe: monedaConSigno(t.neto) };
}

/** El pedido del detalle de una categoría: el mismo período, y `categoria`. */
export function consultaDeCategoria(ctx, categoria, { page = 1 } = {}) {
  const qs = periodoDeLaConsulta(ctx);
  if (!qs) return null;
  qs.set("categoria", categoria);
  qs.set("page", String(page));
  qs.set("pageSize", String(PRODUCTOS_POR_PAGINA));
  return qs.toString();
}

/**
 * Cómo se nombra el documento de un movimiento. El origen dice de qué tabla es
 * la referencia (`libroStock.js`); acá solo se pone en palabras, sin consultar
 * nada. Sin referencia, solo el nombre de la operación.
 */
const DOCUMENTO_DEL_ORIGEN = Object.freeze({
  VENTA: "Venta",
  CORRECCION_VENTA: "Corrección de venta",
  ANULACION_VENTA: "Anulación de venta",
  COMPRA_PROVEEDOR: "Pedido a proveedor",
  TRANSFERENCIA_ENVIO: "Envío de la transferencia",
  TRANSFERENCIA_RECEPCION: "Recepción de la transferencia",
  TRANSFERENCIA_CANCELACION: "Cancelación de la transferencia",
  AJUSTE_MANUAL: "Ajuste de stock, auditoría",
  LIMITES_STOCK: "Límites de stock",
  ALTA_PRODUCTO: "Alta de producto",
  ALTA_PRODUCTO_DESDE_STOCK: "Alta desde stock",
  ALTA_AL_LISTAR_STOCK: "Alta al listar stock, local",
  IMPORTACION_PRODUCTOS: "Importación de productos",
  IMPORTACION_STOCK: "Importación de stock",
  PROMOCION_A_DEPOSITO: "Promoción al depósito, producto",
  HERENCIA_DEL_DEPOSITO: "Herencia del depósito, local",
  ELIMINACION_PRODUCTO: "Eliminación de producto",
  RESET_OPERATIVO: "Reset operativo, usuario",
  SIN_ORIGEN: "Sin origen registrado",
});

export function documentoDelMovimiento(m) {
  const nombre = DOCUMENTO_DEL_ORIGEN[m?.origen] ?? m?.origen ?? "—";
  return m?.origenRef ? `${nombre} #${m.origenRef}` : nombre;
}

/**
 * UN MOVIMIENTO DEL DETALLE: el producto, cuándo y por qué documento, la
 * cantidad física con la presentación de Stock Locales y su signo, y su efecto
 * en el capital. Sin costo ese día, "Sin costo": nunca $0.
 */
export function renglonDeMovimiento(m, r) {
  // La ubicación y la escala de SU momento, que manda la API; sin ellas, las de hoy.
  const dep = typeof m.esDepositoDelMomento === "boolean" ? m.esDepositoDelMomento : esDepositoDe(r);
  const cantidad = typeof m.delta === "number" ? variacionLegible(m.delta, m, dep) : null;
  return {
    nombre: m.nombre ?? "Producto sin nombre registrado",
    linea: `${diaCortoDe(m.dia)} ${horaAR(m.instante)} · ${documentoDelMovimiento(m)}`,
    cantidad,
    importe: m.efecto === null || m.efecto === undefined ? "Sin costo" : monedaConSigno(m.efecto),
  };
}
