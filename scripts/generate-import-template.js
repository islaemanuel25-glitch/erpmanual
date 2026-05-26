/**
 * Genera la plantilla Excel para importación de productos.
 * Ejecutar: node scripts/generate-import-template.js
 */
const XLSX = require("xlsx");
const path = require("path");

const headers = [
  "codigo_barra",
  "codigo_barra_secundario",
  "nombre",
  "unidad_medida",
  "factor_pack",
  "precio_costo",
  "precio_venta",
  "margen",
  "categoria",
  "proveedor",
  "area_fisica",
  "stock_inicial",
  "activo",
];

const ejemplo = {
  codigo_barra: "7790001000101",
  codigo_barra_secundario: "7790001000102",
  nombre: "Coca Cola 500ml",
  unidad_medida: "pack",
  factor_pack: 6,
  precio_costo: 1200,
  precio_venta: 1800,
  margen: 50,
  categoria: "Bebidas",
  proveedor: "Distribuidora Sur",
  area_fisica: "Góndola 1",
  stock_inicial: 10,
  activo: "SI",
};

const ws = XLSX.utils.json_to_sheet([ejemplo], { header: headers });

// Anchos de columna
ws["!cols"] = [
  { wch: 16 }, // codigo_barra
  { wch: 20 }, // codigo_barra_secundario
  { wch: 30 }, // nombre
  { wch: 14 }, // unidad_medida
  { wch: 12 }, // factor_pack
  { wch: 12 }, // precio_costo
  { wch: 12 }, // precio_venta
  { wch: 8 },  // margen
  { wch: 16 }, // categoria
  { wch: 20 }, // proveedor
  { wch: 16 }, // area_fisica
  { wch: 14 }, // stock_inicial
  { wch: 8 },  // activo
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Productos");

const outPath = path.join(__dirname, "..", "public", "templates", "import_productos.xlsx");
XLSX.writeFile(wb, outPath);

console.log("Plantilla generada:", outPath);
