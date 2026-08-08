// GET /api/proveedores/listas/[id]/productos?q=...
//
// Candidatos para vincular a mano una fila que no macheó.
//
// SOLO AYUDA A ELEGIR. No machea por nombre ni por parecido: devuelve productos
// para que una persona mire y decida. La coincidencia automática sigue siendo
// exclusivamente por código interno del proveedor.
//
// Exige búsqueda: sin un mínimo de caracteres no devuelve nada. Un catálogo de
// 2.500 productos volcado en un desplegable no ayuda a nadie a elegir bien, y el
// riesgo de esta pantalla es justamente elegir mal.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin, checkPerm } from "@/lib/authorize";
import { productoVisibleWhere, getDepositoIdDeGrupo } from "@/lib/visibilidad";
import { puedeEditarCosto } from "@/lib/productos/propiedadCosto";
import {
  MIN_BUSQUEDA,
  MAX_RESULTADOS,
  consultaValida,
  ordenarCandidatos,
  presentarCandidato,
} from "@/lib/proveedores/listas/vinculacion";

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
    const { grupoId, localId } = scope;

    const { id } = await context.params;
    const importacionId = Number(id);
    if (!Number.isInteger(importacionId) || importacionId <= 0) {
      return NextResponse.json({ ok: false, error: "Id inválido." }, { status: 400 });
    }

    // La importación ancla el alcance: si es de otro grupo, no existe.
    const importacion = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: { id: true, proveedorId: true },
    });
    if (!importacion) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (!consultaValida(q)) {
      return NextResponse.json({
        ok: true,
        items: [],
        minimo: MIN_BUSQUEDA,
        mensaje: `Escribí al menos ${MIN_BUSQUEDA} caracteres para buscar.`,
      });
    }

    const contiene = { contains: q, mode: "insensitive" };

    // Cinco fuentes reales de identificación de un producto en el ERP. El
    // filtro de visibilidad va SIEMPRE: un producto exclusivo de otro local no
    // se puede vincular ni ver desde acá.
    const bases = await prisma.productoBase.findMany({
      where: {
        grupoId,
        ...productoVisibleWhere(localId),
        OR: [
          { nombre: contiene },
          { codigo_barra: contiene },
          { codigo_barra_secundario: contiene },
          { locales: { some: { localId, codigo_barra_propio: contiene } } },
          // Códigos internos de CUALQUIER proveedor del grupo: encontrar el
          // producto por el código con el que lo llama otro proveedor es útil y
          // no filtra nada —siguen siendo productos del mismo grupo—.
          { codigosProveedor: { some: { grupoId, codigoInterno: contiene } } },
        ],
      },
      take: MAX_RESULTADOS,
      select: {
        id: true,
        nombre: true,
        unidad_medida: true,
        factor_pack: true,
        // Habilita mostrar la variación de cada candidato, que es la evidencia
        // que delata cuál es el correcto. Solo se emite con costos.ver.
        precio_costo: true,
        codigo_barra: true,
        codigo_barra_secundario: true,
        creadoEnLocalId: true,
        es_combo: true,
        locales: {
          where: { localId, codigo_barra_propio: { not: null } },
          select: { codigo_barra_propio: true },
        },
        codigosProveedor: {
          where: { grupoId, activo: true },
          select: { codigoInterno: true, proveedorId: true },
        },
      },
    });

    const depositoLocalId = await getDepositoIdDeGrupo(grupoId);

    // Hoy la guarda de arriba ya exige administrador, así que esto siempre da
    // true. Se consulta igual para que el costo dependa del permiso y no de esa
    // guarda: si mañana se afloja, el costo no viaja de arriba sin decidirlo.
    const puedeVerCosto = checkPerm(admin.session, "costos.ver").ok;

    const items = bases.map((b) =>
      presentarCandidato(
        {
          productoBaseId: b.id,
          nombre: b.nombre,
          unidadMedida: b.unidad_medida,
          factorPack: b.factor_pack,
          codigoBarra: b.codigo_barra,
          codigoBarraSecundario: b.codigo_barra_secundario,
          codigosPropios: b.locales.map((x) => x.codigo_barra_propio).filter(Boolean),
          codigosProveedor: b.codigosProveedor.map((x) => x.codigoInterno),
          creadoEnLocalId: b.creadoEnLocalId,
          esCombo: b.es_combo,
          costoActual: b.precio_costo,
        },
        {
          // Se calcula ahora para poder ADVERTIR antes de vincular, no después.
          puedeEditarCosto: puedeEditarCosto(localId, b.creadoEnLocalId, depositoLocalId),
          puedeVerCosto,
        }
      )
    );

    return NextResponse.json({
      ok: true,
      items: ordenarCandidatos(items, q),
      minimo: MIN_BUSQUEDA,
      limite: MAX_RESULTADOS,
      truncado: bases.length === MAX_RESULTADOS,
    });
  } catch (error) {
    console.error("Error buscando productos para vincular:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
