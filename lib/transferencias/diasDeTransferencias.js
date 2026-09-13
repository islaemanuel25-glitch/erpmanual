// lib/transferencias/diasDeTransferencias.js
//
// LAS TRANSFERENCIAS DE UN LOCAL, AGRUPADAS POR DÍA.
//
// ── EL PROBLEMA QUE VIENE A RESOLVER ──────────────────────────────────────
//
// Al abrir un local se veía una lista plana titulada "#200", "#204". Ese número
// es interno: no dice qué día salió, ni qué traía, ni si hubo diferencia. El
// día sí lo dice, y es como se piensa el trabajo — "lo del sábado", "lo de
// ayer".
//
// ── POR QUÉ POR FECHA DE ENVÍO, Y NO DE RECEPCIÓN ────────────────────────
//
// Por lo mismo que el período: es la fecha con la que la transferencia ya cae en
// una semana de pago, así que agrupar por otra cosa haría que una transferencia
// apareciera en un día y contara en otro.
//
// Y hay un motivo que lo cierra, medido sobre producción el 2026-09-13: de las
// 207 transferencias vivas, **las 145 que no están recibidas no tienen
// `fechaRecepcion`** —130 enviadas y 15 contándose—. Agrupar por recepción
// dejaría sin día justamente a las que hay que trabajar. `fechaEnvio`, en
// cambio, está en las 207 sin una sola nula.
//
// Se usa `fechaMostrada` —la misma puerta que titula cada fila— para que el día
// del encabezado no pueda decir una cosa y la hora de la fila otra.

import { diaMesAR, diaSemanaAR } from "@/lib/fechas/formatearFechaHora";
// `fechaArgentinaISO` vive en `rangoArgentina` y no en el formateador: es la
// misma que usa `periodoDePago` para decidir en qué período cae una fecha, así
// que el día de esta banda y el período que la contiene no pueden discrepar.
import { fechaArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { fechaMostrada } from "./rotulosDeTransferencia.js";

/**
 * "Sábado 12" — el título de la banda del día.
 *
 * El nombre del día viene en minúscula del formateador, y acá se pone en
 * mayúscula la primera letra: es un TÍTULO, no una parte de una frase. Se hace
 * con `toLocaleUpperCase` de la primera letra y no con CSS, porque `capitalize`
 * también tocaría el número.
 */
export function tituloDelDia(fecha) {
  const nombre = diaSemanaAR(fecha);
  if (!nombre) return "—";
  const dia = String(diaMesAR(fecha)).split("/")[0];
  const conMayuscula = nombre.charAt(0).toLocaleUpperCase("es-AR") + nombre.slice(1);
  return `${conMayuscula} ${Number(dia)}`;
}

/**
 * Agrupa las transferencias YA SERIALIZADAS de un local por día de envío.
 *
 * Recibe lo que la ruta manda —con `importe`, `recibida` y el conteo de
 * diferencias ya resueltos— y no vuelve a calcular ninguna de esas tres cosas:
 * solo agrupa y suma. Si sumara por su cuenta podría dar un total de día que no
 * cierre contra el del bloque, que se calcula en otro lado.
 *
 * @returns {Array<{clave, fecha, titulo, transferencias, importe, cantidad, sinRecibir, conDiferencias}>}
 *          del día más reciente al más viejo.
 */
export function diasDeTransferencias(transferencias = []) {
  const porDia = new Map();

  for (const t of transferencias || []) {
    const fecha = fechaMostrada(t);
    if (!fecha) continue;

    // La clave es el día ARGENTINO, no el UTC. Un envío de las 22:00 de un
    // sábado es del domingo en UTC, así que agrupar por la fecha cruda armaría
    // un día que nadie trabajó — y justo con los envíos de la noche, que son los
    // que se preparan para la mañana siguiente.
    const clave = fechaArgentinaISO(fecha);
    if (!porDia.has(clave)) {
      porDia.set(clave, {
        clave,
        fecha,
        titulo: tituloDelDia(fecha),
        transferencias: [],
        importe: 0,
        cantidad: 0,
        sinRecibir: 0,
        conDiferencias: 0,
      });
    }

    const dia = porDia.get(clave);
    dia.transferencias.push(t);
    dia.cantidad += 1;
    dia.importe += Number(t?.importe || 0);
    if (!t?.recibida) dia.sinRecibir += 1;
    if (Number(t?.lineasConDiferencia || 0) > 0) dia.conDiferencias += 1;
  }

  // Del más reciente al más viejo. Las claves son `YYYY-MM-DD`, que se ordenan
  // como cadenas igual que como fechas.
  return [...porDia.values()]
    .map((d) => ({
      ...d,
      // Dentro del día, la más reciente primero: es el mismo criterio que el
      // orden de los días, y así la que acaba de llegar queda arriba de todo.
      transferencias: [...d.transferencias].sort(
        (a, b) => new Date(fechaMostrada(b)) - new Date(fechaMostrada(a))
      ),
    }))
    .sort((a, b) => (a.clave < b.clave ? 1 : a.clave > b.clave ? -1 : 0));
}

/** "3 transferencias · 1 sin recibir" — el subtítulo de la banda. */
export function rotuloDelDia({ cantidad = 0, sinRecibir = 0 } = {}) {
  const n = Number(cantidad || 0);
  const base = `${n} ${n === 1 ? "transferencia" : "transferencias"}`;
  const p = Number(sinRecibir || 0);
  // Sin pendientes no se escribe "0 sin recibir": un cero se lee como que falta
  // algo. Mismo criterio que el rótulo del bloque de local.
  return p > 0 ? `${base} · ${p} sin recibir` : base;
}
