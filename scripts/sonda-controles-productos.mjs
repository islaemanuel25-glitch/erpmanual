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
  contarPresentacionesDesdePrisma,
  filaMarcadaPorPresentacion,
  opcionesDelTecho,
  TECHO_CONTROL,
} = await import("../lib/productos/controlesDesdePrisma.js");
const { IDS_CONTROL } = await import("../lib/productos/controlesCalidad.js");
const { IDS_PRESENTACION, IDS_VENTA, IDS_COMPRA } = await import(
  "../lib/productos/presentaciones.js"
);

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

// 1-bis. LOS ARGUMENTOS DE CORTE, tal cual los pasan las dos rutas.
//
// `orderBy` es un ARGUMENTO de Prisma, así que se valida contra Postgres y no
// contra el build: un campo mal escrito ahí sale `Unknown argument` en la
// consulta y en ningún otro lado. Es la misma familia que el `reglaPrecio` que
// esta sonda ya atrapó una vez.
//
// Y el orden se comprueba de verdad —que las filas vuelvan crecientes por id—,
// no solo que la consulta no explote: un `orderBy` que Prisma acepte pero que no
// ordene dejaría el corte tan indeterminado como antes.
await ejercer("techo y orden compartidos, contra Postgres", async () => {
  const r = await prisma.productoBase.findMany({
    ...opcionesDelTecho(),
    select: { id: true },
  });
  const ordenadas = r.every((f, i) => i === 0 || f.id > r[i - 1].id);
  if (!ordenadas) throw new Error("las filas no volvieron ordenadas por id");
  return `${r.length} filas ordenadas · techo ${TECHO_CONTROL}`;
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

// ── LAS PRESENTACIONES, SOBRE LAS MISMAS FILAS ─────────────────────────────
//
// Los cinco campos que agrega esta clasificación —`modo_envio`,
// `modoCompraProveedor`, `pesoEsFijo`, `modoVentaDeposito` y `es_combo`— viajan
// en el MISMO select, así que si alguno no existiera en la base la consulta de
// arriba ya habría fallado. Lo que estos pasos agregan es lo que un select
// válido no prueba: que la clasificación conteste sobre filas reales, y que el
// contador y el filtro den el mismo número.

// 8. La ubicación de prueba: `es_deposito` es un argumento más y se valida igual.
let esDeposito = false;
await ejercer("es_deposito de la ubicación, tal cual lo pide la ruta", async () => {
  const l = await prisma.local.findUnique({
    where: { id: localId },
    select: { es_deposito: true },
  });
  esDeposito = l?.es_deposito === true;
  return esDeposito ? "es depósito" : "es local (o no existe)";
});

// 9. Clasificar filas REALES. Un campo que no viaje llega `undefined` y la
//    clasificación contesta con confianza una respuesta equivocada — que es
//    exactamente cómo se rompió el fiambre de pieza fija en este repo.
await ejercer("clasificar las presentaciones de las filas traídas", () => {
  const conteo = contarPresentacionesDesdePrisma(filas, esDeposito);
  const faltantes = IDS_PRESENTACION.filter((id) => typeof conteo[id] !== "number");
  if (faltantes.length > 0) throw new Error(`el conteo no trajo: ${faltantes.join(", ")}`);
  const venta = IDS_VENTA.map((id) => `${id}=${conteo[id]}`).join(" ");
  const compra = IDS_COMPRA.map((id) => `${id}=${conteo[id]}`).join(" ");
  return `${venta} · ${compra}`;
});

// 10. Contador y filtro, fila por fila. Es el criterio del pedido —el número de
//     la card tiene que ser el total de la lista que abre— comprobado sobre datos
//     reales y no por construcción.
await ejercer("el filtro de presentación coincide con el contador, fila por fila", () => {
  const conteo = contarPresentacionesDesdePrisma(filas, esDeposito);
  const desacuerdos = [];
  for (const id of IDS_PRESENTACION) {
    const porFiltro = filas.filter((f) => filaMarcadaPorPresentacion(id, f, esDeposito)).length;
    if (porFiltro !== conteo[id]) {
      desacuerdos.push(`${id}: filtro ${porFiltro} vs contador ${conteo[id]}`);
    }
  }
  if (desacuerdos.length > 0) throw new Error(desacuerdos.join("; "));
  return "las ocho coinciden";
});

// 11. NINGÚN PRODUCTO CAE EN DOS CARDS DEL MISMO GRUPO. Si pasara, la suma de las
//     cards superaría el catálogo y ninguna diría la verdad sobre su lista.
await ejercer("cada fila cae en una sola card por grupo", () => {
  let dobles = 0;
  for (const f of filas) {
    if (IDS_VENTA.filter((id) => filaMarcadaPorPresentacion(id, f, esDeposito)).length > 1) dobles += 1;
    if (IDS_COMPRA.filter((id) => filaMarcadaPorPresentacion(id, f, esDeposito)).length > 1) dobles += 1;
  }
  if (dobles > 0) throw new Error(`${dobles} filas caen en más de una card de su grupo`);
  return `${filas.length} filas, ninguna repetida`;
});

// 12. LA UBICACIÓN CAMBIA LA RESPUESTA, o no está llegando. Se clasifica el mismo
//     conjunto como depósito y como local: si el fiambre de pieza fija existe en
//     los datos, los dos conteos tienen que diferir. Si no existe, se DICE — un
//     caso que no ocurre en la base de prueba pasa en verde igual, y este repo ya
//     pagó eso una vez con los combos.
await ejercer("la ubicación cambia la clasificación de venta", () => {
  const comoDeposito = contarPresentacionesDesdePrisma(filas, true);
  const comoLocal = contarPresentacionesDesdePrisma(filas, false);
  const difieren = IDS_VENTA.filter((id) => comoDeposito[id] !== comoLocal[id]);
  if (difieren.length > 0) return `difieren en ${difieren.join(", ")} — la ubicación llega`;
  return "NO EJERCIDO: en estos datos ningún producto cambia de escala entre depósito y local";
});

// 13. El `where` del filtro por presentación en el listado, con ids reales.
await ejercer("where del filtro por presentación en el listado", async () => {
  const ids = filas
    .filter((f) => filaMarcadaPorPresentacion(IDS_VENTA[1], f, esDeposito))
    .slice(0, 50)
    .map((f) => f.id);
  const n = await prisma.productoBase.count({ where: { AND: [{ activo: true }, { id: { in: ids } }] } });
  return `${n} de ${ids.length} marcados por ${IDS_VENTA[1]}`;
});

await prisma.$disconnect();

console.log(
  fallas === 0
    ? "\nVERDE: las 13 consultas corren contra Postgres.\n"
    : `\nROJO: ${fallas} de 13.\n`
);
process.exit(fallas === 0 ? 0 : 1);
