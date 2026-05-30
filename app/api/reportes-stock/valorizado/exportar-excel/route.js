// app/api/reportes-stock/valorizado/exportar-excel/route.js
//
// Exporta el reporte de stock valorizado como archivo .xlsx.
// Reusa la query y mapeo de items vía obtenerReporte() del endpoint hermano.

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { obtenerReporte } from "../route";

function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Number(v.toFixed(2));
}

export async function GET(req) {
  try {
    const result = await obtenerReporte(req);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status }
      );
    }

    const headers = [
      "Producto",
      "Código",
      "Local",
      "Categoría",
      "Proveedor",
      "Stock",
      "Costo",
      "Venta",
      "Valor costo",
      "Valor venta",
      "Ganancia",
      "Observación",
    ];

    const data = [
      headers,
      ...result.items.map((it) => [
        it.productoNombre,
        it.codigoBarra,
        it.localNombre,
        it.categoriaNombre,
        it.proveedorNombre,
        round2(it.cantidad),
        round2(it.precioCostoUnitario),
        round2(it.precioVentaUnitario),
        round2(it.valorCosto),
        round2(it.valorVenta),
        round2(it.gananciaPotencial),
        it.observacion,
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [
      { wch: 40 }, // Producto
      { wch: 16 }, // Código
      { wch: 20 }, // Local
      { wch: 20 }, // Categoría
      { wch: 24 }, // Proveedor
      { wch: 10 }, // Stock
      { wch: 12 }, // Costo
      { wch: 12 }, // Venta
      { wch: 14 }, // Valor costo
      { wch: 14 }, // Valor venta
      { wch: 14 }, // Ganancia
      { wch: 28 }, // Observación
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock valorizado");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=stock-valorizado.xlsx`,
      },
    });
  } catch (err) {
    console.error("Error reportes-stock/valorizado/exportar-excel:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al generar Excel" },
      { status: 500 }
    );
  }
}
