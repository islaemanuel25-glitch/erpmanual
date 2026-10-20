// lib/stock/control/controlStockServer.js
//
// LAS ESCRITURAS Y LECTURAS DEL CONTROL DE STOCK.
//
// Las reglas están en `controlStock.js`; acá se cargan las filas, se bloquea y
// se escribe. Todo cambio de stock sigue el orden del ajuste manual
// (`app/api/stock_locales/ajustar/route.js`): la cantidad REAL se lee bloqueada,
// se calcula desde ella, se declara el origen y recién después se escribe, en la
// misma transacción que la fila de `AuditoriaStock` que lo explica.
//
// ── EL ORIGEN Y SU DOCUMENTO ────────────────────────────────────────────────
//
// Cada movimiento del control va al Libro de Stock como AJUSTE_POR_CONTROL con
// el id del control como referencia, y deja una fila en `AuditoriaStock` con el
// mismo `controlStockId`: quién, cuándo, de cuánto a cuánto. Así el Stock
// Diario lo muestra como "Ajuste por control #12" y la bitácora de stock tiene
// el detalle producto por producto.
//
// ── EL CANDADO DEL CONTROL ──────────────────────────────────────────────────
//
// Contar y corregir toman la fila del control con FOR SHARE; terminar la toma
// con FOR UPDATE. Así un conteo que llega mientras se termina espera, y después
// encuentra el control cerrado en vez de colarse en un control que ya puso en
// cero lo que nadie contó.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkPerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { getConfigLocalEfectiva } from "@/lib/config/local";
import { getOperadorActivoDelLocal, puedeOperarSinOperador } from "@/lib/operador";
import { unidadFisicaDeStock } from "@/lib/stock/escalaFisica";
import { bloquearFila, crearFilaEnCero } from "@/lib/stock/filaDeStock";
import { declararOrigenDeStock, ORIGEN_STOCK, ZONA_DEL_LIBRO } from "@/lib/stock/libro/libroStock";
import {
  ACCION_AUDITORIA_CONTROL,
  ESTADO_CONTROL,
  PERMISO_GESTIONAR_CONTROL,
  ORIGENES_DE_VENTA,
  admiteDecimales,
  avisoYaContado,
  clavePersona,
  mismaPersona,
  motivoDelControl,
  partirNoContados,
  stockTrasConteo,
  stockTrasCorreccion,
  textoDeUnidad,
  validarCantidadContada,
} from "@/lib/stock/control/controlStock";

/** Un rechazo que se decide adentro de la transacción y la revierte entera. */
export class RechazoDelControl extends Error {
  constructor(status, mensaje, extra = {}) {
    super(mensaje);
    this.status = status;
    this.extra = extra;
  }
}

// Terminar escribe una fila por producto puesto en cero: con cientos de
// productos, el límite de 5 s de Prisma no alcanza.
const OPCIONES_TX_TERMINAR = Object.freeze({ timeout: 120000, maxWait: 15000 });

const MIS_CONTEOS_VISIBLES = 30;

const TEXTO_SIN_CONTROL = "No hay un control abierto en este local.";

export const TEXTO_GESTIONAR_SIN_OPERADOR =
  "Con un operador activo se puede contar, pero empezar o terminar el control lo hace la cuenta sin PIN.";

// Lo que hace falta del producto para saber en qué unidad se cuenta.
const SELECT_BASE = Object.freeze({
  nombre: true,
  codigo_barra: true,
  activo: true,
  es_combo: true,
  modalidad: true,
  unidad_medida: true,
  modoCompraProveedor: true,
  pesoReferenciaKg: true,
  modoVentaDeposito: true,
  pesoEsFijo: true,
});

// ── QUIÉN ──────────────────────────────────────────────────────────────────

/**
 * LA PERSONA QUE HACE ESTO: el operador activo por PIN, validado en el local; si
 * no hay, la cuenta, pero solo si puede trabajar sin PIN (admin, o dueño en su
 * local). Una cuenta compartida sin PIN no cuenta: no se sabría quién fue.
 *
 * @returns {Promise<{ok:true, usuarioId, operadorId, nombre} | {ok:false, status, error, needsOperador}>}
 */
export async function quienEs(req, session, localId) {
  const op = await getOperadorActivoDelLocal(req, localId);
  if (op?.operadorId) {
    const fila = await prisma.operadorLocal.findUnique({ where: { id: op.operadorId }, select: { nombre: true } });
    return { ok: true, usuarioId: session.id, operadorId: op.operadorId, nombre: fila?.nombre || op.nombre || `Operador #${op.operadorId}` };
  }
  if (!puedeOperarSinOperador(session, { localId })) {
    return { ok: false, status: 428, error: "Identificate con tu PIN para contar.", needsOperador: true };
  }
  return laCuenta(session);
}

/** La cuenta como persona: su nombre, sin operador. */
async function laCuenta(session) {
  const u = await prisma.usuario.findUnique({ where: { id: Number(session.id) }, select: { nombre: true, email: true } });
  return { ok: true, usuarioId: session.id, operadorId: null, nombre: u?.nombre || u?.email || `Usuario #${session.id}` };
}

// ── LA PUERTA DE LAS RUTAS ─────────────────────────────────────────────────

/**
 * El local con el que se trabaja —el de la sesión, o el contexto elegido por el
 * admin—, el permiso y la persona. Una sola puerta para las seis rutas, así
 * ninguna queda pidiendo otra cosa.
 *
 * @param {string|string[]} permiso uno, o varios de los que alcanza con uno
 * `persona`: "exigida" (contar: el PIN, o dueño/admin sin PIN), "opcional"
 * (leer) o "cuenta" (empezar y terminar: la cuenta, que no tiene operador
 * activo porque eso ya se rechazó).
 *
 * @param {{ lectura?: boolean, persona?: "exigida"|"opcional"|"cuenta" }} opciones
 */
export async function autorizarControl(req, permiso, { lectura = false, persona = "exigida" } = {}) {
  const scope = await resolveLocalAndGrupo(req, { lecturaAjena: lectura });
  if (scope.error) return { ok: false, status: scope.status, error: scope.error, needsContexto: scope.needsContexto === true };
  // Con PIN activo, `checkPerm` ya niega gestionar —también al Admin—, porque
  // es uno de `PERMISOS_FUERA_DEL_OPERADOR`. Esto es solo para que el rechazo
  // diga por qué, en vez de "Sin permiso".
  const pedidos = Array.isArray(permiso) ? permiso : [permiso];
  if (scope.session.operadorActivo && pedidos.every((p) => p === PERMISO_GESTIONAR_CONTROL)) {
    return { ok: false, status: 403, error: TEXTO_GESTIONAR_SIN_OPERADOR };
  }
  const perm = checkPerm(scope.session, permiso);
  if (!perm.ok) return { ok: false, status: perm.status, error: perm.error };
  // Empezar y terminar los hace la CUENTA sin PIN —arriba ya se rechazó con
  // operador activo—, cualquiera sea su rol: un encargado sin PIN no es "una
  // cuenta compartida que no se sabe quién es", es quien gestiona. Contar sí
  // exige el PIN salvo dueño o admin (`quienEs`).
  const quien = persona === "cuenta" ? await laCuenta(scope.session) : await quienEs(req, scope.session, scope.localId);
  if (!quien.ok && persona === "exigida") return quien;
  return { ok: true, localId: scope.localId, grupoId: scope.grupoId, session: scope.session, quien: quien.ok ? quien : null };
}

/** La respuesta de un rechazo de la puerta. */
export function respuestaDeRechazo(r) {
  const { ok, status, ...resto } = r;
  return NextResponse.json({ ok: false, ...resto }, { status });
}

/** La respuesta de un error: un rechazo con su status, o un 500 que dice qué pasó. */
export function respuestaDeError(e, queSeHacia) {
  if (e instanceof RechazoDelControl) {
    return NextResponse.json({ ok: false, error: e.message, ...e.extra }, { status: e.status });
  }
  console.error(`❌ CONTROL DE STOCK · ${queSeHacia}:`, e);
  return NextResponse.json({ ok: false, error: `No se pudo ${queSeHacia}: ${e?.message || e}` }, { status: 500 });
}

// ── LECTURAS ───────────────────────────────────────────────────────────────

export function controlAbierto(db, localId) {
  return db.controlStock.findFirst({ where: { localId, estado: ESTADO_CONTROL.ABIERTO } });
}

/** Los productos con al menos un conteo vigente en el control. */
async function idsContados(db, controlId) {
  const filas = await db.conteoControlStock.findMany({
    where: { controlId, borradoEn: null },
    distinct: ["productoLocalId"],
    select: { productoLocalId: true },
  });
  return filas.map((f) => f.productoLocalId);
}

/**
 * EL UNIVERSO DE TERMINAR: los productos del local con stock distinto de cero
 * que nadie contó en este control. Solo los que se pueden contar —activos, de
 * una ficha activa, que no son combo ni servicio—: uno que no se puede escanear
 * no tiene cómo salir de la lista y quedaría en cero sin que nadie lo mirara.
 */
function whereNoContados(localId, contados) {
  return {
    localId,
    cantidad: { not: 0 },
    ...(contados.length ? { productoId: { notIn: contados } } : {}),
    producto: { activo: true, base: { activo: true, es_combo: false, modalidad: "NORMAL" } },
  };
}

async function noContadosConStock(db, localId, contados, esDeposito) {
  const filas = await db.stockLocal.findMany({
    where: whereNoContados(localId, contados),
    select: {
      id: true,
      productoId: true,
      cantidad: true,
      producto: { select: { nombre: true, base: { select: SELECT_BASE } } },
    },
  });
  return filas
    .map((f) => {
      const unidadFisica = unidadFisicaDeStock(f.producto.base, esDeposito);
      return {
        stockLocalId: f.id,
        productoLocalId: f.productoId,
        nombre: f.producto.nombre || f.producto.base.nombre,
        codigoBarra: f.producto.base.codigo_barra || "",
        stock: Number(f.cantidad),
        unidadFisica,
        unidad: textoDeUnidad(unidadFisica),
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * LO VENDIDO DESDE QUE SE ABRIÓ EL CONTROL, por producto, leído del Libro de
 * Stock: ya está en la unidad del stock, incluye los componentes de un combo y
 * descuenta lo anulado o corregido. `vendio` es haber tenido al menos un
 * movimiento de VENTA.
 *
 * `instante` es UTC sin zona, igual que `abiertoEn`. El momento viaja como
 * texto ISO con su `Z` y se pasa a UTC en la base, así no depende de la zona de
 * la sesión de PostgreSQL. El `dia` acota por el índice `(localId, dia)`: el día
 * argentino del momento de apertura.
 */
async function ventasDesde(db, localId, desde) {
  const iso = new Date(desde).toISOString();
  const filas = await db.$queryRaw`
    SELECT "productoLocalId",
           SUM(COALESCE("cantidadAnterior", 0) - COALESCE("cantidadPosterior", 0)) AS "vendidas",
           BOOL_OR("origen" = ${ORIGEN_STOCK.VENTA}) AS "vendio"
      FROM "MovimientoStock"
     WHERE "localId" = ${localId}
       AND "dia" >= ((${iso}::timestamptz) AT TIME ZONE ${ZONA_DEL_LIBRO})::date
       AND "instante" >= ((${iso}::timestamptz) AT TIME ZONE 'UTC')
       AND "origen" = ANY(${[...ORIGENES_DE_VENTA]})
     GROUP BY "productoLocalId"`;
  return new Map(
    filas.map((f) => [Number(f.productoLocalId), { vendio: f.vendio === true, vendidas: Number(f.vendidas) }])
  );
}

async function localDe(db, localId) {
  return db.local.findUnique({ where: { id: localId }, select: { id: true, nombre: true, es_deposito: true } });
}

function aConteo(c, unidades) {
  const u = unidades.get(c.productoLocalId) || {};
  return {
    id: c.id,
    productoLocalId: c.productoLocalId,
    nombre: u.nombre || `Producto #${c.productoLocalId}`,
    cantidad: Number(c.cantidad),
    unidadFisica: u.unidadFisica,
    unidad: textoDeUnidad(u.unidadFisica),
    admiteDecimales: admiteDecimales(u.unidadFisica),
    creadoEn: c.creadoEn,
  };
}

async function productosDe(db, ids, esDeposito) {
  if (!ids.length) return new Map();
  const pls = await db.productoLocal.findMany({
    where: { id: { in: ids } },
    select: { id: true, nombre: true, base: { select: SELECT_BASE } },
  });
  return new Map(
    pls.map((p) => [p.id, { nombre: p.nombre || p.base.nombre, unidadFisica: unidadFisicaDeStock(p.base, esDeposito) }])
  );
}

/**
 * LO QUE MUESTRAN C0, C1 Y C2: el control abierto con su avance y quién está
 * contando, o el último terminado; y lo que contó esta persona.
 */
export async function leerEstado({ localId, quien }) {
  const local = await localDe(prisma, localId);
  const control = await controlAbierto(prisma, localId);

  if (!control) {
    const ultimo = await prisma.controlStock.findFirst({
      where: { localId, estado: ESTADO_CONTROL.TERMINADO },
      orderBy: { terminadoEn: "desc" },
      select: { id: true, terminadoEn: true, terminadoPorNombre: true, puestosEnCero: true },
    });
    return { local, control: null, ultimo };
  }

  const conteos = await prisma.conteoControlStock.findMany({
    where: { controlId: control.id, borradoEn: null },
    select: { id: true, productoLocalId: true, cantidad: true, usuarioId: true, operadorId: true, contadoPor: true, creadoEn: true },
    orderBy: { creadoEn: "asc" },
  });
  const contados = [...new Set(conteos.map((c) => c.productoLocalId))];
  const sinContar = await prisma.stockLocal.count({ where: whereNoContados(localId, contados) });

  // Una fila por persona: su nombre más reciente, el último escaneo y cuántos
  // PRODUCTOS contó. Nunca se suman cantidades de productos distintos.
  const personas = new Map();
  for (const c of conteos) {
    const k = clavePersona(c);
    const p = personas.get(k) || { clave: k, nombre: c.contadoPor, ultimo: c.creadoEn, productos: new Set() };
    p.nombre = c.contadoPor;
    if (c.creadoEn > p.ultimo) p.ultimo = c.creadoEn;
    p.productos.add(c.productoLocalId);
    personas.set(k, p);
  }

  let misConteos = [];
  if (quien) {
    const mios = conteos.filter((c) => mismaPersona(c, quien)).reverse().slice(0, MIS_CONTEOS_VISIBLES);
    const unidades = await productosDe(prisma, [...new Set(mios.map((c) => c.productoLocalId))], local?.es_deposito === true);
    misConteos = mios.map((c) => aConteo(c, unidades));
  }

  return {
    local,
    control: {
      id: control.id,
      abiertoEn: control.abiertoEn,
      abiertoPorNombre: control.abiertoPorNombre,
      contados: contados.length,
      sinContar,
      personas: [...personas.values()]
        .sort((a, b) => b.ultimo - a.ultimo)
        .map((p) => ({ clave: p.clave, nombre: p.nombre, ultimo: p.ultimo, productos: p.productos.size })),
    },
    misConteos,
  };
}

/**
 * EL PRODUCTO ESCANEADO: en qué unidad se cuenta y el aviso si otra persona ya
 * lo contó en este control. No muestra el stock del sistema a propósito: se
 * cuenta lo que hay, no lo que dice la pantalla.
 */
export async function leerProductoParaContar({ localId, productoLocalId, quien }) {
  const local = await localDe(prisma, localId);
  const control = await controlAbierto(prisma, localId);
  if (!control) throw new RechazoDelControl(409, TEXTO_SIN_CONTROL);
  const pl = await productoContable(prisma, localId, productoLocalId);
  const unidadFisica = unidadFisicaDeStock(pl.base, local.es_deposito === true);
  const conteos = await prisma.conteoControlStock.findMany({
    where: { controlId: control.id, productoLocalId, borradoEn: null },
    select: { usuarioId: true, operadorId: true, contadoPor: true, cantidad: true },
  });
  return {
    producto: {
      productoLocalId: pl.id,
      nombre: pl.nombre || pl.base.nombre,
      codigoBarra: pl.base.codigo_barra || "",
      unidadFisica,
      unidad: textoDeUnidad(unidadFisica),
      admiteDecimales: admiteDecimales(unidadFisica),
    },
    aviso: avisoYaContado(conteos, quien, unidadFisica),
  };
}

/** El producto, si es de este local y se puede contar. */
async function productoContable(db, localId, productoLocalId) {
  const pl = await db.productoLocal.findUnique({
    where: { id: Number(productoLocalId) || 0 },
    select: { id: true, localId: true, nombre: true, activo: true, base: { select: SELECT_BASE } },
  });
  if (!pl || pl.localId !== localId) throw new RechazoDelControl(404, "Ese producto no es de este local.");
  if (pl.base.es_combo) throw new RechazoDelControl(400, "Un combo no tiene stock propio: contá sus componentes.");
  if (pl.base.modalidad !== "NORMAL") throw new RechazoDelControl(400, "Un servicio no tiene stock para contar.");
  return pl;
}

/**
 * LA VISTA DE TERMINAR: los que nadie contó y el sistema dice que hay, partidos
 * en vendidos durante el control y los que quedan en cero.
 */
export async function leerTerminar({ localId }) {
  const local = await localDe(prisma, localId);
  const control = await controlAbierto(prisma, localId);
  if (!control) throw new RechazoDelControl(409, TEXTO_SIN_CONTROL);
  const contados = await idsContados(prisma, control.id);
  const noContados = await noContadosConStock(prisma, localId, contados, local.es_deposito === true);
  const ventas = await ventasDesde(prisma, localId, control.abiertoEn);
  const { vendidos, aCero } = partirNoContados(noContados, ventas);
  return { local, control: { id: control.id, abiertoEn: control.abiertoEn }, vendidos, aCero };
}

// ── ESCRITURAS ─────────────────────────────────────────────────────────────

/** El control abierto del local, con el candado pedido, o un rechazo. */
async function tomarControl(tx, localId, { exclusivo }) {
  const filas = exclusivo
    ? await tx.$queryRaw`SELECT "id", "abiertoEn" FROM "ControlStock" WHERE "localId" = ${localId} AND "estado" = 'ABIERTO' FOR UPDATE`
    : await tx.$queryRaw`SELECT "id", "abiertoEn" FROM "ControlStock" WHERE "localId" = ${localId} AND "estado" = 'ABIERTO' FOR SHARE`;
  if (!filas[0]) throw new RechazoDelControl(409, TEXTO_SIN_CONTROL);
  return filas[0];
}

export async function abrirControl({ localId, quien }) {
  try {
    return await prisma.$transaction(async (tx) => {
      const ya = await controlAbierto(tx, localId);
      if (ya) throw new RechazoDelControl(409, "Ya hay un control abierto en este local.");
      return tx.controlStock.create({
        data: {
          localId,
          abiertoPorUsuarioId: quien.usuarioId,
          abiertoPorOperadorId: quien.operadorId,
          abiertoPorNombre: quien.nombre,
        },
      });
    });
  } catch (e) {
    // El índice único parcial: otro celular lo abrió en el mismo instante.
    if (e?.code === "P2002") throw new RechazoDelControl(409, "Ya hay un control abierto en este local.");
    throw e;
  }
}

async function permiteNegativo(localId, grupoId, esDeposito) {
  const efectiva = await getConfigLocalEfectiva(localId, grupoId, { esDeposito });
  return efectiva.allowNegativeStock === true;
}

/**
 * GUARDAR UN CONTEO. El primero del producto en el control fija el stock en lo
 * contado; los siguientes suman. Devuelve el conteo y el aviso que corresponde
 * ahora.
 */
export async function registrarConteo({ localId, grupoId, quien, productoLocalId, cantidad }) {
  const local = await localDe(prisma, localId);
  const esDeposito = local.es_deposito === true;
  const pl = await productoContable(prisma, localId, productoLocalId);
  const unidadFisica = unidadFisicaDeStock(pl.base, esDeposito);
  const v = validarCantidadContada(cantidad, unidadFisica);
  if (!v.ok) throw new RechazoDelControl(v.status, v.error);
  const allowNegativeStock = await permiteNegativo(localId, grupoId, esDeposito);

  return prisma.$transaction(async (tx) => {
    // 1 · El control, compartido: terminar no puede cerrarlo en el medio.
    const control = await tomarControl(tx, localId, { exclusivo: false });

    // 2 · Qué documento explica los movimientos que siguen. Antes de crear la
    //     fila: crearla ya deja un ALTA en el Libro.
    await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.AJUSTE_POR_CONTROL, referencia: String(control.id) });

    // 3 · La cantidad REAL, bloqueada. Dos celulares con el mismo producto se
    //     ordenan acá: el segundo ve el conteo del primero.
    let fila = await bloquearFila(tx, localId, pl.id);
    if (!fila) fila = await crearFilaEnCero(tx, localId, pl.id);
    const actual = Number(fila.cantidad);

    const previos = await tx.conteoControlStock.count({
      where: { controlId: control.id, productoLocalId: pl.id, borradoEn: null },
    });
    const esPrimero = previos === 0;
    const { nuevo } = stockTrasConteo({ actual, cantidad: v.cantidad, esPrimero, allowNegativeStock });

    const conteo = await tx.conteoControlStock.create({
      data: {
        controlId: control.id,
        localId,
        productoLocalId: pl.id,
        cantidad: v.cantidad,
        usuarioId: quien.usuarioId,
        operadorId: quien.operadorId,
        contadoPor: quien.nombre,
        fijo: esPrimero,
      },
    });
    await tx.auditoriaStock.create({
      data: {
        grupoId,
        localId,
        productoLocalId: pl.id,
        userId: quien.usuarioId,
        accion: ACCION_AUDITORIA_CONTROL.CONTEO,
        cantidadAnterior: actual,
        cantidadNueva: nuevo,
        motivo: motivoDelControl(control.id),
        controlStockId: control.id,
      },
    });
    await tx.stockLocal.update({ where: { id: fila.id }, data: { cantidad: nuevo } });

    return { conteo: { id: conteo.id, cantidad: v.cantidad, fijo: esPrimero }, stockAnterior: actual, stockNuevo: nuevo };
  });
}

/**
 * CORREGIR O BORRAR UN CONTEO PROPIO, mientras el control está abierto. El
 * stock se mueve por la diferencia. Borrar no borra la fila: la marca.
 */
export async function corregirConteo({ localId, grupoId, quien, conteoId, cantidad = null, borrar = false }) {
  const local = await localDe(prisma, localId);
  const esDeposito = local.es_deposito === true;
  const previo = await prisma.conteoControlStock.findUnique({ where: { id: Number(conteoId) || 0 } });
  if (!previo || previo.localId !== localId || previo.borradoEn) throw new RechazoDelControl(404, "Ese conteo no existe.");
  if (!mismaPersona(previo, quien)) throw new RechazoDelControl(403, "Solo quien contó puede corregir su conteo.");
  const pl = await productoContable(prisma, localId, previo.productoLocalId);
  const unidadFisica = unidadFisicaDeStock(pl.base, esDeposito);
  let nueva = 0;
  if (!borrar) {
    const v = validarCantidadContada(cantidad, unidadFisica);
    if (!v.ok) throw new RechazoDelControl(v.status, v.error);
    nueva = v.cantidad;
  }
  const allowNegativeStock = await permiteNegativo(localId, grupoId, esDeposito);

  return prisma.$transaction(async (tx) => {
    const control = await tomarControl(tx, localId, { exclusivo: false });
    if (control.id !== previo.controlId) throw new RechazoDelControl(409, "Ese control ya terminó: no se puede corregir.");

    await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.AJUSTE_POR_CONTROL, referencia: String(control.id) });

    let fila = await bloquearFila(tx, localId, pl.id);
    if (!fila) fila = await crearFilaEnCero(tx, localId, pl.id);
    // Releído con el control tomado: otra corrección del mismo conteo no pasa dos veces.
    const vigente = await tx.conteoControlStock.findUnique({ where: { id: previo.id } });
    if (vigente.borradoEn) throw new RechazoDelControl(404, "Ese conteo ya se borró.");
    const actual = Number(fila.cantidad);
    const { nuevo } = stockTrasCorreccion({ actual, anterior: Number(vigente.cantidad), nueva, allowNegativeStock });

    await tx.conteoControlStock.update({
      where: { id: vigente.id },
      data: borrar ? { borradoEn: new Date() } : { cantidad: nueva },
    });
    await tx.auditoriaStock.create({
      data: {
        grupoId,
        localId,
        productoLocalId: pl.id,
        userId: quien.usuarioId,
        accion: borrar ? ACCION_AUDITORIA_CONTROL.BORRADO : ACCION_AUDITORIA_CONTROL.CORRECCION,
        cantidadAnterior: actual,
        cantidadNueva: nuevo,
        motivo: motivoDelControl(control.id),
        controlStockId: control.id,
      },
    });
    await tx.stockLocal.update({ where: { id: fila.id }, data: { cantidad: nuevo } });

    return { conteoId: vigente.id, borrado: borrar, cantidad: borrar ? null : nueva, stockAnterior: actual, stockNuevo: nuevo };
  });
}

/**
 * TERMINAR: pone en cero los que nadie contó y no se vendieron durante el
 * control, y lo cierra.
 *
 * `vistos` son los productos que la pantalla mostró en "Quedan en 0". Se pone
 * en cero solo lo que la persona vio: si desde entonces apareció uno nuevo en
 * esa lista, se rechaza para que la vuelva a mirar; si uno salió —lo contaron o
 * se vendió—, simplemente no se toca.
 */
export async function terminarControl({ localId, grupoId, quien, vistos }) {
  const local = await localDe(prisma, localId);
  const esDeposito = local.es_deposito === true;
  const vistosSet = new Set((Array.isArray(vistos) ? vistos : []).map(Number).filter((n) => Number.isInteger(n) && n > 0));

  return prisma.$transaction(async (tx) => {
    // 1 · El control, exclusivo: ningún conteo entra mientras tanto.
    const control = await tomarControl(tx, localId, { exclusivo: true });
    const contados = await idsContados(tx, control.id);
    const noContados = await noContadosConStock(tx, localId, contados, esDeposito);

    // 2 · Las filas candidatas, bloqueadas: una venta que llega ahora espera.
    //     Recién con ellas tomadas se mira qué se vendió.
    const ids = noContados.map((p) => p.stockLocalId);
    const bloqueadas = ids.length
      ? await tx.$queryRaw`SELECT "id", "cantidad" FROM "StockLocal" WHERE "id" = ANY(${ids}) ORDER BY "id" FOR UPDATE`
      : [];
    const cantidadReal = new Map(bloqueadas.map((f) => [Number(f.id), Number(f.cantidad)]));
    const ventas = await ventasDesde(tx, localId, control.abiertoEn);
    const { aCero } = partirNoContados(
      noContados.map((p) => ({ ...p, stock: cantidadReal.get(p.stockLocalId) ?? p.stock })).filter((p) => p.stock !== 0),
      ventas
    );

    const nuevos = aCero.filter((p) => !vistosSet.has(p.productoLocalId));
    if (nuevos.length) {
      throw new RechazoDelControl(409, "La lista de los que quedan en 0 cambió. Revisala antes de terminar.", {
        cambioLaLista: true,
      });
    }

    // 3 · El documento de cada producto, el origen, y el cambio.
    if (aCero.length) {
      await tx.auditoriaStock.createMany({
        data: aCero.map((p) => ({
          grupoId,
          localId,
          productoLocalId: p.productoLocalId,
          userId: quien.usuarioId,
          accion: ACCION_AUDITORIA_CONTROL.PUESTO_EN_CERO,
          cantidadAnterior: p.stock,
          cantidadNueva: 0,
          motivo: motivoDelControl(control.id),
          controlStockId: control.id,
        })),
      });
      await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.AJUSTE_POR_CONTROL, referencia: String(control.id) });
      await tx.stockLocal.updateMany({
        where: { id: { in: aCero.map((p) => p.stockLocalId) } },
        data: { cantidad: 0 },
      });
    }

    await tx.controlStock.update({
      where: { id: control.id },
      data: {
        estado: ESTADO_CONTROL.TERMINADO,
        terminadoEn: new Date(),
        terminadoPorUsuarioId: quien.usuarioId,
        terminadoPorOperadorId: quien.operadorId,
        terminadoPorNombre: quien.nombre,
        puestosEnCero: aCero.length,
      },
    });
    return { controlId: control.id, puestosEnCero: aCero.length };
  }, OPCIONES_TX_TERMINAR);
}
