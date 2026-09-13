// lib/transferencias/rotulosDeTransferencia.js
//
// LOS TEXTOS DE LA LISTA DE TRABAJO, en un solo lugar.
//
// ── POR QUÉ ESTO ES UN MÓDULO Y NO DOS PLANTILLAS ADENTRO DE CADA PANTALLA ──
//
// La vista del depósito y la del local dibujan la MISMA transferencia con la
// misma línea de arriba —"#206 · viernes 08:00"— y con líneas de abajo que se
// parecen lo suficiente como para que, escritas dos veces, terminen divergiendo
// en el plural, en el separador o en el nombre del estado. Ya pasó en este
// módulo con la cuenta de lo enviado contra lo recibido, que estaba escrita seis
// veces, y por eso hay un candado de repo entero prohibiéndola.
//
// Acá el riesgo no es aritmético sino de redacción, pero la salida es la misma:
// una puerta, y un candado que la ejerce.
//
// ── LA FECHA NO SE FORMATEA A MANO, NI ACÁ NI EN NINGÚN LADO ────────────────
//
// El contenedor corre en UTC. Un envío de las 22:00 argentinas es del día
// siguiente en UTC, así que el NOMBRE DEL DÍA sale cambiado justo en los envíos
// de la noche — que en este negocio son los que se preparan para la mañana
// siguiente. Por eso sale de `lib/fechas/formatearFechaHora`, que fija la zona.

import { diaSemanaAR, horaAR } from "@/lib/fechas/formatearFechaHora";
import { UNIDADES } from "@/lib/transferencias/periodoDePago";

/**
 * "A pagar esta semana" — el rótulo del importe grande de la vista del local.
 *
 * La especificación lo escribe con la semana adentro porque el chip arranca en
 * SEMANA, que es como se paga. Pero el chip se puede mover, y entonces el
 * rótulo tiene que moverse con él: un importe de UN DÍA rotulado "esta semana"
 * es un número que dice una cosa y un texto que dice otra, que es peor que no
 * tener rótulo.
 */
export function rotuloDeCuenta(unidad) {
  if (unidad === UNIDADES.DIA) return "A pagar hoy";
  if (unidad === UNIDADES.MES) return "A pagar este mes";
  if (unidad === UNIDADES.SEMANA) return "A pagar esta semana";
  // "Otro": el rango lo eligió el usuario y está escrito justo abajo.
  return "A pagar en el período";
}

/**
 * La fecha con la que se muestra una transferencia.
 *
 * Es `fechaEnvio` con `createdAt` de respaldo, y es la MISMA que
 * `fechaDeCorte` usa para decidir en qué período cae (`bloquesPorLocal.js`).
 * Que sean la misma no es casualidad ni se puede aflojar: si la fila dijera una
 * fecha y el período contara otra, un remito se vería fuera del rango que lo
 * incluye y nadie podría explicar por qué.
 */
export function fechaMostrada(t = {}) {
  return t?.fechaEnvio ?? t?.createdAt ?? null;
}

/** "#206 · viernes 08:00". Sin fecha, "#206" solo — nunca "#206 · —". */
export function tituloDeTransferencia(t = {}) {
  const numero = `#${t?.id ?? "—"}`;
  const f = fechaMostrada(t);
  if (!f) return numero;
  const dia = diaSemanaAR(f);
  const hora = horaAR(f, { vacio: "" });
  const cola = [dia, hora].filter(Boolean).join(" ");
  return cola ? `${numero} · ${cola}` : numero;
}

/**
 * EL ESTADO DICHO EN PALABRAS, con el tono que le corresponde.
 *
 * ── POR QUÉ NO ALCANZA CON EL ESTADO ──────────────────────────────────────
 *
 * "Recibida" no distingue la que llegó completa de la que llegó con faltantes, y
 * ésa es justamente la diferencia que el que mira quiere ver sin abrir nada. Y
 * "Recibiendo" no dice cuánto falta. Así que el texto combina el estado con dos
 * datos más: el avance del conteo y cuántas líneas difieren.
 *
 * ── DE DÓNDE SALE CADA UNO, MEDIDO SOBRE PRODUCCIÓN EL 2026-09-13 ─────────
 *
 * · "Sin abrir" — estado `Enviada`. El estado alcanza solo: de las 130 enviadas,
 *   CERO tienen una línea contada o revisada. No hace falta mirar el avance.
 * · "Contando · 20 de 77" — estado `Recibiendo`, con `itemsRevisados` sobre
 *   `itemsRevisables`. Las 15 en ese estado tienen líneas contadas Y revisadas.
 * · "Recibida sin diferencias" / "Recibida · 2 diferencias" — estado `Recibida`
 *   más el CONTEO de líneas que difieren.
 *
 * ── Y EL CONTEO NO SALE DE `Transferencia.tieneDiferencias` ───────────────
 *
 * Aunque se llame parecido. Dos motivos, y el segundo es el que decide:
 *
 *   1. Es un BOOLEANO y acá hace falta el número — "2 diferencias".
 *   2. Solo se escribe al CONFIRMAR la recepción. Medido: de las 15
 *      transferencias en `Recibiendo`, la columna dice `false` en las 15 y las
 *      LÍNEAS dicen que 7 ya tienen diferencia. O sea que mientras se cuenta, la
 *      columna miente por omisión.
 *
 * Sobre las RECIBIDAS la columna sí es exacta —coincide con las líneas en las 62
 * de producción, sin una discrepancia— y aun así no se usa: una sola fuente para
 * los dos casos es mejor que dos que coinciden en uno.
 *
 * El conteo lo hace el servidor con la puerta canónica `diferenciaDeLinea`, que
 * es `recibida − enviada` en unidades físicas.
 */
export function estadoEnPalabras(t = {}) {
  const estado = String(t?.estado || "");

  if (estado === "Recibida") {
    const n = Number(t?.lineasConDiferencia || 0);
    if (n <= 0) return { texto: "Recibida sin diferencias", tono: "muted" };
    return { texto: `Recibida · ${n} ${n === 1 ? "diferencia" : "diferencias"}`, tono: "warning" };
  }

  if (estado === "Recibiendo") {
    const hechos = Number(t?.itemsRevisados ?? 0);
    // EL DENOMINADOR SON LAS LÍNEAS ORIGINALES, no todas. Una agregada durante
    // la recepción no entra en la guarda de confirmación —"¿queda algún original
    // sin revisar?"— así que contarla haría que el avance nunca llegue al total
    // y el número mienta hacia abajo justo al final, que es cuando se mira.
    const total = Number(t?.itemsRevisables ?? t?.cantidadItems ?? 0);
    return { texto: `Contando · ${hechos} de ${total}`, tono: "warning" };
  }

  // `Enviada` y cualquier otro estado que todavía no se tocó. El texto dice lo
  // que hay que hacer, no el nombre técnico del estado.
  return { texto: "Sin abrir", tono: "warning" };
}

/** "56 ítems" / "1 ítem". El plural en un solo lugar. */
export function rotuloDeItems(cantidad) {
  const n = Number(cantidad || 0);
  return `${n} ${n === 1 ? "ítem" : "ítems"}`;
}

// ── SE FUERON `subtituloConEstado` Y `subtituloConAvance` (2026-09-13) ─────
//
// Decían la misma cosa de dos formas: una "56 ítems · recibiendo" y la otra
// "56 ítems · 20 de 56 revisados". Las reemplazó `estadoEnPalabras`, que dice el
// estado en palabras y sirve para las dos vistas, así que las dos quedaron SIN
// UN SOLO CONSUMIDOR — comprobado con `git grep`, no de memoria.
//
// No se dejaron "por si acaso": una función exportada que nadie llama se lee
// como parte del contrato y el día que alguien la use va a reintroducir la
// segunda forma de decir lo mismo.
//
// Lo que sí sobrevivió es el porqué del DENOMINADOR, que era el conocimiento
// caro de aquéllas y ahora vive en `estadoEnPalabras`: `itemsRevisables` y no
// `cantidadItems`, porque una línea agregada durante la recepción no entra en la
// guarda de confirmación —"¿queda algún original sin revisar?"— y contarla haría
// que el avance nunca llegue al total.

/**
 * Lo que dice un local que esta semana no recibió nada.
 *
 * Es una frase y no "0 transferencias", y la diferencia no es de estilo: el cero
 * se lee como un dato que falta —como si algo no hubiera cargado— y la frase
 * dice lo que pasó. Es el mismo motivo por el que `rotuloDeBloque` no escribe
 * "0 sin recibir" cuando no hay pendientes.
 */
export const SIN_MOVIMIENTO = "Sin transferencias en el período";

/**
 * "19 transferencias · 14 sin recibir · 3 con diferencias".
 *
 * Los dos últimos tramos aparecen solo si hay algo que decir: ni "0 sin recibir"
 * ni "0 con diferencias". Un cero al lado del importe se lee como que falta
 * algo, y en un renglón que ya es largo cada tramo tiene que ganarse el lugar.
 */
export function rotuloDeBloque({
  cantidadTransferencias = 0,
  sinRecibir = 0,
  conDiferencias = 0,
} = {}) {
  const n = Number(cantidadTransferencias || 0);
  if (n === 0) return SIN_MOVIMIENTO;
  const base = `${n} ${n === 1 ? "transferencia" : "transferencias"}`;
  const tramos = [base];
  const p = Number(sinRecibir || 0);
  if (p > 0) tramos.push(`${p} sin recibir`);
  const d = Number(conDiferencias || 0);
  if (d > 0) tramos.push(`${d} con diferencia${d === 1 ? "" : "s"}`);
  return tramos.join(" · ");
}

/**
 * El aviso de la cabecera de cuenta: "2 transferencias sin recibir · el total
 * todavía no está cerrado".
 *
 * Devuelve `null` cuando no hay pendientes, y eso es lo que el componente usa
 * para no dibujar el renglón. El texto y la decisión de mostrarlo son el mismo
 * hecho: un aviso que dice "0 sin recibir · el total todavía no está cerrado"
 * sería falso.
 */
export function avisoDeTotalAbierto({ sinRecibir = 0 } = {}) {
  const p = Number(sinRecibir || 0);
  if (p <= 0) return null;
  const cuantas = `${p} ${p === 1 ? "transferencia" : "transferencias"} sin recibir`;
  return `${cuantas} · el total todavía no está cerrado`;
}
