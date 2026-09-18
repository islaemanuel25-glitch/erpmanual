// POST /api/proveedores/listas/[id]/columna-de-precio
//
// CAMBIA CON QUÉ COLUMNA DEL ARCHIVO SE LEYÓ ESTA LISTA, SIN VOLVER A SUBIRLA.
//
// ── DE DÓNDE SALE ──────────────────────────────────────────────────────────
//
// De un costo mal escrito. Una lista con las dos columnas de Arcor se leyó con
// la de SIN IVA, que explicaba 1 de cada 9 productos, teniendo al lado la de con
// IVA, que explicaba 4. ARCOR ARVEJAS quedó en $858,86 en vez de $1.039,22 — un
// 17 % abajo— y no se vio, porque contra el costo viejo daba +15,7 % y eso cae
// adentro del rango esperado.
//
// Ese defecto se arregló donde se elige la columna. Esto es la otra mitad: qué
// hacer cuando igual se leyó con la equivocada. Sin este endpoint la única
// salida era volver a subir el archivo, y el archivo está en el teléfono de
// quien lo recibió, dos semanas antes.
//
// ── POR QUÉ NO HACE FALTA EL ARCHIVO ───────────────────────────────────────
//
// Porque desde el 2026-09-17 cada fila guarda lo que decía CADA columna de
// precio, no solo la elegida: `ImportacionListaFila.preciosPorColumna`. Con eso
// se vuelve a partir del número correcto y el motor hace exactamente lo mismo
// que siempre.
//
// Las filas leídas ANTES de esa migración no lo tienen y no se pueden
// recolumnar. Se contesta que no se puede y se dice por qué, en vez de escribir
// una lista leída con dos columnas a la vez.
//
// ── ESTA RUTA NO ESCRIBE NINGÚN COSTO ──────────────────────────────────────
//
// No toca `ProductoBase` ni `ProductoLocal`: deja la importación conciliada con
// su resultado nuevo, y el que escribe sigue siendo `aplicar`, con su
// confirmación. Cambiar la columna de una lista YA APLICADA no se permite: los
// costos viejos ya están escritos y lo que corresponde es deshacer primero.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { getDepositoIdDeGrupo } from "@/lib/visibilidad";
import { resolverParserPorId } from "@/lib/proveedores/listas/registro";
import { esImportacionAbierta } from "@/lib/proveedores/listas/persistencia";
import { reconciliarImportacion } from "@/lib/proveedores/listas/reconciliarImportacion";
import { modoDeImportacion } from "@/lib/proveedores/listas/modoDeLaLista";

/** Una corrida grande vuelve a escribir cientos de filas. */
const TX = { maxWait: 20000, timeout: 300000 };

const numeroONull = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function POST(req, context) {
  try {
    const admin = requireAdmin(req);
    if (!admin.ok) {
      return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
    }

    const scope = await resolveScope(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const { grupoId, localId } = scope;

    const params = await context.params;
    const importacionId = Number(params?.id);
    if (!Number.isInteger(importacionId) || importacionId <= 0) {
      return NextResponse.json({ ok: false, error: "Importación inválida." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const columna = Number(body?.columna);
    const conDescuento = body?.conDescuento === true;
    if (!Number.isInteger(columna) || columna < 0) {
      return NextResponse.json(
        { ok: false, error: "Falta decir qué columna del archivo es el precio.", codigo: "COLUMNA_INVALIDA" },
        { status: 400 }
      );
    }

    const cab = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: {
        id: true,
        estado: true,
        modo: true,
        proveedorId: true,
        recargoPct: true,
        impuestoAdicionalPct: true,
        aumentoEsperadoMinPct: true,
        aumentoEsperadoMaxPct: true,
        parser: true,
        decisionDeLectura: true,
        proveedor: { select: { id: true, nombre: true } },
      },
    });
    if (!cab) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    // ── UNA LISTA CERRADA NO SE RECOLUMNA ────────────────────────────────
    //
    // Aplicada, terminada o cancelada. En la aplicada los costos YA están
    // escritos: volver a conciliar con otra columna dejaría el resultado
    // diciendo una cosa y el catálogo otra, que es la peor forma de este
    // problema. Lo que corresponde ahí es deshacer, y después cambiar la
    // columna.
    if (!esImportacionAbierta(cab.estado)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Esta lista ya está cerrada. Si ya aplicaste los precios, primero deshacé la " +
            "aplicación y después cambiá la columna.",
          codigo: "CERRADA",
        },
        { status: 409 }
      );
    }

    // La columna pedida tiene que ser una de las candidatas que el lector
    // encontró en ESTE archivo. Cualquier otra sería costear con una columna que
    // ni siquiera parece un precio — un código de barras entraría como precio.
    const candidatas = Array.isArray(cab.decisionDeLectura?.mapeo?.precios)
      ? cab.decisionDeLectura.mapeo.precios
      : [];
    if (candidatas.length > 0 && !candidatas.includes(columna)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Esa columna del archivo no es una de las que parecen un precio.",
          codigo: "COLUMNA_NO_CANDIDATA",
        },
        { status: 400 }
      );
    }

    const reg = resolverParserPorId(cab.parser);
    if (!reg.ok) {
      return NextResponse.json({ ok: false, error: reg.error }, { status: 409 });
    }

    // ── SE VUELVE A CONCILIAR CON EL MISMO CRITERIO QUE TENÍA ────────────
    //
    // El modo y el rango NO se tocan: lo único que cambia es de qué número se
    // parte. Mezclar las dos cosas en un endpoint haría imposible saber, mirando
    // el resultado, si lo que cambió fue la columna o el criterio.
    const modo = modoDeImportacion(cab);
    const maxPct = numeroONull(cab.aumentoEsperadoMaxPct);
    const cabecera = {
      aumentoEsperadoMinPct: numeroONull(cab.aumentoEsperadoMinPct),
      aumentoEsperadoMaxPct: maxPct,
      impuestoAdicionalPct: numeroONull(cab.impuestoAdicionalPct),
      modo,
    };

    const r = await reconciliarImportacion(prisma, {
      cab,
      cabecera,
      config: {
        ...reg.config,
        recargoPct: Number(cab.recargoPct ?? 0),
        // El techo del rango ES el umbral de variación alta, igual que en las
        // otras dos relecturas. Controlando no hay rango y queda en null, que es
        // lo que ya tenía.
        umbralVariacionPct: maxPct,
        impuestoAdicionalPct: numeroONull(cab.impuestoAdicionalPct),
      },
      alcance: { grupoId, localId, depositoLocalId: await getDepositoIdDeGrupo(grupoId) },
      opcionesTx: TX,
      recolumnar: { columna, conDescuento },
    });

    if (!r.ok) {
      if (r.codigo === "SIN_PRECIOS_POR_COLUMNA") {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Esta lista se leyó antes de que el sistema guardara los precios de cada columna, " +
              "así que no se puede cambiar sin volver a subir el archivo.",
            codigo: r.codigo,
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { ok: false, error: "Esta lista no tiene filas para volver a leer.", codigo: r.codigo },
        { status: 409 }
      );
    }

    // ── Y SE DEJA ESCRITO CON QUÉ COLUMNA QUEDÓ, Y QUE LA ELEGISTE VOS ───
    //
    // El registro de auditoría se actualiza en el mismo paso: si mañana un costo
    // no cierra, la primera pregunta es con qué columna se leyó y quién la
    // eligió. Las opciones medidas se conservan —son del archivo, no de esta
    // decisión— y el respaldo pasa a ser el de la columna nueva.
    const opciones = Array.isArray(cab.decisionDeLectura?.opciones) ? cab.decisionDeLectura.opciones : [];
    const suya = opciones.find((o) => o.columna === columna && o.conDescuento === conDescuento);
    const titulo =
      suya?.titulo ?? cab.decisionDeLectura?.titulos?.[columna] ?? String(columna);

    await prisma.importacionListaProveedor.update({
      where: { id: cab.id },
      data: {
        columnaPrecioElegida: String(titulo),
        descuentoAplicado: conDescuento,
        decisionDeLectura: {
          ...(cab.decisionDeLectura ?? {}),
          columna,
          titulo,
          conDescuento,
          aMano: true,
          origenDeLaEleccion: "LA_ELEGISTE_AHORA",
          explicadas: suya?.explicadas ?? null,
          comparables: suya?.comparables ?? null,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      importacionId: cab.id,
      columna,
      titulo,
      modo,
      resumen: r.resumen,
    });
  } catch (e) {
    // EL MOTIVO, NO "ERROR INTERNO". Un mensaje mudo acá manda a mirar el módulo
    // equivocado: esta ruta vuelve a conciliar una lista entera y lo que falle
    // adentro —una consulta, un lote— es lo que hay que poder leer.
    console.error("[listas/columna-de-precio]", e);
    return NextResponse.json(
      {
        ok: false,
        error: `No se pudo volver a leer la lista con esa columna: ${e?.message ?? "error desconocido"}`,
        codigo: "ERROR_AL_RECOLUMNAR",
      },
      { status: 500 }
    );
  }
}
