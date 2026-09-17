// lib/proveedores/listas/configuracionProveedor.js
//
// LA CONFIGURACIÓN COMERCIAL DE UN PROVEEDOR PARA IMPORTAR SUS LISTAS.
//
// ── QUÉ RESUELVE, Y POR QUÉ ESTÁ EN UN SOLO LUGAR ───────────────────────────
//
// Tres valores deciden qué costo se propone y cuál se marca para revisar: el
// rango de aumento esperado, el recargo comercial y el impuesto adicional. Hasta
// el 2026-09-16 los tres estaban escritos en el código —`RANGO_POR_DEFECTO` acá
// al lado y `CONFIG_ARCOR` en `configuraciones/arcor.js`— y valían lo mismo para
// cualquier proveedor.
//
// Peor todavía: la pantalla de subir una lista los mostraba con este texto,
// literal, "Son los valores configurados para el proveedor y no se pueden cambiar
// después". Lo segundo era cierto y lo primero no: no había ninguna configuración
// por proveedor, y el usuario leía que sí.
//
// ── NO HAY VALORES DE FÁBRICA, Y ES LO IMPORTANTE ───────────────────────────
//
// Un proveedor sin configurar NO concilia. No cae a un 10 y 20 razonables: se
// frena y la pantalla los pide.
//
// El motivo está medido. El rango de fábrica era 10 % a 20 %, y los aumentos que
// Emanuel nombró andan por el 5 % a 8 %: con el valor de fábrica puesto, TODAS las
// filas de una lista real caen fuera del rango y se marcan "aumento bajo". Un
// default no es una comodidad cuando decide costos — es una respuesta inventada
// que se ve igual que una contestada.
//
// ── EL IMPUESTO SE PREGUNTA APARTE DEL PORCENTAJE ───────────────────────────
//
// `impuestosDefinidos` es un hecho propio y no se deriva de `impuestoAdicionalPct`.
// Un proveedor sin impuestos adicionales carga 0 % A PROPÓSITO, y eso no es lo
// mismo que no haber contestado. Sin ese booleano los dos casos se guardarían
// igual y la pantalla no podría distinguirlos.
//
// ── POR QUÉ NO SE PREGUNTA "POR UNIDAD O POR PACK" ──────────────────────────
//
// Emanuel pidió poder indicar si el impuesto adicional va por unidad o por pack.
// Con un PORCENTAJE las dos cuentas dan lo mismo, y por eso la pregunta no se
// muestra: un 3 % aplicado a cada una de 12 unidades y un 3 % aplicado al pack de
// 12 son el mismo número, porque el porcentaje escala con el importe. La
// distinción recién importaría con un impuesto de tantos PESOS por unidad, que es
// otra cosa y hoy no existe.
//
// Módulo puro: sin BD, sin Next.

// La validez del rango se le pregunta a `rangoValido`, que es la que ya usa el
// motor. Escribir acá otra comparación "parecida" es exactamente lo que el
// CLAUDE.md prohíbe: no se rompen el día que se escriben, se rompen el día que
// una cambia.
import { rangoValido } from "./rangoAumento.js";
// CONTROLAR NO PIDE RANGO. Ver `faltantesDeConfiguracion`.
import { MODO_LISTA } from "./modoDeLaLista.js";

/** Qué le falta a un proveedor para poder importar. */
export const FALTA_CONFIGURACION = {
  RANGO: "RANGO",
  RECARGO: "RECARGO",
  IMPUESTOS: "IMPUESTOS",
};

export const TEXTO_FALTA_CONFIGURACION = {
  RANGO:
    "Falta decir entre qué porcentajes se espera que aumenten los precios de este proveedor.",
  RECARGO: "Falta decir qué recargo se le suma al precio de lista de este proveedor.",
  IMPUESTOS:
    "Falta decir si este proveedor agrega impuestos por fuera de los de su lista, y de cuánto.",
};

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Un porcentaje aceptable para cualquiera de los tres valores.
 *
 * El tope es 1000 por el mismo motivo que en `rangoValido`: más que eso no es un
 * aumento, es un error de tipeo con tres ceros de más, y dejarlo pasar escribiría
 * costos absurdos sin que nadie lo note.
 */
export function porcentajeValido(valor, { permiteNegativo = false } = {}) {
  const n = num(valor);
  if (n === null) return false;
  if (!permiteNegativo && n < 0) return false;
  return n >= -100 && n <= 1000;
}

/**
 * La configuración de listas de un proveedor, normalizada.
 *
 * Recibe la fila de `Proveedor` tal como sale de Prisma —con Decimal o con
 * string, da igual— y devuelve números o null. Nunca inventa un valor.
 */
export function configuracionDeProveedor(proveedor) {
  return {
    minPct: num(proveedor?.listaAumentoEsperadoMinPct),
    maxPct: num(proveedor?.listaAumentoEsperadoMaxPct),
    recargoPct: num(proveedor?.listaRecargoPct),
    impuestoAdicionalPct: num(proveedor?.listaImpuestoAdicionalPct),
    impuestosDefinidos: proveedor?.listaImpuestosDefinidos === true,
  };
}

/**
 * ¿Qué le falta a esta configuración para poder conciliar?
 *
 * Devuelve la lista de faltantes, vacía cuando está completa. Se devuelve la
 * lista entera y no el primero: el usuario tiene que poder cargar todo de una,
 * no descubrir el segundo faltante recién después de contestar el primero.
 *
 * ── EL RANGO NO SE PIDE PARA CONTROLAR ─────────────────────────────────────
 *
 * Controlar compara la lista contra los costos de hoy: no hay aumento esperado
 * porque no se espera ningún aumento. Exigirlo igual dejaría a un proveedor sin
 * rango cargado sin poder ni siquiera MIRAR si su lista coincide, que es
 * justamente lo primero que uno quiere hacer con un proveedor nuevo.
 *
 * El recargo y los impuestos SÍ se siguen exigiendo, y no es una inconsistencia:
 * ésos cambian el número contra el que se compara. Controlar sin el recargo
 * mostraría una diferencia sistemática en toda la lista que no existe.
 */
export function faltantesDeConfiguracion(config, { modo } = {}) {
  const faltan = [];
  const min = num(config?.minPct);
  const max = num(config?.maxPct);
  const pideRango = modo !== MODO_LISTA.CONTROLAR;
  if (pideRango && (min === null || max === null || !rangoValido({ minPct: min, maxPct: max }))) {
    faltan.push(FALTA_CONFIGURACION.RANGO);
  }
  if (!porcentajeValido(config?.recargoPct)) faltan.push(FALTA_CONFIGURACION.RECARGO);
  // El porcentaje solo se exige cuando ya se contestó que sí hay impuestos; el
  // booleano se exige siempre. Un proveedor que contestó "0 %" está completo.
  if (config?.impuestosDefinidos !== true) {
    faltan.push(FALTA_CONFIGURACION.IMPUESTOS);
  } else if (!porcentajeValido(config?.impuestoAdicionalPct)) {
    faltan.push(FALTA_CONFIGURACION.IMPUESTOS);
  }
  return faltan;
}

/** ¿Este proveedor puede importar listas, por el lado de la configuración? */
export function configuracionCompleta(config) {
  return faltantesDeConfiguracion(config).length === 0;
}

/**
 * La configuración con la que se va a conciliar ESTA lista.
 *
 * Los valores del proveedor son el punto de partida y lo que el usuario escriba
 * en la pantalla los pisa SOLO PARA ESTA LISTA. Cambiarlos acá no toca al
 * proveedor: para eso hay una acción aparte, y esa separación es deliberada —un
 * mes raro no puede reescribir el criterio de todos los meses sin que nadie lo
 * pida—.
 *
 * Devuelve `{ ok: false, faltan }` cuando el resultado sigue incompleto, así el
 * que llama no tiene que acordarse de comprobarlo.
 */
export function configuracionParaLaLista(proveedor, sobrescritura = {}) {
  const base = configuracionDeProveedor(proveedor);

  const tomar = (clave) => {
    const v = num(sobrescritura?.[clave]);
    return v === null ? base[clave] : v;
  };

  const impuestosDefinidos =
    sobrescritura?.impuestosDefinidos === undefined || sobrescritura?.impuestosDefinidos === null
      ? base.impuestosDefinidos
      : sobrescritura.impuestosDefinidos === true;

  const config = {
    minPct: tomar("minPct"),
    maxPct: tomar("maxPct"),
    recargoPct: tomar("recargoPct"),
    impuestoAdicionalPct: tomar("impuestoAdicionalPct"),
    impuestosDefinidos,
  };

  const faltan = faltantesDeConfiguracion(config, { modo: sobrescritura?.modo });
  if (faltan.length > 0) return { ok: false, faltan, config };
  return { ok: true, faltan: [], config };
}

/**
 * El costo con el impuesto adicional del proveedor aplicado.
 *
 * Va DESPUÉS del recargo comercial y sobre el precio con IVA de la lista, que es
 * el precio con el que trabaja todo el módulo. Un impuesto no definido o en cero
 * devuelve el costo tal cual, sin pasar por una multiplicación por 1 que
 * introduciría error de redondeo donde no hay nada que sumar.
 */
export function aplicarImpuestoAdicional(costo, impuestoAdicionalPct) {
  const c = num(costo);
  if (c === null) return null;
  const imp = num(impuestoAdicionalPct);
  if (imp === null || imp === 0) return c;
  return c * (1 + imp / 100);
}
