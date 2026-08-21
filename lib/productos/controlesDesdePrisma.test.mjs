// Candados del puente entre Prisma y la clasificación de controles.
//
// ── EL CANDADO QUE IMPORTA ES EL PRIMERO ────────────────────────────────────
//
// `SELECT_CONTROLES_BASE` pedía `reglaPrecio` y `recargoFijoUnidad` a
// `ProductoBase`. Esas dos columnas viven SOLO en `ProductoLocal`. El build
// compiló, los 21 candados del dominio quedaron en verde, y la consulta explotó
// recién contra Postgres con `Unknown field reglaPrecio`.
//
// G1 compara los dos `select` contra `prisma/schema.prisma`. No reemplaza a la
// sonda —que además prueba que la migración se aplicó y que el índice resuelve—,
// pero atrapa esta familia entera sin base de datos y en milisegundos.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  SELECT_CONTROLES_BASE,
  SELECT_CONTROLES_LOCAL,
  filaParaControles,
  contarDesdePrisma,
  filaMarcadaPor,
} from "./controlesDesdePrisma.js";
import { IDS_CONTROL, CONTROL } from "./controlesCalidad.js";

const SCHEMA = fs.readFileSync(
  path.join(process.cwd(), "prisma", "schema.prisma"),
  "utf8"
);

/**
 * Los nombres de campo declarados en un modelo del schema.
 *
 * Saca los comentarios ANTES de mirar. Ya hubo tres candados en este repo que
 * encontraron su patrón dentro de un comentario: dos dieron falso positivo y el
 * tercero —el peor— dio falso VERDE con la comprobación sacada.
 */
function camposDelModelo(nombreModelo) {
  const inicio = SCHEMA.indexOf(`model ${nombreModelo} {`);
  assert.ok(inicio >= 0, `no se encontró el modelo ${nombreModelo}`);
  const fin = SCHEMA.indexOf("\n}", inicio);
  const cuerpo = SCHEMA.slice(inicio, fin).replace(/\/\/[^\n]*/g, "");
  const campos = new Set();
  for (const linea of cuerpo.split("\n").slice(1)) {
    const m = linea.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s+\S/);
    if (m && !m[1].startsWith("@")) campos.add(m[1]);
  }
  return campos;
}

test("G1. cada campo de los dos select existe en su modelo del schema", () => {
  const enBase = camposDelModelo("ProductoBase");
  const enLocal = camposDelModelo("ProductoLocal");

  const faltanEnBase = Object.keys(SELECT_CONTROLES_BASE).filter((c) => !enBase.has(c));
  const faltanEnLocal = Object.keys(SELECT_CONTROLES_LOCAL).filter((c) => !enLocal.has(c));

  assert.deepEqual(
    faltanEnBase,
    [],
    `SELECT_CONTROLES_BASE pide campos que ProductoBase no tiene: ${faltanEnBase.join(", ")}`
  );
  assert.deepEqual(
    faltanEnLocal,
    [],
    `SELECT_CONTROLES_LOCAL pide campos que ProductoLocal no tiene: ${faltanEnLocal.join(", ")}`
  );
});

test("G2. contraprueba de G1: un campo inventado se detecta", () => {
  const enBase = camposDelModelo("ProductoBase");
  // Si el analizador contestara que sí a cualquier cosa, G1 estaría acompañando
  // en vez de afirmando.
  assert.equal(enBase.has("reglaPrecio"), false, "reglaPrecio NO es de ProductoBase");
  assert.equal(enBase.has("recargoFijoUnidad"), false, "recargoFijoUnidad NO es de ProductoBase");
  assert.equal(enBase.has("modalidad"), true, "modalidad SÍ es de ProductoBase");
  assert.equal(camposDelModelo("ProductoLocal").has("reglaPrecio"), true);
});

test("G3. precioRevisadoAt está en el select del local, no en el de la base", () => {
  assert.equal(SELECT_CONTROLES_LOCAL.precioRevisadoAt, true);
  assert.equal(SELECT_CONTROLES_BASE.precioRevisadoAt, undefined);
});

test("G4. sin ProductoLocal la regla es MARGEN_PORCENTUAL, igual que el mapper", () => {
  // `mergeBaseLocalToUi` resuelve `local?.reglaPrecio ?? "MARGEN_PORCENTUAL"`.
  // Si acá se contestara otra cosa, el control diría "falta regla" sobre un
  // producto que la pantalla muestra con margen.
  const fila = filaParaControles({ id: 1, margen: 30, precio_costo: 100, precio_venta: 200 }, null);
  assert.equal(fila.reglaPrecio, "MARGEN_PORCENTUAL");
  assert.equal(fila.recargoFijoUnidad, null);
});

test("G5. la regla del local gana y NO se hereda de la base", () => {
  const base = { id: 1, margen: 30, precio_costo: 100, precio_venta: 200 };
  const local = { id: 9, localId: 3, reglaPrecio: "RECARGO_FIJO_UNIDAD", recargoFijoUnidad: 50 };
  const fila = filaParaControles(base, local);
  assert.equal(fila.reglaPrecio, "RECARGO_FIJO_UNIDAD");
  assert.equal(Number(fila.recargoFijoUnidad), 50);
});

test("G6. el precio y el costo del local pisan a los de la ficha; en null se heredan", () => {
  const base = { id: 1, precio_costo: 100, precio_venta: 200, margen: 30 };
  const conOverride = filaParaControles(base, { id: 9, localId: 3, precio_venta: 250 });
  assert.equal(Number(conOverride.precio_venta), 250, "el override gana");
  assert.equal(Number(conOverride.precio_costo), 100, "sin override se hereda");
});

test("G7. precioRevisadoAt NO se hereda de la ficha ni de otro local", () => {
  const base = { id: 1, precio_costo: 100, precio_venta: 200, precioRevisadoAt: new Date() };
  const fila = filaParaControles(base, { id: 9, localId: 3 });
  assert.equal(
    fila.precioRevisadoAt,
    null,
    "revisar el precio de una ubicación no dice nada sobre el de otra"
  );
});

test("G8. la modalidad sale de la ficha aunque el local mande otra cosa", () => {
  const fila = filaParaControles(
    { id: 1, modalidad: "IMPORTE_VARIABLE", precio_costo: 0, precio_venta: 0 },
    { id: 9, localId: 3, modalidad: "NORMAL" }
  );
  assert.equal(fila.modalidad, "IMPORTE_VARIABLE", "un producto no es servicio en un local y mercadería en otro");
});

test("G9. contador y filtro no se pueden separar: son la misma función", () => {
  const ahora = new Date("2026-08-20T12:00:00Z");
  const viejo = new Date("2026-01-01T00:00:00Z");
  const filas = [
    // Sano y revisado hace poco: no lo marca ninguno.
    {
      id: 1, precio_costo: 100, precio_venta: 200, margen: 100, modalidad: "NORMAL",
      unidad_medida: "UNIDAD",
      locales: [{ id: 1, localId: 3, reglaPrecio: "MARGEN_PORCENTUAL", precioRevisadoAt: ahora }],
    },
    // Precio viejo y sin regla.
    {
      id: 2, precio_costo: 100, precio_venta: 100, margen: null, modalidad: "NORMAL",
      unidad_medida: "UNIDAD",
      locales: [{ id: 2, localId: 3, reglaPrecio: "MARGEN_PORCENTUAL", precioRevisadoAt: viejo }],
    },
    // Sin ProductoLocal: nunca revisado.
    { id: 3, precio_costo: 100, precio_venta: 300, margen: 200, modalidad: "NORMAL", unidad_medida: "UNIDAD", locales: [] },
  ];

  const conteo = contarDesdePrisma(filas, ahora);
  for (const id of IDS_CONTROL) {
    const porFiltro = filas.filter((f) => filaMarcadaPor(id, f, ahora)).length;
    assert.equal(porFiltro, conteo[id], `${id}: el filtro dice ${porFiltro} y el contador ${conteo[id]}`);
  }
  assert.equal(conteo[CONTROL.PRECIO_VENCIDO], 2, "el viejo y el que nunca se revisó");
  assert.equal(conteo[CONTROL.SIN_REGLA], 1);
});
