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
// ── CADA CONTEO SE MIDE CONTRA EL STOCK VIVO DE SU INSTANTE ─────────────────
//
// Aceptar un conteo lee el stock de la fila BLOQUEADO, lo guarda en la fila del
// conteo como `sistemaAlContar`, y deja el stock en lo contado: el ajuste es
// contado − stock vivo. Volver a contarlo hace lo mismo contra el stock vivo de
// ese momento. La diferencia del producto en el control es la suma de esos
// ajustes, leída de su bitácora; no se compara contra la foto de cuando se
// abrió el control, que daba por faltante todo lo vendido en el medio.
//
// Los conteos escritos antes de `sistemaAlContar` se reconstruyen desde el Libro
// (`reconstruirConteos`, la misma cuenta que la revisión).
//
// ── EL LISTADO ES EL DE STOCK ───────────────────────────────────────────────
//
// La lista del control es `/api/stock_locales/listar` con `?control=`: mismo
// orden, mismo universo (`whereUniversoStock`) y mismos filtros. Acá vive lo que
// ese listado le pide al control: la cláusula del chip, el conteo de cada ítem y
// los contadores (`listadoDelControl`).
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
import { buscarProductoLocalPorCodigo } from "@/lib/productos/busquedaCodigoBarra";
import { unidadFisicaDeStock } from "@/lib/stock/escalaFisica";
import { bloquearFila, crearFilaEnCero } from "@/lib/stock/filaDeStock";
import { whereUniversoStock } from "@/lib/stock/universoStock";
import { mapStockItemDeposito, mapStockItemLocal } from "@/lib/stock/mapItem";
import { declararOrigenDeStock, ORIGEN_STOCK, ZONA_DEL_LIBRO } from "@/lib/stock/libro/libroStock";
import { valorDeLaDiferencia } from "@/lib/stock/control/valorDeLaDiferencia";
import {
  ACCION_AUDITORIA_CONTROL,
  ACCIONES_DEL_CONTEO,
  ESTADO_CONTROL,
  FILTRO_CONTROL,
  PERMISO_GESTIONAR_CONTROL,
  ORIGENES_DE_VENTA,
  ajusteNetoDelConteo,
  DECISION_NO_CONTADOS,
  TEXTO_FALTA_DECISION,
  diferenciaDe,
  esDecisionNoContados,
  motivoDelControl,
  ordenarDiferencias,
  partirNoContados,
  stockTrasDeshacer,
  stockTrasFijarTotal,
  textoDeUnidad,
  totalesDeDiferencias,
  validarCantidadContada,
} from "@/lib/stock/control/controlStock";
import {
  ESTADO_RECONSTRUCCION,
  controlAbiertoBloqueado,
  conteosVigentes,
  corregirProductoContado,
  reconstruirConteos,
  revisarProductosContados,
} from "@/lib/stock/control/reconstruccionDeConteos";

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

/** Cuántos controles terminados muestra el inicio. */
const CONTROLES_EN_EL_HISTORIAL = 10;

const TEXTO_SIN_CONTROL = "No hay un control abierto en este local.";

export const TEXTO_GESTIONAR_SIN_OPERADOR =
  "Con un operador activo se puede contar, pero empezar o terminar el control lo hace la cuenta sin PIN.";

export const TEXTO_ESTA_BIEN_NEGATIVO = "El sistema dice que hay menos de cero: poné la cantidad que hay.";

// Lo que hace falta del producto para saber en qué unidad se cuenta y cuánto
// vale: la escala que leen `unidadFisicaDeStock` y `costoPorUnidadFisica`.
const SELECT_BASE = Object.freeze({
  nombre: true,
  codigo_barra: true,
  activo: true,
  es_combo: true,
  modalidad: true,
  unidad_medida: true,
  factor_pack: true,
  precio_costo: true,
  modoCompraProveedor: true,
  pesoReferenciaKg: true,
  modoVentaDeposito: true,
  pesoEsFijo: true,
});

// Lo que piden `mapStockItemLocal` y `mapStockItemDeposito`: los mismos campos
// que trae el listado de Stock. El proveedor no viene: la pantalla lo resuelve
// con el catálogo que ya carga `FiltrosStock`, como Stock.
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
    },
  },
});

// La fila de stock DEL LOCAL, que es la que el control bloquea y escribe. Sin
// el `where`, `take: 1` podía traer la de otro local del mismo producto.
const includeItem = (localId) => ({
  ...INCLUDE_ITEM,
  stock: {
    where: { localId },
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
 * EL UNIVERSO DE TERMINAR: los del listado de Stock con stock distinto de cero
 * que nadie contó en este control. El listado de Stock, el avance y los chips
 * cuentan todo el universo —también lo que está en cero—; terminar mira solo
 * esto, porque poner en cero lo que ya está en cero no corrige nada.
 */
function whereNoContados(localId, contados, esDeposito) {
  return {
    localId,
    cantidad: { not: 0 },
    ...(contados.length ? { productoId: { notIn: contados } } : {}),
    producto: whereUniversoStock(localId, esDeposito),
  };
}

export function controlAbierto(db, localId) {
  return db.controlStock.findFirst({ where: { localId, estado: ESTADO_CONTROL.ABIERTO } });
}

async function idsContados(db, controlId) {
  const filas = await db.conteoControlStock.findMany({
    where: { controlId, borradoEn: null },
    distinct: ["productoLocalId"],
    select: { productoLocalId: true },
  });
  return filas.map((f) => f.productoLocalId);
}

/**
 * LO QUE EL LISTADO DE STOCK LE PIDE AL CONTROL, cuando lo llama con
 * `?control=<chip>`:
 *
 *   · `clausula`: el `where` del chip, para sumarlo a los filtros de siempre;
 *   · `enriquecer(items)`: cada ítem con su `conteo` —o null si nadie lo contó—;
 *   · `resumen`: el total del listado del local, cuántos contados, sin contar y
 *     con diferencia. Son de TODO el local, no de lo que filtra el texto.
 *
 * Sin control abierto no filtra ni agrega nada.
 */
export async function listadoDelControl({ localId, esDeposito, filtro }) {
  const control = await controlAbierto(prisma, localId);
  if (!control) return { clausula: null, enriquecer: async (items) => items, resumen: null };
  const contados = await idsContados(prisma, control.id);
  const vigentes = await conteosVigentes(prisma, control.id, contados);
  const conDiferencia = [...vigentes.entries()].filter(([, v]) => v.diferencia !== 0).map(([id]) => id);

  let clausula = null;
  if (filtro === FILTRO_CONTROL.SIN_CONTAR && contados.length) clausula = { id: { notIn: contados } };
  if (filtro === FILTRO_CONTROL.CONTADOS) clausula = { id: { in: contados } };
  if (filtro === FILTRO_CONTROL.CON_DIFERENCIA) clausula = { id: { in: conDiferencia } };
  // La fila de stock de ESTA ubicación: `StockLocal` es único por (local,
  // producto), así que sin `localId` contaría la de otro local.
  const enNegativo = { stock: { some: { localId, cantidad: { lt: 0 } } } };
  if (filtro === FILTRO_CONTROL.EN_NEGATIVO) clausula = enNegativo;

  const universo = whereUniversoStock(localId, esDeposito);
  const [total, contadosEnElListado, diferenciasEnElListado, negativosEnElListado, porCategoria] = await Promise.all([
    prisma.productoLocal.count({ where: universo }),
    contados.length ? prisma.productoLocal.count({ where: { ...universo, id: { in: contados } } }) : 0,
    conDiferencia.length ? prisma.productoLocal.count({ where: { ...universo, id: { in: conDiferencia } } }) : 0,
    prisma.productoLocal.count({ where: { ...universo, ...enNegativo } }),
    prisma.productoLocal.findMany({ where: universo, select: { base: { select: { categoria: { select: { id: true, nombre: true } } } } } }),
  ]);
  // El selector "Categoría" de la pantalla, como el de recibir transferencia:
  // cada categoría del universo con cuántos productos tiene, por nombre.
  const categorias = new Map();
  for (const p of porCategoria) {
    const c = p.base?.categoria;
    if (!c) continue;
    const previa = categorias.get(c.id);
    categorias.set(c.id, { id: c.id, nombre: c.nombre, cantidad: (previa?.cantidad ?? 0) + 1 });
  }

  return {
    clausula,
    enriquecer: async (items) => items.map((i) => ({ ...i, conteo: aConteo(vigentes.get(i.id)) })),
    resumen: {
      controlId: control.id,
      total,
      contados: contadosEnElListado,
      sinContar: total - contadosEnElListado,
      conDiferencia: diferenciasEnElListado,
      enNegativo: negativosEnElListado,
      categorias: [...categorias.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    },
  };
}

const aConteo = (v) =>
  v ? { total: v.total, contadoPor: v.contadoPor, en: v.en, sistema: v.sistema, diferencia: v.diferencia } : null;

async function localDe(db, localId) {
  return db.local.findUnique({ where: { id: localId }, select: { id: true, nombre: true, es_deposito: true } });
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

// ── LECTURAS ───────────────────────────────────────────────────────────────

/**
 * LO QUE MUESTRA EL INICIO: sin control, el historial de terminados; con
 * control, cuándo se abrió y sus contadores.
 */
export async function leerEstado({ localId }) {
  const local = await localDe(prisma, localId);
  const control = await controlAbierto(prisma, localId);

  if (!control) {
    const historial = await prisma.controlStock.findMany({
      where: { localId, estado: ESTADO_CONTROL.TERMINADO },
      orderBy: { terminadoEn: "desc" },
      take: CONTROLES_EN_EL_HISTORIAL,
      select: { id: true, abiertoEn: true, terminadoEn: true, terminadoPorNombre: true, puestosEnCero: true },
    });
    return { local, control: null, ultimo: historial[0] ?? null, historial };
  }

  const { resumen } = await listadoDelControl({ localId, esDeposito: local.es_deposito === true, filtro: null });
  return {
    local,
    control: { id: control.id, abiertoEn: control.abiertoEn, abiertoPorNombre: control.abiertoPorNombre, ...resumen },
  };
}

/** El ítem de UNA tarjeta: el mismo que arma el listado de Stock, con su conteo. */
async function itemDeLaTarjeta(localId, esDeposito, controlId, productoLocalId) {
  const pl = await prisma.productoLocal.findFirst({
    where: { ...whereUniversoStock(localId, esDeposito), id: productoLocalId },
    include: includeItem(localId),
  });
  if (!pl) return null;
  const item = esDeposito
    ? mapStockItemDeposito(pl, pl.base, pl.stock?.[0], localId)
    : mapStockItemLocal(pl, pl.base, pl.stock?.[0]);
  const vigentes = await conteosVigentes(prisma, controlId, [pl.id]);
  return { ...item, conteo: aConteo(vigentes.get(pl.id)) };
}

/**
 * UN PRODUCTO, por código leído o por id —el "Contar" de terminar—, sin mirar el
 * filtro: la tarjeta tiene que aparecer aunque el chip activo la ocultara. Sin
 * producto del local con ese código, `item` va en null y la pantalla filtra por
 * el texto, como siempre.
 */
export async function buscarProducto({ localId, codigo = null, productoLocalId = null }) {
  const local = await localDe(prisma, localId);
  const esDeposito = local.es_deposito === true;
  const control = await controlAbierto(prisma, localId);
  if (!control) throw new RechazoDelControl(409, TEXTO_SIN_CONTROL);
  let id = Number(productoLocalId) || null;
  if (codigo) {
    const pl = await buscarProductoLocalPorCodigo(prisma, { localId, codigo, consulta: { select: { id: true } } });
    id = pl?.id ?? null;
  }
  const item = id ? await itemDeLaTarjeta(localId, esDeposito, control.id, id) : null;
  return { item };
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

// ── LAS DIFERENCIAS ────────────────────────────────────────────────────────

/**
 * LAS DIFERENCIAS DE UN CONTROL, calculadas con lo que quedó escrito:
 *
 *   · cada producto contado: sistema (antes del primer conteo) contra su total;
 *   · cada producto que el terminar puso en cero: lo que había contra cero. Un
 *     negativo puesto en cero es SOBRANTE: el sistema decía menos de lo que
 *     había.
 *
 * La plata, al costo de la ficha de ahora, con `valorDeLaDiferencia`. Solo las
 * filas con diferencia.
 */
async function calcularDiferencias(db, control, esDeposito) {
  const vigentes = await conteosVigentes(db, control.id);
  const filas = new Map();
  for (const [id, v] of vigentes) filas.set(id, { productoLocalId: id, sistema: v.sistema, contado: v.total, puestoEnCero: false });
  const ceros = await db.auditoriaStock.findMany({
    where: { controlStockId: control.id, accion: ACCION_AUDITORIA_CONTROL.PUESTO_EN_CERO },
    select: { productoLocalId: true, cantidadAnterior: true },
  });
  for (const c of ceros) {
    if (!filas.has(c.productoLocalId)) {
      filas.set(c.productoLocalId, { productoLocalId: c.productoLocalId, sistema: Number(c.cantidadAnterior), contado: 0, puestoEnCero: true });
    }
  }
  const ids = [...filas.keys()];
  const productos = ids.length
    ? await db.productoLocal.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true, precio_costo: true, base: { select: SELECT_BASE } } })
    : [];
  const porId = new Map(productos.map((p) => [p.id, p]));

  const resultado = [];
  for (const f of filas.values()) {
    const diferencia = diferenciaDe({ sistema: f.sistema, contado: f.contado });
    if (diferencia === 0) continue;
    const p = porId.get(f.productoLocalId);
    const unidadFisica = p ? unidadFisicaDeStock(p.base, esDeposito) : "UNIDAD";
    const { costoUnitario, importe } = p
      ? valorDeLaDiferencia({ diferencia, base: p.base, costoLocal: p.precio_costo, esDeposito })
      : { costoUnitario: null, importe: null };
    resultado.push({
      productoLocalId: f.productoLocalId,
      nombre: p ? p.nombre || p.base.nombre : `Producto #${f.productoLocalId}`,
      unidadFisica,
      sistema: f.sistema,
      contado: f.contado,
      diferencia,
      costoUnitario,
      importe,
      puestoEnCero: f.puestoEnCero,
    });
  }
  return ordenarDiferencias(resultado);
}

const deLaTabla = (r) => ({
  productoLocalId: r.productoLocalId,
  nombre: r.nombre,
  unidadFisica: r.unidadFisica,
  sistema: Number(r.sistema),
  contado: Number(r.contado),
  diferencia: Number(r.diferencia),
  costoUnitario: r.costoUnitario == null ? null : Number(r.costoUnitario),
  importe: r.importe == null ? null : Number(r.importe),
  puestoEnCero: r.puestoEnCero,
});

/**
 * EL INFORME DE DIFERENCIAS de un control —el abierto, o uno terminado del
 * local—. Si el control terminó con el informe congelado, se lee de
 * `DiferenciaControlStock` y no cambia; si no, se calcula ahora.
 *
 * `conPlata` en false saca los importes: los ve quien puede ver costos.
 */
export async function leerDiferencias({ localId, controlId = null, conPlata = true }) {
  const local = await localDe(prisma, localId);
  const esDeposito = local.es_deposito === true;
  const control = controlId
    ? await prisma.controlStock.findFirst({ where: { id: Number(controlId), localId } })
    : await controlAbierto(prisma, localId);
  if (!control) throw new RechazoDelControl(404, controlId ? "Ese control no es de este local." : TEXTO_SIN_CONTROL);

  const congelado = control.estado === ESTADO_CONTROL.TERMINADO && control.diferenciasCongeladasEn != null;
  const filas = congelado
    ? ordenarDiferencias((await prisma.diferenciaControlStock.findMany({ where: { controlId: control.id } })).map(deLaTabla))
    : await calcularDiferencias(prisma, control, esDeposito);
  const visibles = conPlata ? filas : filas.map((f) => ({ ...f, costoUnitario: null, importe: null }));
  const totales = totalesDeDiferencias(filas);

  return {
    local,
    control: {
      id: control.id,
      estado: control.estado,
      abiertoEn: control.abiertoEn,
      terminadoEn: control.terminadoEn,
      terminadoPorNombre: control.terminadoPorNombre,
      // Lo que se eligió con lo no contado: el informe lo dice arriba.
      noContadosDecision: control.noContadosDecision ?? null,
      noContadosComoEstaban: control.noContadosComoEstaban ?? null,
    },
    congelado,
    conPlata,
    filas: visibles,
    totales: conPlata ? totales : { ...totales, faltante: null, sobrante: null },
  };
}

/**
 * LA REVISIÓN DEL CONTROL ABIERTO: por cada producto contado, si el stock de hoy
 * es lo contado más lo que pasó después del conteo vigente
 * (`revisionDelProducto`), y si el Libro alcanza para corregirlo. Los que no dan
 * van primero. Solo lee.
 *
 * Es también el modo prueba de la reconstrucción de los conteos escritos antes
 * del stock al contar: lo que acá dice "corregir" es lo que `corregirTodos` y el
 * script ajustarían.
 */
export async function revisarControl({ localId }) {
  const control = await prisma.controlStock.findFirst({ where: { localId, estado: ESTADO_CONTROL.ABIERTO } });
  if (!control) throw new RechazoDelControl(409, TEXTO_SIN_CONTROL);
  const revisados = await revisarProductosContados(prisma, control);
  const nombres = await prisma.productoLocal.findMany({
    where: { id: { in: revisados.map((r) => r.productoLocalId) } },
    select: { id: true, nombre: true, base: { select: { nombre: true, unidad_medida: true, factor_pack: true, modoCompraProveedor: true, modoVentaDeposito: true, pesoEsFijo: true, pesoReferenciaKg: true } } },
  });
  const porId = new Map(nombres.map((p) => [p.id, p]));
  const local = await localDe(prisma, localId);
  const productos = [];
  for (const { productoLocalId, vigente, revision } of revisados) {
    const p = porId.get(productoLocalId);
    if (!p) continue;
    productos.push({
      productoLocalId,
      nombre: p.nombre || p.base.nombre,
      unidadFisica: unidadFisicaDeStock(p.base, local.es_deposito === true),
      contadoPor: vigente.contadoPor,
      ...revision,
    });
  }
  productos.sort((a, b) => Number(b.corregir) - Number(a.corregir) || a.nombre.localeCompare(b.nombre, "es"));
  return {
    control: { id: control.id, abiertoEn: control.abiertoEn },
    productos,
    aCorregir: productos.filter((p) => p.corregir && p.reconstruible).length,
    noReconstruibles: productos.filter((p) => !p.reconstruible).length,
  };
}

// ── ESCRITURAS ─────────────────────────────────────────────────────────────

/**
 * CORREGIR UN PRODUCTO DE LA REVISIÓN: deja su stock en lo que debería —lo
 * contado más lo que pasó después— con un Ajuste por control, que queda en el
 * Libro (y en Stock Diario) y en la bitácora como CONTROL_CORRECCION_REVISION
 * (`corregirProductoContado`). El conteo no se toca, salvo guardar el sistema al
 * contar si no lo tenía. Si ya está bien, no mueve nada; si el Libro no
 * alcanza para saber cuánto, se rechaza diciendo por qué.
 */
export async function repararProducto({ localId, grupoId, quien, productoLocalId }) {
  const id = Number(productoLocalId) || 0;
  const local = await localDe(prisma, localId);
  const esDeposito = local.es_deposito === true;
  const r = await prisma.$transaction(async (tx) => {
    const abierto = await tomarControl(tx, localId, { exclusivo: false });
    const control = await tx.controlStock.findUnique({ where: { id: abierto.id } });
    const hecho = await corregirProductoContado(tx, { control, productoLocalId: id, grupoId, userId: quien.usuarioId });
    if (!hecho.revision) throw new RechazoDelControl(409, "Ese producto no está contado en el control.");
    if (hecho.estado === ESTADO_RECONSTRUCCION.NO_RECONSTRUIBLE) throw new RechazoDelControl(409, hecho.revision.motivoNoReconstruible);
    if (hecho.estado !== ESTADO_RECONSTRUCCION.AJUSTADO) return { reparado: false, revision: hecho.revision, controlId: control.id };
    return { reparado: true, de: hecho.de, a: hecho.a, controlId: control.id };
  });
  const item = await itemDeLaTarjeta(localId, esDeposito, r.controlId, id);
  return { ...r, item };
}

/**
 * CORREGIR TODOS LOS DE LA REVISIÓN: `reconstruirConteos` aplicado sobre el
 * control abierto del local, a nombre de quien lo pide. Es el camino de
 * producción de la reconstrucción —la imagen no trae `scripts/`—, y el mismo
 * que corre el script contra una copia.
 */
export async function corregirTodos({ localId, grupoId, quien }) {
  const control = await controlAbierto(prisma, localId);
  if (!control) throw new RechazoDelControl(409, TEXTO_SIN_CONTROL);
  const r = await reconstruirConteos(prisma, { controlId: control.id, aplicar: true, userId: quien.usuarioId, grupoId });
  if (!r.ok) throw new RechazoDelControl(409, r.error);
  return { controlId: control.id, resumen: r.resumen };
}

/** El control abierto del local, con el candado pedido, o un rechazo. */
async function tomarControl(tx, localId, { exclusivo }) {
  const control = await controlAbiertoBloqueado(tx, localId, { exclusivo });
  if (!control) throw new RechazoDelControl(409, TEXTO_SIN_CONTROL);
  return control;
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
 * ACEPTAR UN CONTEO DE UN PRODUCTO, o borrarlo (`total` null).
 *
 *   · aceptar un total lee el stock vivo bloqueado, lo guarda en la fila como
 *     `sistemaAlContar` y deja el stock en lo contado: el ajuste es contado −
 *     stock vivo, y queda en la bitácora y el Libro. Da lo mismo que sea el
 *     primero (CONTEO) o que lo vuelva a contar (RECUENTO), aunque sea el mismo
 *     número: lo vendido entre los dos ya bajó el stock vivo;
 *   · borrarlo deshace lo que el control le ajustó —la suma de sus filas de
 *     auditoría de conteo— y el producto vuelve a "Sin contar";
 *   · `estaBien`: el total es el stock del sistema EN ESE MOMENTO, leído
 *     bloqueado. Con el sistema en negativo no se puede: hay que contar.
 *
 * Devuelve la tarjeta como queda y los contadores, para que la pantalla los
 * actualice sin volver a pedir la lista.
 */
export async function fijarTotal({ localId, grupoId, quien, productoLocalId, total, estaBien = false }) {
  const local = await localDe(prisma, localId);
  const esDeposito = local.es_deposito === true;
  const pl = await productoContable(prisma, localId, productoLocalId);
  const unidadFisica = unidadFisicaDeStock(pl.base, esDeposito);
  const borrar = !estaBien && (total === null || total === undefined);
  let nuevoTotal = null;
  if (!borrar && !estaBien) {
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

    // "Está bien" es lo que dice el sistema AHORA, no lo que mostraba la tarjeta.
    if (estaBien) {
      if (actual < 0) throw new RechazoDelControl(400, TEXTO_ESTA_BIEN_NEGATIVO);
      nuevoTotal = actual;
    }

    const vigentes = await tx.conteoControlStock.findMany({
      where: { controlId: control.id, productoLocalId: pl.id, borradoEn: null },
      select: { id: true, cantidad: true, sistemaAntes: true },
      orderBy: { creadoEn: "asc" },
    });
    const contado = vigentes.length > 0;
    // Lo que decía el sistema antes del primer conteo: el del primero, que se
    // copia; o el de ahora, si éste es el primero. Es historia: la diferencia
    // ya no se mide contra esto.
    const sistemaAntes = contado ? vigentes[0].sistemaAntes : actual;

    let nuevo;
    let accion;
    if (borrar) {
      if (!contado) return control.id;
      const auditorias = await tx.auditoriaStock.findMany({
        where: { controlStockId: control.id, productoLocalId: pl.id, accion: { in: [...ACCIONES_DEL_CONTEO] } },
        select: { accion: true, cantidadAnterior: true, cantidadNueva: true },
      });
      ({ nuevo } = stockTrasDeshacer({ actual, ajusteNeto: ajusteNetoDelConteo(auditorias), allowNegativeStock }));
      accion = ACCION_AUDITORIA_CONTROL.BORRADO;
    } else {
      ({ nuevo } = stockTrasFijarTotal({ actual, total: nuevoTotal, allowNegativeStock }));
      accion = contado ? ACCION_AUDITORIA_CONTROL.RECUENTO : ACCION_AUDITORIA_CONTROL.CONTEO;
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
          fijo: !contado,
          sistemaAntes,
          sistemaAlContar: actual,
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

  const item = await itemDeLaTarjeta(localId, esDeposito, controlId, pl.id);
  const { resumen } = await listadoDelControl({ localId, esDeposito, filtro: null });
  return { item, resumen };
}

/**
 * TERMINAR: pone en cero los que nadie contó y no se vendieron durante el
 * control, congela el informe de diferencias y lo cierra.
 *
 * `vistos` son los productos que la pantalla mostró en "Quedan en 0". Se pone
 * en cero solo lo que la persona vio: si desde entonces apareció uno nuevo en
 * esa lista, se rechaza para que la vuelva a mirar; si uno salió —lo contaron o
 * se vendió—, simplemente no se toca.
 */
export async function terminarControl({ localId, grupoId, quien, vistos, decision }) {
  // La elección es explícita: sin ella no se toca nada, ni el control.
  if (!esDecisionNoContados(decision)) throw new RechazoDelControl(400, TEXTO_FALTA_DECISION);
  const enCero = decision === DECISION_NO_CONTADOS.EN_CERO;
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
    const { aCero, vendidos } = partirNoContados(
      noContados.map((p) => ({ ...p, stock: cantidadReal.get(p.stockLocalId) ?? p.stock })).filter((p) => p.stock !== 0),
      ventas
    );

    const nuevos = aCero.filter((p) => !vistosSet.has(p.productoLocalId));
    if (nuevos.length) {
      throw new RechazoDelControl(409, "La lista de los que quedan en 0 cambió. Revisala antes de terminar.", {
        cambioLaLista: true,
      });
    }

    // 3 · El documento de cada producto, el origen, y el cambio. Con "dejarlos
    //     como están" no se escribe nada: ni stock, ni bitácora, ni Libro.
    const puestos = enCero ? aCero : [];
    if (puestos.length) {
      await tx.auditoriaStock.createMany({
        data: puestos.map((p) => ({
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
        where: { id: { in: puestos.map((p) => p.stockLocalId) } },
        data: { cantidad: 0 },
      });
    }

    // 4 · El informe, congelado: los contados con diferencia y los puestos en
    //     cero, con la plata al costo de este momento.
    const diferencias = await calcularDiferencias(tx, control, esDeposito);
    if (diferencias.length) {
      await tx.diferenciaControlStock.createMany({
        data: diferencias.map((d) => ({
          controlId: control.id,
          productoLocalId: d.productoLocalId,
          nombre: d.nombre,
          unidadFisica: d.unidadFisica,
          sistema: d.sistema,
          contado: d.contado,
          diferencia: d.diferencia,
          costoUnitario: d.costoUnitario,
          importe: d.importe,
          puestoEnCero: d.puestoEnCero,
        })),
      });
    }

    const ahora = new Date();
    await tx.controlStock.update({
      where: { id: control.id },
      data: {
        estado: ESTADO_CONTROL.TERMINADO,
        terminadoEn: ahora,
        terminadoPorUsuarioId: quien.usuarioId,
        terminadoPorOperadorId: quien.operadorId,
        terminadoPorNombre: quien.nombre,
        puestosEnCero: puestos.length,
        diferenciasCongeladasEn: ahora,
        // Queda escrito qué se eligió: el informe guardado lo dice siempre igual.
        // "Como estaban" cuenta todo lo no contado con stock, vendidos incluidos.
        noContadosDecision: decision,
        noContadosComoEstaban: enCero ? null : aCero.length + vendidos.length,
      },
    });
    return { controlId: control.id, puestosEnCero: puestos.length, decision };
  }, OPCIONES_TX_TERMINAR);
}
