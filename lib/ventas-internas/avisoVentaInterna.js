// lib/ventas-internas/avisoVentaInterna.js
//
// Helper PURO del aviso "esta venta generará una transferencia" del POS. Vive
// separado del componente para poder testear la REGLA sin renderizar nada.
//
// Es SOLO informativo. Quien decide si se crea la transferencia es el backend, que
// recarga el cliente desde la base dentro de la transacción de la venta
// (app/api/pos-ventas/crear). Este helper nunca alimenta el payload: si mostrara
// algo equivocado, la venta igual saldría bien o sería rechazada por el backend.
//
// El destino sale EXCLUSIVAMENTE del vínculo que devuelve el backend. Nunca del
// nombre del cliente, ni de cliente.localId (que es el local PROPIETARIO de la
// ficha, otra cosa). Si el vínculo no vino en la respuesta, no se inventa nada.

/** Variantes del aviso. `null` cuando no hay que mostrar nada. */
export const VARIANTES = {
  INTERNA: "interna",
  DESTINO_INACTIVO: "destino-inactivo",
};

/** Motivos por los que NO se muestra. Sirven para testear y depurar. */
export const MOTIVOS_OCULTO = {
  SIN_CLIENTE: "SIN_CLIENTE",
  CLIENTE_EXTERNO: "CLIENTE_EXTERNO",
  VINCULO_SIN_DATOS: "VINCULO_SIN_DATOS",
};

const OCULTO = (motivo) => ({
  visible: false,
  variante: null,
  titulo: null,
  mensaje: null,
  localNombre: null,
  motivo,
});

const esIdValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;

/**
 * ¿Qué aviso corresponde para el cliente seleccionado en el POS?
 *
 * @param {object|null} cliente  el MISMO objeto que ya guarda el POS en
 *   `state.clienteSeleccionado`. Se leen solo `localVinculadoId` y
 *   `localVinculado { id, nombre, activo }`.
 *
 * @returns {{ visible: boolean, variante: string|null, titulo: string|null,
 *             mensaje: string|null, localNombre: string|null, motivo?: string }}
 */
export function obtenerAvisoVentaInterna(cliente) {
  if (!cliente || typeof cliente !== "object") return OCULTO(MOTIVOS_OCULTO.SIN_CLIENTE);

  // Cliente externo: el caso normal. Sin vínculo declarado no se muestra nada.
  if (!esIdValido(cliente.localVinculadoId)) {
    return OCULTO(MOTIVOS_OCULTO.CLIENTE_EXTERNO);
  }

  // Hay vínculo pero no vinieron los datos del local. Pasa, por ejemplo, al
  // restaurar una venta vieja de la cola offline, guardada antes de esta etapa.
  // No se inventa un destino: se calla. El backend igual resolverá el vínculo.
  const local = cliente.localVinculado;
  if (!local || !esIdValido(local.id)) {
    return OCULTO(MOTIVOS_OCULTO.VINCULO_SIN_DATOS);
  }

  const localNombre = local.nombre || `Local ${Number(local.id)}`;

  // Vínculo histórico con un local que quedó inactivo: la configuración de
  // clientes ya no permite crearlo, pero puede existir. El backend rechaza la
  // venta (DESTINO_INACTIVO), así que se avisa fuerte ANTES de cobrar.
  if (local.activo !== true) {
    return {
      visible: true,
      variante: VARIANTES.DESTINO_INACTIVO,
      titulo: "Local interno inactivo",
      mensaje: `El local interno vinculado (${localNombre}) está inactivo. La venta será rechazada.`,
      localNombre,
    };
  }

  return {
    visible: true,
    variante: VARIANTES.INTERNA,
    titulo: "Venta interna",
    mensaje: `Esta venta generará una transferencia de mercadería al local ${localNombre}.`,
    localNombre,
  };
}

export default obtenerAvisoVentaInterna;
