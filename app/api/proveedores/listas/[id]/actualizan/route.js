// GET /api/proveedores/listas/[id]/actualizan
//
// LOS PRODUCTOS QUE SE VAN A ACTUALIZAR, para la pantalla "Ver los N".
//
// ── POR QUÉ NO SE REUSA `catalogo` ─────────────────────────────────────────
//
// Aquél alimentaba la tabla de la pantalla vieja: devuelve todas las filas de la
// importación con sus veinte columnas técnicas —tipo de coincidencia, dígitos de
// sufijo, motivo, factor, banderas— porque la tabla las mostraba. Esta pantalla
// muestra cuatro cosas por producto y las 954 filas no entran en un teléfono.
//
// Acá se devuelve SOLO lo que se dibuja, solo de las filas que se van a
// actualizar, de a veinte, y con el buscador resuelto EN LA BASE: filtrar en el
// navegador buscaría dentro de las veinte que se trajeron, así que escribir el
// nombre de un producto que está más abajo no daría nada y parecería que no
// está.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { ESTADO_LINEA } from "@/lib/proveedores/listas/estados";
import { motivoDeRevision } from "@/lib/proveedores/listas/resultadoDeLaLista";

const numero = (v) => (v === null || v === undefined ? null : Number(v));
const PAGINA = 20;

export async function GET(req, context) {
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
    const { grupoId } = scope;

    const { id: idCrudo } = await context.params;
    const id = Number(idCrudo);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ ok: false, error: "Id inválido." }, { status: 400 });
    }

    const cab = await prisma.importacionListaProveedor.findFirst({
      where: { id, grupoId },
      select: {
        id: true,
        aumentoEsperadoMinPct: true,
        aumentoEsperadoMaxPct: true,
        proveedor: { select: { id: true, nombre: true } },
      },
    });
    if (!cab) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    const url = new URL(req.url);
    const buscar = String(url.searchParams.get("buscar") ?? "").trim();
    const hasta = Math.max(PAGINA, Number(url.searchParams.get("hasta")) || PAGINA);

    const rango = {
      minPct: numero(cab.aumentoEsperadoMinPct),
      maxPct: numero(cab.aumentoEsperadoMaxPct),
    };

    const where = {
      importacionId: id,
      estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
      excluidaManual: false,
      ...(buscar
        ? {
            OR: [
              { descripcionProveedor: { contains: buscar, mode: "insensitive" } },
              { productoBase: { nombre: { contains: buscar, mode: "insensitive" } } },
              { codigoCrudo: { contains: buscar, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    // Se traen `hasta + 1` para poder decir si queda algo más sin una segunda
    // consulta de conteo.
    const crudas = await prisma.importacionListaFila.findMany({
      where,
      orderBy: { filaExcel: "asc" },
      take: hasta + 1,
      select: {
        id: true,
        estado: true,
        motivo: true,
        codigoCrudo: true,
        descripcionProveedor: true,
        costoAnterior: true,
        costoMaestroPropuesto: true,
        diferenciaPct: true,
        factorErp: true,
        excluidaManual: true,
        productoBaseId: true,
        aumentoEsperadoMinPct: true,
        aumentoEsperadoMaxPct: true,
        confirmadoEn: true,
        vinculadoEn: true,
        multiplicadorConfirmado: true,
        fueraDeRangoAceptadaEn: true,
        productoBase: { select: { nombre: true, factor_pack: true } },
      },
    });

    // EL MISMO FILTRO QUE EL CONTADOR. Una fila LISTO que quedó fuera del rango
    // sin que nadie la eligiera NO se va a actualizar: mostrarla acá diría que
    // se actualizan 112 cuando se actualizan 111.
    const aplicables = crudas.filter((f) => motivoDeRevision(f, rango) === null);
    const hayMas = aplicables.length > hasta;
    const pagina = aplicables.slice(0, hasta);

    return NextResponse.json({
      ok: true,
      proveedor: cab.proveedor,
      rango,
      hayMas,
      items: pagina.map((f) => ({
        id: f.id,
        nombre: f.productoBase?.nombre || f.descripcionProveedor,
        factorPack: f.productoBase?.factor_pack ?? f.factorErp ?? null,
        costoAnterior: numero(f.costoAnterior),
        costoNuevo: numero(f.costoMaestroPropuesto),
        variacionPct: numero(f.diferenciaPct),
      })),
    });
  } catch (e) {
    console.error("[listas/actualizan]", e);
    return NextResponse.json(
      { ok: false, error: "No se pudieron cargar los productos que se actualizan. Probá de nuevo." },
      { status: 500 }
    );
  }
}
