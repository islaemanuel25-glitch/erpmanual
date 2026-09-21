// LA EXPLICACIÓN DEL PROVEEDOR VA PRIMERA, Y VIAJA ENTERA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/lector/explicacionEnElPrompt.test.mjs
//
// ── QUÉ DEFIENDE ──────────────────────────────────────────────────────────
//
// Medido sobre el papel de Paty (`sonda-explicacion-papel.mjs`, cd05b779): con
// la explicación, 11 de 11 renglones bien interpretados en tres corridas
// idénticas; sin ella, el mismo papel salía MAL_LEIDO. O sea que todo el
// circuito nuevo cuelga de dos cosas que no rompen nada al romperse:
//
//   · que el texto LLEGUE al pedido del modelo —si la receta lo deja por el
//     camino, el papel se lee como antes y nadie se entera—;
//   · que vaya PRIMERO —es el contexto con el que hay que leer el resto; abajo
//     del contrato de campos es una aclaración tardía—.
//
// Las dos fallan en silencio: el prompt se arma igual, el modelo contesta
// igual, y la única señal sería un comprobante que no cierra, que es
// exactamente lo que este circuito vino a evitar.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  esquemaDeSalida,
  instruccionesDesdeReceta,
} from "@/lib/compras-proveedor/comprobante/lector/promptDesdeReceta";
import { recetaDelProveedor } from "@/lib/compras-proveedor/comprobante/lector/recetaDelProveedor";

const EXPLICACION_DE_PATY =
  "CANTIDAD son las unidades que manda. BONIF. es el descuento en porcentaje. " +
  "Cuando la columna PESO trae un número, el PRECIO es por kilo y la cantidad son piezas.";

const ENCABEZADO = "El que recibe la mercadería explicó cómo se lee este papel:";

test("LA EXPLICACIÓN VA PRIMERA Y TEXTUAL", () => {
  const texto = instruccionesDesdeReceta({ explicacion: EXPLICACION_DE_PATY });
  assert.ok(texto.includes(ENCABEZADO), "no se le pasa la explicación al modelo");
  // TEXTUAL: no reescrita, no resumida, no traducida a reglas. Lo que se probó
  // que funciona es el texto de una persona.
  assert.ok(texto.includes(EXPLICACION_DE_PATY), "la explicación llegó cambiada");
  // PRIMERA: antes del contrato de campos, que es lo que viene después.
  assert.ok(
    texto.indexOf(ENCABEZADO) < texto.indexOf("Por cada renglón de mercadería devolvé"),
    "la explicación dejó de ir primera"
  );
  assert.ok(texto.indexOf(ENCABEZADO) < texto.indexOf("Sos un transcriptor"));
});

test("SIN EXPLICACIÓN, EL PEDIDO ES EL DE ANTES", () => {
  // Treinta proveedores no la tienen todavía, y para ellos nada cambia.
  const texto = instruccionesDesdeReceta({});
  assert.ok(!texto.includes(ENCABEZADO));
  assert.ok(texto.includes("Sos un transcriptor"));
  // Y una explicación en blanco no cuenta como explicación.
  assert.ok(!instruccionesDesdeReceta({ explicacion: "   " }).includes(ENCABEZADO));
});

test("LA EXPLICACIÓN VIAJA DESDE LA FILA DE LA BASE HASTA LA RECETA", () => {
  // El eslabón que faltaba y que no rompe nada al romperse: si
  // `recetaDelProveedor` no la copia, el prompt de arriba nunca la ve.
  const { receta } = recetaDelProveedor({
    ivaPorLinea: false,
    alicuotaIvaPct: 21,
    explicacion: EXPLICACION_DE_PATY,
  });
  assert.equal(receta.explicacion, EXPLICACION_DE_PATY);
  assert.ok(instruccionesDesdeReceta(receta).includes(EXPLICACION_DE_PATY));
});

test("EL PAPEL PUEDE TRAER KILOS Y DESCUENTO, SIEMPRE", () => {
  // Los dos campos son de la SALIDA, no de la receta: qué significan lo dice la
  // explicación. Si dependieran de una casilla por proveedor, el papel de Paty
  // no podría traerlos hasta que alguien tildara algo.
  for (const receta of [{}, { explicacion: EXPLICACION_DE_PATY }, { ivaPorLinea: true }]) {
    const linea = esquemaDeSalida(receta).properties.lineas.items;
    assert.ok(linea.properties.peso, "se perdió el peso del esquema");
    assert.ok(linea.properties.bonificacion, "se perdió la bonificación del esquema");
    // NULABLES: un renglón sin kilos no tiene que inventar un número. Es la
    // lección del `total` obligatorio, que se contestaba con la suma.
    assert.ok(!(linea.required || []).includes("peso"));
    assert.ok(!(linea.required || []).includes("bonificacion"));
  }
});
