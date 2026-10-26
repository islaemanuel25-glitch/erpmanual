// Candado del ticket térmico: UNA pieza para Posventa y Transferencias.
//
// Transferencias tenía su propio generador, copiado a mano del de Posventa, y se
// corrió: el ticket de la transferencia dejó de salir igual que el de la venta.
// Esto afirma las dos mitades del arreglo:
//
//   A. El ticket de Posventa NO cambió. La huella (sha256) del HTML de tres
//      tickets se sacó con el código ANTERIOR al arreglo, en b988a67, con estas
//      mismas entradas. Si cambia un byte del ticket de la venta, rojo.
//   B. Transferencias imprime por la MISMA VÍA: la misma función, la misma
//      ventana (mismos argumentos de `window.open`), una sola escritura del
//      documento, y en ese documento la MISMA hoja de estilos byte a byte y solo
//      clases que Posventa ya imprime. Cambia el contenido y nada más.
//   C. Ninguna fila de la transferencia es más ancha que el papel. Es lo que
//      rompió la #447 con fcf40c4: "TRANSFERENCIA 3 items" medía 179,8 px contra
//      170,1 px útiles en 58 mm, el documento quedaba más ancho que el papel y la
//      impresión achicaba la página entera —letra chica, trazo gris, borde
//      cortado—. Se mide con las métricas de Helvetica de jsPDF (Arial es
//      métricamente igual) y los tamaños por defecto de `ticketConfig`.
//   D. Fuera del encabezado y del cierre, el ticket de la transferencia es
//      IDÉNTICO al de la venta con las mismas líneas: un bulto como se vende un
//      bulto, una unidad suelta como una unidad, el fiambre como el fiambre.
//   E. En cada renglón impreso, cantidad × precio = importe, y cada línea vale lo
//      que dice la columna Subtotal de la pantalla.
//
// Las entradas de A tienen la forma de los productores reales: el cobro de
// `app/modulos/pos-ventas/page.jsx`, su "Reimprimir" de la lista del turno y
// `construirTicket` de `components/reportes-ventas/AccionesTicket.jsx`. Las de
// B, D y E no se escriben a mano: son una venta de depósito y su transferencia
// tal como las devolvieron `pos-ventas/crear` y `transferencias/detalle` contra
// Postgres, grabadas por `scripts/pruebas-db/ticketTransferencia.mjs`.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/imprimirTicketTermico.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import imprimirTicketTermico, { armarHtmlTicketTermico } from "./imprimirTicketTermico.js";
import imprimirTicketDeTransferencia, { ticketDeTransferencia } from "../transferencias/ticketTransferencia.js";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TablaDetalleTransferencia from "../../components/transferencias/TablaDetalleTransferencia.jsx";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sha = (s) => createHash("sha256").update(s).digest("hex");
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

import { jsPDF } from "jspdf";
import { buildDefaultConfig } from "./ticketConfig.js";
import { sumarSubtotales } from "./lineaPorImporte.js";
import { fechaAR } from "../fechas/formatearFechaHora.js";

// La ventana de impresión: se captura con qué se abre y lo que se le escribe.
// Es lo último que hace la app; de ahí en adelante es el diálogo de impresión
// del sistema, igual para las dos.
let escrito = null;
let traza = [];
globalThis.window = {
  open: (...args) => {
    traza.push(["open", ...args]);
    return {
      document: {
        write(h) { escrito = h; traza.push(["write"]); },
        close() { traza.push(["close"]); },
      },
    };
  },
};

const CASOS_POSVENTA = {
  cobroDividido: {
    huella: "90dbcb1c4fef143da350d6f9436f4014e432bc7e468492e165a3b1e4235b31db",
    args: [{
      numero: 1234,
      fecha: "2026-10-16T15:04:05.000Z",
      items: [
        { nombre: "Coca Cola 2.25L retornable botella grande", precio: 2500, cantidad: 2, subtotalFijado: null, esServicio: false },
        { nombre: "Queso cremoso", precio: 9800, cantidad: 0.35, subtotalFijado: 3430, esServicio: false },
      ],
      subtotal: 8430, descuento: 100, total: 8330, formaPago: "efectivo",
      pagos: [{ medio: "EFECTIVO", monto: 5000 }, { medio: "DEBITO", monto: 3330 }],
      comisionBancaria: 50, netoRecibido: 8280, comisionPendiente: false,
      vendedor: "Ana", localNombre: "Local Centro",
      cliente: { nombre: "Juan <Pérez>", documento: "30111222", telefono: null, direccion: "Calle 1" },
      pagaCon: 10000, vuelto: 5000,
    }, 58, {}],
    contiene: ["Ticket #1234", "Local Centro", "Vendedor: Ana", "Subtotal:", ">TOTAL<", "Gracias por su compra"],
  },
  reimprimirTurno: {
    huella: "e9dba3e81541667f3f3bc3491e9a35c70f133535127b63e35980359af5bf86c1",
    args: [{
      numero: 77, fecha: "2026-10-16T12:00:00.000Z",
      items: [{ nombre: "Pan", precio: 1200, cantidad: 3 }],
      subtotal: 3600, descuento: 0, total: 3600, formaPago: "transferencia",
      vendedor: "-", localNombre: "Local Norte",
    }, 58, undefined],
    contiene: ["Ticket #77", "Local Norte", "3 x $1.200,00"],
  },
  copiaReportes: {
    huella: "42ed59dfd205d43a61dd11501442fca7411c9ef0d7aa82f499975d909453a220",
    args: [{
      localNombre: "Local Sur", numero: 9, fecha: "2026-10-01T23:59:00.000Z", vendedor: "Beto",
      cliente: null, origenEsDeposito: false, estado: "CONFIRMADA", correccion: null,
      items: [
        { nombre: "Carga SUBE", cantidad: 1, precio: 2100, esServicio: true, importeBaseServicio: 2000, recargoServicioPct: 5, recargoServicioImporte: 100, deposito: null },
        { nombre: "Alfajor", cantidad: 1, precio: 900, esServicio: false, importeBaseServicio: null, recargoServicioPct: null, recargoServicioImporte: null, deposito: null },
      ],
      subtotal: 3000, descuento: 0, total: 3000, comisionBancaria: 0, netoRecibido: 3000,
      comisionPendiente: false, formaPago: "credito", esFiado: false,
      pagos: [{ medio: "CREDITO", monto: 3000 }],
      descuentoPromocional: 150, recargoPagoImporte: 90, recargoPagoMedio: "CREDITO", recargoPagoPct: 3,
    }, 80, { copia: true }],
    contiene: ["REIMPRESIÓN — COPIA", "Ticket #9", "size: 72mm auto"],
  },
};

// La venta y su transferencia NO se escriben a mano. Una venta del depósito
// "Depósito Central" a "Mini Norte" con cinco renglones —CIF por unidad, ELITE
// en 4 bultos de 6 y 2 unidades sueltas, queso por kilo y salame de pieza fija—
// y la transferencia que creó, con el bulto y sus sueltas consolidados en UNA
// línea. Regenerar con `scripts/pruebas-db/ticketTransferencia.mjs`.
const GRABADO = JSON.parse(readFileSync(path.join(RAIZ, "lib/transferencias/ticketTransferencia.fixture.json"), "utf8"));
const TRANSFERENCIA = GRABADO.transferencia;
// El ticket de la venta, armado como lo arma `pos-ventas/page.jsx` al cobrar:
// con las líneas que devolvió el backend.
const lineasDeLaVenta = GRABADO.venta.breakdown.lineas.map((l) => ({
  nombre: l.nombre, precio: l.precio, cantidad: l.cantidad, precioNormal: l.precioNormal,
  ofertaNombre: l.ofertaNombre, descuentoPromocional: l.descuentoPromocional, esServicio: l.esServicio,
  importeBaseServicio: l.importeBaseServicio, recargoServicioPct: l.recargoServicioPct,
  recargoServicioImporte: l.recargoServicioImporte,
}));

const estilo = (html) => html.slice(html.indexOf("<style>"), html.indexOf("</style>"));

// ── A. Posventa no cambió ────────────────────────────────────────────────────

for (const [nombre, caso] of Object.entries(CASOS_POSVENTA)) {
  test(`A. Posventa (${nombre}): el HTML es byte a byte el de antes del arreglo`, () => {
    escrito = null;
    imprimirTicketTermico(...caso.args);
    // Que retrató lo que dice retratar, no solo que no varía.
    for (const t of caso.contiene) assert.ok(escrito.includes(t), `falta "${t}"`);
    assert.equal(sha(escrito), caso.huella);
  });
}

test("A. el ticket de Posventa no trae nada de la transferencia", () => {
  for (const caso of Object.values(CASOS_POSVENTA)) {
    const html = armarHtmlTicketTermico(...caso.args);
    for (const t of ["Transferencia #", "Operador:", "Origen:", "Destino:", "t-firma-linea", "Firma / Control"]) {
      assert.ok(!html.includes(t), `Posventa imprime "${t}"`);
    }
  }
});

// ── B. Transferencias imprime con la misma pieza ─────────────────────────────

const cuerpo = (html) => html.slice(html.indexOf("<body>"));
const clases = (html) => new Set([...cuerpo(html).matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)));

test("B. Transferencias sale por la misma vía que Posventa: misma ventana, una escritura, mismo documento", async () => {
  traza = []; escrito = null;
  imprimirTicketTermico(...CASOS_POSVENTA.reimprimirTurno.args);
  const viaPosventa = traza;

  traza = []; escrito = null;
  await imprimirTicketDeTransferencia(TRANSFERENCIA);
  const viaTransferencia = traza;

  assert.deepEqual(viaTransferencia, viaPosventa);
  assert.deepEqual(viaPosventa, [["open", "", "_blank", "width=360,height=600"], ["write"], ["close"]]);
  const { ticket, opts } = ticketDeTransferencia(TRANSFERENCIA);
  assert.equal(escrito, armarHtmlTicketTermico(ticket, 58, opts));
});

test("B. misma hoja de estilos byte a byte y solo clases que Posventa imprime; cambia el contenido", () => {
  const { ticket, opts } = ticketDeTransferencia(TRANSFERENCIA);
  const html = armarHtmlTicketTermico(ticket, 58, opts);
  const pos = armarHtmlTicketTermico(...CASOS_POSVENTA.reimprimirTurno.args);
  // Tamaños, negritas y colores viven en la hoja: si es la misma, son los mismos.
  assert.equal(estilo(html), estilo(pos), "la hoja de estilos difiere de la de Posventa");

  const deLaVenta = new Set(
    Object.values(CASOS_POSVENTA).flatMap((c) => [...clases(armarHtmlTicketTermico(...c.args))])
  );
  for (const c of clases(html)) assert.ok(deLaVenta.has(c), `la transferencia usa la clase "${c}", que Posventa no imprime`);
  // Ni estilo en línea ni marcado propio: todo el aspecto sale de la hoja.
  for (const t of [" style=", "<strong", "<b>", "<font"]) {
    assert.ok(!cuerpo(html).includes(t), `la transferencia trae "${t}"`);
  }

  for (const t of [
    "size: 48mm auto",
    '<div class="t-local">Depósito Central</div>',
    `<div class="t-ticket-num">Transferencia #${TRANSFERENCIA.id}</div>`,
    // `fechaEnvio`, la de la cabecera de la pantalla, en hora argentina.
    `<div class="t-datetime">${fechaAR(new Date(TRANSFERENCIA.fechaEnvio))}  `,
    // Quien ENVIÓ —`creadaPor`, el "Enviada por" de la cabecera—, no quien imprime.
    '<div class="t-seller">Operador: Ana Depósito</div>',
    "Origen:</span> <span class=\"t-client-value\">Depósito Central",
    "Destino:</span> <span class=\"t-client-value\">Mini Norte",
    '<div class="t-footer">Firma / Control</div>',
    "Documento no valido como factura",
  ]) {
    assert.ok(html.includes(t), `falta "${t}"`);
  }
  // Sin cobro, sin código de barras, sin el renglón "TRANSFERENCIA N items", sin
  // la fila "N x" vacía, sin "Lineas:" y sin el prefijo de presentación.
  for (const t of ["t-pago", "Gracias por su compra", "Vendedor:", "Cod:", "Cant:", "TRANSFERENCIA", " x</span><span></span>", "Lineas:", "Unidades:", "Unidad - ", "Bulto - ", "Fiambre - "]) {
    assert.ok(!cuerpo(html).includes(t), `la transferencia imprime "${t}"`);
  }
});

// ── D. Fuera del encabezado y del cierre, el ticket de la venta ──────────────
//
// La #521 salió con "156 x $11.601,86 → $11.601,86" y con "Bulto - " delante
// del nombre: dos cosas que el ticket de Posventa no imprime nunca. Se arma con
// la MISMA función el ticket de la venta y el de su transferencia, con las
// mismas líneas, y se comparan byte a byte en todo lo que no es encabezado ni
// cierre: la cabecera del documento menos el <title>, desde la primera línea
// hasta el TOTAL, y desde la leyenda final hasta el fin.
//
// "Las mismas líneas" son las de la venta real —nombre, cantidad y orden, tal
// como las imprimió Posventa— al costo de la transferencia, que es lo único que
// la transferencia cambia: el precio. Los costos se leen de la respuesta del
// endpoint, no se escriben: el del bulto y el de la unidad suelta de ELITE
// salen de la misma línea, `precioCosto` y `costoUnitarioFisico`.

/** La venta con sus mismas líneas, cada una al costo de la transferencia. */
function ventaAlCostoDeLaTransferencia() {
  const porNombre = new Map(TRANSFERENCIA.items.map((d) => [d.nombre, d]));
  const vistos = new Map();
  const items = lineasDeLaVenta.map((l) => {
    const d = porNombre.get(l.nombre);
    // El segundo renglón del mismo producto es el de las unidades sueltas.
    const vez = (vistos.get(l.nombre) ?? 0) + 1;
    vistos.set(l.nombre, vez);
    const precio = vez === 1 ? d.precioCosto : Math.round(d.costoUnitarioFisico * 100) / 100;
    return { ...l, precio, precioNormal: precio };
  });
  const total = sumarSubtotales(items);
  return { ...GRABADO.venta, localNombre: "Depósito Central", vendedor: "Ana Depósito", items, subtotal: total, descuento: 0, total, formaPago: "efectivo" };
}

/** Lo que no es encabezado ni cierre: la cabecera sin <title>, líneas → TOTAL, y la leyenda final. */
function fueraDeEncabezadoYCierre(html) {
  const cabecera = html.slice(0, html.indexOf("<body>")).replace(/<title>.*<\/title>/, "");
  const desde = html.indexOf('<div class="t-prod">');
  const total = html.indexOf('<span class="t-total-monto">');
  const lineasHastaElTotal = html.slice(desde, html.indexOf("</div>", total) + "</div>".length);
  const leyenda = html.slice(html.indexOf('<div class="t-disclaimer">'));
  return { cabecera, lineasHastaElTotal, leyenda };
}

test("D. fuera del encabezado y del cierre, la transferencia imprime exactamente el ticket de la venta", () => {
  const { ticket, opts } = ticketDeTransferencia(TRANSFERENCIA);
  const transf = fueraDeEncabezadoYCierre(armarHtmlTicketTermico(ticket, 58, opts));
  const venta = fueraDeEncabezadoYCierre(armarHtmlTicketTermico(ventaAlCostoDeLaTransferencia(), 58, {}));
  // Que retrató lo que dice retratar: las cinco líneas, con el bulto en bultos.
  assert.equal((venta.lineasHastaElTotal.match(/class="t-prod"/g) || []).length, 5);
  assert.ok(venta.lineasHastaElTotal.includes("<span>4 x $1.600,00</span>"), "la venta no trae el bulto");
  assert.deepEqual(transf, venta);
});

test("D. contraprueba: la comparación atrapa el prefijo de presentación y la cantidad en unidades del bulto", () => {
  const venta = fueraDeEncabezadoYCierre(armarHtmlTicketTermico(ventaAlCostoDeLaTransferencia(), 58, {}));
  const { ticket, opts } = ticketDeTransferencia(TRANSFERENCIA);
  const conPrefijo = { ...ticket, items: ticket.items.map((i) => ({ ...i, nombre: `Bulto - ${i.nombre}` })) };
  assert.notDeepEqual(fueraDeEncabezadoYCierre(armarHtmlTicketTermico(conPrefijo, 58, opts)), venta);
  // La #521: la cantidad física del bulto al costo del bulto.
  const enUnidades = { ...ticket, items: ticket.items.map((i) => (i.precio === 1600 ? { ...i, cantidad: 24 } : i)) };
  assert.notDeepEqual(fueraDeEncabezadoYCierre(armarHtmlTicketTermico(enUnidades, 58, opts)), venta);
});

// ── E. Cada renglón cierra, y cada línea vale lo que dice la pantalla ────────

/** Un número de cualquiera de los dos formatos: "$ 1.200,00", "$1.200,00", "2,5" o "2.5". */
const comoNumero = (t) => {
  const s = String(t).replace(/[$\s]/g, "");
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
};
const sinEtiquetas = (h) => h.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim();

/** [nombre, subtotal] de cada fila de la tabla de escritorio de la pantalla. */
function filasDeLaPantalla(item) {
  const html = renderToStaticMarkup(
    React.createElement(TablaDetalleTransferencia, {
      item, editItems: [], setEditItems: () => {}, inputsHabilitados: false,
    })
  );
  const tabla = html.slice(html.indexOf("<table"));
  return [...tabla.matchAll(/<tr class="align-middle[^"]*">([\s\S]*?)<\/tr>/g)].map((m) => {
    const celdas = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => sinEtiquetas(c[1]));
    return [celdas[0], comoNumero(celdas.at(-1))];
  });
}

/** [nombre, cantidad, precio, importe] de cada renglón impreso. */
function renglonesDelTicket(html) {
  const out = [];
  let nombre = [];
  for (const m of cuerpo(html).matchAll(/<div class="(t-prod|t-lr)">(.*?)<\/div>/g)) {
    if (m[1] === "t-prod") { nombre.push(m[2]); continue; }
    if (nombre.length === 0) continue;
    const fila = m[2].match(/^<span>([\d.]+) x (\$[\d.,]+)<\/span><span>(\$[\d.,]+)<\/span>$/);
    assert.ok(fila, `renglón con otra forma que la de Posventa: ${m[2]}`);
    out.push([nombre.join(" "), Number(fila[1]), comoNumero(fila[2]), comoNumero(fila[3])]);
    nombre = [];
  }
  return out;
}

/** Los renglones donde cantidad × precio impreso no da el importe impreso. */
const queNoCierran = (renglones) =>
  renglones.filter(([, cant, precio, importe]) => Math.round(cant * precio * 100) !== Math.round(importe * 100));

test("E. en cada renglón impreso, cantidad × precio = importe", () => {
  const { ticket, opts } = ticketDeTransferencia(TRANSFERENCIA);
  const renglones = renglonesDelTicket(armarHtmlTicketTermico(ticket, 58, opts));
  assert.equal(renglones.length, 5);
  assert.deepEqual(queNoCierran(renglones), []);
});

test("E. contraprueba: la cuenta atrapa el renglón de la #521", () => {
  const html521 = `<body><div class="t-prod">MOGUL ANILLOS 1Kg</div><div class="t-lr"><span>156 x $11.601,86</span><span>$11.601,86</span></div>`;
  assert.equal(queNoCierran(renglonesDelTicket(html521)).length, 1);
});

test("E. cada línea de la pantalla vale en el papel lo que dice su columna Subtotal", () => {
  const { ticket, opts } = ticketDeTransferencia(TRANSFERENCIA);
  const renglones = renglonesDelTicket(armarHtmlTicketTermico(ticket, 58, opts));
  const pantalla = filasDeLaPantalla(TRANSFERENCIA);
  assert.equal(pantalla.length, 4, "la tabla de la pantalla no se leyó");
  // Los renglones de una línea son los consecutivos con su nombre, en su orden.
  let i = 0;
  for (const [nombre, subtotal] of pantalla) {
    let suma = 0;
    let n = 0;
    while (i < renglones.length && renglones[i][0] === nombre) { suma += Math.round(renglones[i][3] * 100); i += 1; n += 1; }
    assert.ok(n > 0, `"${nombre}" no está impreso en su orden`);
    // Una línea en un solo renglón cierra al centavo. La de bultos más sueltas
    // imprime la suelta a su precio en centavos —como la vende Posventa— y la
    // pantalla la valoriza con el costo unitario sin redondear: puede haber un
    // centavo de diferencia por cada unidad suelta, nunca más.
    const sueltas = n > 1 ? renglones[i - 1][1] : 0;
    assert.ok(
      Math.abs(suma - Math.round(subtotal * 100)) <= Math.ceil(sueltas / 2),
      `"${nombre}": impreso ${suma / 100}, pantalla ${subtotal}`
    );
  }
  assert.equal(i, renglones.length, "hay renglones impresos que no son de ninguna línea de la pantalla");
});

test("D. el detalle de la transferencia ya no manda la venta asociada que solo leía el ticket anterior", () => {
  const src = sinComentarios(readFileSync(path.join(RAIZ, "app/api/transferencias/detalle/route.js"), "utf8"));
  assert.ok(!src.includes("ventaAsociada"));
  assert.ok(!/venta:\s*\{\s*select:/.test(src));
});

// ── C. Nada más ancho que el papel ───────────────────────────────────────────

const pdf = new jsPDF({ unit: "pt" });
const anchoTexto = (txt, px, peso) => {
  pdf.setFont("helvetica", Number(peso) >= 600 ? "bold" : "normal");
  return pdf.getStringUnitWidth(txt.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")) * px;
};
const MM = 96 / 25.4;
const UTIL_58 = 48 * MM - 2 * 1.5 * MM; // body de 48 mm menos el padding de impresión

function filasMasAnchasQueElPapel(html) {
  const tc = buildDefaultConfig();
  const malas = [];
  const medir = (izq, der, a, b) => {
    const w = anchoTexto(izq, tc[a].fontSize, tc[a].fontWeight) + 4 + anchoTexto(der, tc[b].fontSize, tc[b].fontWeight);
    if (w > UTIL_58) malas.push(`${izq} | ${der}: ${w.toFixed(1)} px`);
  };
  for (const m of cuerpo(html).matchAll(/<div class="t-lr[^"]*"><span>(.*?)<\/span><span>(.*?)<\/span><\/div>/g)) {
    medir(m[1], m[2], "qtyPrice", "qtyPrice");
  }
  for (const m of cuerpo(html).matchAll(/<span class="t-total-label">(.*?)<\/span>\s*<span class="t-total-monto">(.*?)<\/span>/g)) {
    medir(m[1], m[2], "totalLabel", "totalAmount");
  }
  return malas;
}

test("C. ninguna fila de la transferencia es más ancha que el papel de 58 mm", () => {
  const { ticket, opts } = ticketDeTransferencia(TRANSFERENCIA);
  assert.deepEqual(filasMasAnchasQueElPapel(armarHtmlTicketTermico(ticket, 58, opts)), []);
});

test("C. contraprueba: la medición atrapa la fila que rompió la #447", () => {
  const fila447 = `<body><div class="t-total">
    <span class="t-total-label">TRANSFERENCIA</span>
    <span class="t-total-monto">3 items</span>
  </div>`;
  assert.equal(filasMasAnchasQueElPapel(fila447).length, 1);
});

test("B. ningún archivo arma un ticket térmico fuera de la pieza de Posventa", () => {
  const archivos = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "app", "components", "lib"],
    { cwd: RAIZ, encoding: "utf8" }
  ).split("\n").filter((f) => /\.(js|jsx|mjs)$/.test(f) && !f.endsWith(".test.mjs"));
  const conTicket = archivos.filter((f) => {
    let t;
    try { t = sinComentarios(readFileSync(path.join(RAIZ, f), "utf8")); } catch { return false; }
    return t.includes('class="t-ticket-num"') || t.includes('class="t-total-monto"');
  });
  assert.deepEqual(conTicket, ["lib/pos-ventas/imprimirTicketTermico.js"]);
});

test("B. el adaptador de Transferencias no arma HTML y las dos pantallas lo usan", () => {
  const adaptador = sinComentarios(readFileSync(path.join(RAIZ, "lib/transferencias/ticketTransferencia.js"), "utf8"));
  assert.ok(adaptador.includes('"@/lib/pos-ventas/imprimirTicketTermico"'));
  for (const t of ["<html", "<!DOCTYPE", "window.open", "window.print", "document.write", "<style", "class="]) {
    assert.ok(!adaptador.includes(t), `el adaptador tiene "${t}"`);
  }

  for (const f of ["app/modulos/transferencias/[id]/page.jsx", "components/transferencias/AccionesRecepcion.jsx"]) {
    const src = sinComentarios(readFileSync(path.join(RAIZ, f), "utf8"));
    assert.ok(src.includes('"@/lib/transferencias/ticketTransferencia"'), `${f} no imprime con la pieza de Posventa`);
    // Otra vía de salida al lado de la de Posventa.
    for (const t of ["window.print", "document.write", "imprimirTicketTransferencia"]) {
      assert.ok(!src.includes(t), `${f} tiene "${t}"`);
    }
  }
});
