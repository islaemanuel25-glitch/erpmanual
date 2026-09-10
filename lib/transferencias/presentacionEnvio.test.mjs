// LA PRESENTACIÓN CON LA QUE SALIÓ LA MERCADERÍA, Y POR QUÉ SE CONGELA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/presentacionEnvio.test.mjs
//
// ── LO QUE ESTE ARCHIVO DEFIENDE ─────────────────────────────────────────
//
// Dos cosas, y la segunda es la cara:
//
//   1. que un cajón se lea como cajón, un kilo como kilo y una pieza como
//      pieza — y no como "UNIDAD", que es lo que pasaba;
//   2. que editar el catálogo DESPUÉS de despachar no cambie ni lo que la
//      pantalla dice ni cuánto stock entra al destino.
//
// El defecto de origen no estaba en la pantalla: `unidadEnviada` solo sabe decir
// BULTO o UNIDAD, y la venta interna del POS convierte los packs a unidades
// antes de guardar. La pantalla mostraba fielmente un dato que ya venía perdido.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PRESENTACION,
  presentacionDeProducto,
} from "@/lib/productos/presentacionDeProducto";
import {
  descriptorDeEnvio,
  nombreDePresentacion,
  rotuloDeEnvio,
  rotuloFisicoDeEnvio,
  unidadDeDiferencia,
  unidadesFisicasDelDescriptor,
} from "./presentacionEnvio.js";

// ═══════════════════════════════════════════════════════════════════════════
// 1-5. LAS CINCO PRESENTACIONES, CADA UNA CON SU SNAPSHOT
// ═══════════════════════════════════════════════════════════════════════════

const conSnapshot = (extra) => ({
  cantidadEnviada: 0,
  ...extra,
});

test("1. snapshot UNIDAD: 20 UNIDAD", () => {
  const d = descriptorDeEnvio(conSnapshot({
    presentacionEnvio: "UNIDAD", cantidadPresentada: 20, cantidad: 20,
  }));
  assert.equal(d.presentacion, PRESENTACION.UNIDAD);
  assert.equal(rotuloDeEnvio(d), "20 UNIDAD");
  assert.equal(unidadesFisicasDelDescriptor(d), 20);
  // No hay línea secundaria: "20 unidades físicas" debajo de "20 UNIDAD" es ruido.
  assert.equal(rotuloFisicoDeEnvio(d), null);
});

test("2. snapshot PACK x6: 6 PACK x6, y 36 unidades como secundario", () => {
  const d = descriptorDeEnvio(conSnapshot({
    presentacionEnvio: "PACK", cantidadPresentada: 6, factorPresentacion: 6, cantidad: 36,
  }));
  assert.equal(d.presentacion, PRESENTACION.PACK);
  assert.equal(rotuloDeEnvio(d), "6 PACK x6");
  assert.equal(unidadesFisicasDelDescriptor(d), 36);
  assert.equal(rotuloFisicoDeEnvio(d), "36 unidades físicas");
});

test("3. snapshot CAJÓN x8: 6 CAJÓN x8 — NUNCA 48 UNIDAD", () => {
  const d = descriptorDeEnvio(conSnapshot({
    presentacionEnvio: "CAJON", cantidadPresentada: 6, factorPresentacion: 8, cantidad: 48,
  }));
  assert.equal(d.presentacion, PRESENTACION.CAJON);
  assert.equal(rotuloDeEnvio(d), "6 CAJÓN x8");
  // El defecto que originó la tanda, escrito como afirmación.
  assert.notEqual(rotuloDeEnvio(d), "48 UNIDAD");
  assert.ok(!rotuloDeEnvio(d).includes("UNIDAD"));
  assert.ok(!rotuloDeEnvio(d).includes("PACK"), "un cajón no es un pack");
  assert.equal(unidadesFisicasDelDescriptor(d), 48);
  assert.equal(rotuloFisicoDeEnvio(d), "48 unidades físicas");
});

test("4. snapshot KG: 3,250 KG, y la diferencia se dice en KG", () => {
  const d = descriptorDeEnvio(conSnapshot({
    presentacionEnvio: "KG", cantidadPresentada: 3.25, cantidad: 3.25,
  }));
  assert.equal(d.presentacion, PRESENTACION.KG);
  assert.equal(rotuloDeEnvio(d), "3,25 KG");
  assert.equal(unidadDeDiferencia(d), "KG");
  // 18. KG NUNCA se expresa como "unidades".
  assert.equal(rotuloFisicoDeEnvio(d), null);
  assert.ok(!rotuloDeEnvio(d).toLowerCase().includes("unidad"));
});

test("5. snapshot PIEZA: 2 PIEZA, y no se degrada a UNIDAD", () => {
  const d = descriptorDeEnvio(conSnapshot({
    presentacionEnvio: "PIEZA", cantidadPresentada: 2, pesoPiezaKg: 4.45, cantidad: 2,
  }));
  assert.equal(d.presentacion, PRESENTACION.PIEZA);
  assert.equal(rotuloDeEnvio(d), "2 PIEZA");
  assert.equal(unidadDeDiferencia(d), "PIEZA");
  // 19. PIEZA nunca se degrada a UNIDAD.
  assert.ok(!rotuloDeEnvio(d).includes("UNIDAD"));
  assert.equal(d.pesoPiezaKg, 4.45, "el peso congelado tiene que sobrevivir");
  assert.equal(rotuloFisicoDeEnvio(d), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. FÍSICA Y PRESENTADA SON DOS CONCEPTOS
// ═══════════════════════════════════════════════════════════════════════════

test("6. la cantidad física y la presentada no son la misma cosa", () => {
  const d = descriptorDeEnvio(conSnapshot({
    presentacionEnvio: "CAJON", cantidadPresentada: 6, factorPresentacion: 8, cantidad: 48,
  }));
  assert.equal(d.cantidad, 6, "la presentada es la que se muestra");
  assert.equal(unidadesFisicasDelDescriptor(d), 48, "la física es la que mueve stock");
  assert.notEqual(d.cantidad, unidadesFisicasDelDescriptor(d));
});

// ═══════════════════════════════════════════════════════════════════════════
// 7-8. EDITAR EL CATÁLOGO NO REESCRIBE UNA TRANSFERENCIA YA DESPACHADA
// ═══════════════════════════════════════════════════════════════════════════

test("7. cambiar factor_pack DESPUÉS no cambia la interpretación del envío", () => {
  // La línea salió con cajones de 8 y quedó registrado. Hoy el catálogo dice 12.
  const linea = {
    presentacionEnvio: "CAJON", cantidadPresentada: 6, factorPresentacion: 8, cantidad: 48,
    // Lo que el producto dice AHORA, que es otra cosa:
    unidadMedida: "cajon", factorPack: 12,
  };
  const d = descriptorDeEnvio(linea);
  assert.equal(d.factor, 8, "ganó el catálogo actual y reescribió la historia");
  assert.equal(rotuloDeEnvio(d), "6 CAJÓN x8");
  assert.equal(unidadesFisicasDelDescriptor(d), 48, "48 y no 72");
});

test("8. cambiar pesoReferenciaKg DESPUÉS no cambia lo que acredita una PIEZA", () => {
  const linea = {
    presentacionEnvio: "PIEZA", cantidadPresentada: 2, pesoPiezaKg: 4.45, cantidad: 2,
    // El catálogo de hoy dice otro peso:
    unidadMedida: "kg", modoVentaDeposito: "PIEZA", pesoReferenciaKg: 9.9,
  };
  const d = descriptorDeEnvio(linea);
  assert.equal(d.pesoPiezaKg, 4.45, "el peso vivo pisó al congelado");
  // 2 piezas × 4,45 = 8,9 kg, que es lo que el destino tiene que recibir.
  assert.equal(d.cantidad * d.pesoPiezaKg, 8.9);
});

// ═══════════════════════════════════════════════════════════════════════════
// 9-10. LOS HISTÓRICOS
// ═══════════════════════════════════════════════════════════════════════════

test("9. una línea sin snapshot conserva el comportamiento anterior", () => {
  // Lo que hay en las 6388 filas previas: cantidad física y BULTO/UNIDAD.
  const historica = {
    cantidadEnviada: 48, unidadEnviada: "UNIDAD",
    unidadMedida: "cajon", factorPack: 8,
  };
  const d = descriptorDeEnvio(historica);
  // La cantidad que se muestra sigue siendo la física, como antes. No se
  // reinterpreta 48 como "6 cajones".
  assert.equal(d.cantidad, 48);
  assert.equal(d.sueltas, 0);
  assert.equal(
    d.presentacion,
    PRESENTACION.UNIDAD,
    "se contó en unidades: eso es lo que dice el dato, y no se mejora"
  );
});

test("10. y se distingue lo REGISTRADO de lo reconstruido", () => {
  const registrada = descriptorDeEnvio({
    presentacionEnvio: "CAJON", cantidadPresentada: 6, factorPresentacion: 8, cantidad: 48,
  });
  const historica = descriptorDeEnvio({
    cantidadEnviada: 48, unidadEnviada: "UNIDAD", unidadMedida: "cajon", factorPack: 8,
  });

  assert.equal(registrada.registrado, true);
  assert.equal(historica.registrado, false);

  // Es la diferencia que impide presentar una reconstrucción como si fuera un
  // hecho registrado. Sin esto, las dos se leerían igual.
  assert.notEqual(registrada.registrado, historica.registrado);
});

test("10b. un histórico enviado en BULTO sí distingue cajón de pack", () => {
  // Lo único que la reconstrucción agrega es el TIPO, que es información del
  // producto y no una reinterpretación de la cantidad. La cantidad no se toca.
  const d = descriptorDeEnvio({
    cantidadEnviada: 6, unidadEnviada: "BULTO", unidadMedida: "cajon", factorPack: 8,
  });
  assert.equal(d.presentacion, PRESENTACION.CAJON);
  assert.equal(d.cantidad, 6, "la cantidad sigue siendo la que estaba guardada");
  assert.equal(d.registrado, false, "y sigue marcada como reconstruida");
});

// ═══════════════════════════════════════════════════════════════════════════
// 11-12. EL BULTO INCOMPLETO
// ═══════════════════════════════════════════════════════════════════════════

test("11. bultos completos + sueltas mantiene la exactitud", () => {
  // 4 packs de 6 más 5 sueltas = 29. El caso que obliga a dos números.
  const d = descriptorDeEnvio(conSnapshot({
    presentacionEnvio: "PACK", cantidadPresentada: 4, sueltasEnviadas: 5,
    factorPresentacion: 6, cantidad: 29,
  }));
  assert.equal(unidadesFisicasDelDescriptor(d), 29);
  assert.equal(rotuloDeEnvio(d), "4 PACK x6");
  assert.equal(d.sueltas, 5);
  assert.equal(rotuloFisicoDeEnvio(d), "29 unidades físicas");
});

test("12. NUNCA aparece un pack o un cajón decimal", () => {
  // El error que todo este modelo evita: 29/6 = 4,833 y 5,833 × 6 = 34,998.
  const casos = [
    { presentacionEnvio: "PACK", cantidadPresentada: 4, sueltasEnviadas: 5, factorPresentacion: 6, cantidad: 29 },
    { presentacionEnvio: "CAJON", cantidadPresentada: 5, sueltasEnviadas: 7, factorPresentacion: 8, cantidad: 47 },
  ];
  for (const c of casos) {
    const r = rotuloDeEnvio(descriptorDeEnvio(conSnapshot(c)));
    assert.ok(!r.includes(","), `salió un decimal en la presentación: ${r}`);
    assert.ok(!/\d+[.,]\d/.test(r), `salió un decimal en la presentación: ${r}`);
  }
  // Y la cuenta física da exacta, que es el punto.
  assert.equal(
    unidadesFisicasDelDescriptor(descriptorDeEnvio(conSnapshot(casos[1]))),
    47
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// LA REGLA DE DOMINIO, UNA SOLA
// ═══════════════════════════════════════════════════════════════════════════

test("PIEZA se pregunta ANTES que KG, que es donde esto se hace mal", () => {
  // Un fiambre de pieza fija tiene unidad_medida "kg" y se cuenta por piezas.
  // La forma REAL de un fiambre de pieza fija: `esProductoFiambre` —la puerta
  // del predicado único— exige también `modoCompraProveedor === "UNIDAD"`. Se
  // comprobó contra producción: 40 de los 41 productos PIEZA lo cumplen.
  const p = presentacionDeProducto({
    unidadMedida: "kg", modoVentaDeposito: "PIEZA", pesoReferenciaKg: 4.45,
    modoCompraProveedor: "UNIDAD",
  });
  assert.equal(p.presentacion, PRESENTACION.PIEZA);
  assert.equal(p.pesoPiezaKg, 4.45);

  // Sin peso de referencia no es una pieza fija: vuelve a ser peso.
  const sinPeso = presentacionDeProducto({
    unidadMedida: "kg", modoVentaDeposito: "PIEZA", pesoReferenciaKg: null,
    modoCompraProveedor: "UNIDAD",
  });
  assert.equal(sinPeso.presentacion, PRESENTACION.KG);
});

test("un agrupado contado en UNIDAD es una salida en UNIDAD", () => {
  // Un cajón despachado suelto no es un cajón fraccionado.
  const p = presentacionDeProducto({
    unidadMedida: "cajon", factorPack: 8, contadoEn: "UNIDAD",
  });
  assert.equal(p.presentacion, PRESENTACION.UNIDAD);
  assert.equal(p.factor, null);
});

test("un agrupado sin factor NO inventa un factor 1", () => {
  const p = presentacionDeProducto({ unidadMedida: "pack", factorPack: 1 });
  assert.equal(p.presentacion, PRESENTACION.UNIDAD, "un pack de 1 no agrupa nada");
  assert.equal(p.factor, null);
});

test("y el nombre de la presentación no arrastra la cantidad", () => {
  assert.equal(nombreDePresentacion({ presentacion: "CAJON", factor: 8 }), "CAJÓN x8");
  assert.equal(nombreDePresentacion({ presentacion: "KG" }), "KG");
  assert.equal(nombreDePresentacion({ presentacion: "PIEZA" }), "PIEZA");
  assert.equal(nombreDePresentacion({ presentacion: "UNIDAD" }), "UNIDAD");
});
