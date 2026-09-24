// lib/finanzas/pagosProveedoresServer.js
//
// LAS PIEZAS DE SERVIDOR DE PAGOS A PROVEEDORES. Todo lo que toca Prisma vive
// acá; la aritmética y las validaciones viven en `pagosProveedores.js`, que es
// puro. Mismo reparto que `lib/caja/cierreRelevoServer.js` con su par.
//
// ── LAS DOS PUERTAS QUE ESCRIBEN, Y SON LAS ÚNICAS ───────────────────────
//
//   · `crearCuentaPorPagarDesdeCompra` — la deuda nace de una compra. Hoy la
//     llaman solamente los candados; la tanda siguiente la llama "Cerrar
//     compra", adentro de SU transacción, con el pago inicial si corresponde.
//     No hay endpoint para crear deuda a mano: Finanzas no origina deudas.
//   · `registrarPagoProveedor` — un pago sobre una cuenta que ya existe. La
//     llama la ruta de Finanzas y la llama `crearCuentaPorPagarDesdeCompra` para
//     el pago inicial. Es UNA función para los dos caminos a propósito: si el
//     cierre de la compra escribiera su propio pago, el efectivo se descontaría
//     del cajón con dos reglas distintas.
//
// Las dos reciben `tx` —un cliente de transacción— y no abren la suya. Quien
// llama decide dónde empieza y termina la unidad: la ruta abre una para el
// pago, y el cierre de la compra va a meter la cuenta en la suya.

import prisma from "@/lib/prisma";
import { resolveVistaOperativa } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { WHERE_TURNO_OPERATIVO } from "@/lib/caja/cierreRelevo";
import { bloquearTurno } from "@/lib/caja/cierreRelevoServer";
import { desdeCentavos } from "@/lib/caja/efectivoEsperado";
import { validarIdempotencyKey } from "@/lib/caja/retiroDinero";
import { hoyArgentinaISO, inicioDiaArgentina } from "@/lib/fechas/rangoArgentina";

import { esVistaDeDeposito, ubicacionesVisibles } from "./alcanceFinanciero";
import { localesDeFinanzas } from "./localesDelGrupo";
import {
  ERROR_MEDIO_INVALIDO,
  ERROR_TOTAL_INVALIDO,
  PERMISO_REGISTRAR_PAGOS,
  ROTULO_ESTADO_CUENTA,
  ROTULO_MEDIO_PAGO,
  aFechaDeBase,
  claveDelPagoInicial,
  desdeFechaDeBase,
  diaEnQueSeSaldo,
  esMedioPagoProveedor,
  estadoDeCuenta,
  leerDiaDePago,
  leerFechaOpcional,
  leerImporte,
  medioTocaLaCaja,
  motivoDelRetiroDePago,
  validarMontoDePago,
} from "./pagosProveedores";

/**
 * Un rechazo de la regla de negocio, con el status HTTP que le corresponde.
 *
 * La ruta lo devuelve tal cual; cualquier otro error es un 500. Separarlos es lo
 * que permite que "el importe supera el saldo" llegue a la pantalla con esas
 * palabras y no como un "Error interno".
 */
export class ErrorPagoProveedor extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.name = "ErrorPagoProveedor";
    this.status = status;
  }
}

export const ERROR_CUENTA_NO_ENCONTRADA = "Cuenta no encontrada.";
export const ERROR_CUENTA_YA_EXISTE = "Esta compra ya tiene su cuenta por pagar.";
export const ERROR_COMPRA_NO_ENCONTRADA = "Compra no encontrada.";
export const ERROR_COMPRA_ANULADA = "Una compra anulada no genera deuda.";
export const ERROR_UBICACION_AJENA = "Esa ubicación no es del grupo de la compra.";
export const ERROR_FALTA_TURNO = "Un pago en efectivo tiene que salir de un turno abierto.";
export const ERROR_TURNO_NO_OPERATIVO =
  "Ese turno no está abierto en la ubicación de origen. El efectivo sale de un cajón que está operando.";
export const ERROR_TURNO_SIN_EFECTIVO = "Solo un pago en efectivo sale de un turno de caja.";
export const ERROR_ORIGEN_DE_OTRA_UBICACION =
  "La plata para pagar una deuda sale de la misma ubicación que la debe. Ninguna ubicación paga deudas de otra.";
export const ERROR_OPERAR_EN_LA_UBICACION_DE_LA_DEUDA =
  "Esta deuda la paga la ubicación que la debe: para registrar el pago hay que estar operando en esa ubicación.";
export const ERROR_TURNO_DE_OTRA_UBICACION =
  "Ese turno es de otra ubicación. El efectivo sale del cajón de la ubicación que debe.";

// ── LO QUE SE LEE DE UNA CUENTA ─────────────────────────────────────────

/**
 * Las columnas de una cuenta. `pagos.monto` va siempre: sin él no hay saldo, y
 * el saldo es lo primero que se muestra. `pagos.id` y `pagos.fecha` son para
 * saber qué día quedó saldada —`diaEnQueSeSaldo`—: el orden de registro y el día
 * del pago que la saldó. Son columnas que ya existían; no se calcula nada nuevo.
 */
export const SELECT_CUENTA = {
  id: true,
  grupoId: true,
  pedidoProveedorId: true,
  localGastoId: true,
  total: true,
  vencimientoProveedor: true,
  fechaPrevistaPago: true,
  createdAt: true,
  proveedor: { select: { id: true, nombre: true } },
  localGasto: { select: { id: true, nombre: true } },
  pedido: { select: { id: true, nroFactura: true, fechaFactura: true } },
  pagos: { select: { id: true, monto: true, fecha: true } },
};

/** Y las de cada pago del historial, con DE DÓNDE salió la plata. */
export const SELECT_PAGO = {
  id: true,
  monto: true,
  fecha: true,
  medio: true,
  turnoId: true,
  cajaMovimientoId: true,
  nota: true,
  createdAt: true,
  localOrigen: { select: { id: true, nombre: true } },
  usuario: { select: { id: true, nombre: true } },
};

/**
 * Una cuenta como la ve la pantalla: con total, pagado, saldo y estado YA
 * RESUELTOS por `estadoDeCuenta`. La pantalla no suma.
 */
export function serializarCuenta(c) {
  const { total, pagado, saldo, estado } = estadoDeCuenta({ total: c.total, pagos: c.pagos });
  return {
    id: c.id,
    pedidoProveedorId: c.pedidoProveedorId,
    proveedor: c.proveedor ? { id: c.proveedor.id, nombre: c.proveedor.nombre } : null,
    factura: c.pedido?.nroFactura || null,
    fechaFactura: c.pedido?.fechaFactura || null,
    localGasto: c.localGasto ? { id: c.localGasto.id, nombre: c.localGasto.nombre } : null,
    total,
    pagado,
    saldo,
    estado,
    rotuloEstado: ROTULO_ESTADO_CUENTA[estado],
    cantidadPagos: (c.pagos || []).length,
    vencimientoProveedor: desdeFechaDeBase(c.vencimientoProveedor),
    fechaPrevistaPago: desdeFechaDeBase(c.fechaPrevistaPago),
    createdAt: c.createdAt,
    // El día del pago que llevó el saldo a cero; `null` mientras deba algo. Es
    // el que ubica una cuenta Pagada en el calendario de la lista.
    saldadaEl: diaEnQueSeSaldo({ total: c.total, pagos: c.pagos }),
  };
}

export function serializarPago(p) {
  return {
    id: p.id,
    monto: Number(p.monto),
    fecha: p.fecha,
    medio: p.medio,
    rotuloMedio: ROTULO_MEDIO_PAGO[p.medio] || p.medio,
    origen: p.localOrigen ? { id: p.localOrigen.id, nombre: p.localOrigen.nombre } : null,
    usuario: p.usuario ? { id: p.usuario.id, nombre: p.usuario.nombre } : null,
    turnoId: p.turnoId,
    cajaMovimientoId: p.cajaMovimientoId,
    nota: p.nota || null,
  };
}

// ── ALCANCE ─────────────────────────────────────────────────────────────

/**
 * QUIÉN PREGUNTA Y QUÉ UBICACIONES PUEDE VER. Con las piezas que ya usa el
 * tablero de Finanzas, en el mismo orden: `resolveVistaOperativa`, después
 * `Local.es_deposito`, después los locales del grupo.
 *
 * El permiso de VER lo chequea cada ruta antes de llamar acá —así lo ve el
 * candado de `permisoEnCadaGet`—; esto agrega si además puede ESCRIBIR, para
 * que la pantalla no ofrezca un botón que el servidor va a rechazar.
 *
 * @returns {Promise<{error:string, status:number, needsContexto?:boolean} |
 *   {session, vista, grupoId:number, esDeposito:boolean, locales:Array,
 *    visibles:number[], puedeEscribir:boolean}>}
 */
export async function alcanceDePagos(req, session) {
  const vista = await resolveVistaOperativa(req);
  if (vista.error) {
    return { error: vista.error, status: vista.status, needsContexto: vista.needsContexto };
  }

  const localPropio = vista.localId
    ? await prisma.local.findUnique({
        where: { id: vista.localId },
        select: { id: true, es_deposito: true },
      })
    : null;
  const esDeposito = esVistaDeDeposito({ modo: vista.modo, localPropio });
  const { locales } = await localesDeFinanzas(vista.grupoId);
  const visibles = ubicacionesVisibles({
    esDeposito,
    localDeLaSesion: vista.localId,
    localesDelGrupo: locales,
  });

  return {
    session,
    vista,
    grupoId: vista.grupoId,
    esDeposito,
    locales,
    visibles,
    puedeEscribir: checkPerm(session, PERMISO_REGISTRAR_PAGOS).ok,
  };
}

/**
 * ¿QUIEN PREGUNTA PUEDE PAGAR ESTA CUENTA? Ver no alcanza.
 *
 * Hace falta el permiso de registrar pagos Y estar operando la ubicación que
 * debe. Un admin en vista global no opera ninguna —`vista.localId` es null—,
 * así que tampoco paga: para pagar tiene que elegir esa ubicación como contexto.
 *
 * Es la misma condición que `registrarPagoProveedor` vuelve a exigir al
 * escribir; acá sirve para que la pantalla no ofrezca un botón que el servidor
 * va a rechazar, y para que la ruta rechace antes de abrir la transacción.
 */
export function puedePagarLaCuenta(cuenta, alcance) {
  return (
    Boolean(alcance?.puedeEscribir) &&
    Boolean(cuenta) &&
    Number(alcance?.vista?.localId) === cuenta.localGastoId
  );
}

/**
 * ¿Quien pregunta puede ver ESTA cuenta? Por el GASTO, no por quién pagó: un
 * local ve las compras que son suyas aunque las haya pagado el depósito.
 */
export function cuentaEnAlcance(cuenta, alcance) {
  return (
    Boolean(cuenta) &&
    cuenta.grupoId === alcance.grupoId &&
    alcance.visibles.includes(cuenta.localGastoId)
  );
}

// ── ESCRITURA ───────────────────────────────────────────────────────────

/** Serializa los pagos de ESA cuenta, y de ninguna otra. */
async function bloquearCuenta(tx, cuentaId) {
  await tx.$queryRaw`SELECT id FROM "CuentaPorPagarProveedor" WHERE id = ${cuentaId} FOR UPDATE`;
}

async function ubicacionDelGrupo(tx, grupoId, localId) {
  const { locales } = await localesDeFinanzas(grupoId, tx);
  return locales.some((l) => l.localId === Number(localId));
}

/**
 * REGISTRA UN PAGO sobre una cuenta que ya existe. La única puerta.
 *
 * Toma el lock de la cuenta antes de leer el saldo: dos pagos simultáneos de
 * $100.000 sobre un saldo de $150.000 no pueden pasar los dos.
 *
 * EFECTIVO crea UN `CajaMovimiento` RETIRO en el turno indicado —que tiene que
 * ser de la ubicación de origen y estar operativo, con la MISMA condición que
 * usa el POS para vender, `WHERE_TURNO_OPERATIVO`— y deja el pago apuntando a
 * él. Como el movimiento es un RETIRO común, el efectivo esperado del turno lo
 * descuenta por el camino de siempre y una sola vez; el pago no se suma aparte.
 *
 * Los demás medios no tocan la caja.
 *
 * @param {object} tx cliente de transacción
 * @param {object} args
 * @param {number} args.cuentaId
 * @param {number|string} args.monto
 * @param {string} args.medio  uno de `MEDIO_PAGO_PROVEEDOR`
 * @param {number} args.localOrigenId  de dónde SALE la plata: tiene que ser la
 *        ubicación de la deuda
 * @param {number} args.localOperativoId  la ubicación en la que OPERA la sesión
 *        que registra: también tiene que ser la de la deuda
 * @param {number|null} [args.turnoId]  solo en efectivo, y de esa misma ubicación
 * @param {string|null} [args.fecha]  "AAAA-MM-DD", solo fuera de efectivo
 * @param {string|null} [args.nota]
 * @param {string} args.idempotencyKey  el intento; obligatoria, como en el retiro
 * @param {number} args.usuarioId
 * @returns {Promise<{pago, cuenta, repetido:boolean}>} `repetido` en true cuando
 *          la clave ya había entrado: es el pago de antes, no uno nuevo.
 */
export async function registrarPagoProveedor(tx, args = {}) {
  const cuentaId = Number(args.cuentaId);
  if (!Number.isInteger(cuentaId) || cuentaId <= 0) {
    throw new ErrorPagoProveedor(ERROR_CUENTA_NO_ENCONTRADA, 404);
  }
  const clave = validarIdempotencyKey(args.idempotencyKey, { de: "del pago" });
  if (!clave.valido) throw new ErrorPagoProveedor(clave.error);

  await bloquearCuenta(tx, cuentaId);

  const cuenta = await tx.cuentaPorPagarProveedor.findUnique({
    where: { id: cuentaId },
    select: SELECT_CUENTA,
  });
  if (!cuenta) throw new ErrorPagoProveedor(ERROR_CUENTA_NO_ENCONTRADA, 404);

  // ── CADA UBICACIÓN PAGA SUS DEUDAS, Y SOLO LAS SUYAS ────────────────────
  //
  // Las dos condiciones, sin excepción de medio ni de rol:
  //
  //   1. la plata sale de la MISMA ubicación que la deuda;
  //   2. quien registra está OPERANDO esa ubicación.
  //
  // Ver una cuenta no habilita a pagarla: el depósito o un admin en vista
  // global pueden mirar las de todo el grupo, y eso es alcance de lectura. Ni el
  // depósito paga lo de Casiano —aunque elija plata de Casiano— ni un local lo
  // del depósito. La condición es de igualdad y no "mismo grupo": "mismo grupo"
  // fue exactamente el agujero que dejaba pagar con la caja de otro.
  //
  // Van ANTES de la relectura por clave: un intento ajeno no tiene por qué
  // enterarse de qué pago dejó otro. Y antes de cualquier escritura, así que un
  // rechazo no deja nada a medias.
  if (Number(args.localOperativoId) !== cuenta.localGastoId) {
    throw new ErrorPagoProveedor(ERROR_OPERAR_EN_LA_UBICACION_DE_LA_DEUDA, 403);
  }
  const localOrigenId = Number(args.localOrigenId);
  if (localOrigenId !== cuenta.localGastoId) {
    throw new ErrorPagoProveedor(ERROR_ORIGEN_DE_OTRA_UBICACION, 403);
  }

  // ── EL MISMO INTENTO, OTRA VEZ ─────────────────────────────────────────
  //
  // Doble clic, respuesta perdida, reintento: la clave ya entró y se devuelve
  // el pago que dejó, sin crear otro ni otro RETIRO. Se pregunta DESPUÉS del
  // lock de la cuenta, así un segundo envío simultáneo espera al primero y lo
  // encuentra; y ANTES de validar el importe, porque el primer envío puede
  // haber saldado la cuenta y el reintento no tiene que leerse como "ya está
  // pagada". Es la forma del arqueo de Caja: relectura por clave → `repetido`.
  const previo = await tx.pagoProveedor.findUnique({
    where: { cuentaId_idempotencyKey: { cuentaId, idempotencyKey: clave.clave } },
    select: SELECT_PAGO,
  });
  if (previo) {
    return { pago: serializarPago(previo), cuenta: serializarCuenta(cuenta), repetido: true };
  }

  if (!esMedioPagoProveedor(args.medio)) throw new ErrorPagoProveedor(ERROR_MEDIO_INVALIDO);

  const { saldo } = estadoDeCuenta({ total: cuenta.total, pagos: cuenta.pagos });
  const importe = validarMontoDePago({ monto: args.monto, saldo });
  if (importe.error) throw new ErrorPagoProveedor(importe.error);
  const monto = desdeCentavos(importe.centavos);

  const turnoPedido = args.turnoId === null || args.turnoId === undefined || args.turnoId === ""
    ? null
    : Number(args.turnoId);

  let turnoId = null;
  let cajaMovimientoId = null;
  let fecha;

  if (medioTocaLaCaja(args.medio)) {
    if (!Number.isInteger(turnoPedido) || turnoPedido <= 0) {
      throw new ErrorPagoProveedor(ERROR_FALTA_TURNO);
    }
    // El lock del turno es el mismo que toman el retiro y el cierre: un corte
    // que se está tomando en este instante no puede quedarse sin ver este
    // retiro, ni este retiro caer después de su frontera.
    await bloquearTurno(tx, turnoPedido);
    // Un turno de OTRA ubicación es la caja de otro: 403, como el origen. Que
    // sea de la ubicación y no esté operando es otra cosa —el cajón existe pero
    // cerró— y sigue siendo 409.
    const delTurno = await tx.turno.findUnique({
      where: { id: turnoPedido },
      select: { localId: true },
    });
    if (delTurno && delTurno.localId !== localOrigenId) {
      throw new ErrorPagoProveedor(ERROR_TURNO_DE_OTRA_UBICACION, 403);
    }
    const turno = await tx.turno.findFirst({
      where: { id: turnoPedido, localId: localOrigenId, anuladoEn: null, ...WHERE_TURNO_OPERATIVO },
      select: { id: true },
    });
    if (!turno) throw new ErrorPagoProveedor(ERROR_TURNO_NO_OPERATIVO, 409);

    const movimiento = await tx.cajaMovimiento.create({
      data: {
        turnoId: turno.id,
        usuarioId: args.usuarioId,
        tipo: "RETIRO",
        monto,
        motivo: motivoDelRetiroDePago({
          proveedorNombre: cuenta.proveedor?.nombre,
          pedidoProveedorId: cuenta.pedidoProveedorId,
        }),
      },
      select: { id: true, createdAt: true },
    });
    turnoId = turno.id;
    cajaMovimientoId = movimiento.id;
    // La fecha del pago es la del movimiento: la plata salió del cajón AHORA,
    // y un pago en efectivo fechado distinto de su retiro no cerraría con el
    // turno.
    fecha = movimiento.createdAt;
  } else {
    if (turnoPedido !== null) throw new ErrorPagoProveedor(ERROR_TURNO_SIN_EFECTIVO);
    const hoy = hoyArgentinaISO();
    const dia = leerDiaDePago(args.fecha, hoy);
    if (dia.error) throw new ErrorPagoProveedor(dia.error);
    // Hoy es el instante; un día anterior es el comienzo de ese día argentino.
    fecha = dia.valor === hoy ? new Date() : inicioDiaArgentina(dia.valor);
  }

  const nota = String(args.nota ?? "").trim() || null;

  const pago = await tx.pagoProveedor.create({
    data: {
      cuentaId,
      monto,
      medio: args.medio,
      fecha,
      localOrigenId,
      usuarioId: args.usuarioId,
      turnoId,
      cajaMovimientoId,
      nota,
      idempotencyKey: clave.clave,
    },
    select: SELECT_PAGO,
  });

  const cuentaDespues = await tx.cuentaPorPagarProveedor.findUnique({
    where: { id: cuentaId },
    select: SELECT_CUENTA,
  });

  return { pago: serializarPago(pago), cuenta: serializarCuenta(cuentaDespues), repetido: false };
}

/**
 * Lo que devuelve un reintento que perdió la carrera contra el UNIQUE: el pago
 * que ganó. La ruta lo usa al atrapar un P2002, que es la red de abajo del lock
 * —si alguna vez el lock no alcanzara, la base sigue sin dejar pasar dos—.
 */
export async function pagoYaRegistrado(db, { cuentaId, idempotencyKey } = {}) {
  const clave = validarIdempotencyKey(idempotencyKey, { de: "del pago" });
  if (!clave.valido) return null;
  const [pago, cuenta] = await Promise.all([
    db.pagoProveedor.findUnique({
      where: { cuentaId_idempotencyKey: { cuentaId: Number(cuentaId), idempotencyKey: clave.clave } },
      select: SELECT_PAGO,
    }),
    db.cuentaPorPagarProveedor.findUnique({ where: { id: Number(cuentaId) }, select: SELECT_CUENTA }),
  ]);
  if (!pago || !cuenta) return null;
  return { pago: serializarPago(pago), cuenta: serializarCuenta(cuenta), repetido: true };
}

/**
 * CREA LA CUENTA POR PAGAR DE UNA COMPRA, y si corresponde su primer pago.
 *
 * Es la función que va a llamar "Cerrar compra" en la tanda siguiente. Hoy no
 * la llama ninguna ruta: no hay forma de crear deuda desde Finanzas.
 *
 * Lo que la compra NO decide sola, y por eso se pide explícito:
 *
 *   · `total` — el cierre sabe si manda el total del papel o el calculado; acá
 *     no se elige por él.
 *   · `localGastoId` — a quién pertenece el gasto. Tiene que ser una ubicación
 *     del grupo de la compra.
 *
 * `pagoInicial`, si viene, pasa por `registrarPagoProveedor` —la misma puerta
 * que usa Finanzas— dentro de la misma transacción.
 *
 * @param {object} tx cliente de transacción
 * @param {object} args
 * @param {number} args.pedidoProveedorId
 * @param {number} args.localGastoId
 * @param {number|string} args.total
 * @param {string|null} [args.vencimientoProveedor]  "AAAA-MM-DD" o null
 * @param {string|null} [args.fechaPrevistaPago]  "AAAA-MM-DD" o null
 * @param {number} args.usuarioId
 * @param {object|null} [args.pagoInicial]  { monto, medio, localOrigenId, turnoId?, fecha?, nota? }
 * @param {number} [args.localOperativoId]  la ubicación que opera quien cierra;
 *        solo se usa si hay pago inicial, y ahí tiene que ser la del gasto
 */
export async function crearCuentaPorPagarDesdeCompra(tx, args = {}) {
  const pedidoProveedorId = Number(args.pedidoProveedorId);
  const pedido = Number.isInteger(pedidoProveedorId) && pedidoProveedorId > 0
    ? await tx.pedidoProveedor.findUnique({
        where: { id: pedidoProveedorId },
        select: { id: true, grupoId: true, proveedorId: true, estado: true },
      })
    : null;
  if (!pedido) throw new ErrorPagoProveedor(ERROR_COMPRA_NO_ENCONTRADA, 404);
  if (pedido.estado === "ANULADO") throw new ErrorPagoProveedor(ERROR_COMPRA_ANULADA, 409);

  const total = leerImporte(args.total);
  if (total.error) throw new ErrorPagoProveedor(ERROR_TOTAL_INVALIDO);

  const localGastoId = Number(args.localGastoId);
  if (!(await ubicacionDelGrupo(tx, pedido.grupoId, localGastoId))) {
    throw new ErrorPagoProveedor(ERROR_UBICACION_AJENA, 403);
  }

  const vencimiento = leerFechaOpcional(args.vencimientoProveedor);
  if (vencimiento.error) throw new ErrorPagoProveedor(vencimiento.error);
  const prevista = leerFechaOpcional(args.fechaPrevistaPago);
  if (prevista.error) throw new ErrorPagoProveedor(prevista.error);

  // El UNIQUE de la base es el que manda; esto es para decirlo con palabras en
  // vez de con un P2002.
  const existente = await tx.cuentaPorPagarProveedor.findUnique({
    where: { pedidoProveedorId: pedido.id },
    select: { id: true },
  });
  if (existente) throw new ErrorPagoProveedor(ERROR_CUENTA_YA_EXISTE, 409);

  const creada = await tx.cuentaPorPagarProveedor.create({
    data: {
      grupoId: pedido.grupoId,
      pedidoProveedorId: pedido.id,
      proveedorId: pedido.proveedorId,
      localGastoId,
      total: desdeCentavos(total.centavos),
      vencimientoProveedor: aFechaDeBase(vencimiento.valor),
      fechaPrevistaPago: aFechaDeBase(prevista.valor),
      creadoPorId: args.usuarioId,
    },
    select: SELECT_CUENTA,
  });

  if (!args.pagoInicial) return { cuenta: serializarCuenta(creada), pago: null };

  const { pago, cuenta } = await registrarPagoProveedor(tx, {
    ...args.pagoInicial,
    // Si quien cierra la compra no trae una clave, la del pago inicial se deriva
    // de la compra, como el arqueo final se deriva del turno: hay UN pago inicial
    // por compra y un reintento del cierre cae en la misma clave.
    idempotencyKey: args.pagoInicial.idempotencyKey || claveDelPagoInicial(pedido.id),
    cuentaId: creada.id,
    usuarioId: args.usuarioId,
    localOperativoId: args.localOperativoId,
  });
  return { cuenta, pago };
}

/**
 * MUEVE LA FECHA PREVISTA DE PAGO. Solo ésa: el vencimiento del proveedor es
 * una condición que dio él y Finanzas no la reescribe.
 *
 * @param {object} db cliente (o transacción)
 * @param {{ cuentaId:number, fechaPrevistaPago:string|null }} args
 */
export async function cambiarFechaPrevistaPago(db, { cuentaId, fechaPrevistaPago } = {}) {
  const leida = leerFechaOpcional(fechaPrevistaPago);
  if (leida.error) throw new ErrorPagoProveedor(leida.error);
  const cuenta = await db.cuentaPorPagarProveedor.update({
    where: { id: Number(cuentaId) },
    data: { fechaPrevistaPago: aFechaDeBase(leida.valor) },
    select: SELECT_CUENTA,
  });
  return serializarCuenta(cuenta);
}
