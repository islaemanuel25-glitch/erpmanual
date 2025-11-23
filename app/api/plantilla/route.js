import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export async function GET() {
  const columns = [{
    nombre: "",
    descripcion: "",
    sku: "",
    codigoBarra: "",
    categoriaId: "",
    proveedorId: "",
    areaFisicaId: "",
    unidadMedida: "unidad",
    factorPack: "",
    pesoKg: "",
    volumenMl: "",
    precioCosto: "",
    precioVenta: "",
    margen: "",
    precioSugerido: "",
    ivaPorcentaje: "",
    fechaVencimiento: "",
    redondeo100: false,
    activo: true,
    imagenUrl: "",
    esCombo: false,
  }];

  const ws = XLSX.utils.json_to_sheet(columns);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Plantilla");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=plantilla_productos.xlsx",
    },
  });
}
