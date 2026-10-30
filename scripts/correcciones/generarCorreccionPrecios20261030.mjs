// ARMA LA MIGRACIÓN DE LA CORRECCIÓN DE PRECIOS DEL 2026-10-30.
//
//   node --import ./scripts/alias-loader.mjs scripts/correcciones/generarCorreccionPrecios20261030.mjs \
//     --csv <medición.csv> --filas <filas.json> --ofertas <ofertas.json> \
//     --migracion <ruta de migration.sql> --lista <ruta de la lista.txt>
//
// NO toca la base. Lee tres archivos ya exportados de producción en solo
// lectura —la medición del día, las filas activas de hoy y las ofertas— y
// escribe dos: la migración con un UPDATE por fila, y la lista de lo que no se
// aplica. Un paso de datos que corre en producción va como migración (CLAUDE.md,
// "Scripts que tocan la base"), así que esto solo la redacta.
//
// ── EL UNIVERSO SALE DE LA MEDICIÓN, LOS NÚMEROS DE HOY ───────────────────
//
// Entran las filas que la medición marcó por debajo de su regla o a pérdida, y
// salen las de escala —un pack con la venta cargada por unidad—, que van en otra
// tanda. El precio se calcula con el costo y el precio que la fila tiene AHORA,
// y cada UPDATE exige que sigan siendo esos: si alguien los movió entre la
// exportación y el despliegue, la fila no se toca.
//
// ── EL DEPÓSITO TAMBIÉN ALINEA LA FICHA ───────────────────────────────────
//
// Editar un producto en el depósito escribe la ficha y la fila del depósito
// juntas (`editarBase`, `app/api/productos/editar/[id]/route.js`). La corrección
// hace lo mismo, y solo si las dos tenían el mismo precio.

import fs from "node:fs";
import { decidirCorreccion, ACCION } from "./preciosBajoSuRegla.mjs";
import { ofertaVigente } from "../../lib/ofertas/vigencia.js";

function argumento(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  if (i < 0 || !process.argv[i + 1]) {
    console.error(`Falta --${nombre}`);
    process.exit(2);
  }
  return process.argv[i + 1];
}

/** CSV con comillas, como lo escribe `\copy ... csv header`. */
function leerCsv(texto) {
  const filas = [];
  let campo = "";
  let fila = [];
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') entreComillas = false;
      else campo += c;
    } else if (c === '"') entreComillas = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
  const [cabecera, ...resto] = filas;
  return resto.filter((f) => f.length === cabecera.length).map((f) => Object.fromEntries(cabecera.map((h, i) => [h, f[i]])));
}

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
/** El de la ubicación si es un número de verdad y no cero; si no, el de la ficha (`precioDeLaUbicacion`). */
const deLaUbicacion = (local, ficha) => (num(local) ? num(local) : num(ficha));
const sql = (v) => (v === null || v === undefined ? "NULL" : String(Number(v)));
const conZona = (v) => (v == null ? null : /[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v}Z`);
const moneda = (v) => {
  const s = Number(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$${s.endsWith(",00") ? s.slice(0, -3) : s}`;
};

const medicion = leerCsv(fs.readFileSync(argumento("csv"), "utf8"));
const universo = new Set(
  medicion
    .filter((r) => r.venta_cargada_por_unidad_en_bulto !== "t" && (r.bajo_su_regla === "t" || r.a_perdida === "t"))
    .map((r) => Number(r.producto_local_id))
);
const filas = JSON.parse(fs.readFileSync(argumento("filas"), "utf8"));
const ofertas = JSON.parse(fs.readFileSync(argumento("ofertas"), "utf8")) ?? [];

const ahora = new Date();
const basesEnOferta = new Set(
  ofertas
    .filter((o) => ofertaVigente({ ...o, publicadaEn: conZona(o.publicadaEn), finalizadaEn: conZona(o.finalizadaEn), inicioEn: conZona(o.inicioEn), finEn: conZona(o.finEn) }, ahora))
    .flatMap((o) => o.bases ?? [])
);

const aplicar = [];
const lista = [];
let noSube = 0;
let faltan = 0;
const porId = new Map(filas.map((f) => [f.id, f]));
for (const id of universo) {
  const f = porId.get(id);
  if (!f) { faltan++; continue; }
  const costo = deLaUbicacion(f.plCosto, f.baseCosto);
  const venta = deLaUbicacion(f.plVenta, f.baseVenta) ?? 0;
  const margen = f.plMargen !== null ? num(f.plMargen) : num(f.baseMargen);
  const r = decidirCorreccion({
    nombre: f.nombre, costo, venta, reglaPrecio: f.reglaPrecio, margen,
    recargoFijoUnidad: f.recargoFijoUnidad, unidadMedida: f.unidadMedida, factorPack: f.factorPack,
    redondeo100: f.redondeo100 === true, enOfertaVigente: basesEnOferta.has(f.baseId),
  });
  if (r.accion === ACCION.APLICAR) aplicar.push({ f, costo, venta, ...r });
  else if (r.accion === ACCION.LISTA) lista.push({ f, costo, venta, ...r });
  else noSube++;
}

aplicar.sort((a, b) => a.f.localId - b.f.localId || a.f.nombre.localeCompare(b.f.nombre));
lista.sort((a, b) => a.f.localId - b.f.localId || a.f.nombre.localeCompare(b.f.nombre));

// ── LA MIGRACIÓN ─────────────────────────────────────────────────────────
const sentencias = aplicar.map(({ f, precioNuevo, margenNuevo, venta, costo }) => {
  const margen = margenNuevo !== null ? `, "margen" = ${margenNuevo}` : "";
  const local =
    `-- ${f.ubicacion} · ${f.nombre.replace(/\s+/g, " ").trim()} · ${moneda(costo)}: ${moneda(venta)} → ${moneda(precioNuevo)}\n` +
    `UPDATE "ProductoLocal" SET "precio_venta" = ${precioNuevo}${margen}, "updatedAt" = CURRENT_TIMESTAMP\n` +
    ` WHERE "id" = ${f.id} AND "precio_venta" IS NOT DISTINCT FROM ${sql(f.plVenta)}` +
    ` AND "precio_costo" IS NOT DISTINCT FROM ${sql(f.plCosto)} AND "margen" IS NOT DISTINCT FROM ${sql(f.plMargen)};`;
  const alineaFicha = f.esDeposito && num(f.baseVenta) === num(f.plVenta) && num(f.baseCosto) === num(f.plCosto);
  if (!alineaFicha) return local;
  return (
    local +
    `\nUPDATE "ProductoBase" SET "precio_venta" = ${precioNuevo}${margen}, "updatedAt" = CURRENT_TIMESTAMP\n` +
    ` WHERE "id" = ${f.baseId} AND "precio_venta" = ${sql(f.baseVenta)} AND "precio_costo" = ${sql(f.baseCosto)};`
  );
});

const cabecera = `-- PRECIOS POR DEBAJO DE SU PROPIA REGLA O A PÉRDIDA: SE SUBEN A LO QUE DA SU REGLA.
--
-- Corrección pedida por Emanuel el 2026-10-30 sobre la medición del mismo día
-- (/home/emanuel/mediciones/precios-por-ubicacion-20261030.csv). Generada por
-- scripts/correcciones/generarCorreccionPrecios20261030.mjs con la regla de
-- scripts/correcciones/preciosBajoSuRegla.mjs: el precio sale de
-- precioDesdeMargen / precioDesdeRecargoUnidad, con el redondeo de la ficha.
--
--   · Margen > 0 → su margen; monto fijo → costo + su monto; margen ≤ 0 o sin
--     regla → 30 %, y se guarda margen 30. En las demás no se toca el margen.
--   · Nunca baja un precio. No entran: las filas de escala, las de más del
--     doble, las promos y las de margen positivo a pérdida (van en una lista).
--
-- ── SEGURIDAD ─────────────────────────────────────────────────────────────
--
-- Cada UPDATE exige el precio, el costo y el margen que la fila tenía al
-- generarse: si alguien los cambió, esa fila no se toca.
--
-- ── RESPALDO Y VUELTA ATRÁS ───────────────────────────────────────────────
--
-- Antes de cambiar nada se copian todas las filas activas a
-- respaldo.backup_precios_ubicacion_20261030 —en un esquema aparte, para que
-- Prisma no la tome por una tabla suya—. Para volver una fila:
--
--   UPDATE "ProductoLocal" pl SET "precio_venta" = r."precio_venta", "margen" = r."margen"
--     FROM respaldo.backup_precios_ubicacion_20261030 r WHERE r."id" = pl."id" AND pl."id" = <id>;
--
-- y en el depósito, lo mismo sobre "ProductoBase" con base_precio_venta y base_margen.
--
-- Filas que suben: ${aplicar.length}.

CREATE SCHEMA IF NOT EXISTS respaldo;

CREATE TABLE respaldo.backup_precios_ubicacion_20261030 AS
SELECT pl."id", pl."localId", pl."baseId", pl."precio_costo", pl."precio_venta", pl."margen",
       pl."reglaPrecio", pl."recargoFijoUnidad",
       b."precio_venta" AS base_precio_venta, b."margen" AS base_margen,
       CURRENT_TIMESTAMP AS respaldado_en
  FROM "ProductoLocal" pl
  JOIN "ProductoBase" b ON b."id" = pl."baseId"
 WHERE pl."activo";
`;

fs.writeFileSync(argumento("migracion"), `${cabecera}\n${sentencias.join("\n\n")}\n`);

// ── LA LISTA ─────────────────────────────────────────────────────────────
const regla = (f, margen) =>
  f.reglaPrecio === "RECARGO_FIJO_UNIDAD" ? `monto fijo ${moneda(f.recargoFijoUnidad)}` : margen === null ? "sin regla" : `margen ${margen} %`;
let texto = "";
let ubic = null;
for (const { f, costo, venta, precioNuevo, motivo } of lista) {
  if (f.ubicacion !== ubic) { ubic = f.ubicacion; texto += `\n${ubic}\n`; }
  const daria = precioNuevo == null ? "—" : moneda(precioNuevo);
  const margen = f.plMargen !== null ? num(f.plMargen) : num(f.baseMargen);
  texto += `- ${f.nombre.replace(/\s+/g, " ").trim()} · ${moneda(costo)} → ${moneda(venta)} → ${daria} · ${motivo} (${regla(f, margen)})\n`;
}
fs.writeFileSync(argumento("lista"), texto.trimStart());

const porUbicacion = {};
for (const { f } of aplicar) porUbicacion[f.ubicacion] = (porUbicacion[f.ubicacion] ?? 0) + 1;
const deperdidaAGanancia = aplicar.filter(({ venta, costo, precioNuevo }) => venta < costo && precioNuevo > costo).length;
console.log(JSON.stringify({
  universo: universo.size, aplicar: aplicar.length, porUbicacion, deperdidaAGanancia,
  lista: lista.length, noSube, faltan, basesEnOferta: basesEnOferta.size,
  alineanFicha: aplicar.filter(({ f }) => f.esDeposito && num(f.baseVenta) === num(f.plVenta) && num(f.baseCosto) === num(f.plCosto)).length,
}, null, 2));
