// LA CORRECCIÓN DE LOS CUATRO COSTOS DEL PEDIDO 245.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/costosDelPedido245.test.mjs
//
// ── QUÉ SE ESTÁ DEFENDIENDO ───────────────────────────────────────────────
//
// El 245 se cerró antes de `9af324bf`, cuando el precio de cada producto era
// neto + IVA. Los cuatro renglones que se cerraron con "Aceptar el precio
// nuevo" escribieron un costo deflactado en la percepción —2,48 %, que es el
// 3 % del papel medido sobre el precio con IVA— y la migración
// `20260923120000_costo_con_el_pie_del_245` los corrige.
//
// Una migración de datos no se puede correr dos veces para ver si anduvo, así
// que lo que se afirma acá es lo que SÍ se puede afirmar sin base: que los
// números que escribe son los que produce el motor, que toca exactamente los
// cuatro productos y ninguno más, y que cada UPDATE puede correr de nuevo sin
// pisar una corrección posterior.
//
// Es la misma forma que tiene el candado de la hamburguesa del 242.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";


const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SQL = fs.readFileSync(
  path.join(RAIZ, "prisma/migrations/20260923120000_costo_con_el_pie_del_245/migration.sql"),
  "utf8"
);
/** El SQL sin comentarios: acá se cuentan sentencias, no prosa. */
const SENTENCIAS = SQL.replace(/^--[^\n]*$/gm, "");

/**
 * Los cuatro renglones que se cerraron con ACEPTA_FACTURA, con el producto
 * que resolvió cada uno. Los `orden` y los `baseId` salen de la base: son las
 * cuatro filas de `DecisionDePrecioProveedor` con esa decisión para Arcor.
 */
const ACEPTADOS = [
  { orden: 6, baseId: 1715, nombre: "MOGUL COLMILLOS 30g", pack: 12, costoViejo: 6131.82, costoNuevo: 6283.85 },
  { orden: 14, baseId: 1716, nombre: "MOGUL MONSTRUITOS 30g", pack: 10, costoViejo: 6131.82, costoNuevo: 6283.85 },
  { orden: 15, baseId: 2029, nombre: "Furtilla Extreme x500", pack: 83, costoViejo: 6968.54, costoNuevo: 7141.31 },
  { orden: 20, baseId: 1111, nombre: "MOGUL CEREBRITOS 30G", pack: 12, costoViejo: 6131.82, costoNuevo: 6283.85 },
];

// ── EL CANDADO QUE COMPARABA CONTRA EL MOTOR SE FUE CON EL MOTOR ──────────
//
// Había uno más: rehacía los cuatro costos con el reparto del pie de entonces
// (`repartoDelPie`) y los comparaba contra los del SQL. Ese motor de formato se
// borró en la segunda parte de la lectura interpretada (#165) —el costo final
// ahora lo da el modelo por renglón—, y la migración ya está aplicada en
// producción desde 2026-09. Lo que queda acá es lo que el SQL afirma por sí
// mismo: qué escribe, a quién no toca y que puede correr de nuevo.

test("LA DIFERENCIA ES LA DE LA PERCEPCIÓN, NO OTRA COSA", () => {
  // 3 % sobre el neto es 2,48 % sobre el precio con IVA.
  for (const p of ACEPTADOS) {
    const dif = (p.costoNuevo / p.costoViejo - 1) * 100;
    assert.ok(Math.abs(dif - 2.48) < 0.01, `${p.nombre} se movió ${dif.toFixed(2)} %`);
  }
});

test("Y ESOS CUATRO COSTOS ESTÁN ESCRITOS EN EL SQL", () => {
  for (const p of ACEPTADOS) {
    assert.ok(
      new RegExp(`id = ${p.baseId}\\b`).test(SENTENCIAS),
      `la migración no nombra la base ${p.baseId} (${p.nombre})`
    );
    assert.ok(
      new RegExp(`"baseId" = ${p.baseId}\\b`).test(SENTENCIAS),
      `la migración no propaga a los locales de la base ${p.baseId}`
    );
  }
  assert.ok(SENTENCIAS.includes("precio_costo = 6283.85"));
  assert.ok(SENTENCIAS.includes("precio_costo = 7141.31"));
});

test("NO TOCA NINGUNO DE LOS QUE SE CERRARON CON «DEJAR EL QUE TENÍA»", () => {
  // Son quince, y su costo NO salió del papel: la percepción no los alcanza.
  // Tocarlos sería deshacer una decisión de Emanuel.
  const DEJA_EL_MIO = [105, 271, 317, 340, 415, 424, 608, 1083, 1084, 1126, 1147, 1547, 1995, 2137, 3199];
  for (const baseId of DEJA_EL_MIO) {
    assert.ok(
      !new RegExp(`id = ${baseId}\\b|"baseId" = ${baseId}\\b`).test(SENTENCIAS),
      `la migración toca la base ${baseId}, que se cerró con "Dejar el que tenía"`
    );
  }

  // Y no toca nada más que productos y renglones: nada de decisiones, nada de
  // ventas, nada de stock.
  const tablas = [...SENTENCIAS.matchAll(/UPDATE\s+"([A-Za-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(tablas)].sort(),
    ["ComprobanteLinea", "ProductoBase", "ProductoLocal"],
    `toca tablas que no corresponden: ${[...new Set(tablas)].join(", ")}`
  );
});

test("CADA UPDATE PUEDE CORRER DE NUEVO SIN PISAR UNA CORRECCIÓN POSTERIOR", () => {
  // Es la propiedad que hace que una migración de datos sea segura: lleva en el
  // WHERE el valor que corrige, así que si alguien ya lo arregló a mano, o si
  // el precio cambió por otro lado, no toca esa fila.
  const updates = SENTENCIAS.split(/;\s*/).filter((s) => /UPDATE/i.test(s));
  assert.ok(updates.length >= 10, `solo se encontraron ${updates.length} UPDATE`);

  for (const u of updates) {
    assert.ok(/WHERE/i.test(u), `un UPDATE sin WHERE: ${u.slice(0, 60)}`);
    const tocaProducto = /"Producto(Base|Local)"/.test(u);
    if (tocaProducto) {
      assert.ok(
        /precio_costo\s*=\s*[\d.]+\s+AND\s+precio_venta\s*=\s*[\d.]+/i.test(u.split(/WHERE/i)[1]),
        `un UPDATE de producto sin guarda por costo Y venta: ${u.slice(0, 80)}`
      );
    } else {
      assert.ok(
        /"costoFinalUnitario"\s*=\s*[\d.]+/.test(u.split(/WHERE/i)[1]),
        `un UPDATE de renglón sin guarda por su costo: ${u.slice(0, 80)}`
      );
    }
  }
});

test("EL RASTRO VA EN EL RENGLÓN, Y NO EN LA DECISIÓN", () => {
  // `costoFinalUnitario` es el costo que esa línea produjo y se corrige con
  // ella. `costoPrevioAplicacion` NO se toca: significa lo que el producto tenía
  // antes de que la línea lo pisara, que fueron $5.815 / $6.106 / $5.930.
  // Y las decisiones tampoco: guardan los dos precios tal como se le mostraron
  // a quien decidió, y reescribirlos falsearía el registro.
  assert.match(SENTENCIAS, /UPDATE "ComprobanteLinea"/);
  assert.ok(!/costoPrevioAplicacion/.test(SENTENCIAS));
  assert.ok(!/DecisionDePrecioProveedor/.test(SENTENCIAS));
});
