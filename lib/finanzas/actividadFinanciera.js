// lib/finanzas/actividadFinanciera.js
//
// QUÉ PASÓ, DÍA POR DÍA. Puro: agrupa hechos que ya existen, no crea ninguno.
//
// ── LA REGLA QUE GOBIERNA ESTE ARCHIVO ───────────────────────────────────
//
// Finanzas no duplica hechos. Un turno nace en el POS, un movimiento de caja
// nace en el POS, una venta nace en el POS. Acá se los ORDENA y se les pone un
// rótulo, y cada uno se lleva la referencia a su origen para poder abrirlo.
//
// Por eso cada hecho viaja con `origen`, que dice de qué tabla salió y con qué
// id. Sin eso, la pantalla tendría que adivinar a dónde lleva cada fila y la
// lista pasaría a ser una tabla nueva en vez de una vista de lo que ya hay.
//
// ── EL MOTIVO DE UN MOVIMIENTO NO SE INTERPRETA ──────────────────────────
//
// "Panadería" escrito en el motivo de un RETIRO es texto libre que alguien tipeó
// en el POS. NO se convierte en un pago a proveedor, no se busca el proveedor
// que se llame así y no se lo clasifica como gasto: se muestra tal cual, con el
// rótulo "Motivo:" adelante para que se lea como lo que es. Los pagos a
// proveedores de verdad ya tienen su propia tabla —`PagoProveedor`, en su
// submódulo— y se reconocen por el vínculo `cajaMovimientoId`, nunca por el
// texto. Esta lista todavía no usa ese vínculo: queda para cuando se incorporen
// al período.
//
// ── EL DÍA ES EL ARGENTINO, Y NO ES UN DETALLE ───────────────────────────
//
// Un turno que abre a las 22:00 de un sábado es del domingo en UTC. Agrupar por
// la fecha cruda armaría un día que nadie trabajó, y justo con los turnos de la
// noche. Se usa `fechaArgentinaISO`, que es la MISMA puerta con la que
// `periodoDePago` decide en qué período cae una fecha, así que el día de la
// banda y el período que la contiene no pueden discrepar.

import { fechaArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { horaAR } from "@/lib/fechas/formatearFechaHora";
// El título de la banda —"Sábado 12"— es el MISMO de la cuenta de
// Transferencias. Se importa en vez de reescribirse: son dos pantallas que
// agrupan por día argentino y un día que se llame distinto en cada una sería una
// diferencia que nadie pidió.
import { tituloDelDia } from "@/lib/transferencias/diasDeTransferencias";
import { CLASE_MOVIMIENTO } from "./movimientosDeCaja";

/** Los tres hechos que Finanzas sabe mostrar hoy. */
export const HECHO = Object.freeze({
  TURNO: "TURNO",
  INGRESO: "INGRESO",
  RETIRO: "RETIRO",
});

/** De qué tabla salió cada hecho. Es lo que hace que la fila se pueda abrir. */
export const ORIGEN = Object.freeze({
  TURNO: "Turno",
  CAJA_MOVIMIENTO: "CajaMovimiento",
});

/**
 * "08:00–16:00", y "08:00 · abierto" cuando el turno todavía no cerró.
 *
 * El guion es una RAYA (–), no un menos: es un rango horario. Y el turno abierto
 * no dice "08:00–" con la punta colgando, que se lee como un dato que falta en
 * vez de como un turno en curso.
 */
export function rangoHorarioDelTurno(turno) {
  const desde = horaAR(turno?.apertura, { vacio: "—" });
  if (!turno?.cierre) return `${desde} · abierto`;
  return `${desde}–${horaAR(turno.cierre, { vacio: "—" })}`;
}

/**
 * Quién estaba a cargo. El OPERADOR primero, porque es quien estuvo en el
 * mostrador; el usuario del turno como respaldo cuando el local no usa
 * operadores.
 *
 * Devuelve `null` y no "—" cuando no hay ninguno: el rótulo se arma afuera y un
 * "Turno —" es peor que "Turno".
 */
export function aCargoDelTurno(turno) {
  const op = String(turno?.operadorNombre || "").trim();
  if (op) return op;
  const us = String(turno?.vendedorNombre || "").trim();
  return us || null;
}

/** El hecho de un turno, ya rotulado. */
export function hechoDeTurno(turno) {
  const aCargo = aCargoDelTurno(turno);
  return {
    clave: `turno-${turno?.id}`,
    tipo: HECHO.TURNO,
    // El turno ANULADO se muestra y se dice: es un turno que se abrió por error,
    // no tiene plata detrás y sus importes están en null. Esconderlo dejaría un
    // hueco en la lista que nadie puede explicar.
    anulado: Boolean(turno?.anuladoEn),
    titulo: aCargo ? `Turno ${aCargo}` : "Turno",
    subtitulo: rangoHorarioDelTurno(turno),
    // Lo que se vendió en ese turno, con el mismo criterio comercial que el
    // resumen de arriba. Lo calcula el servidor; acá solo se lleva.
    importe: Number(turno?.ventasTotal || 0),
    rotuloImporte: "Ventas",
    instante: turno?.apertura || null,
    origen: { tipo: ORIGEN.TURNO, id: turno?.id ?? null },
  };
}

/** El hecho de un movimiento de caja, ya rotulado. */
export function hechoDeMovimiento(mov) {
  const esRetiro = mov?.tipo === "RETIRO";
  const motivo = String(mov?.motivo || "").trim();
  // La recaudación se nombra por lo que es. No es un retiro manual y sobre todo
  // NO es plata que se gastó: es la venta que ya se contó, saliendo del cajón.
  // Quién es quién lo decidió `clasificarMovimientos` por vínculo, no por texto.
  const esRecaudacion = mov?.clase === CLASE_MOVIMIENTO.RECAUDACION;
  return {
    clave: `caja-${mov?.id}`,
    tipo: esRetiro ? HECHO.RETIRO : HECHO.INGRESO,
    esRecaudacion,
    // "Retiro de caja", NO "Gasto". Ver el encabezado: el sistema sabe que salió
    // del cajón y no sabe en qué se usó.
    titulo: esRecaudacion
      ? "Retiro de recaudación"
      : esRetiro
        ? "Retiro de caja"
        : "Ingreso de caja",
    // El motivo tal cual se escribió, con el prefijo que lo marca como texto de
    // alguien y no como una categoría del sistema. La recaudación no lo lleva:
    // su motivo es una cadena reservada que escribe el sistema, no una persona.
    subtitulo: esRecaudacion
      ? "Se llevó la recaudación del turno"
      : motivo
        ? `Motivo: ${motivo}`
        : "Sin motivo registrado",
    importe: Number(mov?.monto || 0),
    // El signo lo pone la pantalla con este dato, no una resta escrita acá: un
    // retiro es una salida y un ingreso una entrada, y el importe guardado es
    // positivo en los dos casos.
    sale: esRetiro,
    rotuloImporte: esRetiro ? "Salida" : "Entrada",
    instante: mov?.createdAt || null,
    origen: {
      tipo: ORIGEN.CAJA_MOVIMIENTO,
      id: mov?.id ?? null,
      // El movimiento pertenece a un turno y ése es su documento de origen
      // navegable: no hay pantalla de un movimiento suelto.
      turnoId: mov?.turnoId ?? null,
    },
  };
}

/**
 * LOS HECHOS DEL PERÍODO, AGRUPADOS POR DÍA ARGENTINO.
 *
 * Del día más reciente al más viejo, y dentro de cada día del hecho más reciente
 * al más viejo — el mismo criterio que la cuenta de Transferencias, para que las
 * dos listas se lean igual.
 *
 * @param {object} args
 * @param {Array} args.turnos       turnos del período, ya resumidos por el servidor.
 * @param {Array} args.movimientos  `CajaMovimiento` de esos turnos.
 * @returns {Array<{clave, titulo, hechos, ventas, ingresos, retiros}>}
 */
export function actividadPorDia({ turnos = [], movimientos = [] } = {}) {
  const porDia = new Map();

  const meter = (hecho) => {
    if (!hecho?.instante) return;
    const clave = fechaArgentinaISO(hecho.instante);
    if (!porDia.has(clave)) {
      porDia.set(clave, {
        clave,
        titulo: tituloDelDia(hecho.instante),
        hechos: [],
        ventas: 0,
        ingresos: 0,
        retiros: 0,
      });
    }
    const dia = porDia.get(clave);
    dia.hechos.push(hecho);
    if (hecho.tipo === HECHO.TURNO) dia.ventas += Number(hecho.importe || 0);
    else if (hecho.tipo === HECHO.INGRESO) dia.ingresos += Number(hecho.importe || 0);
    else if (hecho.tipo === HECHO.RETIRO) dia.retiros += Number(hecho.importe || 0);
  };

  for (const t of turnos || []) meter(hechoDeTurno(t));
  for (const m of movimientos || []) meter(hechoDeMovimiento(m));

  return [...porDia.values()]
    .map((d) => ({
      ...d,
      hechos: [...d.hechos].sort((a, b) => new Date(b.instante) - new Date(a.instante)),
    }))
    // Las claves son `YYYY-MM-DD`, que se ordenan como cadenas igual que como
    // fechas.
    .sort((a, b) => (a.clave < b.clave ? 1 : a.clave > b.clave ? -1 : 0));
}

/**
 * "2 turnos · 1 retiro" — el subtítulo de la banda del día.
 *
 * No se escribe un cero: "0 retiros" se lee como que falta algo. Mismo criterio
 * que `rotuloDelDia` de Transferencias.
 */
export function rotuloDelDiaFinanciero(dia) {
  const partes = [];
  const turnos = (dia?.hechos || []).filter((h) => h.tipo === HECHO.TURNO).length;
  const ingresos = (dia?.hechos || []).filter((h) => h.tipo === HECHO.INGRESO).length;
  const retiros = (dia?.hechos || []).filter((h) => h.tipo === HECHO.RETIRO).length;

  if (turnos > 0) partes.push(`${turnos} ${turnos === 1 ? "turno" : "turnos"}`);
  if (ingresos > 0) partes.push(`${ingresos} ${ingresos === 1 ? "ingreso" : "ingresos"}`);
  if (retiros > 0) partes.push(`${retiros} ${retiros === 1 ? "retiro" : "retiros"}`);

  return partes.join(" · ");
}
