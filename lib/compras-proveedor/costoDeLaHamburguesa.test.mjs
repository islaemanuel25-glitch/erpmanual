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

import { costoLineaAMaestro } from "@/lib/compras-proveedor/costoMaestro";
import { escalaDelCosto } from "@/lib/unidades/reglaDeUnidades";
import { CAMBIO_PLAUSIBLE_PCT } from "@/lib/compras-proveedor/comprobante/unidadPorPrecio";

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

/** La ficha de la hamburguesa, como la lee la regla única. */
const FICHA = { factor_pack: 30, modoCompraProveedor: "BULTO", unidad_medida: "pack" };

/** El camino del cierre: la regla única dice la escala, la conversión convierte. */
function alMaestro(linea, costoActual) {
  const escala = escalaDelCosto({ costo: linea.precioCosto, unidad: linea.unidad, base: FICHA, costoActual });
  if (escala.requiereDecision) return "PREGUNTA";
  return costoLineaAMaestro({ ...linea, unidad: escala.unidad });
}

test("EL COSTO DEL BULTO EN UNA LÍNEA POR UNIDAD SE DEJA COMO ESTÁ", () => {
  // Con el costo que el producto tenía, $61.703, el de la línea ya está en esa
  // escala: no se multiplica.
  assert.equal(alMaestro(HAMBURGUESA, 61703), 61703);

  // CONTRAPRUEBA: la conversión sola, a la que se le dice "por unidad", hace lo
  // que hacía y lo que produjo el $1.851.090. La escala la decide la regla.
  assert.equal(costoLineaAMaestro(HAMBURGUESA), 1851090);
});

test("Y UNA LÍNEA CON EL COSTO UNITARIO DE VERDAD SÍ SE MULTIPLICA", () => {
  // Es para lo que la conversión existe: el papel cobró $2.056,79 por
  // hamburguesa y el catálogo guarda el bulto de 30.
  assert.equal(alMaestro({ ...HAMBURGUESA, precioCosto: 2056.79 }, 61703), 61703.7);
});

test("EL LÍMITE ES EL DE LA RECEPCIÓN, 35 %, Y LO QUE QUEDA AFUERA SE PREGUNTA", () => {
  // ── ESTE CANDADO CAMBIÓ DE REGLA (2026-11-04) ──────────────────────────
  //
  // Afirmaba un 50 % propio del cierre ("medio costo"). La regla única de
  // unidades lo reemplaza por el decisor y el umbral de la recepción, y lo que
  // ninguna lectura explica ya no se adivina: se pregunta.
  assert.equal(CAMBIO_PLAUSIBLE_PCT, 35);
  // Un 30 % de aumento sobre el costo del bulto: la misma escala.
  assert.equal(alMaestro({ ...HAMBURGUESA, precioCosto: 80214 }, 61703), 80214);
  // Un 40 %: con el 50 % se escribía solo como costo del bulto. Ahora no es ni
  // el bulto ni la unidad, y se pregunta.
  assert.equal(alMaestro({ ...HAMBURGUESA, precioCosto: 86384 }, 61703), "PREGUNTA");
  // Más del doble: antes se multiplicaba por 30 —$4.500.000—. Tampoco se adivina.
  assert.equal(alMaestro({ ...HAMBURGUESA, precioCosto: 150000 }, 61703), "PREGUNTA");
});

test("LOS OTROS CAMINOS NO CAMBIAN", () => {
  // Fiambre o producto por kilo: el costo ya está en la unidad guardada.
  assert.equal(
    costoLineaAMaestro({ precioCosto: 11018.49, unidad: "UNIDAD", factorPack: 1, modoCompraProveedor: "UNIDAD", unidadMedida: "kg" }),
    11018.49
  );
  // Línea por BULTO: ya está por bulto.
  assert.equal(
    costoLineaAMaestro({ precioCosto: 20600, unidad: "BULTO", factorPack: 20, modoCompraProveedor: "BULTO", unidadMedida: "pack" }),
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
  assert.match(cierre, /const aceptadoDelPapel = aceptadoEnElPapel\(det\.id, costoFinal, base\)/);
  assert.match(cierre, /const aceptada = costosAceptados\.has\(det\.id\) \|\| aceptadoDelPapel/);
  assert.match(cierre, /escribeCosto && sugerida\.exigeElegir && !aceptada/);
  // Y lo dice en castellano, nombrando el producto, y como ErrorParaLaPersona
  // para que salga con 409 y no como "error interno".
  const i = cierre.indexOf("Abrí Corregir, elegí qué precio queda");
  assert.ok(i > 0, "el mensaje dejó de decir qué hacer");
  assert.match(cierre.slice(Math.max(0, i - 500), i), /throw new ErrorParaLaPersona\(/);
  assert.match(cierre, /No entró nada/);
  // Y el cierre le pregunta la escala a la regla única, con el costo de hoy, y
  // convierte con la escala que la regla dijo — no con la de la línea.
  assert.match(cierre, /escalaDelCosto\(\{ costo: costoFinal, unidad: det\.unidad, base, costoActual: base\?\.precio_costo \?\? null \}\)/);
  assert.match(cierre, /unidad: escala\.unidad,/);
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
