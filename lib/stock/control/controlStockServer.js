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
// ── EL TOTAL DE UN PRODUCTO ES UNA FILA VIGENTE ─────────────────────────────
//
// El campo de la tarjeta es el TOTAL contado del producto en el control. Cada
// vez que alguien lo fija, las filas vigentes de `ConteoControlStock` se marcan
// borradas y nace UNA fila nueva con el total, a nombre de quien lo tocó. Así la
// historia queda entera —quién puso qué y cuándo— y la vigente dice el total y
// el último que lo tocó, sin pisar ningún hecho.
//
// Los controles que ya estaban abiertos con la versión anterior pueden tener
// varias vigentes del mismo producto (los conteos se sumaban): el total es su
// suma, y el primer cambio las reemplaza por una sola.
//
// ── EL CANDADO DEL CONTROL ──────────────────────────────────────────────────
//
// Contar toma la fila del control con FOR SHARE; terminar la toma con FOR
// UPDATE. Así un conteo que llega mientras se termina espera, y después
// encuentra el control cerrado en vez de colarse en un control que ya puso en
// cero lo que nadie contó.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkPerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { getConfigLocalEfectiva } from "@/lib/config/local";
import { getOperadorActivoDelLocal, puedeOperarSinOperador } from "@/lib/operador";
import { productoVisibleWhere } from "@/lib/visibilidad";
import { buscarProductoLocalPorCodigo } from "@/lib/productos/busquedaCodigoBarra";
import { unidadFisicaDeStock } from "@/lib/stock/escalaFisica";
import { bloquearFila, crearFilaEnCero } from "@/lib/stock/filaDeStock";
import { buildTextOR } from "@/lib/stock/busquedaStock";
import { mapStockItemDeposito, mapStockItemLocal } from "@/lib/stock/mapItem";
import { declararOrigenDeStock, ORIGEN_STOCK, ZONA_DEL_LIBRO } from "@/lib/stock/libro/libroStock";
import {
  ACCION_AUDITORIA_CONTROL,
  ACCIONES_DEL_CONTEO,
  ESTADO_CONTROL,
  FILTRO_CONTROL,
  PERMISO_GESTIONAR_CONTROL,
  ORIGENES_DE_VENTA,
  ajusteNetoDelConteo,
  motivoDelControl,
  partirNoContados,
  stockTrasDeshacer,
  stockTrasFijarTotal,
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

/** Las tarjetas por página: las mismas que Stock Locales. */
export const PRODUCTOS_POR_PAGINA = 25;

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

// Lo que piden `mapStockItemLocal` y `mapStockItemDeposito` —los mismos campos
// que trae el listado de Stock— más el nombre del proveedor, que la tarjeta
// muestra y Stock resuelve con su catálogo.
const INCLUDE_ITEM = Object.freeze({
  base: {
    select: {
      id: true,
      nombre: true,
      codigo_barra: true,
      categoria_id: true,
      proveedor_id: true,
      area_fisica_id: true,
      unidad_medida: true,
      factor_pack: true,
      precio_costo: true,
      precio_venta: true,
      margen: true,
      redondeo_100: true,
      modoCompraProveedor: true,
      pesoReferenciaKg: true,
      pesoEsFijo: true,
      modoVentaDeposito: true,
      proveedor: { select: { nombre: true } },
    },
  },
  stock: {
    take: 1,
    select: { cantidad: true, stockMin: true, stockMax: true, limitesConfiguradosAt: true },
  },
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
 * admin—, el permiso y la persona. Una sola puerta para todas las rutas, así
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

// ── EL UNIVERSO ────────────────────────────────────────────────────────────

/**
 * LOS PRODUCTOS QUE SE PUEDEN CONTAR en esta ubicación: activos, de una ficha
 * activa, que no son combo ni servicio, y en el depósito los que el depósito ve.
 * Es lo que lista Stock Locales —más el servicio afuera—, y de acá salen la
 * lista, los chips, el avance y terminar: un solo universo.
 */
function whereProductoContable(localId, esDeposito) {
  return {
    localId,
    activo: true,
    base: {
      activo: true,
      es_combo: false,
      modalidad: "NORMAL",
      ...(esDeposito ? productoVisibleWhere(localId) : {}),
    },
  };
}

/**
 * EL UNIVERSO DE TERMINAR: los contables con stock distinto de cero que nadie
 * contó en este control. Uno que no se puede escanear no está: no tendría cómo
 * salir de la lista y quedaría en cero sin que nadie lo mirara.
 */
function whereNoContados(localId, contados, esDeposito) {
  return {
    localId,
    cantidad: { not: 0 },
    ...(contados.length ? { productoId: { notIn: contados } } : {}),
    producto: whereProductoContable(localId, esDeposito),
  };
}

export function controlAbierto(db, localId) {
  return db.controlStock.findFirst({ where: { localId, estado: ESTADO_CONTROL.ABIERTO } });
}

/**
 * Los totales vigentes del control, por producto: la suma de sus filas vigentes
 * (una sola, salvo controles de la versión anterior) y el último que lo tocó.
 */
async function totalesVigentes(db, controlId, productoLocalIds = null) {
  const filas = await db.conteoControlStock.findMany({
    where: {
      controlId,
      borradoEn: null,
      ...(productoLocalIds ? { productoLocalId: { in: productoLocalIds } } : {}),
    },
    select: { productoLocalId: true, cantidad: true, contadoPor: true, creadoEn: true },
    orderBy: { creadoEn: "asc" },
  });
  const porProducto = new Map();
  for (const f of filas) {
    const previo = porProducto.get(f.productoLocalId);
    porProducto.set(f.productoLocalId, {
      total: Math.round(((previo?.total ?? 0) + Number(f.cantidad)) * 1000) / 1000,
      contadoPor: f.contadoPor,
      en: f.creadoEn,
    });
  }
  return porProducto;
}

async function idsContados(db, controlId) {
  const filas = await db.conteoControlStock.findMany({
    where: { controlId, borradoEn: null },
    distinct: ["productoLocalId"],
    select: { productoLocalId: true },
  });
  return filas.map((f) => f.productoLocalId);
}

/** Los contadores de los chips y del avance. */
async function resumenDelControl(db, localId, controlId, esDeposito) {
  const contados = await idsContados(db, controlId);
  const sinContar = await db.stockLocal.count({ where: whereNoContados(localId, contados, esDeposito) });
  return { contados: contados.length, sinContar };
}

async function noContadosConStock(db, localId, contados, esDeposito) {
  const filas = await db.stockLocal.findMany({
    where: whereNoContados(localId, contados, esDeposito),
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

// ── LECTURAS ───────────────────────────────────────────────────────────────

/**
 * LO QUE MUESTRA EL INICIO: sin control, el último terminado; con control, cuándo
 * se abrió y sus contadores.
 */
export async function leerEstado({ localId }) {
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

  const resumen = await resumenDelControl(prisma, localId, control.id, local.es_deposito === true);
  return {
    local,
    control: { id: control.id, abiertoEn: control.abiertoEn, abiertoPorNombre: control.abiertoPorNombre, ...resumen },
  };
}

/**
 * EL ÍTEM DE UNA TARJETA: el MISMO que arma el listado de Stock
 * (`mapStockItemLocal` / `mapStockItemDeposito`), así la tarjeta se dibuja con
 * la misma pieza y la misma presentación, más el proveedor y el conteo vigente.
 */
function aItem(pl, esDeposito, localId, totales) {
  const item = esDeposito
    ? mapStockItemDeposito(pl, pl.base, pl.stock?.[0], localId)
    : mapStockItemLocal(pl, pl.base, pl.stock?.[0]);
  const t = totales.get(pl.id);
  return {
    ...item,
    proveedorNombre: pl.base.proveedor?.nombre ?? null,
    conteo: t ? { total: t.total, contadoPor: t.contadoPor, en: t.en } : null,
  };
}

/**
 * LA LISTA DE TARJETAS, como la de Stock Locales: 25 por página, por nombre.
 *
 *   · `filtro`: "sin_contar" (los del universo de terminar), "contados", o
 *     nada (todos los que se pueden contar);
 *   · `q`: el texto del buscador. Si es un código que la caja reconoce en este
 *     local, es ese producto; si no, la búsqueda de texto de Stock;
 *   · `codigo` / `productoLocalId`: UN producto —lo que leyó el lector, o el
 *     "Contar" de terminar—, sin mirar el filtro: la tarjeta tiene que aparecer
 *     aunque el chip activo la estuviera ocultando.
 */
export async function listarProductos({ localId, filtro = null, q = "", page = 1, codigo = null, productoLocalId = null }) {
  const local = await localDe(prisma, localId);
  const esDeposito = local.es_deposito === true;
  const control = await controlAbierto(prisma, localId);
  if (!control) throw new RechazoDelControl(409, TEXTO_SIN_CONTROL);
  const contable = whereProductoContable(localId, esDeposito);

  if (codigo || productoLocalId) {
    let id = Number(productoLocalId) || null;
    if (codigo) {
      const pl = await buscarProductoLocalPorCodigo(prisma, { localId, codigo, consulta: { select: { id: true } } });
      id = pl?.id ?? null;
    }
    const pl = id ? await prisma.productoLocal.findFirst({ where: { ...contable, id }, include: INCLUDE_ITEM }) : null;
    if (!pl) {
      return { item: null, error: codigo ? `No hay ningún producto para contar con el código ${codigo}.` : "Ese producto no se puede contar acá." };
    }
    const totales = await totalesVigentes(prisma, control.id, [pl.id]);
    return { item: aItem(pl, esDeposito, localId, totales) };
  }

  const contados = await idsContados(prisma, control.id);
  const texto = String(q || "").trim();
  const porCodigo = texto
    ? await buscarProductoLocalPorCodigo(prisma, { localId, codigo: texto, consulta: { select: { id: true } } })
    : null;
  const condiciones = [];
  if (porCodigo) condiciones.push({ id: porCodigo.id });
  else if (texto) condiciones.push({ base: buildTextOR(texto) });
  if (filtro === FILTRO_CONTROL.SIN_CONTAR) {
    if (contados.length) condiciones.push({ id: { notIn: contados } });
    condiciones.push({ stock: { some: { cantidad: { not: 0 } } } });
  } else if (filtro === FILTRO_CONTROL.CONTADOS) {
    condiciones.push({ id: { in: contados } });
  }
  const where = { ...contable, ...(condiciones.length ? { AND: condiciones } : {}) };

  const pagina = Math.max(1, Number(page) || 1);
  const total = await prisma.productoLocal.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PRODUCTOS_POR_PAGINA));
  const filas = await prisma.productoLocal.findMany({
    where,
    orderBy: { base: { nombre: "asc" } },
    skip: (pagina - 1) * PRODUCTOS_POR_PAGINA,
    take: PRODUCTOS_POR_PAGINA,
    include: INCLUDE_ITEM,
  });
  const totales = await totalesVigentes(prisma, control.id, filas.map((f) => f.id));
  return {
    items: filas.map((pl) => aItem(pl, esDeposito, localId, totales)),
    total,
    totalPages,
    resumen: { contados: contados.length, sinContar: await prisma.stockLocal.count({ where: whereNoContados(localId, contados, esDeposito) }) },
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
 * FIJAR EL TOTAL CONTADO DE UN PRODUCTO, o borrarlo (`total` null).
 *
 *   · el primer total del producto en el control fija el stock en ese total;
 *   · cambiarlo mueve el stock por la diferencia, sobre lo que hay ahora;
 *   · borrarlo deshace lo que el control le ajustó —la suma de sus filas de
 *     auditoría de conteo— y el producto vuelve a "Sin contar".
 *
 * Devuelve la tarjeta como queda y los contadores, para que la pantalla los
 * actualice sin volver a pedir la lista.
 */
export async function fijarTotal({ localId, grupoId, quien, productoLocalId, total }) {
  const local = await localDe(prisma, localId);
  const esDeposito = local.es_deposito === true;
  const pl = await productoContable(prisma, localId, productoLocalId);
  const unidadFisica = unidadFisicaDeStock(pl.base, esDeposito);
  const borrar = total === null || total === undefined;
  let nuevoTotal = null;
  if (!borrar) {
    const v = validarCantidadContada(total, unidadFisica);
    if (!v.ok) throw new RechazoDelControl(v.status, v.error);
    nuevoTotal = v.cantidad;
  }
  const allowNegativeStock = await permiteNegativo(localId, grupoId, esDeposito);

  const controlId = await prisma.$transaction(async (tx) => {
    // 1 · El control, compartido: terminar no puede cerrarlo en el medio.
    const control = await tomarControl(tx, localId, { exclusivo: false });

    // 2 · Qué documento explica los movimientos que siguen. Antes de crear la
    //     fila: crearla ya deja un ALTA en el Libro.
    await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.AJUSTE_POR_CONTROL, referencia: String(control.id) });

    // 3 · La cantidad REAL, bloqueada. Dos celulares con el mismo producto se
    //     ordenan acá: el segundo ve el total del primero.
    let fila = await bloquearFila(tx, localId, pl.id);
    if (!fila && borrar) return control.id; // sin fila no hay conteo que borrar
    if (!fila) fila = await crearFilaEnCero(tx, localId, pl.id);
    const actual = Number(fila.cantidad);

    const vigentes = await tx.conteoControlStock.findMany({
      where: { controlId: control.id, productoLocalId: pl.id, borradoEn: null },
      select: { id: true, cantidad: true },
    });
    const totalAnterior = vigentes.length
      ? Math.round(vigentes.reduce((s, c) => s + Number(c.cantidad), 0) * 1000) / 1000
      : null;

    let nuevo;
    let accion;
    if (borrar) {
      if (totalAnterior === null) return control.id;
      const auditorias = await tx.auditoriaStock.findMany({
        where: { controlStockId: control.id, productoLocalId: pl.id, accion: { in: [...ACCIONES_DEL_CONTEO] } },
        select: { accion: true, cantidadAnterior: true, cantidadNueva: true },
      });
      ({ nuevo } = stockTrasDeshacer({ actual, ajusteNeto: ajusteNetoDelConteo(auditorias), allowNegativeStock }));
      accion = ACCION_AUDITORIA_CONTROL.BORRADO;
    } else {
      if (totalAnterior === nuevoTotal) return control.id;
      ({ nuevo } = stockTrasFijarTotal({ actual, totalAnterior, total: nuevoTotal, allowNegativeStock }));
      accion = totalAnterior === null ? ACCION_AUDITORIA_CONTROL.CONTEO : ACCION_AUDITORIA_CONTROL.CORRECCION;
    }

    // 4 · El total vigente: las anteriores quedan como historia, y nace la del
    //     último que lo tocó.
    if (vigentes.length) {
      await tx.conteoControlStock.updateMany({
        where: { id: { in: vigentes.map((c) => c.id) } },
        data: { borradoEn: new Date() },
      });
    }
    if (!borrar) {
      await tx.conteoControlStock.create({
        data: {
          controlId: control.id,
          localId,
          productoLocalId: pl.id,
          cantidad: nuevoTotal,
          usuarioId: quien.usuarioId,
          operadorId: quien.operadorId,
          contadoPor: quien.nombre,
          fijo: totalAnterior === null,
        },
      });
    }

    // 5 · El documento del cambio y el cambio.
    await tx.auditoriaStock.create({
      data: {
        grupoId,
        localId,
        productoLocalId: pl.id,
        userId: quien.usuarioId,
        accion,
        cantidadAnterior: actual,
        cantidadNueva: nuevo,
        motivo: motivoDelControl(control.id),
        controlStockId: control.id,
      },
    });
    await tx.stockLocal.update({ where: { id: fila.id }, data: { cantidad: nuevo } });
    return control.id;
  });

  const r = await listarProductos({ localId, productoLocalId: pl.id });
  return { item: r.item, resumen: await resumenDelControl(prisma, localId, controlId, esDeposito) };
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
