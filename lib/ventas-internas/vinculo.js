// lib/ventas-internas/vinculo.js
//
// Predicado PURO: ¿esta operación califica como venta interna (depósito → local del
// mismo grupo)? Es la puerta de entrada del futuro flujo POS Venta → Venta +
// Transferencia. Todavía no hay ningún llamador: en esta etapa solo existe la regla.
//
// No consulta Prisma ni depende de Next: recibe los datos ya resueltos por el
// llamador. Así la regla se puede testear en aislamiento y no se acopla a cómo se
// obtuvieron el cliente, los locales, la pertenencia al grupo o el permiso.
//
// El destino sale EXCLUSIVAMENTE de cliente.localVinculadoId. Nunca se infiere por
// el nombre del cliente ni se reutiliza cliente.localId (que es el local
// PROPIETARIO de la ficha, otra cosa).
//
// Devuelve siempre un resultado explícito con un código estable, para que el
// llamador pueda distinguir "no aplica" de "aplicaría pero falta algo".

/** Códigos de retorno. Estables: el llamador puede ramificar sobre ellos. */
export const CODIGOS = {
  VALIDA: "VENTA_INTERNA_VALIDA",
  CLIENTE_AUSENTE: "CLIENTE_AUSENTE",
  CLIENTE_SIN_LOCAL_VINCULADO: "CLIENTE_SIN_LOCAL_VINCULADO",
  ORIGEN_AUSENTE: "ORIGEN_AUSENTE",
  ORIGEN_NO_ES_DEPOSITO: "ORIGEN_NO_ES_DEPOSITO",
  DESTINO_AUSENTE: "DESTINO_AUSENTE",
  DESTINO_INACTIVO: "DESTINO_INACTIVO",
  ORIGEN_Y_DESTINO_IGUALES: "ORIGEN_Y_DESTINO_IGUALES",
  ORIGEN_FUERA_DEL_GRUPO: "ORIGEN_FUERA_DEL_GRUPO",
  DESTINO_FUERA_DEL_GRUPO: "DESTINO_FUERA_DEL_GRUPO",
  SIN_PERMISO_TRANSFERENCIA: "SIN_PERMISO_TRANSFERENCIA",
};

const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
const no = (codigo) => ({ activa: false, codigo });

/**
 * @param {object}  args
 * @param {object|null} args.cliente      Cliente de la venta. Se lee `localVinculadoId`.
 * @param {object|null} args.localOrigen  Local que vende. Se lee `id` y `es_deposito`.
 * @param {object|null} args.localDestino Local vinculado al cliente. Se lee `id` y `activo`.
 * @param {boolean} args.perteneceOrigenAlGrupo   el origen está en el grupo de la operación.
 * @param {boolean} args.perteneceDestinoAlGrupo  el destino está en el MISMO grupo.
 * @param {boolean} args.tienePermisoCrearTransferencia  permiso `transferencias.crear`.
 *
 * @returns {{ activa: true, codigo: "VENTA_INTERNA_VALIDA", localDestinoId: number }
 *          | { activa: false, codigo: string }}
 */
export function evaluarVinculoVentaInterna({
  cliente = null,
  localOrigen = null,
  localDestino = null,
  perteneceOrigenAlGrupo = false,
  perteneceDestinoAlGrupo = false,
  tienePermisoCrearTransferencia = false,
} = {}) {
  // 1. Cliente.
  if (!cliente) return no(CODIGOS.CLIENTE_AUSENTE);

  // 2. Vínculo explícito con un local interno. Sin esto, venta común.
  const localVinculadoId = cliente.localVinculadoId;
  if (!idValido(localVinculadoId)) return no(CODIGOS.CLIENTE_SIN_LOCAL_VINCULADO);
  const destinoId = Number(localVinculadoId);

  // 3. Local de origen.
  if (!localOrigen || !idValido(localOrigen.id)) return no(CODIGOS.ORIGEN_AUSENTE);
  const origenId = Number(localOrigen.id);

  // 4. Solo el depósito despacha mercadería.
  if (localOrigen.es_deposito !== true) return no(CODIGOS.ORIGEN_NO_ES_DEPOSITO);

  // 5. Local de destino: tiene que ser el que apunta el vínculo, no otro.
  if (!localDestino || !idValido(localDestino.id) || Number(localDestino.id) !== destinoId) {
    return no(CODIGOS.DESTINO_AUSENTE);
  }

  // 6. Destino activo.
  if (localDestino.activo !== true) return no(CODIGOS.DESTINO_INACTIVO);

  // 7. Un depósito no se despacha a sí mismo.
  if (origenId === destinoId) return no(CODIGOS.ORIGEN_Y_DESTINO_IGUALES);

  // 8-9. Los dos en el grupo de la operación (evita fugas entre grupos).
  if (perteneceOrigenAlGrupo !== true) return no(CODIGOS.ORIGEN_FUERA_DEL_GRUPO);
  if (perteneceDestinoAlGrupo !== true) return no(CODIGOS.DESTINO_FUERA_DEL_GRUPO);

  // 10. Permiso para crear la transferencia.
  if (tienePermisoCrearTransferencia !== true) return no(CODIGOS.SIN_PERMISO_TRANSFERENCIA);

  return { activa: true, codigo: CODIGOS.VALIDA, localDestinoId: destinoId };
}

export default evaluarVinculoVentaInterna;
