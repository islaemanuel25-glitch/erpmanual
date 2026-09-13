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

/** "56 ítems" / "1 ítem". El plural en un solo lugar. */
export function rotuloDeItems(cantidad) {
  const n = Number(cantidad || 0);
  return `${n} ${n === 1 ? "ítem" : "ítems"}`;
}

/**
 * La línea de abajo de la fila, en la vista del DEPÓSITO: "56 ítems ·
 * recibiendo".
 *
 * El estado va en minúscula a propósito: es una aclaración dentro de una frase,
 * no una etiqueta. Para la etiqueta está `EstadoTransferenciaBadge`, que se
 * sigue usando en el reporte.
 */
export function subtituloConEstado(t = {}) {
  const estado = String(t?.estado || "").toLowerCase();
  const items = rotuloDeItems(t?.cantidadItems);
  return estado ? `${items} · ${estado}` : items;
}

/**
 * La línea de abajo en la vista del LOCAL: "56 ítems · 20 de 56 revisados".
 *
 * ── POR QUÉ EL AVANCE Y NO EL ESTADO ───────────────────────────────────────
 *
 * El que recibe ya sabe que la transferencia está para recibir —está en la
 * sección PARA RECIBIR—. Lo que no sabe es cuánto le falta, y ése es el dato que
 * lo hace volver a la pantalla.
 *
 * `itemsRevisables` es el DENOMINADOR y no `cantidadItems`: una línea agregada
 * durante la recepción no entra en la guarda de confirmación —"¿queda algún
 * original sin revisar?"—, así que contarla haría que el avance nunca llegue al
 * total y la barra mienta hacia abajo justo al final.
 *
 * Ya recibida, el avance no aporta —está todo revisado por definición— y vuelve
 * el estado.
 */
export function subtituloConAvance(t = {}) {
  const items = rotuloDeItems(t?.cantidadItems);
  if (t?.recibida) return subtituloConEstado(t);
  const total = Number(t?.itemsRevisables ?? t?.cantidadItems ?? 0);
  const hechos = Number(t?.itemsRevisados ?? 0);
  return `${items} · ${hechos} de ${total} revisados`;
}

/** "5 transferencias · 2 sin recibir" / "1 transferencia". */
export function rotuloDeBloque({ cantidadTransferencias = 0, sinRecibir = 0 } = {}) {
  const n = Number(cantidadTransferencias || 0);
  const base = `${n} ${n === 1 ? "transferencia" : "transferencias"}`;
  const p = Number(sinRecibir || 0);
  // Sin pendientes NO se escribe "0 sin recibir": el bloque ya lo dice sin borde
  // en warning, y un cero al lado del importe se lee como si faltara algo.
  return p > 0 ? `${base} · ${p} sin recibir` : base;
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
