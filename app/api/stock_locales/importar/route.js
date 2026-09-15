// app/api/stock_locales/importar/route.js
// ⚠️ REVISIÓN (refactor Stock — Etapa 1): hoy NO se consume desde el módulo
//    Stock Locales. Candidato a documentar / eliminar / cablear en Etapa 3.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveLocalAndGrupo, getLocalIdsDeGrupo } from "@/lib/grupos";
import {
  bloquearCodigosDelGrupo,
  validarUnicidadCodigos,
} from "@/lib/productos/validarCodigosBarra";
import { getDepositoIdDeGrupo } from "@/lib/visibilidad";

export async function POST(req) {
  try {
    // ================================
    // 0) SESSION Y PERMISOS
    // ================================
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado." },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "stock.editar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    // Alcance por grupo: nunca escribir en locales de otros grupos.
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error, needsContexto: ctx.needsContexto },
        { status: ctx.status }
      );
    }
    const localIdsGrupo = await getLocalIdsDeGrupo(ctx.grupoId);

    // ================================
    // 1) RECIBIR BODY
    // ================================
    const { productos } = await req.json();

    if (!Array.isArray(productos) || productos.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No hay productos para importar." },
        { status: 400 }
      );
    }

    // Los combos no tienen stock físico: no se importan por stock.
    if (productos.some((p) => p.esCombo)) {
      return NextResponse.json(
        { ok: false, error: "Los combos no se importan por stock." },
        { status: 400 }
      );
    }

    // ================================
    // 2) MAPEO camelCase → snake_case
    // precioCosto = precio del bulto
    // factorPack = unidades por bulto
    // ================================
    const productosBaseData = productos.map((p) => ({
      grupoId: p.grupoId,
      creadoEnLocalId: p.creadoEnLocalId ?? null,

      nombre: p.nombre,
      descripcion: p.descripcion ?? null,
      sku: p.sku ?? null,
      codigo_barra: p.codigoBarra ?? null,

      categoria_id: p.categoriaId ?? null,
      proveedor_id: p.proveedorId ?? null,
      area_fisica_id: p.areaFisicaId ?? null,

      unidad_medida: p.unidadMedida,       // cajon / pack / unidad
      factor_pack: p.factorPack ?? null,   // unidades dentro del bulto

      peso_kg: p.pesoKg ?? null,
      volumen_ml: p.volumenMl ?? null,

      precio_costo: Number(p.precioCosto), // 🚨 PRECIO DEL BULTO
      precio_venta: Number(p.precioVenta), // precio del bulto (sugerido)
      margen: p.margen ?? null,

      precio_sugerido: p.precioSugerido ?? null,
      iva_porcentaje: p.ivaPorcentaje ?? null,
      fecha_vencimiento: p.fechaVencimiento ?? null,

      redondeo_100: p.redondeo100 ?? false,
      activo: p.activo ?? true,

      imagen_url: p.imagenUrl ?? null,
      es_combo: p.esCombo ?? false,
    }));

    // ================================
    // 3) INSERTAR PRODUCTO BASE
    // ================================
    //
    // ── ESTA RUTA NO VALIDABA NINGÚN CÓDIGO ──────────────────────────────
    //
    // Se apoyaba solo en `skipDuplicates`, que esquiva el índice de la base y
    // nada más: una fila que chocara contra el SECUNDARIO de otro producto, o
    // contra un código propio de la ubicación, entraba igual — y encima entraba
    // en silencio, porque `skipDuplicates` no dice qué salteó.
    //
    // Ahora se pregunta por cada fila con la misma función que todos los demás
    // caminos de alta, y si alguna choca NO SE IMPORTA NADA: un archivo a medio
    // aplicar, sin decir qué filas entraron, es peor que uno rechazado.
    const depositoLocalId = await getDepositoIdDeGrupo(ctx.grupoId, prisma);
    await prisma.$transaction(async (tx) => {
      await bloquearCodigosDelGrupo(tx, ctx.grupoId);

      for (let i = 0; i < productosBaseData.length; i++) {
        const fila = productosBaseData[i];
        if (!fila.codigo_barra) continue;
        const v = await validarUnicidadCodigos({
          prisma: tx,
          grupoId: fila.grupoId,
          ambitoLocalId: fila.creadoEnLocalId,
          depositoLocalId,
          baseIdExcluir: null,
          principal: fila.codigo_barra,
          secundario: null,
        });
        if (!v.ok) {
          const e = new Error(`Fila ${i + 1} ("${fila.nombre}"): ${v.error}`);
          e.esCodigoEnUso = true;
          throw e;
        }
      }

      await tx.productoBase.createMany({
        data: productosBaseData,
        skipDuplicates: true,
      });
    });

    // ================================
    // 4) LEER LOS INSERTADOS RECIENTES
    // ================================
    const bases = await prisma.productoBase.findMany({
      orderBy: { id: "desc" },
      take: productosBaseData.length,
    });

    const baseIds = bases.map((b) => b.id);

    // ================================
    // 5) OBTENER LOCALES
    // ================================
    const locales = await prisma.local.findMany({
      where: { es_deposito: false, id: { in: localIdsGrupo } },
      select: { id: true },
    });

    // ================================
    // 6) CREAR PRODUCTOLOCAL (precio del bulto)
    // ================================
    const productosLocalesData = [];

    for (const b of bases) {
      for (const l of locales) {
        productosLocalesData.push({
          baseId: b.id,
          localId: l.id,
          precio_costo: b.precio_costo,  // 🚨 precio del bulto
          precio_venta: b.precio_venta,  // precio del bulto
          margen: b.margen,
          activo: b.activo,
        });
      }
    }

    await prisma.productoLocal.createMany({
      data: productosLocalesData,
      skipDuplicates: true,
    });

    // ================================
    // 7) CREAR STOCK INICIAL = 0
    // ================================
    const productosLocales = await prisma.productoLocal.findMany({
      where: { baseId: { in: baseIds } },
      select: { id: true, localId: true },
    });

    const stockData = productosLocales.map((pl) => ({
      localId: pl.localId,
      productoId: pl.id,
      cantidad: 0,     // 🚨 depósito = 0 bultos, local = 0 unidades
      // NULL: la importación crea la fila, no configura límites. Ver
      // `limitesConfiguradosAt` en el esquema.
      stockMin: null,
      stockMax: null,
    }));

    await prisma.stockLocal.createMany({
      data: stockData,
      skipDuplicates: true,
    });

    return NextResponse.json({ ok: true });

  } catch (err) {
    // Un código ocupado es un 400 con su texto y el número de fila.
    if (err.esCodigoEnUso) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("❌ ERROR IMPORTAR:", err);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}
