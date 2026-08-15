import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requirePerm } from "@/lib/authorize";

// La planilla de importación de productos: encabezados y una fila en blanco, sin
// ningún dato del negocio. NO estaba entre las 19 que filtraban por eso, y aun
// así se cierra: sus columnas son el contrato de la importación —`precioCosto`,
// `margen`, `proveedorId`— y quien no puede importar no tiene por qué recibirlo.
//
// `productos.importar` es el permiso que ya usan las dos rutas de importar.
const PERMISO_PLANTILLA = ["productos.importar", "productos.crear"];

export async function GET(req) {
  const auth = requirePerm(req, PERMISO_PLANTILLA);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
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
