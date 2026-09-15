// lib/ofertas/tarjetaDeOferta.js
//
// LO QUE DICE LA TARJETA DE UNA OFERTA EN LA LISTA DEL CELULAR.
//
// ── POR QUÉ ES UN MÓDULO Y NO TEXTO ADENTRO DEL COMPONENTE ───────────────
//
// Porque son decisiones, no dibujo: qué sello le corresponde a una oferta, si
// "termina hoy" o "termina el jueves", y cómo se lee un descuento. Adentro del
// JSX no se pueden ejercer sin montar React, y las tres tienen bordes —el día
// calendario argentino, la ventana semiabierta, el porcentaje que no existe—
// donde un error no se ve mirando la pantalla un martes cualquiera.
//
// El componente decide DÓNDE va cada cosa; acá se decide QUÉ dice.
//
// ── LAS FECHAS SON DÍAS CALENDARIO ARGENTINOS ───────────────────────────
//
// El contenedor corre en UTC. "¿Termina hoy?" comparado con el reloj del proceso
// da mal desde las 21:00 argentinas, que es justo cuando alguien mira el celular
// para ver qué ofertas cierran. Se compara con `fechaArgentinaISO`, que es la
// misma pieza con la que el resto del sistema decide de qué día es una venta.

import { fechaArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { fechaLargaAR } from "@/lib/fechas/formatearFechaHora";
import { ESTADO_OFERTA } from "./estados";
import { ultimoDiaVigente } from "./crearOfertaMovil";

function aFecha(v) {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * ── EL ÚLTIMO DÍA VIGENTE, Y POR QUÉ NO ES `finEn` ──────────────────────
 *
 * La ventana es semiabierta: `[inicioEn, finEn)`. Una oferta que termina el
 * viernes se guarda con `finEn` el SÁBADO a las 00:00, así que preguntar por el
 * día de `finEn` diría "termina el sábado" — un día de más, todos los días.
 *
 * `ultimoDiaVigente` resta un segundo y devuelve el último instante en que la
 * oferta rige. Es la misma función que usa la pantalla de crear para decir
 * "Termina el lunes 21": se reusa para que las dos pantallas no puedan
 * contradecirse sobre el mismo día.
 */
export function diaEnQueTermina(finEn) {
  return ultimoDiaVigente(finEn);
}

/** ¿El último día vigente cae HOY, en el calendario argentino? */
export function terminaHoy(finEn, ahora = new Date()) {
  const ultimo = diaEnQueTermina(finEn);
  const hoy = aFecha(ahora);
  if (!ultimo || !hoy) return false;
  return fechaArgentinaISO(ultimo) === fechaArgentinaISO(hoy);
}

/** ¿Y mañana? */
export function terminaManana(finEn, ahora = new Date()) {
  const ultimo = diaEnQueTermina(finEn);
  const hoy = aFecha(ahora);
  if (!ultimo || !hoy) return false;
  const manana = new Date(hoy.getTime() + 24 * 60 * 60 * 1000);
  return fechaArgentinaISO(ultimo) === fechaArgentinaISO(manana);
}

/**
 * EL SELLO DE LA TARJETA: qué palabra y de qué color.
 *
 * ── "VENCE HOY" NO ES UN ESTADO, Y ESO IMPORTA ──────────────────────────
 *
 * Los estados de una oferta son seis y están derivados en `estados.js`. "VENCE
 * HOY" no es uno más: es una oferta ACTIVA sobre la que además hay algo que
 * decidir antes de que termine el día. Si fuera un estado habría que agregarlo
 * al enum derivado y el POS tendría que saber qué hacer con él, cuando para el
 * POS es exactamente una oferta activa.
 *
 * Por eso vive acá, en la capa que decide qué se muestra, y no allá.
 *
 * ── Y GANA SOBRE ACTIVA A PROPÓSITO ─────────────────────────────────────
 *
 * Una oferta que termina hoy es activa y además urgente. El orden de las
 * preguntas es la regla: si ACTIVA se preguntara primero, el aviso no saldría
 * nunca — el mismo defecto que `estados.js` ya tiene resuelto poniendo REVISAR
 * antes que ACTIVA.
 *
 * Devuelve `{ texto, color }`, con `color` en el vocabulario de `SunmiPill`.
 */
export function selloDeOferta({ estado, finEn } = {}, ahora = new Date()) {
  const activa = estado === ESTADO_OFERTA.ACTIVA || estado === ESTADO_OFERTA.REVISAR;
  if (activa && terminaHoy(finEn, ahora)) {
    return { texto: "VENCE HOY", color: "amber" };
  }
  switch (estado) {
    case ESTADO_OFERTA.ACTIVA:
      return { texto: "ACTIVA", color: "green" };
    // REVISAR es una oferta que SIGUE COBRANDO y además tiene un costo que
    // cambió. Va en ámbar y con su palabra: pintarla de verde diría que no hay
    // nada que mirar, que es lo contrario de lo que significa.
    case ESTADO_OFERTA.REVISAR:
      return { texto: "REVISAR", color: "amber" };
    case ESTADO_OFERTA.PROGRAMADA:
      return { texto: "PROGRAMADA", color: "slate" };
    case ESTADO_OFERTA.VENCIDA:
      return { texto: "VENCIDA", color: "amber" };
    case ESTADO_OFERTA.BORRADOR:
      return { texto: "BORRADOR", color: "slate" };
    case ESTADO_OFERTA.FINALIZADA:
      return { texto: "TERMINADA", color: "slate" };
    default:
      return null;
  }
}

/**
 * LA LÍNEA DE CUÁNDO — el renglón de abajo del nombre.
 *
 * "Termina mañana", "Termina el jueves 17 de septiembre", "Arranca el viernes
 * 19 de septiembre", y con " · Solo efectivo" pegado si la oferta es de efectivo.
 *
 * ── POR QUÉ CADA ESTADO DICE OTRA COSA ──────────────────────────────────
 *
 * Porque lo que hace falta saber de un vistazo cambia: de una programada,
 * cuándo empieza; de una que rige, cuánto le queda; de una vencida, que ya no
 * cobra. Un texto único —"del 12 al 19"— obliga a hacer la cuenta en la cabeza
 * en las tres.
 */
export function lineaDeCuando(
  { estado, inicioEn, finEn, soloEfectivo = false } = {},
  ahora = new Date()
) {
  const base = (() => {
    switch (estado) {
      case ESTADO_OFERTA.BORRADOR:
        return "Sin publicar";
      case ESTADO_OFERTA.PROGRAMADA: {
        const i = aFecha(inicioEn);
        return i ? `Arranca el ${fechaLargaAR(i)}` : "Sin fecha de inicio";
      }
      case ESTADO_OFERTA.VENCIDA: {
        const u = diaEnQueTermina(finEn);
        return u ? `Terminó el ${fechaLargaAR(u)}` : "Sin fecha de fin";
      }
      case ESTADO_OFERTA.FINALIZADA:
        return "Terminada a mano";
      default: {
        // ACTIVA y REVISAR: lo que importa es cuánto le queda.
        const u = diaEnQueTermina(finEn);
        if (!u) return "Sin fecha de fin";
        if (terminaHoy(finEn, ahora)) return "Termina hoy";
        if (terminaManana(finEn, ahora)) return "Termina mañana";
        return `Termina el ${fechaLargaAR(u)}`;
      }
    }
  })();

  return soloEfectivo ? `${base} · Solo efectivo` : base;
}

/**
 * LOS DOS RENGLONES CORTOS DE LA IZQUIERDA.
 *
 * ── UN PORCENTAJE QUE NO SE PUEDE CALCULAR NO SE INVENTA ────────────────
 *
 * Sin precio normal no hay descuento posible, y devolver "0 % menos" sería
 * afirmar que la oferta no baja nada. Es el mismo agujero que `formato.js` ya
 * tiene anotado: `Number(null)` es 0, y un cero se lee como un dato.
 *
 * Devuelve `{ normal, descuento }`, cualquiera de los dos en `null` si no se
 * puede decir. El componente no dibuja el renglón que venga en null.
 */
export function renglonesDeComparacion({ precioNormal, precioOferta, money } = {}) {
  const normal = Number(precioNormal);
  const oferta = Number(precioOferta);
  const hayNormal = Number.isFinite(normal) && normal > 0;
  const hayOferta = Number.isFinite(oferta) && oferta > 0;

  const fmt = typeof money === "function" ? money : (n) => String(n);

  // El porcentaje se redondea al entero: "11 % menos" se lee de un vistazo y
  // "10,81 % menos" no. El número exacto vive en el detalle de la oferta, donde
  // hay lugar para leerlo.
  const descuento =
    hayNormal && hayOferta && oferta < normal
      ? `${Math.round(((normal - oferta) / normal) * 100)} % menos`
      : null;

  return {
    normal: hayNormal ? `Normal ${fmt(normal)}` : null,
    descuento,
  };
}
