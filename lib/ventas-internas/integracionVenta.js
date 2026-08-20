// lib/ventas-internas/integracionVenta.js
//
// Piezas PURAS de la integración POS Venta → Transferencia (etapa 4). El route de
// pos-ventas/crear es monolítico; todo lo que se pueda decidir sin base vive acá
// para poder testearlo en aislamiento y para no repetir la regla en cada ruta.
//
// No importa Prisma ni Next: recibe datos ya resueltos y devuelve decisiones.
//
// Distinto de:
//   · vinculo.js              → ¿esta operación califica como venta interna?
//   · configurarVinculo.js    → configurar Cliente.localVinculadoId desde la UI
//   · mapearVentaATransferencia.js → consumo físico → items de transferencia
// Este módulo une esas piezas con las respuestas HTTP y los bloqueos temporales.

import { CODIGOS, evaluarVinculoVentaInterna } from "./vinculo.js";

/**
 * Error tipado del flujo de venta interna. Se lanza DESDE DENTRO de la
 * transacción para abortarla; el handler exterior lo traduce a la respuesta HTTP.
 * Nunca se devuelve un NextResponse desde adentro de `$transaction`.
 */
export class VentaInternaError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = "VentaInternaError";
    this.code = code;
    this.status = status;
    // Marca para que el catch del route lo reconozca sin depender de instanceof
    // (el módulo podría cargarse dos veces en el bundle).
    this.esErrorVentaInterna = true;
  }
}

/** El vínculo cambió entre la validación previa y la transacción. */
export const COD_VINCULO_MODIFICADO = "VINCULO_INTERNO_MODIFICADO";

/**
 * Códigos que significan "esta venta NO es interna" y son perfectamente normales:
 * una venta sin cliente, o con un cliente externo, sigue funcionando como siempre.
 */
export const CODIGOS_SIN_VINCULO = [
  CODIGOS.CLIENTE_AUSENTE,
  CODIGOS.CLIENTE_SIN_LOCAL_VINCULADO,
];

export function esSinVinculo(codigo) {
  return CODIGOS_SIN_VINCULO.includes(codigo);
}

/**
 * Respuesta HTTP para un vínculo DECLARADO pero estructuralmente inválido.
 *
 * Estos casos NO degradan a venta común a propósito: el cliente representa a un
 * local interno, así que dejar pasar la venta sin transferencia generaría deuda
 * por mercadería que nunca sale del depósito. Es preferible rechazar y que alguien
 * corrija la configuración.
 *
 * @param {string} codigo  uno de los códigos de vinculo.js
 * @returns {{ status: number, error: string, code: string }|null}
 *   null si el código no es un fallo estructural (o sea: no corresponde rechazar).
 */
export function respuestaVinculoInvalido(codigo, { nombreLocal = null } = {}) {
  const destino = nombreLocal ? `“${nombreLocal}”` : "vinculado";

  switch (codigo) {
    // 403 — permiso.
    case CODIGOS.SIN_PERMISO_TRANSFERENCIA:
      return {
        status: 403,
        code: codigo,
        error: "No tenés permiso para generar la transferencia de esta venta.",
      };

    // 409 — conflicto estructural entre grupos: los datos existen pero no se
    // corresponden entre sí, y no es algo que el cajero pueda arreglar.
    case CODIGOS.ORIGEN_FUERA_DEL_GRUPO:
      return {
        status: 409,
        code: codigo,
        error: "El depósito desde el que vendés no pertenece a este grupo.",
      };
    case CODIGOS.DESTINO_FUERA_DEL_GRUPO:
      return {
        status: 409,
        code: codigo,
        error: `El local interno ${destino} no pertenece al mismo grupo.`,
      };

    // 400 — configuración inválida.
    case CODIGOS.ORIGEN_NO_ES_DEPOSITO:
      return {
        status: 400,
        code: codigo,
        error:
          "Este cliente representa a un local interno, pero la venta no se realiza desde un depósito.",
      };
    case CODIGOS.DESTINO_INACTIVO:
      return {
        status: 400,
        code: codigo,
        error: `El local interno ${destino} está inactivo.`,
      };
    case CODIGOS.ORIGEN_Y_DESTINO_IGUALES:
      return {
        status: 400,
        code: codigo,
        error: "El local interno vinculado es el mismo depósito que vende.",
      };
    case CODIGOS.DESTINO_AUSENTE:
      return {
        status: 400,
        code: codigo,
        error: "El local interno vinculado a este cliente no existe.",
      };
    case CODIGOS.ORIGEN_AUSENTE:
      return {
        status: 400,
        code: codigo,
        error: "No se pudo resolver el local desde el que se vende.",
      };

    default:
      // VENTA_INTERNA_VALIDA, CLIENTE_AUSENTE y CLIENTE_SIN_LOCAL_VINCULADO no
      // son rechazos.
      return null;
  }
}

/**
 * Pertenencia al grupo, consultada con el cliente Prisma que se le pase (puede ser
 * `tx`). No se usa getLocalIdsDeGrupo() acá porque toma el cliente global y la
 * decisión final tiene que leerse DENTRO de la transacción.
 *
 * El origen se busca en GrupoDeposito y el destino en GrupoLocal —cada uno en el
 * rol que le corresponde—, no en la unión de ambas: el depósito despacha y el
 * local recibe.
 *
 * @param {object} db  cliente Prisma o `tx`
 * @returns {Promise<{ origen: boolean, destino: boolean }>}
 */
export async function pertenenciaAlGrupo(db, { grupoId, origenId, destinoId } = {}) {
  const [dep, loc] = await Promise.all([
    db.grupoDeposito.findFirst({
      where: { grupoId, localId: Number(origenId) },
      select: { id: true },
    }),
    db.grupoLocal.findFirst({
      where: { grupoId, localId: Number(destinoId) },
      select: { id: true },
    }),
  ]);
  return { origen: dep != null, destino: loc != null };
}

/**
 * Resuelve si una venta es interna, LEYENDO con el cliente Prisma que se le pase.
 *
 * Se usa dos veces con el mismo código: una antes de la transacción (con `prisma`,
 * para fallar temprano y avisar) y otra DENTRO (con `tx`, que es la fuente
 * definitiva). No duplica las diez condiciones: arma los datos y delega en
 * evaluarVinculoVentaInterna.
 *
 * El cliente se scopea por { id, grupoId } y NUNCA por Cliente.localId, que es el
 * local PROPIETARIO de la ficha. Filtrar por él ocultaría un vínculo válido y
 * degradaría la venta en silencio.
 *
 * Sin clienteId no consulta nada: una venta común no paga queries de más.
 *
 * @param {object} db  cliente Prisma o `tx`
 * @returns {Promise<{ activa: boolean, codigo: string, destinoId: number|null,
 *                     destinoNombre: string|null }>}
 */
export async function resolverVentaInterna(db, {
  clienteId,
  grupoId,
  localOrigenId,
  esDeposito = false,
  tienePermisoCrearTransferencia = false,
} = {}) {
  const nada = (codigo) => ({ activa: false, codigo, destinoId: null, destinoNombre: null });

  if (!clienteId) return nada(CODIGOS.CLIENTE_AUSENTE);

  const cliente = await db.cliente.findFirst({
    where: { id: Number(clienteId), grupoId },
    select: {
      id: true,
      localId: true,
      grupoId: true,
      localVinculadoId: true,
      localVinculado: {
        select: { id: true, nombre: true, activo: true, es_deposito: true },
      },
    },
  });

  // Cliente inexistente, de otro grupo, o sin vínculo declarado: venta común.
  if (!cliente || cliente.localVinculadoId == null) {
    return nada(CODIGOS.CLIENTE_SIN_LOCAL_VINCULADO);
  }

  // Recién acá —con vínculo DECLARADO— se paga la consulta de pertenencia.
  const pert = await pertenenciaAlGrupo(db, {
    grupoId,
    origenId: localOrigenId,
    destinoId: Number(cliente.localVinculadoId),
  });

  const ev = evaluarVinculoVentaInterna({
    cliente,
    localOrigen: { id: localOrigenId, es_deposito: esDeposito === true },
    localDestino: cliente.localVinculado,
    perteneceOrigenAlGrupo: pert.origen,
    perteneceDestinoAlGrupo: pert.destino,
    tienePermisoCrearTransferencia: tienePermisoCrearTransferencia === true,
  });

  return {
    activa: ev.activa === true,
    codigo: ev.codigo,
    destinoId: ev.activa === true ? ev.localDestinoId : null,
    // El nombre se toma SIEMPRE de la lectura actual: si solo cambió el nombre del
    // local (mismo id), gana el dato fresco y la venta sigue.
    destinoNombre: cliente.localVinculado?.nombre ?? null,
  };
}

/**
 * Confirma, dentro de la transacción, que el vínculo sigue siendo el mismo que se
 * validó antes de abrirla. Lanza VentaInternaError para abortar TODO.
 *
 * Reglas:
 *   · dejó de estar vinculado          → VINCULO_INTERNO_MODIFICADO (409)
 *   · cambió a OTRO destino, aun válido → VINCULO_INTERNO_MODIFICADO (409).
 *     No se redirige en silencio: el cajero vio otro local en pantalla.
 *   · sigue vinculado pero quedó inválido (inactivo, fuera del grupo, sin
 *     permiso…) → el código ESTRUCTURAL real, que es más informativo.
 *
 * @param {object} resultado        salida de resolverVentaInterna leída con `tx`
 * @param {number} destinoEsperado  destino resuelto en la validación previa
 * @returns {{ destinoId: number, destinoNombre: string|null }}
 */
export function confirmarVinculoTransaccional(resultado, destinoEsperado) {
  const esperado = Number(destinoEsperado);

  if (!resultado || resultado.activa !== true) {
    // Si dejó de estar vinculado, el código estructural sería
    // CLIENTE_SIN_LOCAL_VINCULADO, que en la validación previa significa "venta
    // común". Acá NO puede degradar a venta común: ya se descontó stock y se
    // cobró contra un destino. Se traduce a conflicto explícito.
    const codigo = resultado?.codigo;
    if (codigo === CODIGOS.CLIENTE_SIN_LOCAL_VINCULADO || codigo === CODIGOS.CLIENTE_AUSENTE) {
      throw new VentaInternaError(
        COD_VINCULO_MODIFICADO,
        "El cliente dejó de estar vinculado a un local interno mientras se procesaba la venta. " +
          "Volvé a seleccionar el cliente e intentá nuevamente.",
        409
      );
    }
    const resp = respuestaVinculoInvalido(codigo, { nombreLocal: resultado?.destinoNombre });
    throw new VentaInternaError(
      resp?.code ?? codigo ?? COD_VINCULO_MODIFICADO,
      resp?.error ?? "El vínculo con el local interno dejó de ser válido.",
      resp?.status ?? 409
    );
  }

  if (Number(resultado.destinoId) !== esperado) {
    throw new VentaInternaError(
      COD_VINCULO_MODIFICADO,
      "El local vinculado a este cliente cambió mientras se procesaba la venta. " +
        "Volvé a seleccionar el cliente e intentá nuevamente.",
      409
    );
  }

  return { destinoId: Number(resultado.destinoId), destinoNombre: resultado.destinoNombre };
}

/**
 * Índice productoLocalId → fila de ProductoLocal (con `.base`), que es lo que
 * crearTransferencia necesita para crear el ProductoLocal del destino y congelar
 * `precioCosto`.
 *
 * Se arma desde UNA consulta consolidada; nunca una por ítem.
 *
 * @param {Array<object>} productosLocales  filas con { id, ..., base }
 * @returns {Map<number, object>}
 */
export function construirSnapshots(productosLocales = []) {
  const mapa = new Map();
  for (const pl of productosLocales || []) {
    if (!pl || !Number.isInteger(Number(pl.id))) continue;
    mapa.set(Number(pl.id), pl);
  }
  return mapa;
}

/** IDs de ProductoLocal del origen que hay que cargar para los snapshots. */
export function idsParaSnapshots(consumoFisicoConsolidado = []) {
  const ids = new Set();
  for (const c of consumoFisicoConsolidado || []) {
    const id = Number(c?.productoLocalId);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

// ── Bloqueos temporales ───────────────────────────────────────────────────────
//
// La etapa 4 activó la creación de transferencias desde ventas sin la
// sincronización inversa, y estos bloqueos evitaban las inconsistencias que eso
// producía. Queda uno.
//
// ── EL QUE SE FUE: `bloqueoCancelacion` (2026-08-20) ────────────────────────
//
// Prohibía cancelar una transferencia nacida de una venta, y el motivo era real:
// cancelar hacía `cantidad += enviado` sobre el origen, pero la venta ya había
// descontado esa cantidad —la transferencia usa `SOLO_TRANSITO`—, así que
// devolverla habría inventado mercadería que la venta seguía cobrando.
//
// Se retiró porque el problema se resolvió en vez de taparse:
// `/api/transferencias/cancelar` ahora revierte el tránsito según la política con
// la que el remito nació Y revierte la venta con el motor compartido, en una sola
// transacción. Ya no hay nada que prohibir, y dejar la función habría sido dejar
// escrita una prohibición que ya no rige.
//
//   · corregir una venta revierte y reaplica su consumo sin saber nada de la
//     transferencia, que quedaría enviada por cantidades que ya no existen. Ese
//     bloqueo SIGUE, y es el de abajo.

export const COD_CORRECCION_BLOQUEADA = "VENTA_CON_TRANSFERENCIA_VINCULADA";

/**
 * ¿Se puede corregir esta venta? Si tiene transferencia vinculada VIVA, todavía
 * no: ni Enviada, ni Recibiendo, ni Recibida.
 *
 * Se bloquea también en "Recibida" a propósito: la mercadería ya está en el otro
 * local, así que corregir la venta dejaría el stock del destino sin respaldo.
 *
 * ── LA EXCEPCIÓN: "Cancelada" NO BLOQUEA ────────────────────────────────────
 *
 * Una transferencia cancelada no tiene stock en juego —la reversión ya corrió— y
 * no hay nada que la corrección pueda descuadrar. Bloquear por ella era bloquear
 * por un rastro histórico.
 *
 * ── HOY NO TIENE LLAMADOR VIVO, Y SE CONSERVA IGUAL ─────────────────────────
 *
 * La escribió la operación de desvincular una venta interna, que se descartó el
 * 2026-08-20 a favor de anular la venta entera. Anular no pasa por acá —una
 * venta anulada no se corrige—, así que por ahora ninguna ruta llega a este caso.
 *
 * Se conserva porque la excepción es correcta por sí misma y no depende de quién
 * la haya necesitado: bloquear una corrección por una transferencia CANCELADA es
 * bloquear por un rastro histórico, no por stock en juego. El día que exista una
 * forma de cancelar el remito de una venta sin anularla, esto ya está resuelto.
 *
 * Se anota que no tiene llamador para que nadie la lea como "esto lo usa algo" y
 * la dé por ejercida: lo único que la ejerce hoy es su candado.
 *
 * Se decide por ESTADO y no por "la operación de desvincular ya corrió", que era
 * la otra forma de escribirlo: el estado es un hecho de la transferencia y se lee
 * igual desde cualquier lado, mientras que una marca de procedencia habría que
 * mantenerla sincronizada con quien la escribe.
 *
 * @param {object|null} venta  se lee `transferencia` ({ id, estado } o null)
 * @returns {{ status: number, error: string, code: string }|null}
 */
export function bloqueoCorreccion(venta) {
  const t = venta?.transferencia;
  if (!t) return null;
  if (t.estado === "Cancelada") return null;
  const estado = t.estado ? ` (estado: ${t.estado})` : "";
  return {
    status: 409,
    code: COD_CORRECCION_BLOQUEADA,
    error:
      `Esta venta tiene una transferencia vinculada${estado}. ` +
      "La corrección sincronizada todavía no está disponible.",
  };
}

/**
 * Reintento con `clientTxnId` de una venta que YA existe.
 *
 * Si esa venta es interna y movió mercadería física, tiene que tener su
 * transferencia. Si no la tiene, es una venta huérfana y devolver "ok, duplicada"
 * ocultaría una venta interna sin transferencia.
 *
 * NO se repara automáticamente. La reconstrucción es técnicamente posible desde
 * VentaDetalle.cantidadStock + VentaDetalleComponente.cantidad, pero una huérfana
 * solo puede venir de una venta anterior a esta etapa —cuya mercadería ya se
 * entregó hace tiempo— o de una corrupción. Crear hoy una transferencia "Enviada"
 * por eso marcaría en viaje algo que ya llegó. Requiere intervención humana.
 *
 * @param {object} args
 * @param {boolean} args.esInterna       la venta existente es de un cliente interno
 * @param {boolean} args.tieneFisico     tiene al menos una línea con consumo físico
 * @param {boolean} args.tieneTransferencia
 * @returns {{ status: number, error: string, code: string }|null}
 */
export function bloqueoReintentoHuerfana({
  esInterna = false,
  tieneFisico = false,
  tieneTransferencia = false,
} = {}) {
  if (!esInterna || !tieneFisico || tieneTransferencia) return null;
  return {
    status: 409,
    code: "VENTA_INTERNA_SIN_TRANSFERENCIA",
    error:
      "Esta venta es para un local interno y movió mercadería, pero no tiene la transferencia asociada. " +
      "Requiere revisión manual: no se genera automáticamente para no marcar en viaje mercadería ya entregada.",
  };
}
