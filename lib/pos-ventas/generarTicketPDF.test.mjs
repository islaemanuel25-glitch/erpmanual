// Tests del comprobante de venta en PDF (paginación, columnas, unidades, resumen).
//
// Se verifica el ARTEFACTO REAL: se genera el PDF y se parsea su contenido. jsPDF
// escribe los content streams sin comprimir, con la forma `X Y Td` + `(texto) Tj`
// agrupada por página, así que se puede reconstruir qué se escribió, en qué página
// y a qué X/Y (en mm, con el origen arriba-izquierda igual que el generador).
//
// Nota del parser: para un text() multilínea jsPDF emite un solo Td y varios Tj;
// esas líneas quedan con la Y de la primera. Las aserciones de posición se hacen
// sobre textos de una línea, así que no afecta.
//
// Correr con: node --test lib/pos-ventas/generarTicketPDF.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import generarTicketPDF, { planificarPaginas, _geometria } from "./generarTicketPDF.js";

const { Y_LIMITE, Y_PIE, X_IZQ, X_PRESENTACION, MIN_CONTENIDO_ULTIMA } = _geometria;
const PT_POR_MM = 72 / 25.4;
const ALTO_PT = 841.89; // A4

// ── Extracción ───────────────────────────────────────────────────────────────
// jsPDF escribe el texto con las fuentes estándar en WinAnsiEncoding (cp1252).
// latin1 coincide salvo en 0x80–0x9F, donde cp1252 mete los tipográficos: ahí caen
// el guion largo (0x97) y los puntos suspensivos (0x85) que usa el comprobante.
// Sin esta tabla el parser los vería como caracteres de control.
const CP1252_ALTO = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡",
  0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž", 0x91: "‘",
  0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—", 0x98: "˜",
  0x99: "™", 0x9a: "š", 0x9b: "›", 0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};
const deCp1252 = (str) =>
  Array.from(str, (c) => { const cp = c.charCodeAt(0); return cp >= 128 && cp <= 159 ? (CP1252_ALTO[cp] ?? c) : c; }).join("");

function extraer(buf) {
  const s = Buffer.from(buf).toString("latin1");
  const traza = [];
  let pagina = 0;
  const reStream = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = reStream.exec(s)) !== null) {
    const cuerpo = m[1];
    if (!cuerpo.includes("BT")) continue;
    pagina += 1;
    const reTok = /(-?[\d.]+)\s+(-?[\d.]+)\s+Td|\(((?:\\.|[^\\()])*)\)\s*Tj/g;
    let x = 0, y = 0, t;
    while ((t = reTok.exec(cuerpo)) !== null) {
      if (t[1] !== undefined) { x = +t[1]; y = +t[2]; continue; }
      traza.push({
        txt: deCp1252(t[3].replace(/\\([()\\])/g, "$1")),
        x: +(x / PT_POR_MM).toFixed(2),
        y: +((ALTO_PT - y) / PT_POR_MM).toFixed(2),
        pagina,
      });
    }
  }
  return traza;
}

async function gen(v, opts = { copia: true }) {
  const res = generarTicketPDF(v, { ...opts, output: "blob" });
  return { res, traza: extraer(await res.blob.arrayBuffer()) };
}

const cuenta = (traza, needle) => traza.filter((t) => t.txt.includes(needle)).length;
const exactos = (traza, txt) => traza.filter((t) => t.txt === txt);
const esFilaProducto = (t) => /^Producto \d\d/.test(t.txt) && t.x < X_PRESENTACION;

// ── Datos de prueba ──────────────────────────────────────────────────────────
const dep = (o = {}) => ({
  modo: o.modo ?? "UNIDAD",
  factorPack: o.factorPack ?? 1,
  cantidadStock: o.cantidadStock ?? null,
  unidadMedida: o.unidadMedida ?? "unidad",
  modoVentaDeposito: o.modoVentaDeposito ?? "PESO",
  modoEnvio: o.modoEnvio ?? null,
});

function item(i, extra = {}) {
  return {
    nombre: extra.nombre ?? `Producto ${String(i).padStart(2, "0")}`,
    cantidad: extra.cantidad ?? 2,
    precio: extra.precio ?? 1234.56,
    esServicio: false,
    deposito: extra.deposito ?? dep(),
    ...extra,
  };
}

function venta(n, over = {}) {
  const items = over.items || Array.from({ length: n }, (_, i) => item(i + 1));
  const subtotal = items.reduce((a, it) => a + Number(it.precio) * Number(it.cantidad), 0);
  return {
    localNombre: "depo",
    numero: 833,
    fecha: "2026-07-29T13:12:00.000Z",
    vendedor: "Administrador",
    cliente: { nombre: "Minimarket casiano", documento: "30712345678" },
    origenEsDeposito: true,
    estado: "cobrado",
    correccion: null,
    items,
    subtotal,
    descuento: 0,
    total: subtotal,
    comisionBancaria: 0,
    netoRecibido: subtotal,
    formaPago: "efectivo",
    pagos: [{ medio: "EFECTIVO", monto: subtotal }],
    ...over,
  };
}

// ── A. Encabezado ────────────────────────────────────────────────────────────

test("encabezado: COMPROBANTE DE VENTA, ya no REIMPRESIÓN — COPIA", async () => {
  const { traza } = await gen(venta(3));
  assert.equal(cuenta(traza, "COMPROBANTE DE VENTA"), 1);
  assert.equal(cuenta(traza, "REIMPRESI"), 0);
  assert.equal(cuenta(traza, "COPIA"), 0);
  assert.equal(cuenta(traza, "Copia del comprobante"), 1);
});

test("origen / destino / ticket / fecha / vendedor / forma de pago / estado", async () => {
  const { traza } = await gen(venta(3));
  assert.equal(cuenta(traza, "Origen (Dep"), 1);
  assert.equal(cuenta(traza, "Destino:"), 1);
  assert.equal(cuenta(traza, "Minimarket casiano"), 1);
  assert.equal(cuenta(traza, "Ticket #833"), 2); // encabezado + pie
  assert.equal(cuenta(traza, "Fecha:"), 1);
  assert.equal(cuenta(traza, "Vendedor: Administrador"), 1);
  assert.equal(cuenta(traza, "Forma de pago:"), 1);
  assert.equal(cuenta(traza, "Estado: Cobrado"), 1);
});

test("consumidor final cuando no hay cliente; origen neutro sin el flag", async () => {
  const a = (await gen(venta(3, { cliente: null }))).traza;
  assert.equal(cuenta(a, "Consumidor final"), 1);
  const b = (await gen(venta(3, { origenEsDeposito: undefined }))).traza;
  assert.equal(cuenta(b, "Origen (Dep"), 0);
  assert.equal(cuenta(b, "Origen (Local)"), 0);
  assert.equal(cuenta(b, "Origen:"), 1);
});

// ── B. Columnas ──────────────────────────────────────────────────────────────

test("columnas: Producto | Presentación | Cantidad | Precio | Subtotal", async () => {
  const { res, traza } = await gen(venta(3));
  for (const h of ["Producto", "Presentaci", "Cantidad", "Precio", "Subtotal"]) {
    assert.ok(cuenta(traza, h) >= 1, `falta el encabezado ${h}`);
  }
  // "Cant." viejo ya no existe.
  assert.equal(exactos(traza, "Cant.").length, 0);
  assert.equal(res.paginas, 1);
});

test("la presentación va en su columna, NO debajo del nombre", async () => {
  const { traza } = await gen(
    venta(0, {
      items: [item(1, { deposito: dep({ modo: "PACK", factorPack: 12, unidadMedida: "pack" }) })],
    })
  );
  const etiqueta = exactos(traza, "Pack x12");
  assert.equal(etiqueta.length, 1);
  // Está a la altura de la columna Presentación, no en la del nombre.
  assert.ok(etiqueta[0].x >= X_PRESENTACION - 1, `x=${etiqueta[0].x} debería estar en la columna Presentación`);
  const nombre = traza.find((t) => t.txt === "Producto 01");
  assert.equal(etiqueta[0].y, nombre.y, "la presentación debería ir en la misma línea que el nombre");
  // Ya no se escribe el consumo físico bajo el nombre.
  assert.equal(cuenta(traza, "= 36 u"), 0);
  assert.equal(cuenta(traza, "1 pack = "), 0);
});

test("el encabezado completo se repite en cada página con productos", async () => {
  const { res, traza } = await gen(venta(60));
  assert.ok(res.paginas >= 2);
  const conProducto = new Set(traza.filter(esFilaProducto).map((t) => t.pagina));
  for (const p of conProducto) {
    for (const h of ["Producto", "Presentaci", "Cantidad", "Precio", "Subtotal"]) {
      assert.equal(
        traza.filter((t) => t.pagina === p && t.txt.startsWith(h)).length >= 1,
        true,
        `página ${p}: falta el encabezado ${h}`
      );
    }
  }
});

test("el nombre largo se limita a 2 líneas", async () => {
  const largo =
    "Mortadela Paladini especial de la casa con un nombre absurdamente largo que no cabe ni en tres lineas completas";
  const { traza } = await gen(venta(0, { items: [item(1, { nombre: largo })] }));
  const trozos = traza.filter((t) => t.x < X_PRESENTACION && largo.includes(t.txt.replace("…", "")) && t.txt.length > 5);
  assert.ok(trozos.length <= 2, `el nombre ocupó ${trozos.length} líneas (máximo 2)`);
  assert.ok(traza.some((t) => t.txt.includes("…")), "debería cortarse con puntos suspensivos");
});

// ── C/D. Unidades ────────────────────────────────────────────────────────────

test("productos por peso muestran kg, nunca 'u' ni 'uds'", async () => {
  const { traza } = await gen(
    venta(0, {
      items: [
        item(1, { cantidad: 1.92, deposito: dep({ modo: null, unidadMedida: "kg" }) }),
        item(2, { cantidad: 3.285, deposito: dep({ modo: null, unidadMedida: "kg" }) }),
        item(3, { cantidad: 1, deposito: dep({ modo: null, unidadMedida: "kg" }) }),
      ],
    })
  );
  assert.equal(cuenta(traza, "1,920 kg"), 1);
  assert.equal(cuenta(traza, "3,285 kg"), 1);
  assert.equal(cuenta(traza, "1 kg"), 1);
  assert.equal(cuenta(traza, "Kg"), 3); // la etiqueta de presentación, una por línea
  // Ninguna celda de cantidad dice "u" ni "uds".
  const celdas = traza.filter((t) => /kg$/.test(t.txt));
  assert.equal(celdas.length, 3);
  assert.equal(cuenta(traza, " uds"), 0);
  assert.equal(traza.filter((t) => /\d u$/.test(t.txt)).length, 0);
});

test("Pack xN, Pieza y Unidad con sus cantidades", async () => {
  const { traza } = await gen(
    venta(0, {
      items: [
        item(1, { cantidad: 3, deposito: dep({ modo: "PACK", factorPack: 10, unidadMedida: "pack" }) }),
        item(2, { cantidad: 4, deposito: dep({ modo: "PIEZA", unidadMedida: "kg", modoVentaDeposito: "PIEZA" }) }),
        item(3, { cantidad: 20, deposito: dep({ modo: "UNIDAD", unidadMedida: "unidad" }) }),
      ],
    })
  );
  assert.equal(cuenta(traza, "Pack x10"), 1);
  assert.equal(cuenta(traza, "3 packs"), 1);
  assert.equal(cuenta(traza, "Pieza"), 1);
  assert.equal(cuenta(traza, "4 pz"), 1);
  assert.equal(cuenta(traza, "Unidad"), 1);
  assert.equal(cuenta(traza, "20 u"), 1);
});

test("línea histórica sin datos → presentación neutra, no 'Unidad'", async () => {
  const { traza } = await gen(
    venta(0, { items: [item(1, { cantidad: 2, deposito: { modo: null, factorPack: 1, cantidadStock: null, unidadMedida: null } })] })
  );
  assert.equal(cuenta(traza, "Unidad"), 0);
  assert.equal(cuenta(traza, "Kg"), 0);
  assert.equal(exactos(traza, "—").length, 1);
});

test("servicio: presentación 'Servicio' y desglose propio", async () => {
  const { traza } = await gen(
    venta(0, {
      items: [
        {
          nombre: "Carga SUBE", cantidad: 1, precio: 5150, esServicio: true,
          importeBaseServicio: 5000, recargoServicioPct: 3, recargoServicioImporte: 150,
        },
      ],
    })
  );
  assert.equal(cuenta(traza, "Servicio"), 1);
  assert.equal(cuenta(traza, "Carga solicitada"), 1);
  assert.equal(cuenta(traza, "Recargo 3%"), 1);
  assert.equal(cuenta(traza, "Total del servicio"), 1);
});

// ── A. Paginación y resumen ──────────────────────────────────────────────────

for (const n of [3, 20, 38, 60]) {
  test(`venta de ${n} ítems: pagina sin salirse del área útil`, async () => {
    const { res, traza } = await gen(venta(n));
    const fuera = traza.filter((t) => t.y > Y_LIMITE + 12 && Math.abs(t.y - Y_PIE) > 1);
    assert.deepEqual(fuera, [], `textos fuera del área útil: ${JSON.stringify(fuera.slice(0, 3))}`);
    for (let p = 1; p <= res.paginas; p++) {
      assert.equal(
        traza.filter((t) => t.pagina === p && t.txt.includes(`gina ${p} de ${res.paginas}`)).length,
        1,
        `falta el pie en la página ${p}`
      );
    }
    assert.equal(traza.filter(esFilaProducto).length, n);
  });
}

test("la última página nunca queda con el resumen solo o casi solo", async () => {
  // Se barre un rango amplio: cualquier cantidad de ítems debe dejar la página del
  // resumen con productos reales.
  for (let n = 1; n <= 70; n++) {
    const { res, traza } = await gen(venta(n));
    const enUltima = traza.filter((t) => esFilaProducto(t) && t.pagina === res.paginas).length;
    assert.ok(
      enUltima >= 1,
      `${n} ítems: la última página (de ${res.paginas}) no tiene ningún producto`
    );
    if (res.paginas > 1) {
      assert.ok(
        enUltima >= 3,
        `${n} ítems: la última página tiene solo ${enUltima} producto(s) junto al resumen`
      );
    }
    assert.equal(res.paginaResumenDedicada, false);
  }
});

test("totales y 'Gracias por su compra' una sola vez, en la última página", async () => {
  for (const n of [3, 30, 38, 60, 120]) {
    const { res, traza } = await gen(venta(n));
    assert.equal(exactos(traza, "TOTAL").length, 1, `${n}: TOTAL duplicado`);
    const gracias = exactos(traza, "Gracias por su compra");
    assert.equal(gracias.length, 1, `${n}: 'Gracias' duplicado`);
    assert.equal(gracias[0].pagina, res.paginas, `${n}: 'Gracias' no está en la última página`);
    for (const p of traza.filter((t) => t.pagina === res.paginas && esFilaProducto(t))) {
      assert.ok(gracias[0].y > p.y, `${n}: 'Gracias' por encima de un producto`);
    }
  }
});

test("el TOTAL no queda pegado al borde superior de su página", async () => {
  for (const n of [30, 38, 44, 60]) {
    const { traza } = await gen(venta(n));
    const total = exactos(traza, "TOTAL")[0];
    assert.ok(total.y > _geometria.Y_TOPE + 25, `${n} ítems: TOTAL a y=${total.y}, demasiado arriba`);
  }
});

test("resumen: subtotal, descuento, pagos detallados y neto recibido", async () => {
  const items = Array.from({ length: 6 }, (_, i) => item(i + 1));
  const sub = items.reduce((a, it) => a + it.precio * it.cantidad, 0);
  const { traza } = await gen(
    venta(0, {
      items,
      subtotal: sub,
      descuento: 1500,
      total: sub - 1500,
      comisionBancaria: 900,
      netoRecibido: sub - 1500 - 900,
      formaPago: "mixto",
      pagos: [
        { medio: "EFECTIVO", monto: 10000 },
        { medio: "TARJETA_DEBITO", monto: sub - 1500 - 10000 },
      ],
    })
  );
  assert.equal(exactos(traza, "Subtotal").length, 2); // encabezado de tabla + resumen
  assert.equal(exactos(traza, "Descuento").length, 1);
  assert.equal(exactos(traza, "Pagos").length, 1);
  assert.equal(exactos(traza, "Efectivo").length, 1);
  assert.equal(exactos(traza, "Débito").length, 1);
  assert.equal(exactos(traza, "Comisión bancaria").length, 1);
  assert.equal(exactos(traza, "Neto recibido").length, 1);
});

test("un único pago en efectivo no infla el resumen con un desglose redundante", async () => {
  const { traza } = await gen(venta(3));
  assert.equal(exactos(traza, "Pagos").length, 0);
  assert.equal(exactos(traza, "Descuento").length, 0); // no hay descuento
  assert.equal(exactos(traza, "TOTAL").length, 1);
});

// ── planificarPaginas (reparto puro) ─────────────────────────────────────────

test("planificarPaginas: no duplica, no pierde y no reordena filas", () => {
  for (const n of [1, 5, 29, 30, 44, 60, 90, 120]) {
    const filas = Array.from({ length: n }, () => ({ alto: 6.8 }));
    const p = planificarPaginas({
      filas, altoResumen: 40, inicioPagina1: 70, inicioPaginaN: 24,
    });
    const idx = p.paginas.flatMap((x) => x.filas);
    assert.equal(idx.length, n, `${n}: se perdieron o duplicaron filas`);
    assert.deepEqual(idx, [...Array(n).keys()], `${n}: las filas se reordenaron`);
    assert.equal(p.paginas.filter((x) => x.resumen).length, 1, `${n}: resumen duplicado`);
  }
});

test("planificarPaginas: la página del resumen alcanza el contenido mínimo", () => {
  for (let n = 1; n <= 200; n++) {
    const filas = Array.from({ length: n }, () => ({ alto: 6.8 }));
    const p = planificarPaginas({
      filas, altoResumen: 40, inicioPagina1: 70, inicioPaginaN: 24, minContenidoUltima: MIN_CONTENIDO_ULTIMA,
    });
    const ultima = p.paginas[p.paginas.length - 1];
    const contenido = ultima.filas.length * 6.8;
    if (p.paginas.length === 1) continue; // todo en una hoja: nada que rebalancear
    assert.ok(
      contenido >= MIN_CONTENIDO_ULTIMA || p.paginas[p.paginas.length - 2].filas.length === 1,
      `${n} filas: la última página quedó con ${ultima.filas.length} fila(s)`
    );
  }
});

test("planificarPaginas: nunca vacía la página anterior", () => {
  for (let n = 1; n <= 200; n++) {
    const filas = Array.from({ length: n }, () => ({ alto: 6.8 }));
    const p = planificarPaginas({ filas, altoResumen: 40, inicioPagina1: 70, inicioPaginaN: 24 });
    for (let i = 0; i < p.paginas.length - 1; i++) {
      assert.ok(p.paginas[i].filas.length >= 1, `${n}: la página ${i + 1} quedó vacía`);
    }
  }
});

test("planificarPaginas: resumen enorme que no admite ninguna fila → página dedicada", () => {
  const filas = Array.from({ length: 40 }, () => ({ alto: 6.8 }));
  const p = planificarPaginas({
    filas, altoResumen: 243, inicioPagina1: 70, inicioPaginaN: 24, limite: 268,
  });
  assert.equal(p.resumenDedicado, true);
  const ultima = p.paginas[p.paginas.length - 1];
  assert.equal(ultima.filas.length, 0);
  assert.equal(ultima.resumen, true);
});

// ── Colisiones entre columnas ────────────────────────────────────────────────

test("ningún texto de una columna invade la siguiente", async () => {
  const { jsPDF } = await import("jspdf");
  const medidor = new jsPDF({ format: "a4", unit: "mm" });
  const ancho = (txt, size) => {
    medidor.setFontSize(size);
    return medidor.getTextWidth(txt);
  };

  const { traza } = await gen(
    venta(0, {
      items: [
        item(1, { nombre: "Mortadela Paladini especial de la casa nombre larguísimo", cantidad: 1.92, precio: 128450.75, deposito: dep({ modo: null, unidadMedida: "kg" }) }),
        item(2, { nombre: "Eight Click Mentolado", cantidad: 3, precio: 1284900.5, deposito: dep({ modo: "PACK", factorPack: 10, unidadMedida: "pack" }) }),
        item(3, { nombre: "Pancho 24 Als", cantidad: 3, precio: 987654.32, deposito: dep({ modo: "PACK", factorPack: 24, unidadMedida: "pack" }) }),
      ],
    })
  );

  const { X_CANTIDAD, X_PRECIO, X_SUBTOTAL } = _geometria;

  // Se acota el chequeo a las FILAS de la tabla: las Y donde se dibujó un nombre de
  // producto. Así no entran el título centrado del encabezado ni el resumen.
  const anclas = ["Mortadela", "Eight Click", "Pancho 24"].map((pref) => {
    const t = traza.find((x) => x.txt.startsWith(pref));
    assert.ok(t, `no se encontró la fila de ${pref}`);
    return t.y;
  });

  let revisados = 0;
  for (const yFila of anclas) {
    const celdas = traza.filter((t) => Math.abs(t.y - yFila) < 0.5);
    for (const t of celdas) {
      revisados++;
      // Alineados a la izquierda: Producto y Presentación.
      if (t.x < X_PRESENTACION - 1) {
        const fin = t.x + ancho(t.txt, 9);
        assert.ok(
          fin <= X_PRESENTACION + 0.6,
          `"${t.txt}" (Producto) termina en ${fin.toFixed(1)} e invade Presentación (${X_PRESENTACION})`
        );
        continue;
      }
      if (Math.abs(t.x - X_PRESENTACION) < 1) {
        const fin = t.x + ancho(t.txt, 9);
        assert.ok(
          fin <= X_CANTIDAD + 0.6,
          `"${t.txt}" (Presentación) termina en ${fin.toFixed(1)} e invade Cantidad (${X_CANTIDAD})`
        );
        continue;
      }
      // Alineados a la derecha: no pueden arrancar antes del borde de la columna previa.
      const derecha = [
        [X_CANTIDAD, X_PRESENTACION + ancho("Pack x24", 9)],
        [X_PRECIO, X_CANTIDAD],
        [X_SUBTOTAL - 1, X_PRECIO],
      ];
      for (const [borde, limiteIzq] of derecha) {
        if (Math.abs(t.x - borde) < 0.8) {
          const inicio = t.x - ancho(t.txt, 9);
          assert.ok(
            inicio >= limiteIzq - 0.6,
            `"${t.txt}" alineado a ${borde} arranca en ${inicio.toFixed(1)} e invade la columna anterior (${limiteIzq.toFixed(1)})`
          );
        }
      }
    }
  }
  assert.ok(revisados >= 12, `se revisaron solo ${revisados} celdas`);
});

// ── PDF vs Compartir ─────────────────────────────────────────────────────────

test("descargar y compartir producen el mismo documento", async () => {
  const v = venta(45);
  const a = await gen(v, { copia: true });
  const b = await gen(v, { copia: true });
  assert.equal(a.res.paginas, b.res.paginas);
  assert.equal(a.res.nombreArchivo, b.res.nombreArchivo);
  assert.deepEqual(
    a.traza.map((t) => [t.txt, t.pagina, t.x, t.y]),
    b.traza.map((t) => [t.txt, t.pagina, t.x, t.y])
  );
});

test("nombre de archivo", async () => {
  assert.equal((await gen(venta(3), { copia: true })).res.nombreArchivo, "venta-833-copia.pdf");
  assert.equal((await gen(venta(3), {})).res.nombreArchivo, "venta-833.pdf");
});

test("compatibilidad: el ticket en vivo del POS no rompe sin los campos nuevos", async () => {
  const posTicket = {
    localNombre: "mini el 7",
    numero: 1234,
    fecha: new Date("2026-07-29T13:12:00.000Z"),
    vendedor: "Cajero",
    cliente: null,
    items: [{ nombre: "Coca Cola 500ml", cantidad: 2, precio: 800, esServicio: false }],
    subtotal: 1600, descuento: 0, total: 1600,
    comisionBancaria: 0, netoRecibido: 1600,
    formaPago: "efectivo", pagos: null,
    pagaCon: 2000, vuelto: 400,
  };
  const { res, traza } = await gen(posTicket, {});
  assert.equal(res.paginas, 1);
  assert.equal(cuenta(traza, "COMPROBANTE DE VENTA"), 1);
  assert.equal(cuenta(traza, "Consumidor final"), 1);
  assert.equal(cuenta(traza, "Paga con"), 1);
  assert.equal(cuenta(traza, "Vuelto"), 1);
  // Sin descriptor de depósito: presentación neutra, no se inventa "Unidad".
  assert.equal(cuenta(traza, "Unidad"), 0);
  assert.equal(res.nombreArchivo, "venta-1234.pdf");
});
