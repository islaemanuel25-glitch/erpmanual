// GET  /api/proveedores/listas/[id]/posibles  — "Pueden ser de <proveedor>"
// POST /api/proveedores/listas/[id]/posibles  — «No»: ese renglón no es ese producto
//
// LA BÚSQUEDA OPCIONAL EN EL RESTO DEL CATÁLOGO (Emanuel, 2026-10-24).
//
// La revisión de una lista arranca SOLO de los productos del proveedor
// (`productoDelProveedorWhere`). Un producto que el proveedor vende pero que
// está cargado con otro, o sin ninguno, no aparece nunca y su costo queda viejo.
// Esto lo busca, y solo cuando alguien toca «Buscar en el resto de mis
// productos»: la pantalla no lo llama al cargar, y ninguna otra ruta lo hace.
//
// ── QUÉ SE CRUZA CON QUÉ ──────────────────────────────────────────────────
//
// Los renglones de ESTA lista que quedaron sin vincular, con código, contra
// los productos activos que VE la ubicación donde se subió la lista
// (`alcanceDeLaListaWhere`: un exclusivo de otro local nunca) y que NO tienen
// ningún vínculo con este proveedor: ni en sus tres lugares, ni por un código.
// Se dejan afuera además los combos —no tienen costo propio— y los renglones
// que ya son la sugerencia "¿Es …?" de un producto del proveedor: esa pregunta
// ya está hecha en su tarjeta. El parecido y el umbral son los de esa misma
// sugerencia (`posiblesDelProveedor`).
//
// ── LO QUE ESTO NO HACE ───────────────────────────────────────────────────
//
// No vincula. «✓ Sí» y «Otro» van por la vinculación de siempre (`en-la-lista`,
// con `sumarProveedor`), que es la que guarda el código, recalcula el renglón
// con el motor de la lista y anota el producto como sumado a esta lista
// (`ProductoSumadoALaLista`). Acá se guarda el «No» y se hace el «Deshacer».
//
// ── ACEPTADOS (2026-10-24) ────────────────────────────────────────────────
//
// El GET devuelve además los aceptados en esta lista, con el renglón al que
// quedaron atados: la pestaña «Aceptados» de la hoja. Se leen de la base, así
// que siguen ahí al cerrar y volver a abrir la hoja o la pantalla.
//
// «Deshacer» (`{ deshacer: true, productoBaseId }`) saca el vínculo con este
// proveedor —el renglón queda sin producto y su código apagado, como «No está
// en la lista» de `otra-fila`, con las mismas funciones— y, si el «✓ Sí» le
// sumó el proveedor, vacía ESE lugar y nada más: el proveedor que tenía antes
// queda. Todo en una transacción.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requirePerm } from "@/lib/authorize";
import { importacionDeProveedorPropioWhere } from "@/lib/visibilidad";
import { esImportacionAbierta, OPCIONES_TX } from "@/lib/proveedores/listas/persistencia";
import { recalcularContadores } from "@/lib/proveedores/listas/contadores";
import { alcanceDeLaListaWhere } from "@/lib/proveedores/listas/cargaErp";
import { clavesDeCodigo } from "@/lib/proveedores/listas/normalizarCodigo";
import {
  LUGARES_DE_PROVEEDOR,
  claveDeRechazo,
  desactivarCodigo,
  desvinculada,
  posiblesDelProveedor,
  renglonDeLaHoja,
  sugerenciasDeRenglones,
  textoDeProveedoresDeHoy,
} from "@/lib/proveedores/listas/vincularConUnaFila";

async function contexto(req, context) {
  const acceso = requirePerm(req, "proveedores.listas");
  if (!acceso.ok) return { error: { ok: false, error: acceso.error }, status: acceso.status };
  const scope = await resolveScope(req);
  if (scope.error) {
    return { error: { ok: false, error: scope.error, needsContexto: scope.needsContexto }, status: scope.status };
  }
  const p = await context.params;
  const importacionId = Number(p?.id);
  if (!Number.isInteger(importacionId)) return { error: { ok: false, error: "Identificador inválido." }, status: 400 };
  const cab = await prisma.importacionListaProveedor.findFirst({
    where: { id: importacionId, grupoId: scope.grupoId, ...importacionDeProveedorPropioWhere(scope.localId, acceso.session.esAdmin) },
    // `localOperativoId`: la búsqueda es sobre lo que ve la ubicación donde se subió.
    select: { id: true, estado: true, proveedorId: true, localOperativoId: true, proveedor: { select: { nombre: true } } },
  });
  if (!cab) return { error: { ok: false, error: "Importación no encontrada." }, status: 404 };
  if (!esImportacionAbierta(cab.estado)) {
    return {
      error: { ok: false, error: "Esta lista está cerrada: ya no se le pueden sumar productos.", codigo: "CERRADA" },
      status: 409,
    };
  }
  return { acceso, grupoId: scope.grupoId, importacionId, cab };
}

/** Los renglones libres, con lo que hace falta para cruzarlos y para mostrarlos. */
const CAMPOS_RENGLON = {
  id: true,
  codigoCrudo: true,
  codigoNormalizado: true,
  descripcionProveedor: true,
  precioConIva: true,
  unidadesPorBulto: true,
  productoBaseId: true,
};

export async function GET(req, context) {
  try {
    const ctx = await contexto(req, context);
    if (ctx.error) return NextResponse.json(ctx.error, { status: ctx.status });
    const { grupoId, importacionId, cab } = ctx;
    const proveedorId = cab.proveedorId;
    const desde = Date.now();

    const [libres, delProveedor, porCodigo, rechazos, conRenglon, sumados] = await Promise.all([
      prisma.importacionListaFila.findMany({
        where: { importacionId, productoBaseId: null, aplicada: false },
        select: CAMPOS_RENGLON,
        orderBy: { filaExcel: "asc" },
      }),
      prisma.productoBase.findMany({
        where: alcanceDeLaListaWhere({ grupoId, localId: cab.localOperativoId, proveedorId }),
        select: { id: true, nombre: true },
      }),
      prisma.productoCodigoProveedor.findMany({
        where: { grupoId, proveedorId, activo: true },
        select: { productoBaseId: true },
      }),
      prisma.renglonQueNoEsElProducto.findMany({
        where: { grupoId, proveedorId },
        select: { productoBaseId: true, codigoInterno: true },
      }),
      prisma.importacionListaFila.findMany({
        where: { importacionId, productoBaseId: { not: null } },
        select: CAMPOS_RENGLON,
        orderBy: { filaExcel: "asc" },
      }),
      prisma.productoSumadoALaLista.findMany({
        where: { importacionId, grupoId },
        select: { productoBaseId: true, productoBase: { select: { nombre: true } } },
        orderBy: { sumadoEn: "asc" },
      }),
    ]);

    // ── LOS QUE YA TIENEN VÍNCULO CON ESTE PROVEEDOR, AFUERA ──────────────
    const conVinculo = new Set([...delProveedor.map((p) => p.id), ...porCodigo.map((c) => c.productoBaseId)]);

    // ── LOS RENGLONES QUE YA SON "¿ES …?" DE UN PRODUCTO DEL PROVEEDOR ────
    // Con la misma cuenta que la ruta del resultado: si acá se propusiera ese
    // renglón para otro producto, las dos preguntas competirían por él.
    const yaEnLaLista = new Set(conRenglon.map((f) => f.productoBaseId));
    const sinRenglon = delProveedor.filter((p) => !yaEnLaLista.has(p.id));
    const sugeridos = new Set([...sugerenciasDeRenglones({ filas: libres, productos: sinRenglon }).values()].map((s) => s.id));
    const renglones = libres.filter((f) => !sugeridos.has(f.id) && clavesDeCodigo(f.codigoNormalizado ?? f.codigoCrudo).normalizado);

    const catalogo = await prisma.productoBase.findMany({
      // El resto de lo que VE la ubicación de la lista: un exclusivo de otro
      // local no se propone nunca (2026-10-24).
      where: {
        AND: [
          alcanceDeLaListaWhere({ grupoId, localId: cab.localOperativoId }),
          { es_combo: false, id: { notIn: [...conVinculo] } },
        ],
      },
      select: {
        id: true,
        nombre: true,
        proveedor: { select: { nombre: true } },
        proveedor2: { select: { nombre: true } },
        proveedor3: { select: { nombre: true } },
      },
    });

    const posibles = posiblesDelProveedor({
      filas: renglones.map((f) => ({ ...f, codigoNormalizado: clavesDeCodigo(f.codigoNormalizado ?? f.codigoCrudo).normalizado })),
      productos: catalogo,
      rechazos: new Set(rechazos.map((r) => claveDeRechazo(r.productoBaseId, r.codigoInterno))),
    });

    return NextResponse.json({
      ok: true,
      proveedor: cab.proveedor?.nombre ?? null,
      items: posibles.map(({ producto, renglon }) => ({
        productoBaseId: producto.id,
        nombre: producto.nombre,
        proveedoresDeHoy: textoDeProveedoresDeHoy([producto.proveedor?.nombre, producto.proveedor2?.nombre, producto.proveedor3?.nombre]),
        renglon,
      })),
      // Los aceptados en esta lista, con el renglón al que están atados hoy
      // (null si después alguien lo desató desde la revisión).
      aceptados: sumados.map((s) => {
        const fila = conRenglon.find((f) => f.productoBaseId === s.productoBaseId) ?? null;
        return {
          productoBaseId: s.productoBaseId,
          nombre: s.productoBase?.nombre ?? "",
          renglon: fila ? renglonDeLaHoja(fila) : null,
        };
      }),
      // Cuánto tardó, para poder medirlo en producción sin abrir la consola.
      ms: Date.now() - desde,
    });
  } catch (e) {
    console.error("[listas/posibles GET]", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo buscar en el resto de tus productos. Probá de nuevo." },
      { status: 500 }
    );
  }
}

/**
 * «No»: este renglón no es este producto. Se recuerda por el código del renglón
 * para que las próximas listas del proveedor no lo vuelvan a proponer.
 */
export async function POST(req, context) {
  try {
    const ctx = await contexto(req, context);
    if (ctx.error) return NextResponse.json(ctx.error, { status: ctx.status });
    const { acceso, grupoId, importacionId, cab } = ctx;

    const body = await req.json().catch(() => ({}));
    const productoBaseId = Number(body?.productoBaseId);
    if (body?.deshacer === true) return await deshacer({ grupoId, importacionId, cab, productoBaseId });
    const filaId = Number(body?.filaId);
    if (!Number.isInteger(productoBaseId) || !Number.isInteger(filaId)) {
      return NextResponse.json({ ok: false, error: "Falta el producto o el renglón." }, { status: 400 });
    }
    const [fila, producto] = await Promise.all([
      prisma.importacionListaFila.findFirst({
        where: { id: filaId, importacionId },
        select: { codigoCrudo: true, codigoNormalizado: true, descripcionProveedor: true },
      }),
      prisma.productoBase.findFirst({ where: { id: productoBaseId, grupoId }, select: { id: true } }),
    ]);
    if (!fila || !producto) {
      return NextResponse.json({ ok: false, error: "Ese renglón o ese producto ya no están." }, { status: 404 });
    }
    const codigoInterno = clavesDeCodigo(fila.codigoNormalizado ?? fila.codigoCrudo).normalizado;
    if (!codigoInterno) {
      return NextResponse.json({ ok: false, error: "Ese renglón no tiene código." }, { status: 409 });
    }
    const quien = Number(acceso.session?.id ?? acceso.session?.userId) || null;
    await prisma.renglonQueNoEsElProducto.upsert({
      where: { renglon_no_es_unico: { grupoId, proveedorId: cab.proveedorId, productoBaseId, codigoInterno } },
      create: {
        grupoId,
        proveedorId: cab.proveedorId,
        productoBaseId,
        codigoInterno,
        descripcionProveedor: fila.descripcionProveedor ?? null,
        decididoPorUsuarioId: quien,
      },
      update: { decididoPorUsuarioId: quien, decididoEn: new Date() },
    });
    return NextResponse.json({ ok: true, accion: "NO_ES", productoBaseId, codigoInterno });
  } catch (e) {
    console.error("[listas/posibles POST]", e);
    return NextResponse.json({ ok: false, error: "No se pudo guardar la respuesta. Probá de nuevo." }, { status: 500 });
  }
}

/**
 * «Deshacer» un aceptado: vuelve a como estaba antes del «✓ Sí» o del «Otro».
 *
 *   1. Sus renglones de ESTA lista quedan sin producto, con el código apagado:
 *      `desvinculada` y `desactivarCodigo`, las mismas de «No está en la
 *      lista». Uno ya aplicado no se toca: su costo está escrito, y eso se
 *      deshace deshaciendo la aplicación.
 *   2. Si el «✓ Sí» le sumó el proveedor, ESE lugar se vacía, y solo si sigue
 *      teniendo a este proveedor. Los otros dos no se miran: el proveedor que
 *      tenía antes queda.
 *   3. La anotación de sumado se borra: vuelve a «Por revisar».
 */
async function deshacer({ grupoId, importacionId, cab, productoBaseId }) {
  if (!Number.isInteger(productoBaseId)) {
    return NextResponse.json({ ok: false, error: "Falta el producto." }, { status: 400 });
  }
  const sumado = await prisma.productoSumadoALaLista.findFirst({
    where: { importacionId, productoBaseId, grupoId },
    select: { id: true, lugarDelProveedor: true, productoBase: { select: { nombre: true } } },
  });
  if (!sumado) {
    return NextResponse.json(
      { ok: false, error: "Ese producto no se sumó desde esta búsqueda, así que no hay nada que deshacer." },
      { status: 404 }
    );
  }
  const filas = await prisma.importacionListaFila.findMany({
    where: { importacionId, productoBaseId },
    select: { id: true, aplicada: true, codigoCrudo: true, codigoNormalizado: true },
  });
  if (filas.some((f) => f.aplicada === true)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Su costo ya se aplicó con esta lista. Para deshacerlo, primero deshacé la aplicación.",
        codigo: "YA_APLICADA",
      },
      { status: 409 }
    );
  }
  const lugar = LUGARES_DE_PROVEEDOR.includes(sumado.lugarDelProveedor) ? sumado.lugarDelProveedor : null;

  await prisma.$transaction(async (tx) => {
    for (const f of filas) {
      await desactivarCodigo(tx, {
        grupoId,
        proveedorId: cab.proveedorId,
        productoBaseId,
        codigo: f.codigoNormalizado ?? f.codigoCrudo,
      });
      await tx.importacionListaFila.update({ where: { id: f.id }, data: desvinculada() });
    }
    if (lugar) {
      await tx.productoBase.updateMany({
        where: { id: productoBaseId, grupoId, [lugar]: cab.proveedorId },
        data: { [lugar]: null },
      });
    }
    await tx.productoSumadoALaLista.delete({ where: { id: sumado.id } });
    await recalcularContadores(tx, importacionId);
  }, OPCIONES_TX);

  // Con qué proveedores quedó: la tarjeta vuelve a «Por revisar» diciéndolo.
  const despues = await prisma.productoBase.findFirst({
    where: { id: productoBaseId, grupoId },
    select: {
      proveedor: { select: { nombre: true } },
      proveedor2: { select: { nombre: true } },
      proveedor3: { select: { nombre: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    accion: "DESHECHO",
    productoBaseId,
    proveedoresDeHoy: textoDeProveedoresDeHoy([
      despues?.proveedor?.nombre,
      despues?.proveedor2?.nombre,
      despues?.proveedor3?.nombre,
    ]),
    mensaje: `${sumado.productoBase?.nombre ?? "El producto"} ya no es de ${cab.proveedor?.nombre ?? "este proveedor"} y vuelve a «Por revisar».`,
  });
}
