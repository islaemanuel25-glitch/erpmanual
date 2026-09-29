// lib/finanzas/gastosServer.js
//
// LAS PIEZAS DE SERVIDOR DE GASTOS. Todo lo que toca Prisma vive acá; la
// aritmética y las validaciones viven en `gastos.js`, que es puro. El mismo
// reparto que `pagosProveedoresServer.js` con `pagosProveedores.js`.
//
// ── LAS DOS PUERTAS QUE ESCRIBEN, Y SON LAS ÚNICAS ───────────────────────
//
//   · `crearGasto` — el gasto nace, y si viene con pago inicial, lo paga en la
//     misma transacción por la otra puerta.
//   · `registrarPagoGasto` — un pago sobre un gasto que ya existe.
//
// Las rutas que vengan las llaman a éstas y no escriben `gasto` ni `pagoGasto`
// por su cuenta: las reglas que importan —de quién es el gasto, quién lo paga,
// que el efectivo salga del cajón de esa ubicación una sola vez— viven acá, en
// la capa que escribe, y no en la pantalla ni en la ruta.
//
// Las dos reciben `tx` y no abren la suya: quien llama decide la unidad. Si el
// pago inicial falla, el gasto tampoco queda.

import { checkPerm } from "@/lib/authorize";
import { desdeCentavos } from "@/lib/caja/efectivoEsperado";
import { validarIdempotencyKey } from "@/lib/caja/retiroDinero";

import {
  ERROR_FALTA_FECHA_GASTO,
  PERMISO_REGISTRAR_GASTOS,
  ERROR_TOTAL_GASTO_INVALIDO,
  claveDelPagoInicialDeGasto,
  esMedioPagoGasto,
  leerConcepto,
  leerTextoOpcional,
  motivoDelRetiroDeGasto,
  validarPagoDeGasto,
} from "./gastos";
import { localesDeFinanzas } from "./localesDelGrupo";
import {
  ERROR_MEDIO_INVALIDO,
  PERMISO_VER_FINANZAS,
  ROTULO_ESTADO_CUENTA,
  aFechaDeBase,
  desdeFechaDeBase,
  estadoDeCuenta,
  leerFechaOpcional,
  leerImporte,
} from "./pagosProveedores";
import { resolverSalidaDelPago } from "./salidaDelPago";

/**
 * Un rechazo de la regla de negocio, con su status HTTP. Cualquier otro error
 * es un 500: separarlos es lo que deja que "el importe supera lo que falta
 * pagar" llegue a la pantalla con esas palabras.
 */
export class ErrorGasto extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.name = "ErrorGasto";
    this.status = status;
  }
}

export const ERROR_GASTO_NO_ENCONTRADO = "Gasto no encontrado.";
export const ERROR_UBICACION_DEL_GASTO_AJENA = "Esa ubicación no es del grupo.";
export const ERROR_CATEGORIA_INVALIDA = "Elegí una categoría de gasto válida.";
export const ERROR_OPERAR_EN_LA_UBICACION_DEL_GASTO =
  "Este gasto es de otra ubicación: para registrarlo o pagarlo hay que estar operando en la ubicación del gasto.";
export const ERROR_ORIGEN_DE_OTRA_UBICACION_GASTO =
  "La plata para pagar un gasto sale de la misma ubicación del gasto. Ninguna ubicación paga gastos de otra.";

// ── LO QUE SE LEE ───────────────────────────────────────────────────────

export const SELECT_PAGO_GASTO = {
  id: true,
  gastoId: true,
  monto: true,
  fecha: true,
  medio: true,
  localOrigenId: true,
  usuarioId: true,
  turnoId: true,
  cajaMovimientoId: true,
  nota: true,
  createdAt: true,
};

export const SELECT_GASTO = {
  id: true,
  grupoId: true,
  localId: true,
  categoriaId: true,
  concepto: true,
  total: true,
  fecha: true,
  beneficiario: true,
  comprobanteNumero: true,
  comprobanteFecha: true,
  vencimiento: true,
  fechaPrevistaPago: true,
  creadoPorId: true,
  createdAt: true,
  categoria: { select: { id: true, nombre: true } },
  pagos: { select: { id: true, monto: true, fecha: true }, orderBy: { id: "asc" } },
};

export function serializarPagoGasto(p) {
  return {
    id: p.id,
    gastoId: p.gastoId,
    monto: Number(p.monto),
    fecha: p.fecha,
    medio: p.medio,
    localOrigenId: p.localOrigenId,
    usuarioId: p.usuarioId,
    turnoId: p.turnoId,
    cajaMovimientoId: p.cajaMovimientoId,
    nota: p.nota,
    createdAt: p.createdAt,
  };
}

/** El gasto con total, pagado, saldo y estado ya resueltos: la pantalla no suma. */
export function serializarGasto(g) {
  const { total, pagado, saldo, estado } = estadoDeCuenta({ total: g.total, pagos: g.pagos });
  return {
    id: g.id,
    grupoId: g.grupoId,
    localId: g.localId,
    categoria: g.categoria ? { id: g.categoria.id, nombre: g.categoria.nombre } : null,
    concepto: g.concepto,
    total,
    pagado,
    saldo,
    estado,
    rotuloEstado: ROTULO_ESTADO_CUENTA[estado],
    fecha: desdeFechaDeBase(g.fecha),
    beneficiario: g.beneficiario,
    comprobanteNumero: g.comprobanteNumero,
    comprobanteFecha: desdeFechaDeBase(g.comprobanteFecha),
    vencimiento: desdeFechaDeBase(g.vencimiento),
    fechaPrevistaPago: desdeFechaDeBase(g.fechaPrevistaPago),
    creadoPorId: g.creadoPorId,
    createdAt: g.createdAt,
  };
}

/** Las categorías activas, en el orden en que se ofrecen. */
export function categoriasDeGasto(db) {
  return db.categoriaGasto.findMany({
    where: { activo: true },
    orderBy: [{ orden: "asc" }, { id: "asc" }],
    select: { id: true, nombre: true },
  });
}

// ── ESCRITURA ───────────────────────────────────────────────────────────

/** Serializa los pagos de ESE gasto, y de ningún otro. */
async function bloquearGasto(tx, gastoId) {
  await tx.$queryRaw`SELECT id FROM "Gasto" WHERE id = ${gastoId} FOR UPDATE`;
}

async function ubicacionDelGrupo(tx, grupoId, localId) {
  const { locales } = await localesDeFinanzas(grupoId, tx);
  return locales.some((l) => l.localId === Number(localId));
}

/**
 * EL PERMISO SE CHEQUEA ACÁ, en la capa que escribe, y no solo en la ruta.
 *
 * Ver (`finanzas.ver`) y escribir (`finanzas.gastos.registrar`), los dos, como
 * pide la ruta de pagos a proveedores. Con esto el permiso de gastos se chequea
 * desde el primer día aunque todavía no haya pantalla, y una ruta futura que se
 * olvide de chequearlo no abre la puerta. Devuelve quién registra: el usuario
 * sale de la sesión y no de un argumento que se pueda mandar distinto.
 */
function exigirPermisoDeEscribir(session) {
  for (const permiso of [PERMISO_VER_FINANZAS, PERMISO_REGISTRAR_GASTOS]) {
    const p = checkPerm(session, permiso);
    if (!p.ok) throw new ErrorGasto(p.error, p.status);
  }
  const usuarioId = Number(session.id);
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) throw new ErrorGasto("No autenticado", 401);
  return usuarioId;
}

function leerFechaOpcionalOError(v) {
  const f = leerFechaOpcional(v);
  if (f.error) throw new ErrorGasto(f.error);
  return f.valor;
}

function leerTextoOError(v, maximo) {
  const t = leerTextoOpcional(v, maximo);
  if (t.error) throw new ErrorGasto(t.error);
  return t.valor;
}

/**
 * REGISTRA UN PAGO sobre un gasto que ya existe. La única puerta.
 *
 * Toma el lock del gasto antes de leer el saldo: dos pagos simultáneos no
 * pueden pasar los dos sobre el mismo saldo. El efectivo sale del cajón por
 * `resolverSalidaDelPago`, la misma regla que un pago a proveedor: turno
 * operativo de la ubicación del gasto, su lock, y UN RETIRO al que el pago
 * queda apuntando. Los demás medios no tocan la caja.
 *
 * @param {object} tx cliente de transacción
 * @param {object} args
 * @param {number} args.gastoId
 * @param {number|string} args.monto
 * @param {string} args.medio  uno de `MEDIO_PAGO_GASTO`
 * @param {number} args.localOrigenId  de dónde SALE la plata: la del gasto
 * @param {number} args.localOperativoId  la ubicación que OPERA quien registra:
 *        también la del gasto
 * @param {number|null} [args.turnoId]  solo en efectivo, de esa misma ubicación
 * @param {string|null} [args.fecha]  "AAAA-MM-DD", solo fuera de efectivo
 * @param {string|null} [args.nota]
 * @param {string} args.idempotencyKey  el intento; obligatoria
 * @param {object} args.session  quien registra: tiene que tener `finanzas.ver` y
 *        `finanzas.gastos.registrar`; el pago queda a nombre de `session.id`
 * @returns {Promise<{pago, gasto, repetido:boolean}>}
 */
export async function registrarPagoGasto(tx, args = {}) {
  const usuarioId = exigirPermisoDeEscribir(args.session);
  const gastoId = Number(args.gastoId);
  if (!Number.isInteger(gastoId) || gastoId <= 0) throw new ErrorGasto(ERROR_GASTO_NO_ENCONTRADO, 404);
  const clave = validarIdempotencyKey(args.idempotencyKey, { de: "del pago" });
  if (!clave.valido) throw new ErrorGasto(clave.error);

  await bloquearGasto(tx, gastoId);

  const gasto = await tx.gasto.findUnique({ where: { id: gastoId }, select: SELECT_GASTO });
  if (!gasto) throw new ErrorGasto(ERROR_GASTO_NO_ENCONTRADO, 404);

  // ── CADA UBICACIÓN PAGA SUS GASTOS, Y SOLO LOS SUYOS ────────────────────
  //
  // Las dos igualdades de `registrarPagoProveedor`, sin excepción de medio ni
  // de rol: la plata sale de la ubicación del gasto, y quien registra la está
  // operando. Ver un gasto —el depósito, un admin en vista global— no habilita
  // a pagarlo. Van antes de la relectura por clave y de cualquier escritura.
  if (Number(args.localOperativoId) !== gasto.localId) {
    throw new ErrorGasto(ERROR_OPERAR_EN_LA_UBICACION_DEL_GASTO, 403);
  }
  const localOrigenId = Number(args.localOrigenId);
  if (localOrigenId !== gasto.localId) throw new ErrorGasto(ERROR_ORIGEN_DE_OTRA_UBICACION_GASTO, 403);

  // ── EL MISMO INTENTO, OTRA VEZ ─────────────────────────────────────────
  //
  // Después del lock —un envío simultáneo espera al primero y lo encuentra— y
  // antes de validar el importe: el primer envío puede haber saldado el gasto,
  // y el reintento no se tiene que leer como "ya está pagado".
  const previo = await tx.pagoGasto.findUnique({
    where: { gastoId_idempotencyKey: { gastoId, idempotencyKey: clave.clave } },
    select: SELECT_PAGO_GASTO,
  });
  if (previo) return { pago: serializarPagoGasto(previo), gasto: serializarGasto(gasto), repetido: true };

  if (!esMedioPagoGasto(args.medio)) throw new ErrorGasto(ERROR_MEDIO_INVALIDO);

  const { saldo } = estadoDeCuenta({ total: gasto.total, pagos: gasto.pagos });
  const importe = validarPagoDeGasto({ monto: args.monto, saldo });
  if (importe.error) throw new ErrorGasto(importe.error);
  const monto = desdeCentavos(importe.centavos);

  const nota = leerTextoOError(args.nota);

  const { turnoId, cajaMovimientoId, fecha } = await resolverSalidaDelPago(tx, {
    medio: args.medio,
    turnoId: args.turnoId,
    fecha: args.fecha,
    localOrigenId,
    usuarioId,
    monto,
    motivo: motivoDelRetiroDeGasto({ concepto: gasto.concepto, gastoId }),
    crearError: (mensaje, status) => new ErrorGasto(mensaje, status),
  });

  const pago = await tx.pagoGasto.create({
    data: {
      gastoId,
      monto,
      medio: args.medio,
      fecha,
      localOrigenId,
      usuarioId,
      turnoId,
      cajaMovimientoId,
      nota,
      idempotencyKey: clave.clave,
    },
    select: SELECT_PAGO_GASTO,
  });

  const despues = await tx.gasto.findUnique({ where: { id: gastoId }, select: SELECT_GASTO });
  return { pago: serializarPagoGasto(pago), gasto: serializarGasto(despues), repetido: false };
}

/**
 * CREA UN GASTO, y si viene, su pago inicial en la misma transacción.
 *
 * El gasto se registra operando SU ubicación, igual que se paga: el depósito no
 * anota gastos a nombre de un local ni al revés. La categoría tiene que estar
 * activa. El pago inicial pasa por `registrarPagoGasto` —la misma puerta de
 * siempre— con una clave derivada del gasto, así que un reintento del alta cae
 * en el mismo pago y no saca dos veces la plata del cajón.
 *
 * @param {object} tx cliente de transacción
 * @param {object} args
 * @param {number} args.grupoId
 * @param {number} args.localId  la ubicación dueña del gasto
 * @param {number} args.localOperativoId  la que opera quien registra: la misma
 * @param {number} args.categoriaId
 * @param {string} args.concepto
 * @param {number|string} args.total
 * @param {string} args.fecha  "AAAA-MM-DD", el día al que corresponde
 * @param {string|null} [args.beneficiario]
 * @param {string|null} [args.comprobanteNumero]
 * @param {string|null} [args.comprobanteFecha]  "AAAA-MM-DD"
 * @param {string|null} [args.vencimiento]  "AAAA-MM-DD"
 * @param {string|null} [args.fechaPrevistaPago]  "AAAA-MM-DD"
 * @param {string} args.idempotencyKey  el intento de alta; obligatoria
 * @param {object} args.session  quien registra, con los dos permisos
 * @param {object|null} [args.pagoInicial]  { monto, medio, turnoId?, fecha?, nota? }
 * @returns {Promise<{gasto, pago, repetido:boolean}>}
 */
export async function crearGasto(tx, args = {}) {
  const usuarioId = exigirPermisoDeEscribir(args.session);
  const clave = validarIdempotencyKey(args.idempotencyKey, { de: "del gasto" });
  if (!clave.valido) throw new ErrorGasto(clave.error);

  const localId = Number(args.localId);
  if (!Number.isInteger(localId) || localId <= 0 || Number(args.localOperativoId) !== localId) {
    throw new ErrorGasto(ERROR_OPERAR_EN_LA_UBICACION_DEL_GASTO, 403);
  }
  const grupoId = Number(args.grupoId);
  if (!Number.isInteger(grupoId) || !(await ubicacionDelGrupo(tx, grupoId, localId))) {
    throw new ErrorGasto(ERROR_UBICACION_DEL_GASTO_AJENA, 403);
  }

  // ── EL MISMO INTENTO, OTRA VEZ ─────────────────────────────────────────
  //
  // Devuelve el gasto de antes y, si lo tuvo, su pago inicial. Si dos envíos
  // llegan a la vez, el UNIQUE `(localId, idempotencyKey)` deja pasar uno y el
  // otro aborta su transacción entera —gasto, pago y retiro—; quien llama lo
  // atrapa y responde con `gastoYaRegistrado`.
  const previo = await gastoYaRegistrado(tx, { localId, idempotencyKey: clave.clave });
  if (previo) return previo;

  const categoriaId = Number(args.categoriaId);
  const categoria = Number.isInteger(categoriaId) && categoriaId > 0
    ? await tx.categoriaGasto.findUnique({ where: { id: categoriaId }, select: { id: true, activo: true } })
    : null;
  if (!categoria || !categoria.activo) throw new ErrorGasto(ERROR_CATEGORIA_INVALIDA);

  const concepto = leerConcepto(args.concepto);
  if (concepto.error) throw new ErrorGasto(concepto.error);

  const total = leerImporte(args.total);
  if (total.error) throw new ErrorGasto(ERROR_TOTAL_GASTO_INVALIDO);

  const fecha = leerFechaOpcionalOError(args.fecha);
  if (!fecha) throw new ErrorGasto(ERROR_FALTA_FECHA_GASTO);

  const creado = await tx.gasto.create({
    data: {
      grupoId,
      localId,
      categoriaId: categoria.id,
      concepto: concepto.valor,
      total: desdeCentavos(total.centavos),
      fecha: aFechaDeBase(fecha),
      beneficiario: leerTextoOError(args.beneficiario),
      comprobanteNumero: leerTextoOError(args.comprobanteNumero),
      comprobanteFecha: aFechaDeBase(leerFechaOpcionalOError(args.comprobanteFecha)),
      vencimiento: aFechaDeBase(leerFechaOpcionalOError(args.vencimiento)),
      fechaPrevistaPago: aFechaDeBase(leerFechaOpcionalOError(args.fechaPrevistaPago)),
      creadoPorId: usuarioId,
      idempotencyKey: clave.clave,
    },
    select: SELECT_GASTO,
  });

  if (!args.pagoInicial) return { gasto: serializarGasto(creado), pago: null, repetido: false };

  const { pago, gasto } = await registrarPagoGasto(tx, {
    ...args.pagoInicial,
    gastoId: creado.id,
    // La plata sale de la ubicación del gasto: no hay otra que valga, y una
    // distinta en el pedido se rechaza en `registrarPagoGasto`.
    localOrigenId: args.pagoInicial.localOrigenId ?? localId,
    localOperativoId: args.localOperativoId,
    session: args.session,
    idempotencyKey: args.pagoInicial.idempotencyKey || claveDelPagoInicialDeGasto(creado.id),
  });
  return { gasto, pago, repetido: false };
}

/**
 * El gasto que ya dejó un intento de alta, con su pago inicial si lo tuvo, o
 * `null`. Es lo que devuelve un reintento, y lo que la ruta usa al atrapar un
 * P2002 del UNIQUE de la clave.
 */
export async function gastoYaRegistrado(db, { localId, idempotencyKey } = {}) {
  const clave = validarIdempotencyKey(idempotencyKey, { de: "del gasto" });
  if (!clave.valido) return null;
  const gasto = await db.gasto.findUnique({
    where: { localId_idempotencyKey: { localId: Number(localId), idempotencyKey: clave.clave } },
    select: SELECT_GASTO,
  });
  if (!gasto) return null;
  const pagoInicial = await db.pagoGasto.findUnique({
    where: { gastoId_idempotencyKey: { gastoId: gasto.id, idempotencyKey: claveDelPagoInicialDeGasto(gasto.id) } },
    select: SELECT_PAGO_GASTO,
  });
  return {
    gasto: serializarGasto(gasto),
    pago: pagoInicial ? serializarPagoGasto(pagoInicial) : null,
    repetido: true,
  };
}

/** El pago que ya dejó un intento, o `null`. Para el P2002 del pago. */
export async function pagoDeGastoYaRegistrado(db, { gastoId, idempotencyKey } = {}) {
  const clave = validarIdempotencyKey(idempotencyKey, { de: "del pago" });
  if (!clave.valido) return null;
  const [pago, gasto] = await Promise.all([
    db.pagoGasto.findUnique({
      where: { gastoId_idempotencyKey: { gastoId: Number(gastoId), idempotencyKey: clave.clave } },
      select: SELECT_PAGO_GASTO,
    }),
    db.gasto.findUnique({ where: { id: Number(gastoId) }, select: SELECT_GASTO }),
  ]);
  if (!pago || !gasto) return null;
  return { pago: serializarPagoGasto(pago), gasto: serializarGasto(gasto), repetido: true };
}
