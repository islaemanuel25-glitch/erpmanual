// SONDA: las consultas de los controles de calidad, ejercidas contra Postgres.
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
//
// Una consulta de Prisma no la prueba el build ni la prueban los candados. El
// proyecto es JavaScript, así que Next compila sin mirar los argumentos, y los
// candados de `controlesCalidad` son funciones puras que no tocan la base. Los
// dos pasan en verde con un `select` que nombra una relación inexistente o una
// columna que la migración todavía no creó.
//
// Ya pasó: tres rutas pedían `productoLocal` dentro de un `select` de
// `ComprobanteLinea` —relación que no existe—, el build compiló, los candados
// quedaron en verde y la pantalla se cayó en producción.
//
// ── FALLA IGUAL CON CERO FILAS ──────────────────────────────────────────────
//
// Postgres valida los ARGUMENTOS, no el resultado. Que la base local esté vacía
// NO es motivo para no correr esto: cuesta segundos y encuentra exactamente lo
// mismo. Por eso la sonda informa cuántas filas vio pero no exige ninguna.
//
// Uso:
//   DATABASE_URL=... node scripts/sonda-controles-productos.mjs

import { crearClientePrisma, LECTURA } from "./lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: LECTURA });

const {
  SELECT_CONTROLES_BASE,
  SELECT_CONTROLES_LOCAL,
  contarDesdePrisma,
  filaMarcadaPor,
} = await import("../lib/productos/controlesDesdePrisma.js");
const { IDS_CONTROL } = await import("../lib/productos/controlesCalidad.js");

let fallas = 0;
const paso = (nombre, detalle = "") => console.log(`  OK   ${nombre}${detalle ? ` — ${detalle}` : ""}`);
const falla = (nombre, err) => {
  fallas += 1;
  console.error(`  ROJO ${nombre}\n       ${err?.message || err}`);
};

async function ejercer(nombre, fn) {
  try {
    const detalle = await fn();
    paso(nombre, detalle);
  } catch (err) {
    falla(nombre, err);
  }
}

// Cualquier local sirve: lo que se valida es la FORMA de la consulta, no el dato.
const algunLocal = await prisma.local.findFirst({ select: { id: true, nombre: true } });
const localId = algunLocal?.id ?? 0;
console.log(`\nUbicación de prueba: ${algunLocal ? `${algunLocal.nombre} (#${localId})` : "ninguna — se ejerce igual con localId 0"}\n`);

// 1. El select del contador y del filtro, tal cual lo arman las dos rutas.
let filas = [];
await ejercer("select de controles (base + ProductoLocal de la ubicación)", async () => {
  filas = await prisma.productoBase.findMany({
    take: 200,
    select: {
      ...SELECT_CONTROLES_BASE,
      locales: { where: { localId }, take: 1, select: SELECT_CONTROLES_LOCAL },
    },
  });
  return `${filas.length} filas`;
});

// 2. `precioRevisadoAt` existe de verdad en la tabla. Un select que la nombre
//    antes de la migración devuelve P2022, no undefined.
await ejercer("ProductoLocal.precioRevisadoAt existe en la base", async () => {
  const n = await prisma.productoLocal.count({ where: { precioRevisadoAt: { not: null } } });
  return `${n} con revisión registrada`;
});

// 3. El índice se usa: ordenar por la columna obliga a Postgres a resolverla.
await ejercer("orden por precioRevisadoAt", async () => {
  const r = await prisma.productoLocal.findMany({
    take: 3,
    orderBy: { precioRevisadoAt: "desc" },
    select: { id: true, precioRevisadoAt: true },
  });
  return `${r.length} filas`;
});

// 4. La clasificación corre sobre filas REALES, no sobre objetos escritos a mano.
//    Es lo único que prueba que el select trajo lo que la clasificación necesita:
//    un campo faltante llega como undefined y el predicado contesta con confianza
//    una respuesta equivocada.
await ejercer("clasificar las filas traídas", () => {
  const conteo = contarDesdePrisma(filas);
  const faltantes = IDS_CONTROL.filter((id) => typeof conteo[id] !== "number");
  if (faltantes.length > 0) throw new Error(`el conteo no trajo: ${faltantes.join(", ")}`);
  return IDS_CONTROL.map((id) => `${id}=${conteo[id]}`).join("  ");
});

// 5. Contador y filtro tienen que dar el mismo número sobre las mismas filas. Es
//    el criterio de aceptación del issue —tocar una card filtra exactamente los
//    productos que la componen— comprobado sobre datos reales y no por
//    construcción.
await ejercer("el filtro coincide con el contador, fila por fila", () => {
  const conteo = contarDesdePrisma(filas);
  const desacuerdos = [];
  for (const id of IDS_CONTROL) {
    const porFiltro = filas.filter((f) => filaMarcadaPor(id, f)).length;
    if (porFiltro !== conteo[id]) desacuerdos.push(`${id}: filtro ${porFiltro} vs contador ${conteo[id]}`);
  }
  if (desacuerdos.length > 0) throw new Error(desacuerdos.join("; "));
  return "los cuatro coinciden";
});

// 6. El `where` del filtro del listado: un `id: { in: [...] }` empujado sobre el
//    AND existente. Se ejerce con ids reales para que Postgres valide el arg.
await ejercer("where del filtro por control en el listado", async () => {
  const ids = filas.slice(0, 50).map((f) => f.id);
  const n = await prisma.productoBase.count({ where: { AND: [{ activo: true }, { id: { in: ids } }] } });
  return `${n} de ${ids.length}`;
});

// 7. El updateMany de "precio revisado", en seco: se ejerce con un baseId
//    imposible para validar los argumentos sin escribir una sola fila.
await ejercer("updateMany de precio revisado (sin tocar filas)", async () => {
  const r = await prisma.productoLocal.updateMany({
    where: { localId, baseId: { in: [-1] } },
    data: { precioRevisadoAt: new Date() },
  });
  if (r.count !== 0) throw new Error(`tocó ${r.count} filas y no debía tocar ninguna`);
  return "0 filas, argumentos válidos";
});

await prisma.$disconnect();

console.log(fallas === 0 ? "\nVERDE: las 7 consultas corren contra Postgres.\n" : `\nROJO: ${fallas} de 7.\n`);
process.exit(fallas === 0 ? 0 : 1);
