// GET  /api/proveedores/listas/[id]/productos/[productoBaseId]/en-la-lista → candidatas
// POST /api/proveedores/listas/[id]/productos/[productoBaseId]/en-la-lista → vincular
//
// "BUSCARLO EN LA LISTA": UN PRODUCTO QUE NO APARECIÓ, Y SU RENGLÓN QUE SÍ ESTÁ.
//
// ── EL CASO REAL, CON SUS DATOS ────────────────────────────────────────────
//
// Emanuel abre «No cambian» → «No vinieron» y toca "ala 800 lavado total con
// bica", costo $60.120,00, caja de 24. La hoja le decía que el proveedor no lo
// informó en esta lista y le ofrecía dos salidas: ver la ficha, o cerrar.
//
// Pero el producto SÍ estaba en la lista de M Y F, con otro nombre y otro código:
// "ALA PVO LAV MANO C BICARBONATO 24X800". Que no aparezca casi nunca significa
// que el proveedor lo dejó de traer — significa que el código guardado está mal o
// falta.
//
// ── POR QUÉ NO ALCANZA CON LOS DOS ENDPOINTS QUE YA HABÍA ──────────────────
//
// `vincular` contesta: dada una FILA sin producto, a cuál del catálogo
// corresponde. `otra-fila` contesta: dada una fila atada al producto equivocado,
// cuál es el renglón correcto. Acá el producto está y NO tiene ninguna fila: es
// la tercera combinación, y era la única sin pantalla.
//
// Lo que SÍ se comparte es todo lo que decide y todo lo que escribe, y vive en
// `lib/proveedores/listas/vincularConUnaFila.js`. Lo único propio de esta ruta es
// de dónde sale el producto: de la URL, no de una fila.
//
// ── QUÉ QUEDA DESPUÉS ──────────────────────────────────────────────────────
//
// El código del renglón elegido queda guardado para el producto —las próximas
// listas lo usan sin preguntar— el renglón queda con su veredicto recalculado, y
// el producto sale de "No vinieron" y entra al recorrido normal.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { getDepositoIdDeGrupo } from "@/lib/visibilidad";
import { resolverParserPorId } from "@/lib/proveedores/listas/registro";
import {
  conciliarFila,
  indexarCodigosProveedor,
  indexarCodigosBarra,
} from "@/lib/proveedores/listas/conciliarLista";
import { filaAPersistir, OPCIONES_TX, esImportacionAbierta } from "@/lib/proveedores/listas/persistencia";
import { recalcularContadores } from "@/lib/proveedores/listas/contadores";
import {
  candidatasConPuntaje,
  desactivarCodigosDelProducto,
  guardarCodigoDeLaFila,
  filaParaElMotor,
  productoParaElMotor,
  motorParaEstaLista,
  CAMPOS_PRODUCTO_PARA_EL_MOTOR,
  CAMPOS_CABECERA_PARA_EL_MOTOR,
} from "@/lib/proveedores/listas/vincularConUnaFila";

/** Los dos ids de la URL, validados. */
async function ids(context) {
  const p = await context.params;
  return { importacionId: Number(p?.id), productoBaseId: Number(p?.productoBaseId) };
}

async function contexto(req) {
  const admin = requireAdmin(req);
  if (!admin.ok) return { error: { ok: false, error: admin.error }, status: admin.status };

  const scope = await resolveScope(req);
  if (scope.error) {
    return {
      error: { ok: false, error: scope.error, needsContexto: scope.needsContexto },
      status: scope.status,
    };
  }
  return scope;
}

/** Los campos de fila que la pantalla muestra y el puntaje necesita. */
const CAMPOS_CANDIDATA = {
  id: true,
  codigoCrudo: true,
  descripcionProveedor: true,
  unidadProveedor: true,
  unidadesPorBulto: true,
  precioConIva: true,
  productoBaseId: true,
  productoBase: { select: { id: true, nombre: true } },
};

export async function GET(req, context) {
  try {
    const ctx = await contexto(req);
    if (ctx.error) return NextResponse.json(ctx.error, { status: ctx.status });
    const { grupoId } = ctx;

    const { importacionId, productoBaseId } = await ids(context);
    if (!Number.isInteger(importacionId) || !Number.isInteger(productoBaseId)) {
      return NextResponse.json({ ok: false, error: "Identificador inválido." }, { status: 400 });
    }

    const cab = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: { id: true, estado: true, proveedor: { select: { id: true, nombre: true } } },
    });
    if (!cab) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    const producto = await prisma.productoBase.findFirst({
      where: { id: productoBaseId, grupoId },
      select: { id: true, nombre: true },
    });
    if (!producto) {
      return NextResponse.json({ ok: false, error: "Producto no encontrado." }, { status: 404 });
    }

    const url = new URL(req.url);
    const buscar = String(url.searchParams.get("buscar") ?? "").trim();

    const filas = await prisma.importacionListaFila.findMany({
      where: {
        importacionId,
        ...(buscar
          ? {
              OR: [
                { descripcionProveedor: { contains: buscar, mode: "insensitive" } },
                { codigoCrudo: { contains: buscar, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: CAMPOS_CANDIDATA,
      orderBy: { filaExcel: "asc" },
    });

    return NextResponse.json({
      ok: true,
      proveedor: cab.proveedor,
      editable: esImportacionAbierta(cab.estado),
      producto,
      // No hay fila actual: el producto no estaba en ningún renglón, que es el
      // problema que trajo a alguien acá.
      actual: null,
      total: filas.length,
      items: candidatasConPuntaje({
        filas,
        nombreDelProducto: producto.nombre,
        productoBaseId,
        filaActualId: null,
      }),
    });
  } catch (e) {
    console.error("[listas/en-la-lista GET]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudieron leer los renglones de la lista: ${e?.message ?? "error"}` },
      { status: 500 }
    );
  }
}

export async function POST(req, context) {
  try {
    const ctx = await contexto(req);
    if (ctx.error) return NextResponse.json(ctx.error, { status: ctx.status });
    const { grupoId, localId } = ctx;

    const { importacionId, productoBaseId } = await ids(context);
    if (!Number.isInteger(importacionId) || !Number.isInteger(productoBaseId)) {
      return NextResponse.json({ ok: false, error: "Identificador inválido." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const filaElegidaId = Number(body?.filaElegidaId);
    if (!Number.isInteger(filaElegidaId)) {
      return NextResponse.json(
        { ok: false, error: "Elegí un renglón de la lista." },
        { status: 400 }
      );
    }

    const cab = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: CAMPOS_CABECERA_PARA_EL_MOTOR,
    });
    if (!cab) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }
    if (!esImportacionAbierta(cab.estado)) {
      return NextResponse.json(
        { ok: false, error: "Esta lista está cerrada: no se pueden cambiar sus vínculos.", codigo: "CERRADA" },
        { status: 409 }
      );
    }

    const reg = resolverParserPorId(cab.parser);
    if (!reg.ok) return NextResponse.json({ ok: false, error: reg.error }, { status: 409 });

    const producto = await prisma.productoBase.findFirst({
      where: { id: productoBaseId, grupoId },
      select: CAMPOS_PRODUCTO_PARA_EL_MOTOR,
    });
    if (!producto) {
      return NextResponse.json({ ok: false, error: "El producto ya no existe." }, { status: 404 });
    }

    const filaNueva = await prisma.importacionListaFila.findFirst({
      where: { id: filaElegidaId, importacionId },
    });
    if (!filaNueva) {
      return NextResponse.json(
        { ok: false, error: "Ese renglón no es de esta lista." },
        { status: 404 }
      );
    }
    // UNA FILA YA APLICADA NO SE MUEVE. Su costo ya está escrito en el producto
    // que tenía: mudarle el vínculo dejaría ese costo puesto sin nada que lo
    // explique. Lo que se hace con una aplicada es deshacer, que es otra acción.
    if (filaNueva.aplicada === true) {
      return NextResponse.json(
        {
          ok: false,
          error: "Ese renglón ya se aplicó. Para moverlo, primero deshacé la aplicación.",
          codigo: "FILA_APLICADA",
        },
        { status: 409 }
      );
    }
    const codigoNuevo = filaNueva.codigoNormalizado ?? filaNueva.codigoCrudo;
    if (!codigoNuevo) {
      return NextResponse.json(
        { ok: false, error: "Ese renglón de la lista no tiene código, así que no se puede vincular." },
        { status: 409 }
      );
    }

    const depositoLocalId = await getDepositoIdDeGrupo(grupoId);
    const ahora = new Date();
    // La config y el contexto salen de la MISMA función que los arma para «No es
    // este producto». Rehacerlos acá fue el defecto que mandó `creadoEnLocalId`
    // en `undefined` y guardó la fila como BLOQUEADO: está contado en
    // `vincularConUnaFila.js`.
    const { config, contexto: contextoMotor } = motorParaEstaLista({
      cab,
      reg,
      grupoId,
      operandoEnLocalId: localId,
      depositoLocalId,
    });
    const productoParaMotor = productoParaElMotor(producto);

    // ── EL VEREDICTO SE CALCULA CON EL MISMO MOTOR ──────────────────────────
    //
    // `conciliarFila` es la función que decidió las otras filas de esta lista. Si
    // acá se escribiera un cálculo propio, este renglón tendría un costo que no
    // salió del mismo lugar que los demás y nadie podría explicar la diferencia.
    const recalculada = conciliarFila({
      fila: filaParaElMotor(filaNueva, { vinculadoEn: ahora }),
      indice: indexarCodigosProveedor([
        { id: 0, productoBaseId, codigoInterno: codigoNuevo, activo: true },
      ]),
      indiceBarra: indexarCodigosBarra([]),
      productosPorId: new Map([[producto.id, productoParaMotor]]),
      contexto: contextoMotor,
      config,
    });

    await prisma.$transaction(async (tx) => {
      // 1. Los códigos viejos de este producto con este proveedor se apagan.
      //    Desde acá no se sabe cuál era el equivocado —el producto no apareció
      //    en la lista, así que ninguno de ellos está en este archivo— y dejar
      //    uno activo lo haría machear el mes que viene. Va ANTES del upsert,
      //    que es el que enciende el nuevo.
      await desactivarCodigosDelProducto(tx, {
        grupoId,
        proveedorId: cab.proveedorId,
        productoBaseId,
      });

      // 2. El código del renglón elegido queda guardado para siempre.
      await guardarCodigoDeLaFila(tx, {
        grupoId,
        proveedorId: cab.proveedorId,
        productoBaseId,
        fila: filaNueva,
      });

      // 3. El renglón queda con este producto y su veredicto recalculado.
      await tx.importacionListaFila.update({
        where: { id: filaNueva.id },
        data: { ...filaAPersistir(recalculada), vinculadoEn: ahora },
      });

      await recalcularContadores(tx, importacionId);
    }, OPCIONES_TX);

    return NextResponse.json({
      ok: true,
      accion: "VINCULADA",
      productoBaseId,
      filaId: filaNueva.id,
      codigo: codigoNuevo,
      mensaje:
        `${producto.nombre} quedó atado al renglón «${filaNueva.descripcionProveedor}» ` +
        `(código ${filaNueva.codigoCrudo}). Las próximas listas de este proveedor lo van a usar solo.`,
    });
  } catch (e) {
    console.error("[listas/en-la-lista POST]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudo vincular el producto con ese renglón: ${e?.message ?? "error"}` },
      { status: 500 }
    );
  }
}
