// LA RECETA ESTRUCTURAL: VOCABULARIO CERRADO Y SIN NÚMEROS DE UNA FACTURA.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import {
  CAMPOS,
  CRITERIO_ENVIADO,
  parametrosDeLectura,
  pistaUtilizable,
  recetaAporta,
  recetaEnCastellano,
  recetaValida,
  valoresDeFacturaEnLaReceta,
} from "./recetaDeLectura.js";

test("una receta completa sobrevive entera", () => {
  const r = recetaValida({
    nombre: "Consumidor Final",
    columnas: {
      cantidad: { encabezado: "ENVIADO", posicion: 0 },
      descripcion: { encabezado: "ARTICULO", posicion: 1 },
      precioUnitario: { encabezado: "PRECIO", posicion: 2 },
      subtotal: { encabezado: "TOTAL", posicion: 3 },
    },
    enviado: { criterio: "CANTIDAD_PRESENTE" },
    cantidadEn: "UNIDAD",
    facturaPor: "UNIDAD",
    subtotal: { hayColumna: true, incluyeBonificacion: true },
    variante: { pistas: ["CONSUMIDOR FINAL"] },
  });
  assert.equal(r.nombre, "Consumidor Final");
  assert.equal(r.columnas.cantidad.encabezado, "ENVIADO");
  assert.equal(r.enviado.criterio, CRITERIO_ENVIADO.CANTIDAD_PRESENTE);
  assert.equal(r.cantidadEn, "UNIDAD");
  assert.deepEqual(r.variante.pistas, ["CONSUMIDOR FINAL"]);
});

test("EL VOCABULARIO ES CERRADO: lo que no está se descarta", () => {
  const r = recetaValida({
    columnas: { cantidad: { encabezado: "CANT" }, inventada: { encabezado: "X" } },
    enviado: { criterio: "LO_QUE_A_MI_ME_PAREZCA" },
    cantidadEn: "CAJONES",
    facturaPor: "docena",
    campoQueNoExiste: "algo",
  });
  assert.equal(r.columnas.cantidad.encabezado, "CANT");
  assert.ok(!("inventada" in r.columnas));
  assert.ok(!("campoQueNoExiste" in r));
  // Un criterio no reconocido queda en null, NO en "TODOS": asumir que todos los
  // renglones fueron enviados metería en el pedido cosas que el proveedor no
  // mandó, que es justo lo que este campo existe para evitar.
  assert.equal(r.enviado.criterio, null);
  assert.equal(r.cantidadEn, null);
  assert.equal(r.facturaPor, null);
});

test("CANTIDAD Y PRECIO SON DOS PREGUNTAS Y SE GUARDAN SEPARADAS", () => {
  const r = recetaValida({ cantidadEn: "UNIDAD", facturaPor: "BULTO" });
  assert.equal(r.cantidadEn, "UNIDAD");
  assert.equal(r.facturaPor, "BULTO");
});

test("NO SE GUARDA NINGÚN VALOR DE UNA FACTURA", () => {
  // El pedido lo dice: hay que volver a leer cantidades, importes, descuentos y
  // porcentajes en cada archivo. Una pista que sea el número de comprobante o
  // una fecha haría que la receta reconociera UN documento en vez de un formato,
  // y fallaría recién con la factura siguiente.
  const r = recetaValida({
    variante: {
      pistas: ["CONSUMIDOR FINAL", "0001-00012345", "12/03/2026", "$ 50.500", "REMITO", "50500"],
    },
  });
  assert.deepEqual(r.variante.pistas, ["CONSUMIDOR FINAL", "REMITO"]);
  assert.deepEqual(valoresDeFacturaEnLaReceta(r), []);
});

test("y si igual entrara uno, se dice CUÁL", () => {
  const conBasura = { variante: { pistas: ["0001-00012345"] }, columnas: { cantidad: { encabezado: "50500" } } };
  const problemas = valoresDeFacturaEnLaReceta(conBasura);
  assert.equal(problemas.length, 2);
  assert.ok(problemas.some((p) => p.includes("0001-00012345")));
  assert.ok(problemas.some((p) => p.includes("50500")));
});

test("pistaUtilizable distingue un rótulo de un dato", () => {
  assert.equal(pistaUtilizable("CONSUMIDOR FINAL"), true);
  assert.equal(pistaUtilizable("Responsable Inscripto"), true);
  assert.equal(pistaUtilizable("REMITO R"), true);
  assert.equal(pistaUtilizable("0001-00012345"), false);
  assert.equal(pistaUtilizable("12/03/2026"), false);
  assert.equal(pistaUtilizable("50.500,00"), false);
  assert.equal(pistaUtilizable(""), false);
  assert.equal(pistaUtilizable(null), false);
  // Dos letras no alcanzan para reconocer un formato.
  assert.equal(pistaUtilizable("CF"), false);
});

test("NINGÚN CAMPO ES OBLIGATORIO: una receta vacía queda vacía", () => {
  // Un campo obligatorio en una salida estructurada es una orden de inventar. Si
  // `cantidadEn` lo fuera, el modelo pondría "UNIDAD" —lo más común— y esa
  // suposición es exactamente la que convirtió 10 unidades en 10 bultos.
  const r = recetaValida({});
  assert.equal(r.cantidadEn, null);
  assert.equal(r.facturaPor, null);
  assert.equal(r.enviado.criterio, null);
  assert.equal(r.subtotal.hayColumna, null);
  assert.equal(recetaAporta(r), false);
});

test("una columna sin encabezado ni posición no identifica nada", () => {
  const r = recetaValida({ columnas: { cantidad: { encabezado: null, posicion: null } } });
  assert.equal(r.columnas.cantidad, null);
  assert.equal(recetaAporta(r), false);
});

test("la posición cero es una posición, no un campo vacío", () => {
  // El cero falsy ya mordió cuatro veces en este módulo. La primera columna de
  // un Excel es la 0, y tratarla como ausente perdería justamente la que el
  // ejemplo del pedido nombra: "la primera columna es la cantidad enviada".
  const r = recetaValida({ columnas: { cantidad: { posicion: 0 } } });
  assert.equal(r.columnas.cantidad.posicion, 0);
  assert.equal(recetaAporta(r), true);
});

test("la columna marcada solo se guarda si el criterio la usa", () => {
  const conColumna = recetaValida({ enviado: { criterio: "COLUMNA_MARCADA", columna: "ENV" } });
  assert.equal(conColumna.enviado.columna, "ENV");
  // Con otro criterio, la columna sobra: guardarla dejaría un dato que nada lee
  // y que el día que alguien cambie el criterio parecería vigente.
  const sinColumna = recetaValida({ enviado: { criterio: "TODOS", columna: "ENV" } });
  assert.equal(sinColumna.enviado.columna, null);
});

test("LA RECETA NO GUARDA IDENTIDAD DE PRODUCTOS", () => {
  // Códigos, alias, descripciones y presentaciones viven en
  // ProductoCodigoProveedor, que es lo que hace que Listas y Facturas compartan
  // lo que aprenden. Una segunda memoria acá haría que el día que difieran nadie
  // supiera cuál manda.
  const r = recetaValida({
    codigoProveedor: "ABC",
    aliases: [{ descripcionProveedor: "MARLBORO", productoBaseId: 3 }],
    productoBaseId: 3,
    presentacionProveedor: "BOX",
  });
  const serializada = JSON.stringify(r);
  assert.ok(!serializada.includes("ABC"));
  assert.ok(!serializada.includes("MARLBORO"));
  assert.ok(!serializada.includes("productoBaseId"));
  assert.ok(!serializada.includes("presentacionProveedor"));

  // Y el archivo tampoco NOMBRA la tabla de identidad, sin contar comentarios:
  // no la lee ni la escribe.
  const codigo = readFileSync(new URL("./recetaDeLectura.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.ok(!codigo.includes("ProductoCodigoProveedor"));
  assert.ok(!codigo.includes("productoCodigoProveedor"));
});

test("la tolerancia comercial es el ÚNICO número que la receta guarda", () => {
  const r = recetaValida({ toleranciaEscalaPct: 25 });
  assert.equal(r.toleranciaEscalaPct, 25);
  // Fuera de rango cae a null para que rija el default único.
  assert.equal(recetaValida({ toleranciaEscalaPct: -1 }).toleranciaEscalaPct, null);
  assert.equal(recetaValida({ toleranciaEscalaPct: 5000 }).toleranciaEscalaPct, null);
  assert.equal(recetaValida({}).toleranciaEscalaPct, null);
});

test("EL null DE LA RECETA NO SE CONVIERTE EN false", () => {
  // "La receta no opina sobre si hay columna de subtotal" y "la receta dice que
  // no hay" llevan a decisiones opuestas. Con `false`, todo subtotal leído se
  // descartaría en silencio.
  const sinOpinion = parametrosDeLectura(recetaValida({}));
  assert.equal(sinOpinion.hayColumnaSubtotal, null);
  const dice = parametrosDeLectura(recetaValida({ subtotal: { hayColumna: false } }));
  assert.equal(dice.hayColumnaSubtotal, false);
});

test("los parámetros de lectura hablan el idioma de prepararLineas", () => {
  const p = parametrosDeLectura(
    recetaValida({ cantidadEn: "BULTO", facturaPor: "BULTO", toleranciaEscalaPct: 30 })
  );
  assert.equal(p.cantidadEn, "BULTO");
  assert.equal(p.facturaPor, "BULTO");
  assert.equal(p.toleranciaEscalaPct, 30);
  // Sin receta, `facturaPor` cae a UNIDAD, que es el comportamiento de siempre.
  assert.equal(parametrosDeLectura(null).facturaPor, "UNIDAD");
});

test("la receta se explica en castellano, con lo que se ENTENDIÓ", () => {
  const r = recetaValida({
    columnas: { cantidad: { encabezado: "ENVIADO", posicion: 0 } },
    enviado: { criterio: "CANTIDAD_PRESENTE" },
    cantidadEn: "UNIDAD",
    subtotal: { hayColumna: true, incluyeBonificacion: true },
    variante: { pistas: ["CONSUMIDOR FINAL"] },
  });
  const lineas = recetaEnCastellano(r);
  assert.ok(lineas.some((l) => l.includes("La cantidad sale de \"ENVIADO\"")), lineas.join(" | "));
  assert.ok(lineas.some((l) => l.includes("no fue enviado")));
  assert.ok(lineas.some((l) => l.includes("unidades sueltas")));
  assert.ok(lineas.some((l) => l.includes("bonificación aplicada")));
  assert.ok(lineas.some((l) => l.includes("CONSUMIDOR FINAL")));
});

test("una columna sin encabezado se explica por su posición, empezando en 1", () => {
  const r = recetaValida({ columnas: { cantidad: { posicion: 0 } } });
  assert.ok(recetaEnCastellano(r)[0].includes("la columna 1"));
});

test("los campos posibles son exactamente los siete del documento", () => {
  assert.deepEqual(CAMPOS, [
    "codigo",
    "descripcion",
    "cantidad",
    "unidad",
    "precioUnitario",
    "bonificacionPct",
    "subtotal",
  ]);
});
