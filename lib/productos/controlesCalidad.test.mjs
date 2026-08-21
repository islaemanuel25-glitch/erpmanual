// Candados de los CONTROLES DE CALIDAD de Productos.
//
// Los cuatro delegan en piezas que ya tienen sus propios candados, así que acá no
// se re-prueba la aritmética de cada una: se prueba QUÉ delega en QUÉ, dónde
// están los bordes, y sobre todo que el contador y el filtro no se puedan
// separar — que es el defecto que esta capa existe para impedir.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  CONTROL,
  CONTROLES,
  IDS_CONTROL,
  DIAS_REVISION_PRECIO,
  esControlValido,
  esServicioImporteVariable,
  precioVencido,
  faltaReglaDeGanancia,
  vendeSinGanancia,
  escalaEnRiesgo,
  marcadoPor,
  contarControles,
} from "./controlesCalidad.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const AHORA = new Date("2026-08-21T12:00:00.000Z");
const haceDias = (d) => new Date(AHORA.getTime() - d * 24 * 60 * 60 * 1000);

/** Una fila sana: con regla, con ganancia, revisada hoy y sin descalce. */
const sano = (extra = {}) => ({
  modalidad: "NORMAL",
  margen: 30,
  reglaPrecio: "MARGEN_PORCENTUAL",
  recargoFijoUnidad: null,
  precio_costo: 100,
  precio_venta: 130,
  precioRevisadoAt: AHORA,
  unidad_medida: "unidad",
  factor_pack: 1,
  pesoReferenciaKg: null,
  ...extra,
});

// ── A · FALTA REGLA DE GANANCIA ─────────────────────────────────────────────

test("A1. margen null con regla porcentual → FALTA regla", () => {
  assert.equal(faltaReglaDeGanancia(sano({ margen: null })), true);
});

test("A2. margen 0 NO es falta: es una regla cargada", () => {
  // Vender al costo a propósito es una decisión, no un olvido. Es el caso que
  // más fácil se confunde al escribir un `!margen`.
  assert.equal(faltaReglaDeGanancia(sano({ margen: 0 })), false);
});

test("A3. recargo fijo configurado NO es falta, ni con margen null", () => {
  assert.equal(
    faltaReglaDeGanancia(
      sano({ margen: null, reglaPrecio: "RECARGO_FIJO_UNIDAD", recargoFijoUnidad: 50 })
    ),
    false
  );
});

test("A4. modo recargo SIN recargo cargado cae al margen viejo, y eso NO es falta", () => {
  // ── ESTE CANDADO AFIRMABA LO CONTRARIO Y ESTABA MAL ───────────────────────
  //
  // Lo escribí suponiendo que una fila en modo recargo sin recargo cargado
  // quedaba sin regla. `reglaDeGananciaDe` hace otra cosa: si el recargo no está
  // configurado, cae al margen guardado y devuelve PORCENTAJE.
  //
  // No lo cambié: el issue define tres casos —margen null, margen 0, recargo
  // configurado— y este borde no está entre ellos. Inventar acá una regla nueva
  // sería exactamente lo que no hay que hacer, y además dejaría el control
  // contradiciendo lo que la tarjeta del producto muestra: la pieza es la misma
  // que decide qué se dibuja, así que la card diría "30 %" mientras el control
  // diría "falta regla".
  //
  // Queda anotado como decisión heredada, no como algo que este control decidió.
  assert.equal(
    faltaReglaDeGanancia(sano({ margen: 30, reglaPrecio: "RECARGO_FIJO_UNIDAD", recargoFijoUnidad: null })),
    false
  );

  // Y sin margen NI recargo, sí falta.
  assert.equal(
    faltaReglaDeGanancia(sano({ margen: null, reglaPrecio: "RECARGO_FIJO_UNIDAD", recargoFijoUnidad: null })),
    true
  );
});

// ── B · VENTA ≤ COSTO ───────────────────────────────────────────────────────

test("B1. venta por debajo del costo marca; con ganancia no", () => {
  assert.equal(vendeSinGanancia(sano({ precio_costo: 100, precio_venta: 90 })), true);
  assert.equal(vendeSinGanancia(sano({ precio_costo: 100, precio_venta: 100 })), true);
  assert.equal(vendeSinGanancia(sano({ precio_costo: 100, precio_venta: 130 })), false);
});

test("B2. SIN COSTO no marca: no es un producto que pierde plata, es uno sin dato", () => {
  assert.equal(vendeSinGanancia(sano({ precio_costo: null, precio_venta: 130 })), false);
  assert.equal(vendeSinGanancia(sano({ precio_costo: 0, precio_venta: 130 })), false);
});

// ── C · ESCALA / PRECIO EN RIESGO ───────────────────────────────────────────

test("C1. marca POR_FACTOR: precio de bulto sobre una unidad suelta", () => {
  // Costo unitario 100 con un precio que parece de pack de 12.
  const p = sano({ precio_costo: 100, precio_venta: 1300, unidad_medida: "pack", factor_pack: 12 });
  assert.equal(escalaEnRiesgo(p), true);
});

test("C2. marca POR_PESO: precio por kilo sobre un producto que se cuenta por pieza", () => {
  const p = sano({
    precio_costo: 100,
    precio_venta: 450,
    unidad_medida: "kg",
    pesoReferenciaKg: 4,
    factor_pack: null,
  });
  assert.equal(escalaEnRiesgo(p), true);
});

test("C3. NO marca BAJO — ése es el control de Venta ≤ costo y contarlo lo duplicaría", () => {
  assert.equal(escalaEnRiesgo(sano({ precio_costo: 100, precio_venta: 90 })), false);
});

test("C4. NO marca NORMAL ni SIN_DATOS", () => {
  assert.equal(escalaEnRiesgo(sano({ precio_costo: 100, precio_venta: 130 })), false);
  assert.equal(escalaEnRiesgo(sano({ precio_costo: null, precio_venta: 130 })), false);
});

test("C5. NO marca un margen alto que la escala no explica", () => {
  // Un ratio grande que no coincide ni con el peso ni con el factor es
  // ALTO_LEGITIMO. Marcarlo llenaría la card de ruido y es justamente lo que el
  // diagnóstico fue diseñado para evitar.
  const p = sano({ precio_costo: 100, precio_venta: 900, unidad_medida: "unidad", factor_pack: 1 });
  assert.equal(escalaEnRiesgo(p), false);
});

// ── D · PRECIO SIN REVISAR ──────────────────────────────────────────────────

test("D1. el borde de 30 días, explícito en los dos lados", () => {
  // Exactamente en el umbral NO está vencido: la regla es "más de 30 días".
  // Este borde tiene que cortar igual en el contador y en el filtro, y por eso
  // hay una sola función.
  assert.equal(precioVencido(haceDias(DIAS_REVISION_PRECIO), AHORA), false, "30 días justos NO vence");
  assert.equal(precioVencido(haceDias(DIAS_REVISION_PRECIO + 0.001), AHORA), true, "un pelo más, vence");
  assert.equal(precioVencido(haceDias(29), AHORA), false);
  assert.equal(precioVencido(haceDias(31), AHORA), true);
});

test("D2. null histórico cuenta como pendiente, y no se inventa una fecha", () => {
  assert.equal(precioVencido(null, AHORA), true);
  assert.equal(precioVencido(undefined, AHORA), true);
  // Una fecha ilegible es lo mismo que no tenerla.
  assert.equal(precioVencido("no es una fecha", AHORA), true);
});

test("D3. acepta string ISO y Date por igual", () => {
  assert.equal(precioVencido(haceDias(10).toISOString(), AHORA), false);
  assert.equal(precioVencido(haceDias(40).toISOString(), AHORA), true);
});

// ── E · LOS SERVICIOS DE IMPORTE VARIABLE QUEDAN FUERA DE LOS CUATRO ────────

test("E1. un servicio de importe variable no aparece en NINGÚN control", () => {
  // No tiene precio fijo: el importe lo escribe el cajero en cada venta. No hay
  // precio que revisar, ni margen que falte, ni venta que comparar.
  const servicio = {
    modalidad: "IMPORTE_VARIABLE",
    margen: null,
    reglaPrecio: "MARGEN_PORCENTUAL",
    recargoFijoUnidad: null,
    precio_costo: 100,
    precio_venta: 50, // vendería "sin ganancia" si se lo mirara
    precioRevisadoAt: null, // y estaría "vencido"
    unidad_medida: "unidad",
    factor_pack: 1,
  };
  assert.equal(esServicioImporteVariable(servicio), true);
  for (const id of IDS_CONTROL) {
    assert.equal(marcadoPor(id, servicio, AHORA), false, `el control ${id} marcó un servicio`);
  }
});

// ── F · EL CONTADOR Y EL FILTRO SON LA MISMA FUNCIÓN ────────────────────────

test("F1. contar y filtrar dan el MISMO número, por construcción", () => {
  // Éste es el candado que justifica que exista este archivo. Si el contador y
  // el listado tuvieran predicados distintos, la card diría 47 sobre una lista
  // de 45 y nadie sabría cuál de los dos miente.
  const productos = [
    sano(),
    sano({ margen: null }),
    sano({ margen: null, precio_venta: 90 }),
    sano({ precioRevisadoAt: haceDias(60) }),
    sano({ precio_costo: 100, precio_venta: 1300, unidad_medida: "pack", factor_pack: 12 }),
  ];

  const conteo = contarControles(productos, AHORA);
  for (const id of IDS_CONTROL) {
    const filtrados = productos.filter((p) => marcadoPor(id, p, AHORA));
    assert.equal(conteo[id], filtrados.length, `${id}: el contador no coincide con el filtro`);
  }
});

test("F2. el conteo devuelve SIEMPRE las cuatro claves, aunque den cero", () => {
  // Una card en 0 significa "este control está sano" y tiene que seguir
  // visible. Omitir la clave haría que la pantalla no pueda distinguir "sano" de
  // "no se calculó".
  const conteo = contarControles([sano()], AHORA);
  assert.deepEqual(Object.keys(conteo).sort(), [...IDS_CONTROL].sort());
  for (const id of IDS_CONTROL) {
    assert.equal(typeof conteo[id], "number", `${id} no vino en el conteo`);
  }
  assert.equal(conteo[CONTROL.SIN_REGLA], 0);
});

test("F3. un control desconocido no marca nada", () => {
  // Una URL con basura no puede mostrar el catálogo entero como si estuviera
  // todo mal.
  assert.equal(marcadoPor("inventado", sano({ margen: null }), AHORA), false);
  assert.equal(esControlValido("inventado"), false);
  assert.equal(esControlValido(CONTROL.PRECIO_VENCIDO), true);
});

// ── G · LA CONFIGURACIÓN ES EXTENSIBLE, NO CUATRO BLOQUES ──────────────────

test("G1. los controles salen de un array y traen rol semántico, no colores", () => {
  assert.equal(CONTROLES.length, 4);
  for (const c of CONTROLES) {
    assert.ok(c.id && c.titulo && c.rol, `control incompleto: ${JSON.stringify(c)}`);
    assert.ok(["success", "warning", "danger"].includes(c.rol), `rol no semántico: ${c.rol}`);
  }
  // Los ids salen del array: agregar un quinto control no obliga a tocar nada más.
  assert.deepEqual(IDS_CONTROL, CONTROLES.map((c) => c.id));
});

test("G2. NO hay un solo color escrito a mano en el dominio", () => {
  // Los roles los traduce la pantalla a los tokens del theme. Un hex acá haría
  // que el control se viera igual en el theme claro y en el oscuro.
  const src = fs.readFileSync(path.join(RAIZ, "lib/productos/controlesCalidad.js"), "utf8");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(src.replace(/\/\/[^\n]*/g, "")), "hay un color hex en el dominio");
  assert.ok(!/\brgb\(|\brgba\(/.test(src), "hay un color rgb en el dominio");
});

test("G3. y NO reimplementa ninguna regla: delega en las piezas que ya existen", () => {
  const src = fs
    .readFileSync(path.join(RAIZ, "lib/productos/controlesCalidad.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  for (const pieza of ["reglaDeGananciaDe", "seVendeSinGanancia", "diagnosticarMargen"]) {
    assert.ok(src.includes(pieza), `dejó de usar ${pieza}: hay una regla duplicada al lado`);
  }
  // Y no escribe su propia comparación de margen.
  assert.ok(
    !/precio_venta\s*[<>]=?\s*precio_costo/.test(src),
    "apareció una comparación de venta contra costo escrita a mano"
  );
});
