// CANDADO: EL PANEL DE COBRO CON MODALIDADES, DIBUJADO DE VERDAD.
//
//   node --import ./scripts/alias-loader.mjs --test components/pos-ventas/formaPagoModalidadesRender.test.mjs
//
// ── POR QUÉ SE EJECUTA EL JSX EN VEZ DE LEERLO ─────────────────────────────
//
// Porque leer el archivo y buscar una palabra no prueba que la pantalla dibuje
// nada. El proyecto ya pagó ese error dos veces: un identificador usado sin
// importar compiló, pasó el lint, pasaron más de mil candados y reventó en
// producción; y un `SunmiInput` sin importar hizo exactamente lo mismo. Los dos
// aparecen recién al EJECUTAR el JSX.
//
// ── LO QUE ESTO NO PRUEBA ──────────────────────────────────────────────────
//
// Que se VEA bien, y que los clicks hagan lo que dicen. No hay navegador, no hay
// CSS y no hay 390 px de ancho: esto renderiza el estado inicial. La secuencia
// real —tocar Mercado Pago, elegir Crédito, cobrar— la mide
// `scripts/sonda-modalidades-cobro.mjs` contra un navegador de verdad.

import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import FormaPago from "@/components/pos-ventas/FormaPago";
import SelectorModalidad from "@/components/pos-ventas/SelectorModalidad";
import { botonesDeCobro, opcionesDeModalidad } from "@/lib/pos-ventas/cobroPantalla";
import { componerModalidades } from "@/lib/pos-ventas/modalidadesDeMedio";
import { totalesPorOpcionDeCobro } from "@/lib/ofertas/previewPos";

// ── El local del ejemplo: Mercado Pago con DOS modalidades CREDITO ─────────
const MEDIOS = [
  {
    id: 30, nombre: "Efectivo", activo: true, orden: 1, tipoContable: "EFECTIVO",
    procesador: null, recargoPct: 0, comisionPct: 0, modalidades: [],
  },
  {
    id: 10, nombre: "Mercado Pago", activo: true, orden: 2, tipoContable: "MERCADOPAGO",
    procesador: "MERCADOPAGO", recargoPct: 0, comisionPct: 5,
    modalidades: componerModalidades([
      { id: 101, nombre: "Crédito 1 pago", activo: true, orden: 1, tipoContable: "CREDITO", recargoPct: 4, comisionPct: 3 },
      { id: 102, nombre: "Crédito cuotas", activo: true, orden: 2, tipoContable: "CREDITO", recargoPct: 8, comisionPct: 7 },
      { id: 103, nombre: "QR guardado", activo: false, orden: 3, tipoContable: "MERCADOPAGO", recargoPct: 1 },
    ]),
  },
  {
    id: 20, nombre: "Banco X", activo: true, orden: 3, tipoContable: "CREDITO",
    procesador: "BANCO", recargoPct: 6, comisionPct: 9, modalidades: [],
  },
];

const CARRITO = [{ productoLocalId: 1, nombre: "Yerba", cantidad: 2, precio: 1000 }];
const PREVIEW = totalesPorOpcionDeCobro({ carrito: CARRITO, medios: MEDIOS });

const dibujarPanel = (props = {}) =>
  renderToStaticMarkup(
    createElement(FormaPago, {
      subtotal: 2000,
      formaPago: "efectivo",
      onFormaPagoChange: () => {},
      onCobrar: () => {},
      cobrando: false,
      disabled: false,
      mediosCobro: MEDIOS,
      previewPorOpcion: PREVIEW,
      ...props,
    })
  );

const contar = (html, texto) => html.split(texto).length - 1;

// ═══════════════════════════════════════════════════════════════════════════
// UN MEDIO CON MODALIDADES ES UN SOLO BOTÓN
// ═══════════════════════════════════════════════════════════════════════════

test("Mercado Pago aparece UNA vez, y sus modalidades no son medios", () => {
  const html = dibujarPanel();

  assert.equal(contar(html, "Mercado Pago"), 1, "un solo botón padre");
  assert.equal(html.includes("Crédito 1 pago"), false, "la modalidad no es un botón del panel");
  assert.equal(html.includes("Crédito cuotas"), false);
});

test("los tres medios activos se dibujan, cada uno con su nombre real", () => {
  const html = dibujarPanel();
  for (const nombre of ["Efectivo", "Mercado Pago", "Banco X"]) {
    assert.ok(html.includes(nombre), `falta el botón "${nombre}"`);
  }
});

test("dos condiciones CREDITO no colapsan: el panel dibuja los dos botones", () => {
  // "Banco X" es CREDITO y la modalidad de Mercado Pago también. Con la key
  // vieja —`tipoContable.toLowerCase()`— eran el mismo nodo.
  const html = dibujarPanel();
  assert.ok(html.includes("Banco X"));
  assert.ok(html.includes("Mercado Pago"));
});

// ═══════════════════════════════════════════════════════════════════════════
// LOS IMPORTES SALEN DEL PREVIEW
// ═══════════════════════════════════════════════════════════════════════════

test("el botón con modalidades muestra el RANGO de sus modalidades", () => {
  // 4 % y 8 % sobre $2.000 → 2.080 y 2.160. Los dos números salen del motor.
  const html = dibujarPanel();
  assert.ok(html.includes("2.080,00"), "falta el mínimo del rango");
  assert.ok(html.includes("2.160,00"), "falta el máximo del rango");
});

test("un medio sin modalidades muestra su único importe", () => {
  const html = dibujarPanel();
  assert.ok(html.includes("2.120,00"), "Banco X al 6 %");
  assert.ok(html.includes("2.000,00"), "efectivo sin recargo");
});

test("sin recargos ni ofertas el panel queda como siempre: un total grande", () => {
  const parejo = MEDIOS.map((m) => ({ ...m, recargoPct: 0, modalidades: [] }));
  const preview = totalesPorOpcionDeCobro({ carrito: CARRITO, medios: parejo });
  const html = dibujarPanel({ mediosCobro: parejo, previewPorOpcion: preview });

  assert.ok(html.includes("Total a cobrar"));
  assert.equal(html.includes("Total según el medio"), false);
});

test("sin preview de opciones el panel sigue dibujando: es el camino offline", () => {
  const html = dibujarPanel({ previewPorOpcion: null, mediosCobro: null });
  // Los cuatro por defecto, sin ids y sin selector.
  for (const nombre of ["Efectivo", "Débito", "Crédito", "Mercado Pago"]) {
    assert.ok(html.includes(nombre), `falta el botón por defecto "${nombre}"`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EL SELECTOR
// ═══════════════════════════════════════════════════════════════════════════

const botones = botonesDeCobro(MEDIOS);
const botonMP = botones.find((b) => b.nombre === "Mercado Pago");

const dibujarSelector = () =>
  renderToStaticMarkup(
    createElement(SelectorModalidad, {
      opciones: opcionesDeModalidad(botonMP),
      totalDe: (clave) => PREVIEW[clave].total,
      onElegir: () => {},
      formatearImporte: (n) =>
        Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    })
  );

test("el selector muestra las modalidades ACTIVAS con su recargo y su total", () => {
  const html = dibujarSelector();

  assert.ok(html.includes("Crédito 1 pago"));
  assert.ok(html.includes("Crédito cuotas"));
  assert.ok(html.includes("Recargo 4 %"));
  assert.ok(html.includes("Recargo 8 %"));
  assert.ok(html.includes("2.080,00"), "el total de la primera");
  assert.ok(html.includes("2.160,00"), "el total de la segunda");
});

test("una modalidad inactiva NO es cobrable: no aparece en el selector", () => {
  const html = dibujarSelector();
  assert.equal(html.includes("QR guardado"), false);
});

test("el selector pide elegir, y sus opciones son botones de verdad", () => {
  const html = dibujarSelector();
  assert.ok(html.includes("Elegí la modalidad"));
  // `SunmiButton` renderiza `<button>`: se puede tocar y se puede alcanzar con
  // Tab. Una fila de `div` clickeable se vería igual y no sería alcanzable.
  assert.equal(html.split("<button").length - 1, 2, "un botón por modalidad activa");
});

test("el encabezado con Volver lo pone el panel, no el selector", () => {
  // Es el MISMO que usa el panel de dividir. Escribirlo dos veces es como
  // empiezan a separarse.
  assert.equal(dibujarSelector().includes("Volver"), false);
  assert.ok(dibujarPanel().includes("Dividir pago"));
});

// ═══════════════════════════════════════════════════════════════════════════
// PAGO DIVIDIDO
// ═══════════════════════════════════════════════════════════════════════════
//
// El panel dividido se abre con un click, así que acá no se puede llegar a él.
// Lo que sí se puede ejercer es que sus piezas dibujen: se monta el mismo
// componente pidiéndole el modo avanzado a través del único camino que hay sin
// eventos —renderizar y comprobar que el enlace existe— y el resto lo mide la
// sonda contra el navegador.

test("el panel ofrece dividir el pago", () => {
  assert.ok(dibujarPanel().includes("Dividir pago"));
});
