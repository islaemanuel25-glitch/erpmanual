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
//
// Las entradas de A tienen la forma de los productores reales: el cobro de
// `app/modulos/pos-ventas/page.jsx`, su "Reimprimir" de la lista del turno y
// `construirTicket` de `components/reportes-ventas/AccionesTicket.jsx`. La de B,
// la forma del `item` de `/api/transferencias/detalle` (sin `numero`: el número
// es el id).
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

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sha = (s) => createHash("sha256").update(s).digest("hex");
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

import { jsPDF } from "jspdf";
import { buildDefaultConfig } from "./ticketConfig.js";

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

const TRANSFERENCIA = {
  id: 97,
  estado: "ENVIADA",
  fechaCreada: "2026-10-16T13:30:00.000Z",
  origen: { id: 1, nombre: "Depósito Central", esDeposito: true },
  destino: { id: 3, nombre: "Local Norte" },
  items: [
    { nombre: "Yerba Playadito 1kg", codigoBarra: "7790387000108", cantidadEnviada: 3 },
    { nombre: "Fideos", codigoBarra: null, cantidadEnviada: 2.5 },
    { nombre: "Queso", codigoBarra: "7790580346013", cantidadEnviada: 0.1 },
    { nombre: "Salame", codigoBarra: null, cantidadEnviada: 0.2 },
  ],
};
const ME = { nombre: "Emanuel" };

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
  await imprimirTicketDeTransferencia(TRANSFERENCIA, ME);
  const viaTransferencia = traza;

  assert.deepEqual(viaTransferencia, viaPosventa);
  assert.deepEqual(viaPosventa, [["open", "", "_blank", "width=360,height=600"], ["write"], ["close"]]);
  const { ticket, opts } = ticketDeTransferencia(TRANSFERENCIA, ME);
  assert.equal(escrito, armarHtmlTicketTermico(ticket, 58, opts));
});

test("B. misma hoja de estilos byte a byte y solo clases que Posventa imprime; cambia el contenido", () => {
  const { ticket, opts } = ticketDeTransferencia(TRANSFERENCIA, ME);
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
    '<div class="t-ticket-num">Transferencia #97</div>',
    '<div class="t-seller">Operador: Emanuel</div>',
    "Origen:</span> <span class=\"t-client-value\">Depósito Central",
    "Destino:</span> <span class=\"t-client-value\">Local Norte",
    '<div class="t-prod">Yerba Playadito 1kg</div><div class="t-lr"><span>3 x</span><span></span></div>',
    '<div class="t-lr"><span>2.5 x</span><span></span></div>',
    '<span class="t-total-label">Total items</span>\n    <span class="t-total-monto">4</span>',
    // 3 + 2.5 + 0.1 + 0.2 sin el ruido de coma flotante.
    '<span class="t-total-label">Total unidades</span>\n    <span class="t-total-monto">5.8</span>',
    '<div class="t-footer">Firma / Control</div>',
    "Documento no valido como factura",
  ]) {
    assert.ok(html.includes(t), `falta "${t}"`);
  }
  // Sin precios, sin cobro, sin código de barras, sin el renglón "TRANSFERENCIA N items".
  for (const t of ["$", "Subtotal:", "t-pago", "Gracias por su compra", "Vendedor:", "Cod:", "Cant:", "TRANSFERENCIA", "7790387000108"]) {
    assert.ok(!cuerpo(html).includes(t), `la transferencia imprime "${t}"`);
  }
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
  const { ticket, opts } = ticketDeTransferencia(TRANSFERENCIA, ME);
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
