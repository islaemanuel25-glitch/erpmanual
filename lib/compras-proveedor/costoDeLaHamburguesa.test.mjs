// UN COSTO YA GUARDADO POR BULTO NO SE MULTIPLICA OTRA VEZ POR EL BULTO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/costoDeLaHamburguesa.test.mjs
//
// ── EL CASO, MEDIDO EN PRODUCCIÓN ─────────────────────────────────────────
//
// Cerrando el pedido 242 el 2026-09-22 a las 13:42:03 UTC, el costo de
// "Hamburguesa Paty Clasica x2" pasó de **$61.703 a $1.851.090** — treinta
// veces— y el precio de venta se recalculó solo por el margen del 30 %, de
// **$80.300 a $2.406.500**, en la ficha y en las CINCO ubicaciones.
//
// La línea del pedido está en escala UNIDAD (cantidad 90, bultos de 30) y su
// `precioCosto` guardado era el DEL BULTO. `costoLineaAMaestro` multiplicaba por
// el factor cualquier línea en escala UNIDAD, sin preguntarse en qué escala
// venía el número.
//
// Y Emanuel había decidido en esa recepción "Dejás tu precio · $61.703": el
// costo no tenía que moverse ni un peso.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { costoLineaAMaestro, MISMA_ESCALA } from "@/lib/compras-proveedor/costoMaestro";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** La línea real: escala UNIDAD, bulto de 30, costo del BULTO. */
const HAMBURGUESA = {
  precioCosto: 61703,
  unidad: "UNIDAD",
  factorPack: 30,
  modoCompraProveedor: "BULTO",
  unidadMedida: "pack",
};

test("EL COSTO DEL BULTO EN UNA LÍNEA POR UNIDAD SE DEJA COMO ESTÁ", () => {
  // Con el costo que el producto tenía, $61.703, el de la línea ya está en esa
  // escala: no se multiplica.
  assert.equal(costoLineaAMaestro({ ...HAMBURGUESA, costoActual: 61703 }), 61703);

  // CONTRAPRUEBA: sin saber cuál es el costo de hoy, se conserva lo de siempre
  // —multiplicar— que es lo que hacía y lo que produjo el $1.851.090.
  assert.equal(costoLineaAMaestro(HAMBURGUESA), 1851090);
});

test("Y UNA LÍNEA CON EL COSTO UNITARIO DE VERDAD SÍ SE MULTIPLICA", () => {
  // Es para lo que la conversión existe: el papel cobró $2.056,79 por
  // hamburguesa y el catálogo guarda el bulto de 30.
  const porUnidad = { ...HAMBURGUESA, precioCosto: 2056.79, costoActual: 61703 };
  assert.equal(costoLineaAMaestro(porUnidad), 61703.7);
});

test("EL LÍMITE ES MEDIO COSTO, Y SE DICE POR QUÉ", () => {
  // Con el factor más chico que existe —2— multiplicar duplica, así que la
  // mitad deja el caso bueno adentro y el malo afuera.
  assert.equal(MISMA_ESCALA, 0.5);
  // Un 40 % de aumento sobre el costo del bulto: sigue siendo la misma escala.
  assert.equal(costoLineaAMaestro({ ...HAMBURGUESA, precioCosto: 86384, costoActual: 61703 }), 86384);
  // El doble: ya no, y se multiplica como corresponde a una línea por unidad.
  assert.equal(costoLineaAMaestro({ ...HAMBURGUESA, precioCosto: 150000, costoActual: 61703 }), 4500000);
});

test("LOS OTROS CAMINOS NO CAMBIAN", () => {
  // Fiambre o producto por kilo: el costo ya está en la unidad guardada.
  assert.equal(
    costoLineaAMaestro({ precioCosto: 11018.49, unidad: "UNIDAD", factorPack: 1, modoCompraProveedor: "UNIDAD", unidadMedida: "kg", costoActual: 10120 }),
    11018.49
  );
  // Línea por BULTO: ya está por bulto.
  assert.equal(
    costoLineaAMaestro({ precioCosto: 20600, unidad: "BULTO", factorPack: 20, modoCompraProveedor: "BULTO", unidadMedida: "pack", costoActual: 20600 }),
    20600
  );
  // Sin costo no hay nada que escribir.
  assert.equal(costoLineaAMaestro({ precioCosto: 0, unidad: "UNIDAD", factorPack: 30 }), null);
});

// ── Y EL CIERRE FRENA ANTES DE ESCRIBIR UN SALTO QUE NADIE DECIDIÓ ───────

test("EL CIERRE NO ESCRIBE UN COSTO FUERA DE LA VARIACIÓN DEL PROVEEDOR", () => {
  // ── ESTE CANDADO CAMBIÓ DE REGLA, NO DE EXIGENCIA ───────────────────
  //
  // Afirmaba el freno de "más de TRES VECES" que entró con `b345ba3e`. Era un
  // número del sistema: el mismo 3 para un proveedor que actualiza todos los
  // meses y para uno que no mueve un precio en medio año. Lo reemplaza la
  // **variación normal de cada proveedor**, que vive en su receta y por defecto
  // es 10 %, y que es la MISMA pregunta que hace la hoja de Corregir.
  //
  // Lo que se exige sigue siendo lo mismo y por eso el candado sigue vivo: el
  // cierre no escribe un costo que la persona no haya elegido cuando la
  // diferencia no es normal.
  const cierre = codigoDe("app/api/compras-proveedor/recibir/[id]/route.js");
  assert.ok(!/SALTO_DE_COSTO_QUE_FRENA/.test(cierre), "quedó el freno viejo de las tres veces");
  assert.match(cierre, /decisionDeCostoSugerida\(\{/);
  assert.match(cierre, /variacionPct: variacionNormalPct/);
  // Frena solo si la persona NO lo aceptó en esta recepción. La aceptación es
  // la que manda quien llama o la que la hoja de Corregir ya dejó guardada en
  // el renglón para ESE costo —la pantalla no manda `costosAceptados`, y sin
  // leer lo guardado un aumento aceptado frenaba cada vez—. Y solo frena lo
  // que se va a escribir: una línea excluida no escribe costo.
  // Con el producto de la línea, porque la aceptación vale solo contra el
  // catálogo que se miró al decidir.
  assert.match(cierre, /const aceptada = costosAceptados\.has\(det\.id\) \|\| aceptadoEnElPapel\(det\.id, costoFinal, base\)/);
  assert.match(cierre, /escribeCosto && sugerida\.exigeElegir && !aceptada/);
  // Y lo dice en castellano, nombrando el producto, y como ErrorParaLaPersona
  // para que salga con 409 y no como "error interno".
  const i = cierre.indexOf("Abrí Corregir, elegí qué precio queda");
  assert.ok(i > 0, "el mensaje dejó de decir qué hacer");
  assert.match(cierre.slice(Math.max(0, i - 500), i), /throw new ErrorParaLaPersona\(/);
  assert.match(cierre, /No entró nada/);
  // Y el cierre le pasa a la conversión con qué comparar la escala.
  assert.match(cierre, /costoActual: base\?\.precio_costo \?\? null/);
});

test("LA RESTAURACIÓN NOMBRA LOS DOS VALORES Y NO PISA UNA CORRECCIÓN POSTERIOR", () => {
  const sql = fs.readFileSync(
    path.join(RAIZ, "prisma/migrations/20260922143000_restaurar_costo_hamburguesa/migration.sql"),
    "utf8"
  );
  // Vuelve a lo que tenía, leído del backup de las 13:35:16 — no de una fórmula.
  assert.match(sql, /precio_costo = 61703\.00/);
  assert.match(sql, /precio_venta = 80300\.00/);
  // Y solo si lo que hay es exactamente lo que el cierre escribió: si alguien ya
  // lo arregló, esto no toca nada.
  assert.match(sql, /AND precio_costo = 1851090/);
  assert.match(sql, /AND precio_venta = 2406500/);
  // Las dos filas: la ficha y las ubicaciones.
  assert.match(sql, /UPDATE "ProductoBase"/);
  assert.match(sql, /UPDATE "ProductoLocal"/);
  assert.match(sql, /"baseId" = 298/);
  // Aditiva en el sentido que importa: no borra ni crea nada.
  assert.ok(!/DROP|DELETE|TRUNCATE|INSERT/i.test(sql));
});
