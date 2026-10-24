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
import { requirePerm } from "@/lib/authorize";
import { getDepositoIdDeGrupo, importacionDeProveedorPropioWhere } from "@/lib/visibilidad";
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
  ubicacionQueJuzgaElCosto,
  CAMPOS_PRODUCTO_PARA_EL_MOTOR,
  CAMPOS_CABECERA_PARA_EL_MOTOR,
  lugarParaSumarProveedor,
} from "@/lib/proveedores/listas/vincularConUnaFila";

/** Los dos ids de la URL, validados. */
async function ids(context) {
  const p = await context.params;
  return { importacionId: Number(p?.id), productoBaseId: Number(p?.productoBaseId) };
}

async function contexto(req) {
  const acceso = requirePerm(req, "proveedores.listas");
  if (!acceso.ok) return { error: { ok: false, error: acceso.error }, status: acceso.status };

  const scope = await resolveScope(req);
  if (scope.error) {
    return {
      error: { ok: false, error: scope.error, needsContexto: scope.needsContexto },
      status: scope.status,
    };
  }
  // Sin el comodín, solo las listas de un proveedor del local de la sesión.
  return {
    ...scope,
    // Quién decide "No viene en esta lista": se guarda con la decisión.
    session: acceso.session,
    propia: importacionDeProveedorPropioWhere(scope.localId, acceso.session.esAdmin),
  };
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
      where: { id: importacionId, grupoId, ...ctx.propia },
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

    // ── CUALQUIERA DE LAS PALABRAS, NO LA FRASE ENTERA ────────────────────
    //
    // La hoja de vincular arranca con las primeras palabras del nombre del
    // producto ya escritas (2026-10-23). Exigir la frase entera dejaba afuera
    // el renglón que el proveedor escribe en otro orden o abreviado —"SOLITAS
    // ANIMACION" contra "GALL SOLITAS ANIM"—, que es justo el que se busca. Con
    // cualquier palabra entran más, y el orden lo pone el parecido al nombre.
    const palabras = buscar.split(/\s+/).filter((p) => p.length >= 2);
    const filas = await prisma.importacionListaFila.findMany({
      where: {
        importacionId,
        ...(palabras.length
          ? {
              OR: palabras.flatMap((p) => [
                { descripcionProveedor: { contains: p, mode: "insensitive" } },
                { codigoCrudo: { contains: p, mode: "insensitive" } },
              ]),
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

    // ── "NO VIENE EN ESTA LISTA" AHORA SE GUARDA ─────────────────────────
    //
    // Hasta el 2026-10-23 no escribía nada: el producto ya estaba fuera de la
    // lista y la pantalla de "No vinieron" lo seguía mostrando ahí. Con la
    // revisión que arranca de tus productos, no guardarlo dejaba la tarjeta
    // "Sin vincular" para siempre, como si nadie la hubiera mirado. Es un hecho
    // de ESTA lista (`ProductoQueNoVieneEnLaLista`): no toca vínculos ni costos.
    // ── Y SE DESHACE (2026-10-24) ─────────────────────────────────────────
    //
    // `{ noViene: false }` borra la marca: es el «Deshacer» del aviso que sale
    // al tocar «No viene» en la tarjeta. Las mismas guardas que marcarla.
    if (body?.noViene === true || body?.noViene === false) {
      const cabNo = await prisma.importacionListaProveedor.findFirst({
        where: { id: importacionId, grupoId, ...ctx.propia },
        select: { id: true, estado: true },
      });
      if (!cabNo) {
        return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
      }
      if (!esImportacionAbierta(cabNo.estado)) {
        return NextResponse.json(
          { ok: false, error: "Esta lista está cerrada: ya no se puede marcar nada en ella.", codigo: "CERRADA" },
          { status: 409 }
        );
      }
      const productoNo = await prisma.productoBase.findFirst({
        where: { id: productoBaseId, grupoId },
        select: { id: true, nombre: true },
      });
      if (!productoNo) {
        return NextResponse.json({ ok: false, error: "El producto ya no existe." }, { status: 404 });
      }
      if (body.noViene === false) {
        await prisma.productoQueNoVieneEnLaLista.deleteMany({ where: { importacionId, productoBaseId } });
        return NextResponse.json({
          ok: true,
          accion: "VUELVE_A_SIN_VINCULAR",
          productoBaseId,
          mensaje: `${productoNo.nombre} vuelve a estar sin vincular.`,
        });
      }
      await prisma.productoQueNoVieneEnLaLista.upsert({
        where: { no_viene_unico_por_lista_y_producto: { importacionId, productoBaseId } },
        create: { grupoId, importacionId, productoBaseId, decididoPorUsuarioId: ctx.session?.id ?? null },
        update: { decididoPorUsuarioId: ctx.session?.id ?? null, decididoEn: new Date() },
      });
      return NextResponse.json({
        ok: true,
        accion: "NO_VIENE",
        productoBaseId,
        mensaje: `${productoNo.nombre} queda como que no viene en esta lista. No se cambió ningún costo.`,
      });
    }

    const filaElegidaId = Number(body?.filaElegidaId);
    if (!Number.isInteger(filaElegidaId)) {
      return NextResponse.json(
        { ok: false, error: "Elegí un renglón de la lista." },
        { status: 400 }
      );
    }

    const cab = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId, ...ctx.propia },
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

    // ── «✓ SÍ» DESDE "PUEDEN SER DE…": SUMAR ESTE PROVEEDOR (2026-10-24) ────
    //
    // El producto venía del resto del catálogo: no tiene a este proveedor en
    // ninguno de sus tres lugares, y la revisión y las próximas listas salen de
    // esos lugares (`productoDelProveedorWhere`), no del código. Así que además
    // del código se suma el proveedor en el primer lugar LIBRE, sin quitar ni
    // cambiar los que ya tiene (`lugarParaSumarProveedor`). Con los tres
    // ocupados no se vincula: hacer lugar es cambiar un proveedor, y eso se
    // decide en la ficha.
    let lugarDelProveedor = null;
    if (body?.sumarProveedor === true) {
      const lugares = await prisma.productoBase.findFirst({
        where: { id: productoBaseId, grupoId },
        select: { proveedor_id: true, proveedor2_id: true, proveedor3_id: true },
      });
      const r = lugarParaSumarProveedor(lugares, cab.proveedorId);
      if (r.lleno) {
        return NextResponse.json(
          {
            ok: false,
            error: `${producto.nombre} ya tiene tres proveedores. Para sumarle este, sacale uno en su ficha.`,
            codigo: "SIN_LUGAR_DE_PROVEEDOR",
          },
          { status: 409 }
        );
      }
      lugarDelProveedor = r.lugar;
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
      // Con el dueño del costo y no con la ubicación activa: desde un local el
      // renglón quedaba bloqueado para siempre. Ver `ubicacionQueJuzgaElCosto`.
      operandoEnLocalId: ubicacionQueJuzgaElCosto({ producto, operandoEnLocalId: localId, depositoLocalId }),
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

      // Si antes alguien dijo que no venía, ya vino: la marca sobra, y dejarla
      // serían dos respuestas a la misma pregunta.
      await tx.productoQueNoVieneEnLaLista.deleteMany({ where: { importacionId, productoBaseId } });

      // 4. Desde "Pueden ser de…": el proveedor, en su lugar libre. Solo ese
      //    campo, y solo si estaba vacío —la condición va en el `where`, así
      //    que si otro lo llenó en el medio no se pisa nada—.
      if (lugarDelProveedor) {
        await tx.productoBase.updateMany({
          where: { id: productoBaseId, grupoId, [lugarDelProveedor]: null },
          data: { [lugarDelProveedor]: cab.proveedorId },
        });
      }
      // 5. Y queda anotado como sumado a ESTA lista, con el lugar que llenó:
      //    la pestaña «Aceptados», la etiqueta de la revisión y el «Deshacer»
      //    salen de acá (`ProductoSumadoALaLista`). Si ya estaba anotado —otro
      //    renglón con «Otro»— el lugar que llenó la primera vez no se pisa.
      if (body?.sumarProveedor === true) {
        await tx.productoSumadoALaLista.upsert({
          where: { sumado_unico_por_lista_y_producto: { importacionId, productoBaseId } },
          create: {
            grupoId,
            importacionId,
            productoBaseId,
            lugarDelProveedor,
            sumadoPorUsuarioId: Number(ctx.session?.id ?? ctx.session?.userId) || null,
          },
          update: lugarDelProveedor ? { lugarDelProveedor } : {},
        });
      }

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
