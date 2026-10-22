// lib/stock/control/reconstruccionDeConteos.js
//
// LOS CONTEOS VIGENTES, LA REVISIÓN Y LA RECONSTRUCCIÓN DEL CONTROL DE STOCK,
// CON LA BASE QUE SE LES PASA.
//
// Vivían en `controlStockServer.js`, que construye su cliente con
// `@/lib/prisma`. Se sacaron tal cual para que el script de reconstrucción
// (`scripts/control-stock-reconstruir.mjs`) haga EXACTAMENTE la misma cuenta
// con el cliente de la fábrica, sin una copia al lado: el servidor les pasa
// `prisma`, el script el suyo. Por eso acá no hay imports con `@/` ni de Prisma.
//
// ── LA RECONSTRUCCIÓN ES LA REVISIÓN APLICADA ───────────────────────────────
//
// Hasta el 2026-10-22 un conteo no guardaba el stock del sistema al contar, y
// cambiar el total movía el stock por la diferencia de totales: lo vendido
// entre dos conteos quedaba como faltante. Para esos conteos, lo que debería
// haber es lo que ya calcula la revisión —lo contado más lo que no es del
// control después del conteo vigente— y el stock del sistema al contar sale del
// Libro (`revisionDelProducto`). Corregir el stock a `deberia` deja la suma de
// los ajustes del producto en contado − ese stock, que es su diferencia.
//
// Es idempotente por construcción: una vez corregido, `deberia` y el stock se
// mueven juntos con cada venta, y la cuenta da cero. Además la fila vigente
// queda con `sistemaAlContar`, que dice que ya se miró.

import {
  ACCION_AUDITORIA_CONTROL,
  ACCIONES_DEL_CONTEO,
  ESTADO_CONTROL,
  MOTIVO_NO_RECONSTRUIBLE,
  diferenciaDelConteo,
  motivoDelControl,
  revisionDelProducto,
} from "./controlStock.js";
import { bloquearFila } from "../filaDeStock.js";
import { declararOrigenDeStock, ORIGEN_STOCK } from "../libro/libroStock.js";

const redondear3 = (x) => Math.round(Number(x) * 1000) / 1000;

/** Lo que una corrección hizo con un producto contado. */
export const ESTADO_RECONSTRUCCION = Object.freeze({
  // El stock no era lo contado más lo que pasó después: se corrigió.
  AJUSTADO: "AJUSTADO",
  // El stock ya daba; solo faltaba guardar el sistema al contar.
  MARCADO: "MARCADO",
  // Ya estaba: el stock da y el sistema al contar está guardado.
  AL_DIA: "AL_DIA",
  // El Libro no alcanza para saberlo: no se toca.
  NO_RECONSTRUIBLE: "NO_RECONSTRUIBLE",
});

/** El control abierto del local, con el candado pedido, o null. */
export async function controlAbiertoBloqueado(tx, localId, { exclusivo }) {
  const filas = exclusivo
    ? await tx.$queryRaw`SELECT "id", "localId", "abiertoEn" FROM "ControlStock" WHERE "localId" = ${localId} AND "estado" = 'ABIERTO' FOR UPDATE`
    : await tx.$queryRaw`SELECT "id", "localId", "abiertoEn" FROM "ControlStock" WHERE "localId" = ${localId} AND "estado" = 'ABIERTO' FOR SHARE`;
  return filas[0] ?? null;
}

/**
 * EL CONTEO VIGENTE DE CADA PRODUCTO: el total (la suma de sus filas vigentes,
 * una sola salvo controles de la versión anterior), el último que lo tocó y
 * cuándo, la fila vigente y la diferencia.
 *
 * La diferencia es la suma de lo que el control le ajustó —cada conteo contra
 * el stock vivo de su instante—, leída de su bitácora; el sistema es contado −
 * diferencia (`diferenciaDelConteo`).
 */
export async function conteosVigentes(db, controlId, productoLocalIds = null) {
  const filas = await db.conteoControlStock.findMany({
    where: {
      controlId,
      borradoEn: null,
      ...(productoLocalIds ? { productoLocalId: { in: productoLocalIds } } : {}),
    },
    select: { id: true, productoLocalId: true, cantidad: true, contadoPor: true, creadoEn: true, sistemaAlContar: true },
    orderBy: { creadoEn: "asc" },
  });
  const porProducto = new Map();
  for (const f of filas) {
    const previo = porProducto.get(f.productoLocalId);
    porProducto.set(f.productoLocalId, {
      total: redondear3((previo?.total ?? 0) + Number(f.cantidad)),
      contadoPor: f.contadoPor,
      en: f.creadoEn,
      filaId: f.id,
      filasVigentes: (previo?.filasVigentes ?? 0) + 1,
      sistemaAlContar: f.sistemaAlContar == null ? null : Number(f.sistemaAlContar),
    });
  }
  const ids = [...porProducto.keys()];
  const auditorias = ids.length
    ? await db.auditoriaStock.findMany({
        where: { controlStockId: controlId, productoLocalId: { in: ids }, accion: { in: [...ACCIONES_DEL_CONTEO] } },
        select: { productoLocalId: true, accion: true, cantidadAnterior: true, cantidadNueva: true },
      })
    : [];
  const deCada = new Map();
  for (const a of auditorias) deCada.set(a.productoLocalId, [...(deCada.get(a.productoLocalId) ?? []), a]);
  for (const [id, v] of porProducto) {
    Object.assign(v, diferenciaDelConteo({ contado: v.total, auditorias: deCada.get(id) ?? [] }));
  }
  return porProducto;
}

/**
 * LO QUE HACE FALTA PARA REVISAR UN PRODUCTO CONTADO: su bitácora en el control,
 * su Libro desde que se abrió y la fila de stock del local. También las filas
 * del mismo producto con OTRO local, que no deberían existir: si hay, se dicen.
 *
 * Devuelve `(id, vigente, actualBloqueado?) => revisión`, con `vigente` el de
 * `conteosVigentes`.
 */
export async function datosDeRevision(db, control, ids) {
  const [auditorias, movimientos, filas] = await Promise.all([
    db.auditoriaStock.findMany({
      where: { controlStockId: control.id, productoLocalId: { in: ids } },
      orderBy: { id: "asc" },
      select: { productoLocalId: true, accion: true, cantidadAnterior: true, cantidadNueva: true, createdAt: true },
    }),
    db.movimientoStock.findMany({
      where: { localId: control.localId, productoLocalId: { in: ids }, instante: { gte: new Date(control.abiertoEn) } },
      orderBy: { id: "asc" },
      select: { id: true, productoLocalId: true, origen: true, origenRef: true, cantidadAnterior: true, cantidadPosterior: true, instante: true },
    }),
    db.stockLocal.findMany({ where: { productoId: { in: ids } }, select: { localId: true, productoId: true, cantidad: true } }),
  ]);
  const de = (lista, id) => lista.filter((x) => (x.productoLocalId ?? x.productoId) === id);
  return (id, vigente, actualBloqueado = null) => {
    const propias = de(filas, id).filter((f) => f.localId === control.localId);
    const actual = actualBloqueado ?? (propias[0] ? Number(propias[0].cantidad) : 0);
    const r = revisionDelProducto({
      controlId: control.id,
      contado: vigente?.total ?? null,
      desde: vigente?.en ?? null,
      auditorias: de(auditorias, id).map((a) => ({ ...a, creadoEn: a.createdAt })),
      movimientos: de(movimientos, id),
      actual,
    });
    if (!r) return null;
    // Varias vigentes que se sumaban: no hay UN instante del conteo.
    const sumados = (vigente?.filasVigentes ?? 1) > 1;
    const ajenas = de(filas, id).filter((f) => f.localId !== control.localId).map((f) => ({ localId: f.localId, cantidad: Number(f.cantidad) }));
    return {
      ...r,
      ...(sumados ? { reconstruible: false, motivoNoReconstruible: MOTIVO_NO_RECONSTRUIBLE.VARIOS_CONTEOS_SUMADOS } : {}),
      filasDeOtroLocal: ajenas,
    };
  };
}

/** Sin conteo en la bitácora la revisión no puede decir nada: igual se informa. */
const sinRevision = (vigente, motivo = MOTIVO_NO_RECONSTRUIBLE.SIN_CONTEO_EN_LA_BITACORA) => ({
  contado: vigente.total,
  reconstruible: false,
  motivoNoReconstruible: motivo,
  corregir: false,
});

/** Qué haría corregir este producto, sin escribir nada. */
export function estadoDeReconstruccion(vigente, revision) {
  if (!revision?.reconstruible) return ESTADO_RECONSTRUCCION.NO_RECONSTRUIBLE;
  if (revision.corregir) return ESTADO_RECONSTRUCCION.AJUSTADO;
  if (vigente.sistemaAlContar == null) return ESTADO_RECONSTRUCCION.MARCADO;
  return ESTADO_RECONSTRUCCION.AL_DIA;
}

/**
 * LA REVISIÓN DE CADA PRODUCTO CONTADO DEL CONTROL, sin escribir: la que
 * muestra la pantalla y la que lista el modo prueba del script.
 */
export async function revisarProductosContados(db, control) {
  const vigentes = await conteosVigentes(db, control.id);
  const ids = [...vigentes.keys()];
  const revisar = await datosDeRevision(db, control, ids);
  return ids.map((id) => {
    const vigente = vigentes.get(id);
    // Un producto que no se puede revisar no tira abajo la revisión de los
    // demás: va a "no se corrige" con el motivo, y el motivo real al log.
    let revision;
    try {
      revision = revisar(id, vigente) ?? sinRevision(vigente);
    } catch (e) {
      console.error(`❌ CONTROL DE STOCK · revisar el producto #${id} del control #${control.id}:`, e);
      revision = sinRevision(vigente, `${MOTIVO_NO_RECONSTRUIBLE.NO_SE_PUDO_REVISAR} ${e?.message || e}`);
    }
    return { productoLocalId: id, vigente, revision, estado: estadoDeReconstruccion(vigente, revision) };
  });
}

/**
 * CORREGIR UN PRODUCTO CONTADO, adentro de una transacción que ya tomó el
 * control: su stock pasa a lo contado más lo que pasó después, con un Ajuste
 * por control en el Libro y en la bitácora (CONTROL_CORRECCION_REVISION, que no
 * es un conteo: la revisión siguiente sigue anclada en el conteo), y la fila
 * vigente guarda el sistema al contar si no lo tenía. La cuenta se rehace con
 * la fila bloqueada: si ya está bien, no mueve nada. Si el Libro no alcanza, no
 * toca nada y dice por qué.
 *
 * @returns {Promise<{ estado: string, revision: object|null, de?: number, a?: number }>}
 */
export async function corregirProductoContado(tx, { control, productoLocalId, grupoId, userId }) {
  const id = Number(productoLocalId) || 0;
  const fila = await bloquearFila(tx, control.localId, id);
  if (!fila) return { estado: null, revision: null };
  const vigente = (await conteosVigentes(tx, control.id, [id])).get(id);
  if (!vigente) return { estado: null, revision: null };
  const actual = Number(fila.cantidad);
  const revision = (await datosDeRevision(tx, control, [id]))(id, vigente, actual) ?? sinRevision(vigente);
  const estado = estadoDeReconstruccion(vigente, revision);
  if (estado === ESTADO_RECONSTRUCCION.NO_RECONSTRUIBLE || estado === ESTADO_RECONSTRUCCION.AL_DIA) return { estado, revision };

  if (estado === ESTADO_RECONSTRUCCION.AJUSTADO) {
    await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.AJUSTE_POR_CONTROL, referencia: String(control.id) });
    await tx.auditoriaStock.create({
      data: {
        grupoId,
        localId: control.localId,
        productoLocalId: id,
        userId,
        accion: ACCION_AUDITORIA_CONTROL.CORRECCION_REVISION,
        cantidadAnterior: actual,
        cantidadNueva: revision.deberia,
        motivo: motivoDelControl(control.id),
        controlStockId: control.id,
      },
    });
    await tx.stockLocal.update({ where: { id: fila.id }, data: { cantidad: revision.deberia } });
  }
  if (vigente.sistemaAlContar == null) {
    await tx.conteoControlStock.update({ where: { id: vigente.filaId }, data: { sistemaAlContar: revision.sistemaAlContar } });
  }
  return { estado, revision, de: actual, a: revision.deberia };
}

/**
 * RECONSTRUIR LOS CONTEOS DE UN CONTROL ABIERTO.
 *
 * Sin `aplicar`, solo dice qué haría con cada producto contado. Con `aplicar`,
 * corrige cada uno en su propia transacción —con el control tomado, así un
 * terminar no lo cierra en el medio—, y el resultado es lo que de verdad hizo:
 * una venta en el medio puede cambiar un MARCADO por un AJUSTADO, o al revés.
 *
 * `userId` y `grupoId` son los de la bitácora: la persona a cuyo nombre queda la
 * corrección.
 */
export async function reconstruirConteos(db, { controlId, aplicar = false, userId, grupoId }) {
  const control = await db.controlStock.findUnique({ where: { id: Number(controlId) || 0 } });
  if (!control) return { ok: false, error: `No existe el control #${controlId}.` };
  if (control.estado !== ESTADO_CONTROL.ABIERTO) return { ok: false, error: `El control #${control.id} no está abierto.` };

  const plan = await revisarProductosContados(db, control);
  const nombres = new Map(
    (
      await db.productoLocal.findMany({
        where: { id: { in: plan.map((p) => p.productoLocalId) } },
        select: { id: true, nombre: true, base: { select: { nombre: true } } },
      })
    ).map((p) => [p.id, p.nombre || p.base?.nombre || `Producto #${p.id}`])
  );

  const productos = [];
  for (const p of plan) {
    let { estado, revision } = p;
    if (aplicar && (estado === ESTADO_RECONSTRUCCION.AJUSTADO || estado === ESTADO_RECONSTRUCCION.MARCADO)) {
      const hecho = await db.$transaction(async (tx) => {
        const abierto = await controlAbiertoBloqueado(tx, control.localId, { exclusivo: false });
        if (!abierto || abierto.id !== control.id) return null;
        return corregirProductoContado(tx, { control, productoLocalId: p.productoLocalId, grupoId, userId });
      });
      if (!hecho) return { ok: false, error: `El control #${control.id} se cerró mientras se reconstruía.`, productos };
      ({ estado, revision } = hecho);
    }
    productos.push({
      productoLocalId: p.productoLocalId,
      nombre: nombres.get(p.productoLocalId) ?? `Producto #${p.productoLocalId}`,
      estado,
      contado: p.vigente.total,
      sistemaAlContar: revision?.sistemaAlContar ?? null,
      diferencia: revision?.diferencia ?? null,
      actual: revision?.actual ?? null,
      deberia: revision?.deberia ?? null,
      ajuste: revision?.ajuste ?? null,
      motivo: revision?.motivoNoReconstruible ?? null,
    });
  }
  const cuantos = (e) => productos.filter((x) => x.estado === e).length;
  return {
    ok: true,
    aplicado: aplicar,
    control: { id: control.id, localId: control.localId, abiertoEn: control.abiertoEn },
    productos,
    resumen: {
      contados: productos.length,
      ajustados: cuantos(ESTADO_RECONSTRUCCION.AJUSTADO),
      marcados: cuantos(ESTADO_RECONSTRUCCION.MARCADO),
      alDia: cuantos(ESTADO_RECONSTRUCCION.AL_DIA),
      noReconstruibles: cuantos(ESTADO_RECONSTRUCCION.NO_RECONSTRUIBLE),
    },
  };
}
