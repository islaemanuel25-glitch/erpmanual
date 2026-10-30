// ARMA LA MIGRACIÓN DE LAS FILAS SIN MARGEN CON PRECIO VIEJO (2026-10-30).
//
//   node --import ./scripts/alias-loader.mjs scripts/correcciones/generarCorreccionSinRegla20261030.mjs \
//     --filas <filas.json> --ofertas <ofertas.json> --migracion <migration.sql> --lista <lista.txt>
//
// NO toca la base. Lee las filas activas y las ofertas exportadas de producción
// en solo lectura y escribe la migración —un UPDATE por fila, condicionado a los
// valores exportados— y la lista de lo que no se aplica. La regla de cada fila
// es `preciosSinRegla.mjs`; acá solo se arma el universo y se escribe.
//
// ── EL UNIVERSO ──────────────────────────────────────────────────────────
//
// Toda fila activa sin margen —ni el suyo ni el de la ficha— y sin monto fijo,
// o con margen ≤ 0. Incluye las 252 que la medición llamó "de escala": el
// costo del bulto está bien y la venta quedó vieja (diagnóstico de Emanuel).
//
// ── EL DEPÓSITO TAMBIÉN ALINEA LA FICHA ───────────────────────────────────
//
// Como `editarBase` en `app/api/productos/editar/[id]/route.js`, y solo si la
// ficha y la fila del depósito tenían el mismo precio y el mismo costo.

import fs from "node:fs";
import { decidirSinRegla, ACCION, TIPO } from "./preciosSinRegla.mjs";
// Las "de escala" con monto fijo por unidad suben con su regla: es exactamente
// lo que decide la corrección anterior, así que se usa esa y no una copia.
import { decidirCorreccion } from "./preciosBajoSuRegla.mjs";
import { argumento, basesEnOfertaVigente, deLaUbicacion, leerCsv, moneda, num, sql } from "./comun.mjs";

// ── LO DECIDIDO POR EMANUEL EN EL PEDIDO, FILA POR FILA ───────────────────
const normal = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toUpperCase();
const PRECIO_FIJO = [
  { ubicacion: "depo", nombre: "AZUFRE", precio: 1600 },
  { ubicacion: "mini el 7", nombre: "AZUFRE", precio: 1600 },
  { ubicacion: "Minimarket ayala", nombre: "AZUFRE", precio: 1600 },
  { ubicacion: "mini el 7", nombre: "REXONA X1 ANTIBACTERIAL", precio: 1700 },
  { ubicacion: "Mini unidas", nombre: "OMEPRAZOL", precio: 800 },
];
const A_TREINTA_SIN_TOPE = [
  "ACEITUNAS NEGRAS", "BARRA CREMAC", "BARRA TREMBLAY", "MORTADELA PALADINI", "PALETA FELA",
  "PALETA SADIA", "QUESO CREMOSO CREMAC", "SALAME FELA", "SALAME FOX",
].map((nombre) => ({ ubicacion: "Minimarket ayala", nombre }));
const EXCLUIDAS = [
  (n) => n.includes("PEHUAMAR") && n.includes("450G"),
  (n) => n.includes("QUETH CHISITOS 400G"),
  (n) => n.includes("CAMELL YELLOW 20"),
  (n) => n.includes("GILLETTE MACH 3") && n.includes("X2"),
  (n) => n.includes("GRNIOL"),
];
const usados = new Set();
const busca = (lista, f) => {
  const i = lista.findIndex((e) => e.ubicacion === f.ubicacion && e.nombre === normal(f.nombre));
  if (i >= 0) usados.add(`${lista === PRECIO_FIJO ? "fijo" : "treinta"}:${i}`);
  return i >= 0 ? lista[i] : null;
};

// ── LAS 252 "DE ESCALA" DE LA MEDICIÓN ────────────────────────────────────
//
// Entran todas. 133 no tienen margen y caen en la regla de siempre; el resto SÍ
// tiene margen —el suyo o el de la ficha— y la venta igual quedó vieja: suben a
// lo que da su margen, sin tocarlo. En las dos, las 30 veces se miden contra la
// venta por unidad × el factor, que es como quedó cargada.
const escala = new Set(
  leerCsv(fs.readFileSync(argumento("csv"), "utf8"))
    .filter((r) => r.venta_cargada_por_unidad_en_bulto === "t")
    .map((r) => Number(r.producto_local_id))
);
const factorDe = (f) => (["pack", "cajon"].includes(f.unidadMedida) && num(f.factorPack) > 1 ? num(f.factorPack) : 1);

/** Una fila de monto fijo: la decisión de la corrección anterior, que no toca la regla. */
function conMonto(f, costo, venta) {
  const r = decidirCorreccion({
    nombre: f.nombre, costo, venta, reglaPrecio: f.reglaPrecio, margen: null,
    recargoFijoUnidad: f.recargoFijoUnidad, unidadMedida: f.unidadMedida, factorPack: f.factorPack,
    redondeo100: f.redondeo100 === true, enOfertaVigente: basesEnOferta.has(f.baseId),
  });
  if (r.accion === "APLICAR") return { accion: ACCION.APLICAR, tipo: TIPO.SUBE_A_SU_MARGEN, precioNuevo: r.precioNuevo, margenNuevo: null };
  if (r.accion === "LISTA") return { accion: ACCION.LISTA, motivo: r.motivo, precioNuevo: r.precioNuevo };
  return { accion: ACCION.NADA, precioNuevo: null };
}

const filas = JSON.parse(fs.readFileSync(argumento("filas"), "utf8"));
const ofertas = JSON.parse(fs.readFileSync(argumento("ofertas"), "utf8")) ?? [];
const basesEnOferta = basesEnOfertaVigente(ofertas);

const aplicar = [];
const lista = [];
let sinCosto = 0;
let universo = 0;
for (const f of filas) {
  const enRecargo = f.reglaPrecio === "RECARGO_FIJO_UNIDAD" && num(f.recargoFijoUnidad) !== null && num(f.recargoFijoUnidad) >= 0;
  // El margen de la ficha es el de ANTES de la primera corrección del día: esa
  // tanda le puso 30 a 11 fichas del depósito, y los locales que heredan de
  // ellas pasaron a "tener" un margen que nunca les recalculó el precio —REXONA
  // x1 ANTIBACTERIAL de mini el 7 seguía a $700—. Sin esto quedaban afuera.
  const margenFicha = f.baseMargenAntes !== undefined ? num(f.baseMargenAntes) : num(f.baseMargen);
  const margen = f.plMargen !== null ? num(f.plMargen) : margenFicha;
  const decididaAMano = busca(PRECIO_FIJO, f) !== null || busca(A_TREINTA_SIN_TOPE, f) !== null;
  const deEscala = escala.has(f.id) && !enRecargo;
  // La medición también marcó "de escala" a 115 filas de monto fijo —cartones
  // de cigarrillos a $49.000 contra $49.980 de costo—: la venta está por bulto y
  // apenas abajo del costo, porque nunca se recalculó. Suben con su regla.
  const deEscalaConMonto = escala.has(f.id) && enRecargo;
  const enElUniverso = decididaAMano || deEscala || deEscalaConMonto || (!enRecargo && (margen === null || margen <= 0));
  const excluida = EXCLUIDAS.some((e) => e(normal(f.nombre)));
  if (!enElUniverso && !excluida) continue;
  if (enElUniverso) universo++;

  const costo = deLaUbicacion(f.plCosto, f.baseCosto);
  const venta = deLaUbicacion(f.plVenta, f.baseVenta) ?? 0;
  const r = deEscalaConMonto && !excluida ? conMonto(f, costo, venta) : decidirSinRegla({
    nombre: f.nombre, costo, venta, redondeo100: f.redondeo100 === true,
    enOfertaVigente: basesEnOferta.has(f.baseId),
    excluida,
    precioFijo: busca(PRECIO_FIJO, f)?.precio ?? null,
    aTreintaSinTope: busca(A_TREINTA_SIN_TOPE, f) !== null,
    margenPropio: deEscala && margen !== null && margen > 0 ? margen : null,
    topeSobre: deEscala ? venta * factorDe(f) : null,
  });
  if (r.accion === ACCION.APLICAR) aplicar.push({ f, costo, venta, margen, ...r });
  else if (r.accion === ACCION.LISTA) lista.push({ f, costo, venta, margen, ...r });
  else sinCosto++;
}

const sinEncontrar = [
  ...PRECIO_FIJO.filter((_, i) => !usados.has(`fijo:${i}`)),
  ...A_TREINTA_SIN_TOPE.filter((_, i) => !usados.has(`treinta:${i}`)),
];

const orden = (a, b) => a.f.localId - b.f.localId || a.f.nombre.localeCompare(b.f.nombre);
aplicar.sort(orden);
lista.sort(orden);

// ── LA MIGRACIÓN ─────────────────────────────────────────────────────────
const alineaFicha = (f) => f.esDeposito && num(f.baseVenta) === num(f.plVenta) && num(f.baseCosto) === num(f.plCosto);
const sentencias = aplicar.map(({ f, costo, venta, precioNuevo, margenNuevo }) => {
  // Lo que se escribe: el precio si sube, y el margen y la regla solo si se
  // decidieron acá. Una fila de escala con su margen sube de precio y nada más.
  const sets = [];
  if (precioNuevo !== null) sets.push(`"precio_venta" = ${precioNuevo}`);
  if (margenNuevo !== null) sets.push(`"margen" = ${margenNuevo}`, `"reglaPrecio" = 'MARGEN_PORCENTUAL'`);
  const setsFicha = sets.filter((s) => !s.startsWith('"reglaPrecio"'));
  const cambio = precioNuevo !== null ? `${moneda(venta)} → ${moneda(precioNuevo)}` : `${moneda(venta)} sin cambio`;
  const queMargen = margenNuevo !== null ? `margen ${margenNuevo}` : "su regla, sin tocarla";
  let s =
    `-- ${f.ubicacion} · ${f.nombre.replace(/\s+/g, " ").trim()} · ${moneda(costo)}: ${cambio} · ${queMargen}\n` +
    `UPDATE "ProductoLocal" SET ${sets.join(", ")}, "updatedAt" = CURRENT_TIMESTAMP\n` +
    ` WHERE "id" = ${f.id} AND "precio_venta" IS NOT DISTINCT FROM ${sql(f.plVenta)}` +
    ` AND "precio_costo" IS NOT DISTINCT FROM ${sql(f.plCosto)} AND "margen" IS NOT DISTINCT FROM ${sql(f.plMargen)}` +
    ` AND "reglaPrecio" = '${f.reglaPrecio}' AND "recargoFijoUnidad" IS NOT DISTINCT FROM ${sql(f.recargoFijoUnidad)};`;
  if (alineaFicha(f)) {
    s +=
      `\nUPDATE "ProductoBase" SET ${setsFicha.join(", ")}, "updatedAt" = CURRENT_TIMESTAMP\n` +
      ` WHERE "id" = ${f.baseId} AND "precio_venta" = ${sql(f.baseVenta)} AND "precio_costo" = ${sql(f.baseCosto)}` +
      ` AND "margen" IS NOT DISTINCT FROM ${sql(f.baseMargen)};`;
  }
  return s;
});

const suben = aplicar.filter((a) => a.tipo === TIPO.SUBE_A_30);
const anclados = aplicar.filter((a) => a.tipo === TIPO.ANCLADO);
const conSuMargen = aplicar.filter((a) => a.tipo === TIPO.SUBE_A_SU_MARGEN);
const cabecera = `-- FILAS SIN MARGEN CON PRECIO VIEJO: A 30 %, O CON SU MARGEN ANCLADO.
--
-- Corrección pedida por Emanuel el 2026-10-30. Una fila sin margen —o con
-- margen ≤ 0— nunca se recalcula cuando sube el costo, y la venta se queda en un
-- precio viejo. Generada por
-- scripts/correcciones/generarCorreccionSinRegla20261030.mjs con la regla de
-- scripts/correcciones/preciosSinRegla.mjs (precioDesdeMargen, redondeo de la
-- ficha), sobre el costo del bulto tal como está:
--
--   · ganando menos de 30 % → margen 30 y la venta que da: ${suben.length} filas;
--   · ganando 30 % o más → mismo precio y el margen anclado a un entero que lo
--     conserva: ${anclados.length} filas;
--   · de las 252 "de escala", las que SÍ tienen margen suben a lo que da el
--     suyo, sin tocarlo: ${conSuMargen.length} filas.
--
-- Regla MARGEN_PORCENTUAL en todas. Nunca baja un precio. Lo decidido aparte por
-- Emanuel —precios fijos, fiambres a 30, filas excluidas— está en el generador.
--
-- ── SEGURIDAD ─────────────────────────────────────────────────────────────
--
-- Cada UPDATE exige el precio, el costo, el margen, la regla y el monto fijo
-- exportados: si alguien los cambió, esa fila no se toca.
--
-- ── RESPALDO Y VUELTA ATRÁS ───────────────────────────────────────────────
--
-- Antes de cambiar nada, todas las filas activas con su ficha van a
-- respaldo.backup_precios_ubicacion_20261030_b. Para volver una fila:
--
--   UPDATE "ProductoLocal" pl SET "precio_venta" = r."precio_venta", "margen" = r."margen",
--          "reglaPrecio" = r."reglaPrecio"
--     FROM respaldo.backup_precios_ubicacion_20261030_b r WHERE r."id" = pl."id" AND pl."id" = <id>;
--
-- y en el depósito, lo mismo sobre "ProductoBase" con base_precio_venta y base_margen.

CREATE SCHEMA IF NOT EXISTS respaldo;

CREATE TABLE respaldo.backup_precios_ubicacion_20261030_b AS
SELECT pl."id", pl."localId", pl."baseId", pl."precio_costo", pl."precio_venta", pl."margen",
       pl."reglaPrecio", pl."recargoFijoUnidad",
       b."precio_costo" AS base_precio_costo, b."precio_venta" AS base_precio_venta, b."margen" AS base_margen,
       CURRENT_TIMESTAMP AS respaldado_en
  FROM "ProductoLocal" pl
  JOIN "ProductoBase" b ON b."id" = pl."baseId"
 WHERE pl."activo";
`;
fs.writeFileSync(argumento("migracion"), `${cabecera}\n${sentencias.join("\n\n")}\n`);

// ── LA LISTA ─────────────────────────────────────────────────────────────
let texto = "";
let ubic = null;
for (const { f, costo, venta, precioNuevo, motivo } of lista) {
  if (f.ubicacion !== ubic) { ubic = f.ubicacion; texto += `\n${ubic}\n`; }
  texto += `- ${f.nombre.replace(/\s+/g, " ").trim()} · ${moneda(costo)} → ${moneda(venta)} → ${precioNuevo == null ? "—" : moneda(precioNuevo)} · ${motivo}\n`;
}
fs.writeFileSync(argumento("lista"), texto.trimStart());

const porUbicacion = {};
for (const a of aplicar) {
  const u = (porUbicacion[a.f.ubicacion] ??= { suben: 0, anclados: 0, escalaConSuMargen: 0 });
  if (a.tipo === TIPO.SUBE_A_30) u.suben++;
  else if (a.tipo === TIPO.SUBE_A_SU_MARGEN) u.escalaConSuMargen++;
  else u.anclados++;
}
console.log(JSON.stringify({
  universo, aplicar: aplicar.length, porUbicacion,
  deperdidaAGanancia: aplicar.filter((a) => a.precioNuevo !== null && a.venta < a.costo && a.precioNuevo > a.costo).length,
  escalaEnLaMigracion: aplicar.filter((a) => escala.has(a.f.id)).length,
  escalaEnLaLista: lista.filter((a) => escala.has(a.f.id)).length,
  lista: lista.length, sinCosto, alineanFicha: aplicar.filter((a) => alineaFicha(a.f)).length,
  conMargenNuevoEnFicha: aplicar.filter((a) => alineaFicha(a.f)).length,
  sinEncontrar,
}, null, 2));
