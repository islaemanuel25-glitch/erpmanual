// lib/transferencias/criterioDeCuenta.js
//
// CON QUÉ FECHA CAE UNA TRANSFERENCIA EN UN PERÍODO, Y QUÉ ESTADOS CUENTAN.
//
// Son dos lecturas del mismo hecho, y conviven a propósito:
//
//   · ENVIO — la cuenta de siempre de Transferencias. Cae por `fechaEnvio`
//     (`createdAt` si falta), suma todo lo que no está cancelado y valoriza lo
//     recibido, o lo enviado si nadie contó todavía. Contesta "qué le mandé a
//     este local en la semana y cuánto me debe", con el total abierto mientras
//     falte recibir.
//
//   · RECEPCION — el efecto contable que consume Finanzas como "Pago a
//     depósito". Cae por `Transferencia.fechaRecepcion` y suma SOLO las
//     `Recibida`: la mercadería se considera pagada al depósito el día que el
//     local la acepta. Las `Enviada` y `Recibiendo` se informan aparte como
//     pendientes de recepción y no suman. Un período ya cerrado no cambia
//     porque alguien confirme después: esa confirmación cae en su propio día.
//
// La VALORIZACIÓN es la misma en las dos —`importeRecibidoDeDetalleCentavos`—.
// Lo único que cambia es qué transferencias entran y con qué fecha.
//
// Vive en un archivo propio y sin imports para que lo puedan leer el contexto
// de la URL y las dos pantallas —que corren en el navegador— y el servidor sin
// arrastrar nada más.

export const CRITERIO_CUENTA = Object.freeze({ ENVIO: "ENVIO", RECEPCION: "RECEPCION" });

/** El que usa Transferencias cuando nadie pide otro. */
export const CRITERIO_POR_DEFECTO = CRITERIO_CUENTA.ENVIO;

/** Los estados que todavía esperan que el local confirme. No suman en RECEPCION. */
export const ESTADOS_PENDIENTES_DE_RECEPCION = Object.freeze(["Enviada", "Recibiendo"]);

/** El único estado que el local ya aceptó. */
export const ESTADO_RECIBIDA = "Recibida";

/**
 * La fecha con la que una transferencia cae en un período EN EL CRITERIO DE
 * RECEPCIÓN: el día que el local la aceptó. La escribe solo
 * `confirmar-recepcion`, en la misma transacción que mueve el stock del local
 * y pone el estado en `Recibida`. Sin recepción no hay fecha, y no se inventa.
 */
export function fechaDeRecepcion(t) {
  return t?.fechaRecepcion ?? null;
}

/** Un valor desconocido no es un criterio: cae al de siempre. */
export function criterioDeCuenta(valor) {
  return valor === CRITERIO_CUENTA.RECEPCION ? CRITERIO_CUENTA.RECEPCION : CRITERIO_POR_DEFECTO;
}

// ── LAS PALABRAS, UNA VEZ PARA LAS DOS PANTALLAS ──────────────────────────
//
// Finanzas y Transferencias dicen lo mismo del mismo número. Escritas en cada
// componente, el día que una cambie la redacción las dos pantallas parecerían
// hablar de cosas distintas.

/** El nombre contable del importe reconocido. */
export const ROTULO_PAGO_A_DEPOSITO = "Pago a depósito";

/** El de lo que todavía no se confirmó. */
export const ROTULO_PENDIENTE_DE_RECEPCION = "Pendiente de recepción";

/** Por qué las pendientes no están en el total. */
export const NOTA_PENDIENTES =
  "Todavía sin confirmar por el local. Se informa y no se descuenta.";

/** Cuándo se reconoce el pago. */
export const NOTA_RECONOCIMIENTO =
  "Mercadería recibida del depósito. Cuenta el día en que el local confirma la recepción.";

/** "1 transferencia", "7 transferencias". */
export function rotuloDeTransferencias(n) {
  const c = Number(n || 0);
  return `${c} ${c === 1 ? "transferencia" : "transferencias"}`;
}
