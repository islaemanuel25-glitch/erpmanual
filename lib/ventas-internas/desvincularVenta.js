// lib/ventas-internas/desvincularVenta.js
//
// "ESTA VENTA NO ERA INTERNA": el predicado puro de la operación que corrige un
// cliente mal elegido en el POS.
//
// ── EL CASO QUE LA ORIGINÓ ──────────────────────────────────────────────────
//
// Venta 7726, 2026-08-19. Se le vendió a Minimarket ayala y se cargó al cliente
// "Minimarket casiano", que está vinculado al local Casiano casas. La venta
// disparó la transferencia #97 con destino Casiano, por 155.486,40, y la
// mercadería se la llevó Ayala.
//
// No había forma de salir: cancelar la transferencia estaba prohibido por venir
// de una venta, y corregir la venta estaba prohibido por tener transferencia.
//
// ── POR QUÉ ES UNA SOLA OPERACIÓN Y NO DOS PASOS ────────────────────────────
//
// Ésta es la decisión de diseño y conviene entenderla antes de tocar el archivo.
//
// Cancelar la transferencia de una venta interna LEGÍTIMA es destructivo: la
// mercadería queda descontada del depósito y no entra nunca en el local destino,
// que es peor que el problema original — desaparece de la contabilidad sin que
// nadie lo note. Lo único que hace segura la cancelación es que la venta deje de
// ser interna, y eso significa que su cliente deje de estar vinculado.
//
// O sea: las dos mitades no son dos pasos de un mismo trámite, son las dos caras
// de un solo hecho. La transferencia existe PORQUE el cliente estaba vinculado;
// si el cliente deja de estarlo, la transferencia no tiene razón de ser. Al
// revés, cancelar dejando el cliente vinculado deja la venta afirmando que
// Casiano compró mercadería que nunca va a recibir.
//
// Por eso el motor no expone "cancelar" por un lado y "cambiar cliente" por el
// otro: expone el hecho completo, y o pasan las dos cosas o no pasa ninguna.
// Está ejercido en el candado "NO se puede cancelar sin cambiar el cliente".
//
// ── LO QUE ESTA OPERACIÓN NO ES ─────────────────────────────────────────────
//
// No es una redirección. Si el cliente nuevo también estuviera vinculado —a otro
// local—, lo correcto no es cancelar sino cambiarle el destino a la
// transferencia, y eso hoy no existe. Se rechaza en vez de hacer lo más
// parecido: ver CLIENTE_NUEVO_VINCULADO.
//
// No toca plata. El total, los pagos y la caja quedan exactamente como están: la
// venta ocurrió, se cobró y el dinero está bien donde está. Lo único que se
// corrige es a quién se le atribuye y el remito que nunca debió emitirse.

/** Códigos estables. El llamador ramifica sobre ellos, no sobre el texto. */
export const CODIGOS_DESVINCULAR = {
  OK: "DESVINCULAR_OK",
  VENTA_AUSENTE: "VENTA_AUSENTE",
  SIN_TRANSFERENCIA: "VENTA_SIN_TRANSFERENCIA",
  TRANSFERENCIA_NO_ENVIADA: "TRANSFERENCIA_NO_ENVIADA",
  TRANSFERENCIA_CON_RECEPCION: "TRANSFERENCIA_CON_RECEPCION",
  CLIENTE_NUEVO_AUSENTE: "CLIENTE_NUEVO_AUSENTE",
  CLIENTE_NUEVO_VINCULADO: "CLIENTE_NUEVO_VINCULADO",
  CLIENTE_NUEVO_ES_EL_MISMO: "CLIENTE_NUEVO_ES_EL_MISMO",
  CLIENTE_NUEVO_DE_OTRO_GRUPO: "CLIENTE_NUEVO_DE_OTRO_GRUPO",
  MOTIVO_AUSENTE: "MOTIVO_AUSENTE",
};

/** Mínimo de caracteres del motivo. Un motivo de tres letras no explica nada. */
export const MOTIVO_MIN = 10;

const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
const no = (codigo, error) => ({ puede: false, codigo, error });

/**
 * ¿Alguna línea del remito tiene recepción cargada?
 *
 * `null` es "nadie tocó todavía"; `0` es "se registró que no llegó nada", y ése
 * YA es un acto de recepción — el destino abrió el remito y dijo algo. Los dos no
 * se colapsan, igual que en el resto del módulo de transferencias.
 *
 * Se mira línea por línea y no el estado del remito: el estado pasa a
 * "Recibiendo" recién al guardar, y entre medio puede haber una línea escrita.
 */
export function tieneAlgunaRecepcion(detalle = []) {
  return detalle.some((d) => d?.recibido !== null && d?.recibido !== undefined);
}

/**
 * ¿Se puede desvincular esta venta?
 *
 * @param {object} args
 * @param {object|null} args.venta          { id, clienteId, grupoId, transferencia: { estado, detalle } }
 * @param {object|null} args.clienteNuevo   { id, localVinculadoId, grupoId }
 * @param {string} args.motivo
 * @returns {{ puede: true, codigo: "DESVINCULAR_OK" }
 *          | { puede: false, codigo: string, error: string }}
 */
export function puedeDesvincular({ venta = null, clienteNuevo = null, motivo = "" } = {}) {
  if (!venta || !idValido(venta.id)) {
    return no(CODIGOS_DESVINCULAR.VENTA_AUSENTE, "No se encontró la venta.");
  }

  const t = venta.transferencia;
  if (!t) {
    return no(
      CODIGOS_DESVINCULAR.SIN_TRANSFERENCIA,
      "Esta venta no generó ninguna transferencia. Si solo querés cambiarle el cliente, usá la corrección simple."
    );
  }

  if (t.estado !== "Enviada") {
    return no(
      CODIGOS_DESVINCULAR.TRANSFERENCIA_NO_ENVIADA,
      `La transferencia está en "${t.estado}" y solo se puede deshacer mientras esté en "Enviada". ` +
        (t.estado === "Recibida"
          ? "Ya la recibieron: la mercadería está en el otro local y hay que moverla desde ahí."
          : "")
    );
  }

  // El estado dice "Enviada" pero puede haber recepción a medio cargar. Cancelar
  // ahí dejaría el destino con líneas escritas de un remito que ya no existe.
  if (tieneAlgunaRecepcion(t.detalle || [])) {
    return no(
      CODIGOS_DESVINCULAR.TRANSFERENCIA_CON_RECEPCION,
      "El destino ya empezó a registrar la recepción de este remito. Hablá con el local antes de deshacerlo."
    );
  }

  if (!clienteNuevo || !idValido(clienteNuevo.id)) {
    return no(
      CODIGOS_DESVINCULAR.CLIENTE_NUEVO_AUSENTE,
      "Falta elegir a qué cliente corresponde la venta."
    );
  }

  if (Number(clienteNuevo.id) === Number(venta.clienteId)) {
    return no(
      CODIGOS_DESVINCULAR.CLIENTE_NUEVO_ES_EL_MISMO,
      "El cliente elegido es el que ya tiene la venta. Si el cliente está bien, la transferencia también, y no hay nada que deshacer."
    );
  }

  // Fuga entre grupos: mismo criterio que el resto del módulo.
  if (venta.grupoId != null && clienteNuevo.grupoId != null &&
      Number(venta.grupoId) !== Number(clienteNuevo.grupoId)) {
    return no(
      CODIGOS_DESVINCULAR.CLIENTE_NUEVO_DE_OTRO_GRUPO,
      "El cliente elegido pertenece a otro grupo."
    );
  }

  // EL CANDADO DEL DISEÑO. Si el cliente nuevo también está vinculado, la venta
  // sigue siendo interna y cancelar la transferencia dejaría mercadería
  // descontada del depósito sin destino. Lo que ese caso necesita es redirigir,
  // que es otra operación y todavía no existe.
  if (clienteNuevo.localVinculadoId != null) {
    return no(
      CODIGOS_DESVINCULAR.CLIENTE_NUEVO_VINCULADO,
      "Ese cliente también está vinculado a un local, así que la venta seguiría siendo interna y la " +
        "mercadería tiene que llegar a algún lado. Cambiarle el destino a una transferencia todavía no " +
        "se puede: por ahora hay que recibirla y transferirla desde el local."
    );
  }

  if (typeof motivo !== "string" || motivo.trim().length < MOTIVO_MIN) {
    return no(
      CODIGOS_DESVINCULAR.MOTIVO_AUSENTE,
      `Escribí por qué se deshace, con al menos ${MOTIVO_MIN} caracteres. Una transferencia cancelada sin ` +
        `motivo es indistinguible dentro de un mes de una que nunca debió existir.`
    );
  }

  return { puede: true, codigo: CODIGOS_DESVINCULAR.OK };
}
