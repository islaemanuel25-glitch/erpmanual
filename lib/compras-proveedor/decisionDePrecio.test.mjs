import test from "node:test";
import assert from "node:assert/strict";

import {
  DECISION_DE_PRECIO,
  decisionVencida,
  decisionVigente,
  mismoPrecio,
  queCambioDesdeLaDecision,
} from "@/lib/compras-proveedor/decisionDePrecio";
import {
  ESTADO_LINEA,
  FILTRO,
  estadoDeLinea,
  hayQueDecidirElPrecio,
  opcionesDeFiltro,
  pasaFiltro,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";

// ── LOS NÚMEROS SON LOS DEL PAPEL, NO INVENTADOS ───────────────────────────
//
// Renglón 110 del comprobante 5 del pedido 232, medido contra producción: la
// factura trae el bulto a 33.600 y el pedido lo tenía a 34.603,20. Son 8 bultos
// facturados como 80 unidades, que es por lo que la cantidad viene convertida.
//
// Importa que sean los reales: un fixture "razonable" escrito a mano es cómo
// tres candados de este repo quedaron verdes para siempre probando una
// combinación de campos que el endpoint no manda nunca.
const FACTURA = 33600;
const PROPIO = 34603.2;

const fila = (extra = {}) => ({
  lineaId: 110,
  textoCrudo: "PHILIPS MORRIS 10",
  producto: "Philips 10",
  productoLocalId: 6079,
  productoBaseId: 2043,
  pedidoDetalleId: 2574,
  cantidad: 80,
  cantidadPedida: 8,
  unidad: { unidad: "POR_UNIDAD", lecturas: { porUnidad: { bultos: 8 }, porBulto: { bultos: 80 } } },
  costoFactura: FACTURA,
  costoCatalogo: PROPIO,
  subtotal: 268800,
  decisionPrecio: null,
  ...extra,
});

const decision = (extra = {}) => ({
  decision: DECISION_DE_PRECIO.DEJA_EL_MIO,
  precioFacturado: FACTURA,
  precioPropio: PROPIO,
  decididaEn: new Date("2026-09-20T12:00:00Z"),
  ...extra,
});

// ── SIN DECISIÓN, LA PREGUNTA ESTÁ ─────────────────────────────────────────

test("sin nada decidido, la línea pregunta por el precio y va a Revisar", () => {
  const f = fila();
  assert.equal(hayQueDecidirElPrecio(f), true);
  assert.equal(estadoDeLinea(f), ESTADO_LINEA.PRECIO_DISTINTO);
  assert.equal(pasaFiltro(f, FILTRO.REVISAR), true);
});

// ── LAS DOS RESPUESTAS CALLAN LA PREGUNTA ──────────────────────────────────

test("con 'dejo el mío' guardado sobre estos dos precios, no se vuelve a preguntar", () => {
  // Es la respuesta que no deja ningún otro rastro: no escribe costo, no toca
  // el pedido. Si no la guardara esta tabla, sería la única que vuelve a
  // preguntar en cada factura — que es de lo que se trata la tanda.
  const f = fila({ decisionPrecio: decision() });
  assert.equal(decisionVigente(f)?.decision, DECISION_DE_PRECIO.DEJA_EL_MIO);
  assert.equal(hayQueDecidirElPrecio(f), false);
  assert.equal(estadoDeLinea(f), ESTADO_LINEA.COINCIDE, "ya no es algo a resolver");
  assert.equal(pasaFiltro(f, FILTRO.REVISAR), false);
});

test("con 'acepto el de la factura' guardado, tampoco se vuelve a preguntar", () => {
  const f = fila({ decisionPrecio: decision({ decision: DECISION_DE_PRECIO.ACEPTA_FACTURA }) });
  assert.equal(hayQueDecidirElPrecio(f), false);
  assert.equal(estadoDeLinea(f), ESTADO_LINEA.COINCIDE);
});

test("el contador de 'Revisar' no cuenta las que solo tenían el precio decidido", () => {
  // El número de arriba y lo que se ve abajo tienen que decir lo mismo: si la
  // tarjeta ya no pregunta, el filtro no la puede seguir contando.
  const sinDecidir = [fila(), fila({ lineaId: 111, pedidoDetalleId: 2575 })];
  const decididas = sinDecidir.map((f) => ({ ...f, decisionPrecio: decision() }));

  const antes = opcionesDeFiltro(sinDecidir).find((o) => o.clave === FILTRO.REVISAR);
  const despues = opcionesDeFiltro(decididas).find((o) => o.clave === FILTRO.REVISAR);
  assert.equal(antes.cantidad, 2);
  assert.equal(despues.cantidad, 0);
});

// ── Y SE VENCE CUANDO LA COMPARACIÓN ES OTRA ───────────────────────────────

test("si la factura trae otro precio, la decisión ya no aplica y se pregunta de nuevo", () => {
  const f = fila({ costoFactura: 35000, decisionPrecio: decision() });
  assert.equal(decisionVigente(f), null);
  assert.equal(hayQueDecidirElPrecio(f), true);
  assert.equal(estadoDeLinea(f), ESTADO_LINEA.PRECIO_DISTINTO);
  // Y se puede decir QUÉ se movió, para no preguntar como si nunca se hubiera
  // contestado.
  assert.equal(decisionVencida(f)?.decision, DECISION_DE_PRECIO.DEJA_EL_MIO);
  assert.equal(queCambioDesdeLaDecision(f), "FACTURA");
});

test("si cambió el costo propio, la comparación es otra y también se pregunta", () => {
  const f = fila({ costoCatalogo: 30000, decisionPrecio: decision() });
  assert.equal(decisionVigente(f), null);
  assert.equal(hayQueDecidirElPrecio(f), true);
  assert.equal(queCambioDesdeLaDecision(f), "PROPIO");
});

test("una decisión con un valor desconocido no calla nada", () => {
  // Un valor viejo o roto no puede hacer desaparecer una pregunta: ante la duda
  // se pregunta, que es el lado seguro.
  const f = fila({ decisionPrecio: decision({ decision: "LO_QUE_SEA" }) });
  assert.equal(decisionVigente(f), null);
  assert.equal(decisionVencida(f), null, "tampoco se muestra como una decisión anterior");
  assert.equal(hayQueDecidirElPrecio(f), true);
});

// ── LA TOLERANCIA, CON EL CASO QUE LA OBLIGA ───────────────────────────────

test("el error de punto flotante de precio × pack NO vence una decisión", () => {
  // El precio de bulto sale de `precioFinal * factorPack` en punto flotante:
  // 1000,06 por 10 da 10000.599999999999, y la base lo devuelve como 10000.6.
  // Medido barriendo dos millones de combinaciones de precio con dos decimales
  // por los packs usuales: el 23,9 % no vuelve igual. Con comparación exacta,
  // una de cada cuatro decisiones se vencería sola en la factura siguiente sin
  // que nada hubiera cambiado.
  const calculado = 1000.06 * 10;
  const guardado = 10000.6;
  assert.notEqual(calculado, guardado, "si esto fuera igual, la tolerancia no haría falta");
  assert.equal(mismoPrecio(calculado, guardado), true);

  const f = fila({
    costoFactura: calculado,
    costoCatalogo: 12000,
    decisionPrecio: decision({ precioFacturado: guardado, precioPropio: 12000 }),
  });
  assert.equal(hayQueDecidirElPrecio(f), false);
});

test("un peso de diferencia SÍ vence la decisión", () => {
  // La tolerancia cubre el redondeo, no un precio nuevo. Las diferencias reales
  // del comprobante 5 van de 480 a 3.960 pesos: cinco órdenes de magnitud
  // arriba del centavo.
  const f = fila({ costoFactura: FACTURA + 1, decisionPrecio: decision() });
  assert.equal(decisionVigente(f), null);
  assert.equal(hayQueDecidirElPrecio(f), true);
});

test("sin uno de los dos números no se puede afirmar que sea el mismo precio", () => {
  assert.equal(mismoPrecio(null, 100), false);
  assert.equal(mismoPrecio(100, undefined), false);
  assert.equal(decisionVigente(fila({ costoCatalogo: null, decisionPrecio: decision() })), null);
});

// ── LA DECISIÓN LLEGA A LA FILA POR EL CAMINO REAL ─────────────────────────

test("la fila que arma el endpoint conserva la decisión y el producto base", () => {
  // La forma de la línea es la que devuelve `analizarLineas`: la decisión se
  // adjunta ahí, con el `productoBaseId` ya resuelto. Si este campo no viajara,
  // todos los candados de arriba seguirían verdes sobre una fila que la
  // pantalla nunca recibe — que es el defecto más repetido de este repo.
  const DETALLES = [
    { id: 2574, productoBaseId: 2043, nombre: "Philips 10", cantidad: 8, precioCosto: PROPIO, unidad: "BULTO" },
  ];
  const guardada = decision();
  const r = filasDeConciliacion({
    comprobantes: [
      {
        id: 5,
        estado: "SIN_TOTAL",
        tipo: "FC",
        puntoVenta: "0003",
        numero: "00012345",
        lineas: [
          {
            id: 110,
            textoCrudo: "PHILIPS MORRIS 10",
            cantidad: 80,
            subtotalImpreso: 268800,
            productoLocalId: 6079,
            productoBaseId: 2043,
            pedidoDetalleId: 2574,
            pedidoDetalle: DETALLES[0],
            decisionPrecio: guardada,
            precio: { precioAEscribir: FACTURA },
          },
        ],
      },
    ],
    detalles: DETALLES,
  });

  const f = r.grupos[0].filas[0];
  assert.equal(f.productoBaseId, 2043);
  assert.deepEqual(f.decisionPrecio, guardada);
  // Y con eso la fila completa —no el fixture de arriba— ya no pregunta.
  assert.equal(f.costoFactura, FACTURA);
  assert.equal(Number(f.costoCatalogo), PROPIO);
  assert.equal(hayQueDecidirElPrecio(f), false);
});

test("CONTRAPRUEBA: mirando solo el precio de la factura, una decisión vieja callaría de más", () => {
  // Es la versión rota más plausible: guardar y comparar UN número. Con el
  // costo propio movido, esa versión sigue diciendo "ya decidido" sobre una
  // comparación que nadie vio nunca, y el precio del papel entra —o no entra—
  // por una decisión tomada sobre otra diferencia.
  const f = fila({ costoCatalogo: 30000, decisionPrecio: decision() });
  const soloLaFactura = (x) => mismoPrecio(x.decisionPrecio?.precioFacturado, x.costoFactura);

  assert.equal(soloLaFactura(f), true, "la versión rota no ve nada raro");
  assert.equal(decisionVigente(f), null, "la buena vence la decisión");
  assert.notEqual(
    soloLaFactura(f),
    decisionVigente(f) != null,
    "si estas dos coincidieran, el candado no estaría afirmando el segundo número"
  );
});
