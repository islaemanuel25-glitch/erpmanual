import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveScope } from "@/lib/grupos";
import { datosDeLaListaDePrecios } from "@/lib/productos/listaDePreciosServer";
import { armarListaDePreciosPdf } from "@/lib/pdf/listaDePreciosPdf";
import * as XLSX from "xlsx";

// LA EXPORTACIÓN DEL CATÁLOGO, EN DOS FORMATOS.
//
//   · `formato: "pdf"` — la LISTA DE PRECIOS: los productos activos de una
//     ubicación con su costo y su venta, agrupados por categoría. Es lo que se
//     baja desde el botón "Descargar lista de precios" del catálogo.
//   · sin formato —o cualquier otro— — el EXCEL de siempre, el que se vuelve a
//     subir desde Import / Export. No cambió de columnas.
//
// Son la misma exportación a propósito: el mismo permiso, la misma ubicación y
// los mismos filtros de proveedor y categoría. La lista en PDF entró el
// 2026-10-31 y se sumó acá en vez de escribirse una ruta al lado.
//
// ── LA UBICACIÓN SALE DE `resolveScope`, DESDE ESE DÍA ────────────────────
//
// Antes se tomaba el `localId` del cuerpo tal cual: un usuario de un local con
// `costos.ver` podía pedir el catálogo con costos de OTRO local. Ahora es la
// misma regla que el listado del catálogo: quien no es administrador exporta
// solo su local, y un `localId` ajeno contesta 403; el administrador elige
// cualquiera, o usa su contexto activo. Con eso siempre hay una ubicación, y la
// rama que armaba "una fila por cada local" quedó sin camino y se borró.

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    // PIDE `costos.ver` Y NO `productos.ver`, y el motivo está en lo que baja: el
    // XLSX trae `precio_costo` y `margen` DE TODO EL CATÁLOGO. Medido: 1,3 MB con
    // 2.005 productos, y con `productos.ver` se lo llevaba el rol Mini.
    //
    // `costos.ver` es el permiso que YA EXISTE para esto —lo usan el detalle de
    // venta y las dos rutas de listas de proveedor para decidir si muestran el
    // costo— y contado contra los roles de producción lo tienen Admin y
    // DUEÑO_LOCAL, que son 4 usuarios activos. No lo tienen Mini ni CAJERO.
    //
    // Ver el catálogo y llevárselo con los costos son dos cosas distintas. La
    // lista de precios en PDF también lleva el costo, así que pide lo mismo.
    const perm = checkPerm(session, "costos.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json();

    const scope = await resolveScope(req, { explicitLocalId: Number(body.localId) || null });
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, ...(scope.needsContexto ? { needsContexto: true } : {}) },
        { status: scope.status }
      );
    }
    const { localId, grupoId } = scope;

    const proveedorId = body.proveedorId ? Number(body.proveedorId) : null;
    const categoriaId = body.categoriaId ? Number(body.categoriaId) : null;

    const hoy = new Date().toISOString().split("T")[0];

    if (body.formato === "pdf") {
      const datos = await datosDeLaListaDePrecios(prisma, { grupoId, localId, proveedorId, categoriaId });
      const bytes = await armarListaDePreciosPdf(datos);
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="lista-de-precios_${hoy}.pdf"`,
        },
      });
    }

    // Filtro base
    const where = { grupoId };
    if (proveedorId) where.proveedor_id = proveedorId;
    if (categoriaId) where.categoria_id = categoriaId;

    // Obtener productos base con relaciones
    const productos = await prisma.productoBase.findMany({
      where,
      orderBy: { nombre: "asc" },
      include: {
        categoria: { select: { nombre: true } },
        proveedor: { select: { nombre: true } },
        area_fisica: { select: { nombre: true } },
        locales: {
          where: { localId },
          take: 1,
          include: {
            local: { select: { nombre: true } },
            stock: { select: { cantidad: true, stockMin: true, stockMax: true } },
          },
        },
      },
    });

    // Armar filas para Excel
    const filas = [];

    for (const p of productos) {
      if (p.locales.length > 0) {
        // Una fila por el local filtrado
        const loc = p.locales[0];
        filas.push({
          id: p.id,
          codigo_barra: p.codigo_barra || "",
          codigo_barra_secundario: p.codigo_barra_secundario || "",
          nombre: loc.nombre || p.nombre,
          categoria: p.categoria?.nombre || "",
          proveedor: p.proveedor?.nombre || "",
          area_fisica: p.area_fisica?.nombre || "",
          unidad_medida: p.unidad_medida || "",
          factor_pack: p.factor_pack != null ? Number(p.factor_pack) : "",
          modo_pedido: p.modo_pedido || "BULTO",
          modo_compra_proveedor: p.modoCompraProveedor || "BULTO",
          precio_costo: Number(loc.precio_costo ?? p.precio_costo ?? 0),
          precio_venta: Number(loc.precio_venta ?? p.precio_venta ?? 0),
          margen: Number(loc.margen ?? p.margen ?? 0),
          stock_actual: loc.stock?.[0] ? Number(loc.stock[0].cantidad) : 0,
          stock_min: loc.stock?.[0]?.stockMin != null ? Number(loc.stock[0].stockMin) : "",
          stock_max: loc.stock?.[0]?.stockMax != null ? Number(loc.stock[0].stockMax) : "",
          activo: (loc.activo ?? p.activo) ? "SI" : "NO",
          local_nombre: loc.local?.nombre || "",
        });
      } else {
        // Producto sin locales asignados (solo base)
        filas.push({
          id: p.id,
          codigo_barra: p.codigo_barra || "",
          codigo_barra_secundario: p.codigo_barra_secundario || "",
          nombre: p.nombre,
          categoria: p.categoria?.nombre || "",
          proveedor: p.proveedor?.nombre || "",
          area_fisica: p.area_fisica?.nombre || "",
          unidad_medida: p.unidad_medida || "",
          factor_pack: p.factor_pack != null ? Number(p.factor_pack) : "",
          modo_pedido: p.modo_pedido || "BULTO",
          modo_compra_proveedor: p.modoCompraProveedor || "BULTO",
          precio_costo: Number(p.precio_costo ?? 0),
          precio_venta: Number(p.precio_venta ?? 0),
          margen: Number(p.margen ?? 0),
          stock_actual: "",
          stock_min: "",
          stock_max: "",
          activo: p.activo ? "SI" : "NO",
          local_nombre: "",
        });
      }
    }

    // Generar Excel
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");

    // Ajustar ancho de columnas
    ws["!cols"] = [
      { wch: 6 },   // id
      { wch: 16 },  // codigo_barra
      { wch: 20 },  // codigo_barra_secundario
      { wch: 35 },  // nombre
      { wch: 15 },  // categoria
      { wch: 18 },  // proveedor
      { wch: 15 },  // area_fisica
      { wch: 14 },  // unidad_medida
      { wch: 10 },  // factor_pack
      { wch: 14 },  // modo_pedido
      { wch: 22 },  // modo_compra_proveedor
      { wch: 12 },  // precio_costo
      { wch: 12 },  // precio_venta
      { wch: 8 },   // margen
      { wch: 12 },  // stock_actual
      { wch: 10 },  // stock_min
      { wch: 10 },  // stock_max
      { wch: 6 },   // activo
      { wch: 18 },  // local_nombre
    ];

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="productos_${hoy}.xlsx"`,
      },
    });
  } catch (e) {
    console.error("ERROR productos/export:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno" },
      { status: 500 }
    );
  }
}
