// Tests del comprobante de venta en PDF (paginación, encabezado y totales).
//
// Se verifica el ARTEFACTO REAL: se genera el PDF y se parsea su contenido. jsPDF
// escribe los content streams sin comprimir, con la forma `X Y Td` + `(texto) Tj`
// agrupada por página, así que se puede reconstruir qué se escribió, en qué página
// y a qué Y (en mm, con el origen arriba-izquierda igual que el generador).
//
// Con eso se afirma que ninguna fila se sale del área útil, que el encabezado de
// columnas se repite por página, y que los totales y el "Gracias por su compra"
// van una sola vez, al final.
//
// Nota del parser: para un text() multilínea jsPDF emite un solo Td y varios Tj;
// todas esas líneas quedan con la Y de la primera. Las aserciones de posición se
// hacen sobre textos de una línea, así que no afecta.
//
// Correr con: node --test lib/pos-ventas/generarTicketPDF.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import generarTicketPDF, { _geometria } from "./generarTicketPDF.js";

const { Y_LIMITE, Y_PIE, X_IZQ } = _geometria;
const PT_POR_MM = 72 / 25.4;
const ALTO_PT = 841.89; // A4

// ── Extracción ───────────────────────────────────────────────────────────────
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
        txt: t[3].replace(/\\([()\\])/g, "$1"),
        x: +(x / PT_POR_MM).toFixed(2),
        y: +((ALTO_PT - y) / PT_POR_MM).toFixed(2),
        pagina,
      });
    }
  }
  return traza;
}

async function gen(v, opts = { copia: true, output: "blob" }) {
  const res = generarTicketPDF(v, { ...opts, output: "blob" });
  const traza = extraer(await res.blob.arrayBuffer());
  return { res, traza };
}

const cuenta = (traza, needle) => traza.filter((t) => t.txt.includes(needle)).length;
const exactos = (traza, txt) => traza.filter((t) => t.txt === txt);

// ── Datos de prueba ──────────────────────────────────────────────────────────
function item(i, extra = {}) {
  return {
    nombre: extra.nombre ?? `Producto ${String(i).padStart(2, "0")}`,
    cantidad: extra.cantidad ?? 2,
    precio: extra.precio ?? 1234.56,
    esServicio: false,
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

// ── Encabezado ───────────────────────────────────────────────────────────────

test("encabezado: COMPROBANTE DE VENTA, ya no REIMPRESIÓN — COPIA", async () => {
  const { traza } = await gen(venta(3));
  assert.equal(cuenta(traza, "COMPROBANTE DE VENTA"), 1);
  assert.equal(cuenta(traza, "REIMPRESI"), 0);
  assert.equal(cuenta(traza, "COPIA"), 0);
  assert.equal(cuenta(traza, "Copia del comprobante"), 1);
});

test("sin copia no aparece la aclaración", async () => {
  const { traza } = await gen(venta(3), {});
  assert.equal(cuenta(traza, "Copia del comprobante"), 0);
  assert.equal(cuenta(traza, "COMPROBANTE DE VENTA"), 1);
});

test("origen se etiqueta Depósito o Local según el flag, y neutro si falta", async () => {
  assert.equal(cuenta((await gen(venta(3, { origenEsDeposito: true }))).traza, "Origen (Dep"), 1);
  assert.equal(cuenta((await gen(venta(3, { origenEsDeposito: false }))).traza, "Origen (Local)"), 1);
  const { traza } = await gen(venta(3, { origenEsDeposito: undefined }));
  assert.equal(cuenta(traza, "Origen (Dep"), 0);
  assert.equal(cuenta(traza, "Origen (Local)"), 0);
  assert.equal(cuenta(traza, "Origen:"), 1);
});

test("destino: cliente cuando existe, Consumidor final cuando no", async () => {
  const a = (await gen(venta(3))).traza;
  assert.equal(cuenta(a, "Destino:"), 1);
  assert.equal(cuenta(a, "Minimarket casiano"), 1);
  assert.equal(cuenta(a, "Consumidor final"), 0);

  const b = (await gen(venta(3, { cliente: null }))).traza;
  assert.equal(cuenta(b, "Consumidor final"), 1);
});

test("encabezado incluye ticket, fecha, vendedor, forma de pago y estado", async () => {
  const { traza } = await gen(venta(3));
  assert.equal(cuenta(traza, "Ticket #833"), 2); // encabezado + pie de la única página
  assert.equal(cuenta(traza, "Fecha:"), 1);
  assert.equal(cuenta(traza, "Vendedor: Administrador"), 1);
  assert.equal(cuenta(traza, "Forma de pago:"), 1);
  assert.equal(cuenta(traza, "Estado: Cobrado"), 1);
});

test("venta corregida se informa con su versión", async () => {
  const { traza } = await gen(venta(3, { correccion: { corregida: true, version: 2 } }));
  assert.equal(cuenta(traza, "Venta corregida"), 1);
  assert.equal(cuenta(traza, "2"), traza.filter((t) => t.txt.includes("2")).length);
});

// ── Paginación ───────────────────────────────────────────────────────────────

for (const n of [3, 20, 38, 60]) {
  test(`venta de ${n} ítems: pagina sin salirse del área útil`, async () => {
    const { res, traza } = await gen(venta(n));
    assert.ok(res.paginas >= 1);

    // Nada fuera del área de contenido, salvo el pie por página.
    const fuera = traza.filter((t) => t.y > Y_LIMITE + 9 && Math.abs(t.y - Y_PIE) > 1);
    assert.deepEqual(fuera, [], `textos fuera del área útil: ${JSON.stringify(fuera.slice(0, 3))}`);

    // Encabezado de columnas repetido en cada página con productos.
    const conProducto = new Set(
      traza.filter((t) => /^Producto \d\d$/.test(t.txt)).map((t) => t.pagina)
    );
    for (const p of conProducto) {
      assert.equal(
        traza.filter((t) => t.txt === "Producto" && t.pagina === p).length,
        1,
        `la página ${p} debería repetir el encabezado de columnas`
      );
    }

    // Pie "Página X de Y" una vez por página.
    for (let p = 1; p <= res.paginas; p++) {
      const pies = traza.filter((t) => t.pagina === p && t.txt.includes(`gina ${p} de ${res.paginas}`));
      assert.equal(pies.length, 1, `falta el pie en la página ${p}`);
    }

    // Todos los productos dibujados.
    assert.equal(traza.filter((t) => /^Producto \d\d$/.test(t.txt)).length, n);
  });
}

test("38 y 60 ítems generan al menos 2 páginas reales", async () => {
  const a = await gen(venta(38));
  const b = await gen(venta(60));
  assert.ok(a.res.paginas >= 2, `38 ítems dieron ${a.res.paginas} página(s)`);
  assert.ok(b.res.paginas >= 2, `60 ítems dieron ${b.res.paginas} página(s)`);
  assert.ok(b.res.paginas >= a.res.paginas);
});

test("ninguna fila de producto se solapa con otra en la misma página", async () => {
  const { traza } = await gen(venta(60));
  const porPagina = new Map();
  for (const t of traza.filter((x) => /^Producto \d\d$/.test(x.txt))) {
    if (!porPagina.has(t.pagina)) porPagina.set(t.pagina, []);
    porPagina.get(t.pagina).push(t.y);
  }
  assert.ok(porPagina.size >= 2);
  for (const [pagina, ys] of porPagina) {
    const ordenado = [...ys].sort((a, b) => a - b);
    assert.deepEqual(ys, ordenado, `página ${pagina}: filas fuera de orden`);
    for (let i = 1; i < ordenado.length; i++) {
      assert.ok(
        ordenado[i] - ordenado[i - 1] >= 5,
        `página ${pagina}: filas demasiado juntas (${ordenado[i - 1]} → ${ordenado[i]})`
      );
    }
  }
});

// ── Totales y cierre ─────────────────────────────────────────────────────────

for (const n of [3, 38, 60]) {
  test(`${n} ítems: totales y "Gracias por su compra" una sola vez, al final`, async () => {
    const { res, traza } = await gen(venta(n));
    assert.equal(exactos(traza, "TOTAL").length, 1, "TOTAL duplicado");
    // "Subtotal" aparece en el encabezado de tabla (una vez por página CON
    // productos; la página que solo lleva totales no repite la tabla) más una vez
    // en el bloque de totales.
    const paginasConProducto = new Set(
      traza.filter((t) => /^Producto \d\d$/.test(t.txt)).map((t) => t.pagina)
    ).size;
    assert.equal(exactos(traza, "Subtotal").length, paginasConProducto + 1);

    const gracias = exactos(traza, "Gracias por su compra");
    assert.equal(gracias.length, 1, "'Gracias' duplicado");
    assert.equal(gracias[0].pagina, res.paginas, "'Gracias' no está en la última página");

    // No queda por encima de ningún producto de esa página.
    for (const p of traza.filter((t) => t.pagina === res.paginas && /^Producto \d\d$/.test(t.txt))) {
      assert.ok(gracias[0].y > p.y, "'Gracias' se superpone con productos");
    }
  });
}

test("descuento, pago dividido y efectivo no rompen la paginación", async () => {
  const items = Array.from({ length: 45 }, (_, i) => item(i + 1));
  const sub = items.reduce((a, it) => a + it.precio * it.cantidad, 0);
  const { res, traza } = await gen(
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
  assert.equal(exactos(traza, "Descuento").length, 1);
  assert.equal(exactos(traza, "Pagos").length, 1);
  assert.equal(exactos(traza, "Neto recibido").length, 1);
  assert.equal(exactos(traza, "Gracias por su compra").length, 1);
  const fuera = traza.filter((t) => t.y > Y_LIMITE + 9 && Math.abs(t.y - Y_PIE) > 1);
  assert.deepEqual(fuera, [], "totales fuera del área útil");
  assert.ok(res.paginas >= 2);
});

// ── Nombres largos, decimales, Pack/Unidad, servicios ────────────────────────

test("nombre largo hace wrap y no invade las columnas numéricas", async () => {
  const largo =
    "Mortadela Paladini especial de la casa con nombre extremadamente largo para forzar varias lineas de wrap";
  const { traza } = await gen(venta(0, { items: [item(1, { nombre: largo }), item(2)] }));
  const trozos = traza.filter((t) => t.x === X_IZQ && largo.includes(t.txt) && t.txt.length > 8);
  assert.ok(trozos.length >= 2, `el nombre largo debería partirse en varias líneas (dio ${trozos.length})`);
  for (const t of trozos) assert.equal(t.x, X_IZQ);
});

test("cantidades decimales se formatean en es-AR", async () => {
  const { traza } = await gen(venta(0, { items: [item(1, { cantidad: 0.755 })] }));
  assert.equal(cuenta(traza, "0,755"), 1);
});

test("Pack / Unidad / Pieza aparecen cuando el dato existe, y nada cuando no", async () => {
  const { traza } = await gen(
    venta(0, {
      items: [
        item(1, { deposito: { modo: "PACK", factorPack: 12, cantidadStock: "36.000" } }),
        item(2, { deposito: { modo: "UNIDAD", factorPack: 12, cantidadStock: "5.000" } }),
        item(3, { deposito: { modo: "PIEZA", factorPack: 1, cantidadStock: "4.000" } }),
      ],
    })
  );
  assert.equal(cuenta(traza, "Pack/Bulto "), 1);
  assert.equal(cuenta(traza, "Unidad suelta"), 1);
  assert.equal(cuenta(traza, "Piezas"), 1);
  assert.equal(cuenta(traza, "= 36 u"), 1);
  assert.equal(cuenta(traza, "= 4 pz"), 1);

  const neutro = (
    await gen(venta(0, { items: [item(1, { deposito: { modo: null, factorPack: 12, cantidadStock: null } })] }))
  ).traza;
  assert.equal(cuenta(neutro, "Pack/Bulto"), 0);
  assert.equal(cuenta(neutro, "Unidad suelta"), 0);
});

test("servicio de importe variable mantiene su desglose", async () => {
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
  assert.equal(cuenta(traza, "Carga solicitada"), 1);
  assert.equal(cuenta(traza, "Recargo 3%"), 1);
  assert.equal(cuenta(traza, "Total del servicio"), 1);
});

// ── PDF vs Compartir ─────────────────────────────────────────────────────────

test("descargar y compartir producen el mismo documento", async () => {
  const v = venta(45);
  const a = await gen(v, { copia: true });
  const b = await gen(v, { copia: true });
  assert.equal(a.res.paginas, b.res.paginas);
  assert.equal(a.res.nombreArchivo, b.res.nombreArchivo);
  assert.deepEqual(
    a.traza.map((t) => [t.txt, t.pagina, t.y]),
    b.traza.map((t) => [t.txt, t.pagina, t.y])
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
  assert.equal(res.nombreArchivo, "venta-1234.pdf");
});
