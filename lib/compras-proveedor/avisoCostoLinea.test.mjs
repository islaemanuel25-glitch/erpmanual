// Candados del aviso de costo distinto.
//
// EJERCITAN EL COMPORTAMIENTO, NO LA FORMA. Van dos veces que una captura
// encuentra lo que el candado dejó pasar —C-14 con `checkPerm`, y la vuelta del
// pedido sin proveedor— y las dos por comprobar que algo estuviera escrito en
// vez de que funcionara.
//
// Acá entra una línea con un precio y sale una señal, y el candado compara la
// señal. Los dos casos de la tanda están explícitos: precio distinto → aparece,
// precio igual → no aparece.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/avisoCostoLinea.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compararCostoLinea, textoAvisoCosto, UMBRAL_CENTAVOS } from "./avisoCostoLinea.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const suelto = { factor_pack: 1 };
const pack = (f = 24) => ({ factor_pack: f });
const fiambre = { modoCompraProveedor: "UNIDAD" };
const porKg = { unidad_medida: "kg" };

// ===========================================================================
// LOS DOS CASOS DE LA TANDA
// ===========================================================================

test("precio DISTINTO al del catálogo → el aviso APARECE", () => {
  const r = compararCostoLinea({
    precioLinea: 1500, unidad: "BULTO", costoCatalogo: 1200, base: suelto,
  });
  assert.equal(r.hayDiferencia, true);
  assert.equal(r.costoLinea, 1500);
  assert.equal(r.costoCatalogo, 1200);
  assert.equal(r.diferencia, 300);
  assert.equal(r.sentido, "sube");
});

test("precio IGUAL al del catálogo → el aviso NO aparece", () => {
  const r = compararCostoLinea({
    precioLinea: 1200, unidad: "BULTO", costoCatalogo: 1200, base: suelto,
  });
  assert.equal(r.hayDiferencia, false);
  assert.equal(r.sentido, null);
  assert.equal(r.diferencia, 0);
});

test("un precio MÁS BARATO también avisa, y dice que baja", () => {
  // Que baje también importa: puede ser una bonificación real o un error de
  // tipeo, y las dos cosas merecen una mirada.
  const r = compararCostoLinea({
    precioLinea: 900, unidad: "BULTO", costoCatalogo: 1200, base: suelto,
  });
  assert.equal(r.hayDiferencia, true);
  assert.equal(r.sentido, "baja");
  assert.equal(r.diferencia, -300);
});

// ===========================================================================
// LA COMPARACIÓN MIDE LO MISMO DE LOS DOS LADOS
// ===========================================================================

test("una línea por UNIDAD se compara contra el maestro POR BULTO", () => {
  // 50 la unidad × 24 = 1200 por bulto, que es lo que guarda el catálogo. Sin la
  // conversión, 50 contra 1200 encendería el aviso en TODAS las líneas de pack
  // cargadas por unidad.
  const r = compararCostoLinea({
    precioLinea: 50, unidad: "UNIDAD", costoCatalogo: 1200, base: pack(24),
  });
  assert.equal(r.costoLinea, 1200);
  assert.equal(r.hayDiferencia, false);
});

test("una línea por BULTO no se vuelve a multiplicar", () => {
  const r = compararCostoLinea({
    precioLinea: 1200, unidad: "BULTO", costoCatalogo: 1200, base: pack(24),
  });
  assert.equal(r.costoLinea, 1200);
  assert.equal(r.hayDiferencia, false);
});

test("fiambre y kg se comparan por kg, sin factor", () => {
  for (const base of [fiambre, porKg]) {
    const r = compararCostoLinea({
      precioLinea: 8500, unidad: "UNIDAD", costoCatalogo: 8500, base: { ...base, factor_pack: 10 },
    });
    assert.equal(r.hayDiferencia, false, "el factor no debería entrar");
  }
});

// ===========================================================================
// EL UMBRAL — un peso, medido contra el ruido real de la base
// ===========================================================================

test("el ruido de teclear el unitario de un pack NO enciende el aviso", () => {
  // Casos reales de erpazul_al: alguien carga la línea por unidad y teclea el
  // unitario ya redondeado a centavos. Al volver a bulto quedan centavos de
  // diferencia que no son un cambio de precio.
  const casos = [
    { cat: 23500, factor: 24, unit: 979.17 },   // ruido +0,08
    { cat: 1480, factor: 18, unit: 82.22 },     // ruido −0,04
    { cat: 999, factor: 7, unit: 142.71 },      // ruido −0,03
  ];
  for (const c of casos) {
    const r = compararCostoLinea({
      precioLinea: c.unit, unidad: "UNIDAD", costoCatalogo: c.cat, base: pack(c.factor),
    });
    assert.equal(
      r.hayDiferencia,
      false,
      `catálogo ${c.cat} × factor ${c.factor}: el ruido de ${r.diferencia} encendió el aviso`
    );
  }
});

test("el umbral es de UN PESO, y se ejerce en los dos bordes", () => {
  assert.equal(UMBRAL_CENTAVOS, 100);
  const bajo = compararCostoLinea({
    precioLinea: 1200.99, unidad: "BULTO", costoCatalogo: 1200, base: suelto,
  });
  const justo = compararCostoLinea({
    precioLinea: 1201, unidad: "BULTO", costoCatalogo: 1200, base: suelto,
  });
  assert.equal(bajo.hayDiferencia, false, "99 centavos todavía es ruido");
  assert.equal(justo.hayDiferencia, true, "un peso ya es una diferencia");
});

test("el umbral vale para los dos lados", () => {
  assert.equal(
    compararCostoLinea({ precioLinea: 1199.01, unidad: "BULTO", costoCatalogo: 1200, base: suelto }).hayDiferencia,
    false
  );
  assert.equal(
    compararCostoLinea({ precioLinea: 1199, unidad: "BULTO", costoCatalogo: 1200, base: suelto }).hayDiferencia,
    true
  );
});

// ===========================================================================
// CUANDO NO HAY NADA QUE COMPARAR, NO SE AVISA
// ===========================================================================

test("sin costo en el catálogo no se avisa", () => {
  // Un producto recién creado sin costo cargado encendería el aviso en cada
  // línea, y el aviso dejaría de significar algo.
  for (const cat of [0, null, undefined, "", -100, NaN, "abc"]) {
    const r = compararCostoLinea({
      precioLinea: 1500, unidad: "BULTO", costoCatalogo: cat, base: suelto,
    });
    assert.equal(r.hayDiferencia, false, `costoCatalogo ${JSON.stringify(cat)} no debería avisar`);
  }
});

test("sin precio en la línea no se avisa", () => {
  for (const p of [0, null, undefined, "", -50, NaN, "abc"]) {
    const r = compararCostoLinea({
      precioLinea: p, unidad: "BULTO", costoCatalogo: 1200, base: suelto,
    });
    assert.equal(r.hayDiferencia, false, `precioLinea ${JSON.stringify(p)} no debería avisar`);
  }
});

test("nunca devuelve NaN ni undefined en la diferencia", () => {
  for (const [p, c] of [[NaN, 1200], [1500, NaN], [null, null], ["x", "y"]]) {
    const r = compararCostoLinea({ precioLinea: p, unidad: "BULTO", costoCatalogo: c, base: suelto });
    assert.equal(Number.isFinite(r.diferencia), true);
  }
});

// ===========================================================================
// El texto: dice los dos números y qué hacer
// ===========================================================================

test("el texto nombra los dos importes y el lápiz", () => {
  const cmp = compararCostoLinea({
    precioLinea: 1500, unidad: "BULTO", costoCatalogo: 1200, base: suelto,
  });
  const t = textoAvisoCosto(cmp);
  assert.match(t, /1\.500/);
  assert.match(t, /1\.200/);
  assert.match(t, /lápiz/i);
  assert.match(t, /no cambia el catálogo/i);
});

test("sin diferencia no hay texto", () => {
  const cmp = compararCostoLinea({
    precioLinea: 1200, unidad: "BULTO", costoCatalogo: 1200, base: suelto,
  });
  assert.equal(textoAvisoCosto(cmp), "");
  assert.equal(textoAvisoCosto(null), "");
});

// ===========================================================================
// EL AVISO NO ESCRIBE NADA
// ===========================================================================

test("el módulo no importa nada que pueda escribir", () => {
  // Es una señal, no una acción. Si algún día alguien le agrega una escritura,
  // el pedido volvería a mover el catálogo por la puerta de atrás.
  const src = fs.readFileSync(path.join(RAIZ, "lib/compras-proveedor/avisoCostoLinea.js"), "utf8");
  assert.doesNotMatch(src, /prisma|\.update\(|\.create\(/, "el aviso escribe: tiene que ser solo lectura");
});

// ===========================================================================
// FORMA: que la línea lo muestre, y que la pantalla le pase el dato
// ===========================================================================

test("FORMA: el carrito muestra el aviso y le pasa las cuatro entradas", () => {
  // Mira el JSX y lo dice en su nombre. Va igual porque un módulo perfecto que
  // nadie invoca no avisa nada — y ese es exactamente el error que ya se cometió
  // dos veces.
  const src = fs.readFileSync(
    path.join(RAIZ, "components/compras-proveedor/CarritoPedido.jsx"),
    "utf8"
  );
  assert.match(src, /compararCostoLinea\(\{/);
  for (const campo of ["precioLinea:", "unidad:", "costoCatalogo:", "base,"]) {
    assert.match(src, new RegExp(campo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `el carrito no le pasa ${campo} a compararCostoLinea`);
  }
  assert.match(src, /cmp\.hayDiferencia\s*&&/, "el aviso no se renderiza");
});

test("FORMA: la pantalla del pedido carga el costo del catálogo en cada línea", () => {
  // Sin `costoCatalogo` en el ítem, el aviso jamás se enciende y el candado de
  // arriba pasaría igual.
  const src = fs.readFileSync(
    path.join(RAIZ, "app/modulos/compras-proveedor/nueva/page.jsx"),
    "utf8"
  );
  const veces = (src.match(/costoCatalogo:/g) || []).length;
  assert.ok(
    veces >= 4,
    `se esperaban 4 sitios donde se arma una línea con costoCatalogo, hay ${veces}`
  );
});
