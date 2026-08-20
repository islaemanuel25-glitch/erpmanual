// Tests de la normalización de lectura del costo de transferencias.
//
// El defecto: `TransferenciaDetalle.precioCosto` guarda el costo en la escala
// COMERCIAL del producto (por bulto si la presentación es pack/cajón), mientras
// que `cantidad` y `recibido` están en la escala de `unidadEnviada`. Al enviar
// por UNIDAD un producto con presentación de pack, el documento multiplicaba
// unidades físicas por un precio de bulto y sobrevalorizaba por el factor.
//
// Los casos 10-14 son el caso REAL de la Transferencia 4 en producción.
//
// Las aserciones sobre las rutas se hacen sobre el fuente SIN COMENTARIOS, para
// no validar contra un texto explicativo.
//
// Correr con: node --test lib/transferencias/costoTransferencia.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ERRORES_COSTO,
  UNIDADES_ESCALA_BULTO,
  resolverCostoTransferencia,
  costoEstaEnEscalaDeBulto,
  cantidadAValorizar,
  valorizarDetalle,
  origenEsDepositoDe,
  exigirProductoCompleto,
  COLUMNAS_DEL_FIAMBRE,
} from "./costoTransferencia.js";
import { valorEnLaEscalaDeVenta, ESCALA_PIEZA } from "../precios/escalaDeVenta.js";
import {
  importeDeLinea,
  importeDeDetalle,
  importeDeDetalleCentavos,
} from "./agregadosPeriodo.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");

const leerSinComentarios = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const SUPERFICIES = [
  "app/api/transferencias/detalle/route.js",
  "app/api/transferencias/listar/route.js",
  "app/api/transferencias/pdf/route.js",
  "app/api/transferencias/pdf-recepcion/route.js",
];

// Fichas reales de producción.
const AGRIDULCE = { unidad_medida: "pack", factor_pack: 20 };
const AZUCARADAS = { unidad_medida: "pack", factor_pack: 28 };
const CLASICAS = { unidad_medida: "pack", factor_pack: 24 };
const SUELTO = { unidad_medida: "unidad", factor_pack: 1 };
const CAJON = { unidad_medida: "cajon", factor_pack: 12 };

// `origenEsDeposito` se pasa SIEMPRE y de forma visible. Ojo con lo que esto es
// y lo que no: es un dato de prueba elegido en la firma del helper, no el default
// que la función tenía adentro. Aquél hacía que olvidarse se viera igual que
// decidir, y por eso se sacó el 2026-08-20. Que la función LANCE cuando falta lo
// comprueban los candados 22a y 22b, más abajo.
const costo = (precioCosto, unidadEnviada, base, origenEsDeposito = false) =>
  resolverCostoTransferencia({
    precioCosto,
    unidadEnviada,
    unidadMedida: base.unidad_medida,
    factorPack: base.factor_pack,
    origenEsDeposito,
  });

// ── 1-5. Matriz unidad × presentación ────────────────────────────────────────

test("1. UNIDAD + producto unidad + factor 1 → costo igual", () => {
  assert.equal(costo(1500, "UNIDAD", SUELTO), 1500);
});

test("2. UNIDAD + pack x20 → costo / 20", () => {
  assert.equal(costo(19200, "UNIDAD", AGRIDULCE), 960);
});

test("3. UNIDAD + cajon x12 → costo / 12", () => {
  assert.equal(costo(8930 * 12, "UNIDAD", CAJON), 8930);
  assert.equal(costo(1200, "UNIDAD", CAJON), 100);
});

test("4. BULTO + pack x20 → costo igual (las escalas ya coinciden)", () => {
  assert.equal(costo(19200, "BULTO", AGRIDULCE), 19200);
});

test("5. BULTO + cajon x12 → costo igual", () => {
  assert.equal(costo(1200, "BULTO", CAJON), 1200);
});

// ── 6-9. Bordes y errores ────────────────────────────────────────────────────

test("6. factor null / 0 / 1 en producto unidad → costo igual, sin dividir", () => {
  for (const f of [null, undefined, 0, 1]) {
    assert.equal(costo(1500, "UNIDAD", { unidad_medida: "unidad", factor_pack: f }), 1500);
  }
});

test("7. factor inválido en producto pack → error tipado, no división silenciosa", () => {
  for (const f of [0, -5, "abc", NaN]) {
    assert.throws(
      () => costo(19200, "UNIDAD", { unidad_medida: "pack", factor_pack: f }),
      (e) => {
        assert.equal(e.code, ERRORES_COSTO.FACTOR_INVALIDO);
        return true;
      },
      `factor ${f} debería fallar`
    );
  }
});

test("7b. pack sin factor (null) devuelve el costo tal cual, no rompe la lectura", () => {
  assert.equal(costo(19200, "UNIDAD", { unidad_medida: "pack", factor_pack: null }), 19200);
});

test("7c. pack con factor 1 no divide", () => {
  assert.equal(costo(19200, "UNIDAD", { unidad_medida: "pack", factor_pack: 1 }), 19200);
});

test("8. unidadEnviada desconocida → error", () => {
  for (const u of ["CAJON", "", null, undefined, "unidades"]) {
    assert.throws(
      () => costo(19200, u, AGRIDULCE),
      (e) => e.code === ERRORES_COSTO.UNIDAD_DESCONOCIDA
    );
  }
});

test("9. precioCosto no numérico → error", () => {
  for (const c of [null, undefined, "abc", {}, [], true, Infinity, NaN]) {
    assert.throws(
      () => costo(c, "UNIDAD", AGRIDULCE),
      (e) => e.code === ERRORES_COSTO.COSTO_INVALIDO,
      `costo ${JSON.stringify(String(c))} debería fallar`
    );
  }
});

test("9b. acepta Decimal de Prisma y strings numéricos", () => {
  assert.equal(costo("19200.00", "UNIDAD", AGRIDULCE), 960);
  assert.equal(costo({ toString: () => "26880.00" }, "UNIDAD", AZUCARADAS), 960);
});

// ── 10-14. Caso real: Transferencia 4 ────────────────────────────────────────

test("10. Agridulce: 19.200 / 20 = 960", () => {
  assert.equal(costo(19200, "UNIDAD", AGRIDULCE), 960);
});

test("11. Azucaradas: 26.880 / 28 = 960", () => {
  assert.equal(costo(26880, "UNIDAD", AZUCARADAS), 960);
});

test("12. Clásicas: 23.040 / 24 = 960", () => {
  assert.equal(costo(23040, "UNIDAD", CLASICAS), 960);
});

// De acá en adelante el origen se pasa SIEMPRE y explícito: `valorizarDetalle`
// dejó de tener default el 2026-08-20. En estos casos es `false` porque son packs
// y la rama del fiambre no los toca; el punto no es el valor, es que esté dicho.
test("13. subtotal por producto: 5 recibidas × 960 = 4.800", () => {
  const v = valorizarDetalle(
    { cantidad: 10, recibido: 5, unidadEnviada: "UNIDAD", precioCosto: 26880 },
    AZUCARADAS,
    { origenEsDeposito: false }
  );
  assert.equal(v.costoUnitario, 960);
  assert.equal(v.cantidad, 5);
  assert.equal(v.subtotal, 4800);
});

test("14. total de la Transferencia 4 = 14.400 (antes 345.600)", () => {
  const filas = [
    { detalle: { cantidad: 10, recibido: 5, unidadEnviada: "UNIDAD", precioCosto: 19200 }, base: AGRIDULCE },
    { detalle: { cantidad: 10, recibido: 5, unidadEnviada: "UNIDAD", precioCosto: 26880 }, base: AZUCARADAS },
    { detalle: { cantidad: 10, recibido: 5, unidadEnviada: "UNIDAD", precioCosto: 23040 }, base: CLASICAS },
  ];
  const total = filas.reduce(
    (acc, f) => acc + valorizarDetalle(f.detalle, f.base, { origenEsDeposito: false }).subtotal,
    0
  );
  assert.equal(total, 14400);

  // Lo que mostraba antes, para dejar el defecto documentado.
  const totalViejo = filas.reduce((acc, f) => acc + 5 * f.detalle.precioCosto, 0);
  assert.equal(totalViejo, 345600);
});

// ── 15-17. Compatibilidad y cantidad a valorizar ─────────────────────────────

test("15. transferencia manual por BULTO mantiene el costo de pack", () => {
  // Fila real: 361 LATA X24, cantidad 3 bultos, costo 23.500 por bulto.
  const v = valorizarDetalle(
    { cantidad: 3, recibido: 3, unidadEnviada: "BULTO", precioCosto: 23500 },
    { unidad_medida: "pack", factor_pack: 24 },
    { origenEsDeposito: false }
  );
  assert.equal(v.costoUnitario, 23500, "no se divide: la cantidad ya está en bultos");
  assert.equal(v.subtotal, 70500);
});

test("16. recibido 0 → subtotal 0, no el total enviado", () => {
  const v = valorizarDetalle(
    { cantidad: 10, recibido: 0, unidadEnviada: "UNIDAD", precioCosto: 26880 },
    AZUCARADAS,
    { origenEsDeposito: false }
  );
  assert.equal(v.cantidad, 0);
  assert.equal(v.subtotal, 0);
});

test("17. recibido null → valoriza lo enviado", () => {
  const v = valorizarDetalle(
    { cantidad: 10, recibido: null, unidadEnviada: "UNIDAD", precioCosto: 26880 },
    AZUCARADAS,
    { origenEsDeposito: false }
  );
  assert.equal(v.cantidad, 10);
  assert.equal(v.subtotal, 9600);
});

test("17b. cantidadAValorizar no usa truthiness", () => {
  assert.equal(cantidadAValorizar({ cantidad: 20, recibido: 0 }), 0);
  assert.equal(cantidadAValorizar({ cantidad: 20, recibido: null }), 20);
  assert.equal(cantidadAValorizar({ cantidad: 20, recibido: 18 }), 18);
});

test("17c. el remito de envío valoriza siempre lo enviado", () => {
  const v = valorizarDetalle(
    { cantidad: 10, recibido: 5, unidadEnviada: "UNIDAD", precioCosto: 26880 },
    AZUCARADAS,
    { cantidadModo: "ENVIADA", origenEsDeposito: false }
  );
  assert.equal(v.cantidad, 10);
  assert.equal(v.subtotal, 9600);
});

// ── 18-20. Invariantes de integración ────────────────────────────────────────

test("18. las cuatro superficies usan el helper compartido, sin duplicar la fórmula", () => {
  for (const ruta of SUPERFICIES) {
    const src = leerSinComentarios(ruta);
    // La fórmula puede llegar de dos maneras y las dos valen, porque en las dos
    // vive en UN solo lugar: importando el helper directamente, o a través de
    // lib/transferencias/agregadosPeriodo.js, que lo importa (ver 18d). Lo que
    // el invariante prohíbe es reimplementarla, no la indirección.
    const directo = /from "@\/lib\/transferencias\/costoTransferencia"/.test(src);
    const viaAgregados = /from "@\/lib\/transferencias\/agregadosPeriodo"/.test(src);
    assert.ok(
      directo || viaAgregados,
      `${ruta} debe llegar al helper, directo o vía agregadosPeriodo`
    );
    assert.ok(
      /resolverCostoTransferencia|valorizarDetalle|importeDeDetalle/.test(src),
      `${ruta} debe usar el helper`
    );
    assert.ok(
      !/precioCosto\s*\/\s*factor|\/\s*factor_pack/.test(src),
      `${ruta} no debe reimplementar la división`
    );
  }
});

test("18d. agregadosPeriodo no reimplementa la fórmula: la importa", () => {
  const src = leerSinComentarios("lib/transferencias/agregadosPeriodo.js");
  assert.ok(
    /from "\.\/costoTransferencia\.js"/.test(src),
    "agregadosPeriodo debe importar el helper de costo"
  );
  assert.ok(/valorizarDetalle/.test(src), "agregadosPeriodo debe usar valorizarDetalle");
  assert.ok(
    !/precioCosto\s*\/\s*factor|\/\s*factor_pack/.test(src),
    "agregadosPeriodo no debe reimplementar la división"
  );
});

test("18b. ninguna superficie conserva la valorización vieja por truthiness", () => {
  for (const ruta of SUPERFICIES) {
    const src = leerSinComentarios(ruta);
    assert.ok(
      !/cantidadRecibida\s*>\s*0\s*\?\s*cantidadRecibida\s*:\s*cantidadEnviada/.test(src),
      `${ruta} todavía decide la cantidad con truthiness`
    );
  }
});

test("18c. listar carga los campos que el helper necesita", () => {
  const src = leerSinComentarios("app/api/transferencias/listar/route.js");
  for (const campo of ["unidadEnviada: true", "unidad_medida: true", "factor_pack: true"]) {
    assert.ok(src.includes(campo), `falta el select ${campo}`);
  }
});

test("19. no se modifica el precioCosto persistido", () => {
  for (const ruta of SUPERFICIES) {
    const src = leerSinComentarios(ruta);
    assert.ok(
      !/transferenciaDetalle\.update/.test(src),
      `${ruta} es de lectura: no debe escribir el detalle`
    );
  }
  // El helper es puro: no muta la entrada.
  const detalle = { cantidad: 10, recibido: 5, unidadEnviada: "UNIDAD", precioCosto: 26880 };
  const copia = { ...detalle };
  valorizarDetalle(detalle, AZUCARADAS, { origenEsDeposito: false });
  assert.deepEqual(detalle, copia, "el helper no debe mutar el detalle");
});

test("20. no se toca ProductoLocal.precio_costo", () => {
  for (const ruta of SUPERFICIES) {
    const src = leerSinComentarios(ruta);
    assert.ok(
      !/productoLocal\.(update|upsert|create)/.test(src),
      `${ruta} no debe escribir ProductoLocal`
    );
  }
});

test("20b. el enum de presentaciones no incluye valores inexistentes", () => {
  // El enum real es: unidad | pack | cajon | kg.
  assert.deepEqual(UNIDADES_ESCALA_BULTO, ["pack", "cajon"]);
  assert.ok(!UNIDADES_ESCALA_BULTO.includes("caja"));
  assert.ok(!UNIDADES_ESCALA_BULTO.includes("carton"));
});

test("20c. costoEstaEnEscalaDeBulto refleja la regla de buscar-producto", () => {
  assert.equal(costoEstaEnEscalaDeBulto({ unidadMedida: "pack", factorPack: 28 }), true);
  assert.equal(costoEstaEnEscalaDeBulto({ unidadMedida: "cajon", factorPack: 12 }), true);
  assert.equal(costoEstaEnEscalaDeBulto({ unidadMedida: "pack", factorPack: 1 }), false);
  assert.equal(costoEstaEnEscalaDeBulto({ unidadMedida: "unidad", factorPack: 20 }), false);
  assert.equal(costoEstaEnEscalaDeBulto({ unidadMedida: "kg", factorPack: 20 }), false);
});

test("20d. la presentación manda, no modo_envio: pack + SOLO_UNIDAD igual divide", () => {
  // Es exactamente el caso de 9 de Oro: modo_envio SOLO_UNIDAD pero el costo
  // está cargado por bulto. Mirar modo_envio en vez de la presentación fue lo
  // que dejó pasar el defecto.
  assert.equal(costo(26880, "UNIDAD", { unidad_medida: "pack", factor_pack: 28 }), 960);
});

// ── 21. EL FIAMBRE DE PIEZA FIJA ─────────────────────────────────────────────
//
// Incidente del 2026-08-19, transferencia #97. Estos productos tienen
// `unidad_medida = kg`, así que caían en la rama de "presentación unitaria: el
// costo ya es por unidad" y volvían SIN convertir — pero su costo está por kilo
// y la cantidad, saliendo del depósito, está en PIEZAS.
//
// Los dos signos están a propósito: el error seguía al peso de la pieza, así que
// con más de un kilo valorizaba de menos y con menos de un kilo de MÁS. Un
// candado con un solo caso habría dejado la mitad del defecto sin cubrir, y es
// justo la mitad que nadie mira porque "de más" no se reclama.

// Fichas reales de producción.
const PAPAS = {
  unidad_medida: "kg", factor_pack: null, modoCompraProveedor: "UNIDAD",
  pesoEsFijo: true, modoVentaDeposito: "PIEZA", pesoReferenciaKg:2.5,
};
const CHISITOS = {
  unidad_medida: "kg", factor_pack: null, modoCompraProveedor: "UNIDAD",
  pesoEsFijo: true, modoVentaDeposito: "PIEZA", pesoReferenciaKg:0.4,
};
const QUESO = {
  // Mismo `unidad_medida` y con peso cargado, pero NO es de pieza fija: se vende
  // por peso. Es el control que separa "kg" de "pieza".
  unidad_medida: "kg", factor_pack: null,
  pesoEsFijo: false, modoVentaDeposito: "PESO", pesoReferenciaKg: 4.5,
};

const costoPieza = (precioCosto, base, origenEsDeposito = true) =>
  resolverCostoTransferencia({
    precioCosto,
    unidadEnviada: "UNIDAD",
    unidadMedida: base.unidad_medida,
    factorPack: base.factor_pack,
    pesoEsFijo: base.pesoEsFijo,
    pesoReferenciaKg: base.pesoReferenciaKg,
    modoVentaDeposito: base.modoVentaDeposito,
    modoCompraProveedor: base.modoCompraProveedor,
    origenEsDeposito,
  });

test("21a. MÁS de un kilo — Papas Congeladas: 3.800 × 2,5 = 9.500", () => {
  // El caso que destapó el incidente. Es el mismo número que el POS del depósito
  // cobró por ese producto en la venta 7726: costo por pieza, no por kilo.
  assert.equal(costoPieza(3800, PAPAS), 9500);
});

test("21b. MENOS de un kilo — QUETH CHISITOS 400G: 3.800 × 0,4 = 1.520", () => {
  // El signo contrario: acá el costo por pieza es MENOR que el guardado, así que
  // el documento venía valorizando de MÁS. Sin este caso, un arreglo que sumara
  // en vez de multiplicar pasaría igual.
  assert.equal(costoPieza(3800, CHISITOS), 1520);
});

test("21c. un kg que NO es de pieza fija no se toca", () => {
  // El control. Si esto se rompiera, el arreglo estaría convirtiendo todos los
  // productos por kilo y rompería las 90 líneas que hoy están bien.
  assert.equal(costoPieza(7800, QUESO), 7800);
});

test("21d. la UBICACIÓN manda: desde un local la cantidad está en kg, no en piezas", () => {
  // En el depósito ese stock se cuenta en piezas; en un local, en kilos. Si se
  // convirtiera igual, una transferencia entre locales valorizaría mal en
  // silencio. Hoy no existe ninguna, y por eso mismo tiene que estar cubierto.
  assert.equal(costoPieza(3800, PAPAS, false), 3800);
});

test("21e. sin peso de referencia no se inventa una conversión", () => {
  assert.equal(costoPieza(3800, { ...PAPAS, pesoReferenciaKg: null }), 3800);
  assert.equal(costoPieza(3800, { ...PAPAS, pesoReferenciaKg: 0 }), 3800);
});

test("21f. por BULTO no se convierte, aunque sea de pieza fija", () => {
  const v = resolverCostoTransferencia({
    precioCosto: 3800, unidadEnviada: "BULTO",
    unidadMedida: PAPAS.unidad_medida, pesoEsFijo: true,
    modoVentaDeposito: "PIEZA", pesoReferenciaKg: 2.5, origenEsDeposito: true,
  });
  assert.equal(v, 3800);
});

test("21g. el subtotal de la línea real de la #97: 2 piezas = 19.000, no 7.600", () => {
  const v = valorizarDetalle(
    { cantidad: 2, recibido: null, unidadEnviada: "UNIDAD", precioCosto: 3800 },
    PAPAS,
    { origenEsDeposito: true }
  );
  assert.equal(v.costoUnitario, 9500);
  assert.equal(v.subtotal, 19000);

  // Lo que mostraba antes, para dejar el defecto documentado.
  assert.equal(2 * 3800, 7600);
});

test("21h. LA CUENTA NO SE ESCRIBE ACÁ: sale de la misma pieza que el POS", () => {
  // Si alguien reemplaza la llamada por una multiplicación propia, este candado
  // no lo ve — pero el de abajo sí. Acá se afirma que el resultado COINCIDE con
  // la pieza compartida, que es lo que impide que diverjan.
  const porLaPieza = valorEnLaEscalaDeVenta({
    escala: ESCALA_PIEZA, valor: 3800, pesoReferenciaKg: 2.5,
  });
  assert.equal(costoPieza(3800, PAPAS), porLaPieza);
});

test("21j. LAS SUPERFICIES PASAN EL ORIGEN, o el arreglo no corre nunca", () => {
  // Éste es el candado que importa más de todos los de arriba. `origenEsDeposito`
  // tiene default `false` para no romper a nadie, así que una superficie que se
  // olvide de pasarlo sigue andando y sigue valorizando MAL — en silencio, con
  // todos los tests de conversión en verde.
  //
  // Es exactamente la forma de la defensa escrita e inalcanzable: la rama existe,
  // está probada, y ningún camino real la ejerce.
  const CONSUMIDORES = [
    "app/api/transferencias/detalle/route.js",
    "app/api/transferencias/pdf/route.js",
    "app/api/transferencias/pdf-recepcion/route.js",
    "app/api/transferencias/listar/route.js",
    "lib/transferencias/agregadosPeriodo.js",
  ];

  for (const ruta of CONSUMIDORES) {
    const src = leerSinComentarios(ruta);
    assert.match(
      src,
      /origenEsDeposito/,
      `${ruta} no pasa origenEsDeposito: el fiambre de pieza fija se valoriza por kilo una cantidad que está en piezas`
    );
  }

  // ⚠️ ACÁ HABÍA UN CONTADOR CON EXPRESIÓN REGULAR Y SE DEJÓ ENGAÑAR.
  //
  // Contaba llamadas y restaba 2 por las declaraciones. Pero las declaraciones
  // dicen `{ origenEsDeposito = false }` en su firma, así que también matcheaban
  // el patrón "con origen": se sumaban de un lado y se restaban del otro, daba
  // 5 contra 5, y pasó en VERDE con DOS llamadores rotos —`importeDeDetalle` y
  // `resumenPorEstado`—. Uno de ellos llegó a producción y mostró la
  // transferencia #97 en 144.086,40 donde su detalle decía 155.486,40.
  //
  // Contar texto no sirve para esto y no se reemplaza por otro conteo más
  // astuto. Lo que sí sirve es EJERCER: ahora `origenEsDeposito` es obligatorio
  // y las funciones lanzan sin él, así que el candado llama a cada una y
  // comprueba que la exigencia esté viva. Un llamador que se olvide rompe en su
  // propio test, no acá.
});

test("21k. las funciones que valorizan EXIGEN el origen — no tienen default", () => {
  // Las dos últimas se agregaron el 2026-08-20 y son la razón por la que este
  // candado no sirvió la primera vez: cubría las tres de `agregadosPeriodo` y
  // NINGUNA de las dos de este archivo, que son las que están abajo de todo. El
  // default se sacó de un lado y quedó en el otro, y el candado no podía verlo
  // porque no las nombraba. Un candado no afirma sobre lo que no enumera.
  const casos = [
    ["importeDeLinea", () => importeDeLinea({ cantidad: 1, precioCosto: 100 })],
    ["importeDeDetalleCentavos", () => importeDeDetalleCentavos([])],
    ["importeDeDetalle", () => importeDeDetalle([])],
    [
      "resolverCostoTransferencia",
      () => resolverCostoTransferencia({ precioCosto: 100, unidadEnviada: "UNIDAD", unidadMedida: "unidad" }),
    ],
    [
      "valorizarDetalle",
      () => valorizarDetalle({ cantidad: 1, unidadEnviada: "UNIDAD", precioCosto: 100 }, SUELTO),
    ],
  ];
  for (const [nombre, llamar] of casos) {
    assert.throws(
      llamar,
      /falta origenEsDeposito/,
      `${nombre} volvió a tener un default: olvidarse de pasar el origen dejó de avisar`
    );
  }
});

test("21l. y con el origen puesto valorizan normalmente", () => {
  // El par del anterior. Sin esto, una función que lance SIEMPRE también pasaría
  // el candado de arriba y nadie podría valorizar nada.
  assert.equal(importeDeDetalle([], { origenEsDeposito: false }), 0);
  assert.equal(importeDeDetalleCentavos([], { origenEsDeposito: true }), 0);
  assert.equal(
    importeDeLinea(
      {
        cantidad: 2,
        unidadEnviada: "UNIDAD",
        precioCosto: 100,
        producto: { base: { unidad_medida: "unidad", factor_pack: 1 } },
      },
      { origenEsDeposito: false }
    ),
    200
  );
});

// ── 22. LO QUE FALTABA: QUE EL DATO VENGA, NO SOLO QUE SEA UN BOOLEANO ──────

test("22a. origenEsDepositoDe distingue 'no es depósito' de 'no me lo trajiste'", () => {
  // Ésta es LA lección del 2026-08-20. `exigirOrigen` pedía un booleano, y
  // `t.origen?.es_deposito === true` siempre le daba uno: `undefined === true` es
  // `false`, un booleano impecable. Así, un select sin la columna no producía un
  // error sino UNA RESPUESTA FALSA, y el control de origen obligatorio la
  // aprobaba.
  const conLaColumna = { origen: { id: 1, nombre: "Depósito", es_deposito: true } };
  const sinLaColumna = { origen: { id: 1, nombre: "Depósito" } };
  const enUnLocal = { origen: { id: 2, nombre: "Sucursal", es_deposito: false } };

  assert.equal(origenEsDepositoDe(conLaColumna), true);
  assert.equal(origenEsDepositoDe(enUnLocal), false, "false es un valor real y tiene que pasar");
  assert.throws(
    () => origenEsDepositoDe(sinLaColumna),
    (e) => e.code === "ORIGEN_FALTANTE" && /es_deposito/.test(e.message),
    "la columna ausente tiene que frenar, no volverse 'no es depósito'"
  );
  assert.throws(() => origenEsDepositoDe({}), (e) => e.code === "ORIGEN_FALTANTE");
  assert.throws(() => origenEsDepositoDe(null), (e) => e.code === "ORIGEN_FALTANTE");
});

test("22b. exigirProductoCompleto frena el producto a medias, y solo cuando puede ser fiambre", () => {
  const completoEnKg = {
    unidad_medida: "kg",
    modoCompraProveedor: "UNIDAD",
    pesoReferenciaKg: 2.5,
    modoVentaDeposito: "PIEZA",
  };
  // No lanza: están las cuatro columnas.
  assert.doesNotThrow(() => exigirProductoCompleto(completoEnKg, "t"));

  // Tampoco lanza cuando los valores dicen "no es fiambre": `false` y `null` son
  // datos reales. Sin esta mitad, la defensa frenaría media aplicación.
  assert.doesNotThrow(() =>
    exigirProductoCompleto(
      { unidad_medida: "kg", modoCompraProveedor: "BULTO", pesoReferenciaKg: null, modoVentaDeposito: "PESO" },
      "t"
    )
  );

  // Una presentación que no es kg no puede ser fiambre de pieza fija: no se le
  // exige nada, aunque venga pelada.
  assert.doesNotThrow(() => exigirProductoCompleto({ unidad_medida: "pack", factor_pack: 24 }, "t"));
  assert.doesNotThrow(() => exigirProductoCompleto({ unidad_medida: "unidad" }, "t"));

  // Y lanza cuando falta cualquiera de las cuatro, nombrándola.
  for (const col of COLUMNAS_DEL_FIAMBRE.filter((c) => c !== "unidad_medida")) {
    const aMedias = { ...completoEnKg };
    delete aMedias[col];
    assert.throws(
      () => exigirProductoCompleto(aMedias, "t"),
      (e) => e.code === "PRODUCTO_INCOMPLETO" && e.message.includes(col),
      `sin ${col} tiene que frenar y decir cuál falta`
    );
  }
});

test("21i. y el archivo LLAMA a la pieza compartida, no reimplementa la cuenta", () => {
  const src = leerSinComentarios("lib/transferencias/costoTransferencia.js");
  assert.match(
    src, /valorEnLaEscalaDeVenta\(\{/,
    "se dejó de usar la pieza compartida: hay una tercera cuenta de costo por pieza"
  );
  assert.doesNotMatch(
    src, /costo\s*\*\s*peso|peso\s*\*\s*costo/,
    "apareció la multiplicación escrita a mano: eso es el tercer lugar que puede divergir"
  );
});
