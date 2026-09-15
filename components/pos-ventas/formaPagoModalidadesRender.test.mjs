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
import { CLASE_BOTON_MEDIO } from "@/lib/pos-ventas/mediosCobroPantalla";
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

/**
 * CUÁNTOS BOTONES DEL PANEL LLEVAN ESTE TEXTO.
 *
 * Contar el texto crudo NO sirve, y lo probó este mismo candado en su primera
 * corrida: el ícono de Mercado Pago es un `<img alt="Mercado Pago">` adentro del
 * botón, así que el nombre aparecía dos veces y el candado daba rojo con UN solo
 * botón. Estaba midiendo el alt del ícono, no la cantidad de botones.
 *
 * Se cuentan elementos. Los botones no se anidan en este panel, así que cortar
 * por la etiqueta de apertura y quedarse con lo que va hasta su cierre alcanza.
 */
const contarBotonesCon = (html, texto) =>
  html
    .split("<button")
    .slice(1)
    .filter((seg) => seg.split("</button>")[0].includes(texto)).length;

// ═══════════════════════════════════════════════════════════════════════════
// UN MEDIO CON MODALIDADES ES UN SOLO BOTÓN
// ═══════════════════════════════════════════════════════════════════════════

test("Mercado Pago aparece UNA vez, y sus modalidades no son medios", () => {
  const html = dibujarPanel();

  assert.equal(contarBotonesCon(html, "Mercado Pago"), 1, "un solo botón padre");
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
  // EL SIGNO ADELANTE, que antes no estaba: "4 %" al lado de un importe se
  // puede leer como un descuento. El texto lo decide
  // `etiquetaRecargoDeOpcion`, que tiene sus propios candados.
  assert.ok(html.includes("+4 %"), "falta el recargo de la primera");
  assert.ok(html.includes("+8 %"), "falta el recargo de la segunda");
  assert.equal(html.includes("Recargo 4 %"), false, "quedó la redacción vieja");
  assert.ok(html.includes("2.080,00"), "el total de la primera");
  assert.ok(html.includes("2.160,00"), "el total de la segunda");
});

test("una modalidad inactiva NO es cobrable: no aparece en el selector", () => {
  const html = dibujarSelector();
  assert.equal(html.includes("QR guardado"), false);
});

test("las opciones son botones de verdad, y ya no hay línea que pida elegir", () => {
  const html = dibujarSelector();
  // `SunmiButton` renderiza `<button>`: se puede tocar y se puede alcanzar con
  // Tab. Una fila de `div` clickeable se vería igual y no sería alcanzable.
  assert.equal(html.split("<button").length - 1, 2, "un botón por modalidad activa");

  // SE SACÓ "Elegí la modalidad". El encabezado que dibuja `FormaPago` ya dice
  // de qué medio son estas opciones, así que la línea repetía el contexto y
  // empujaba las opciones fuera del pulgar en una pantalla de 360 px.
  assert.equal(html.includes("Elegí la modalidad"), false, "volvió la línea que se sacó");
});

test("una opción se dibuja con LA MISMA clase que un botón de medio del panel", () => {
  // ── POR QUÉ ESTO ES UN CANDADO Y NO UN DETALLE DE ESTILO ────────────────
  //
  // El selector se veía mal porque usaba `SunmiButton color="secondary"`, que es
  // la variante GENÉRICA del kit, mientras el panel usa la del POS
  // —`sunmi-pos-btn-secondary`—. Son dos reglas distintas del CSS: las opciones
  // salían con otro fondo, otro alto y otra tipografía que los botones de los
  // que cuelgan.
  //
  // Lo que lo cierra es que las dos salgan de la MISMA constante. Si alguien
  // vuelve a escribir las clases al lado, esto se pone rojo aunque el resultado
  // se parezca ese día.
  const selector = dibujarSelector();
  const panel = dibujarPanel();

  for (const clase of CLASE_BOTON_MEDIO.split(" ")) {
    assert.ok(selector.includes(clase), `la opción no lleva "${clase}"`);
    assert.ok(panel.includes(clase), `el botón del panel no lleva "${clase}"`);
  }
});

test("una modalidad SIN recargo lo dice en palabras, no con un cero", () => {
  const sinRecargo = {
    ...MEDIOS[1],
    modalidades: componerModalidades([
      { id: 201, nombre: "QR / dinero en cuenta", activo: true, orden: 1, tipoContable: "MERCADOPAGO", recargoPct: 0 },
    ]),
  };
  const boton = botonesDeCobro([sinRecargo]).find((b) => b.nombre === "Mercado Pago");
  const html = renderToStaticMarkup(
    createElement(SelectorModalidad, {
      opciones: opcionesDeModalidad(boton),
      totalDe: () => 2000,
      onElegir: () => {},
      formatearImporte: (n) => String(n),
    })
  );
  assert.ok(html.includes("Sin recargo"));
  assert.equal(html.includes("+0 %"), false, "un cero entre porcentajes se lee salteado");
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

// ═══════════════════════════════════════════════════════════════════════════
// DESPUÉS DE LA VENTA, EL PANEL NO ARRASTRA NADA
// ═══════════════════════════════════════════════════════════════════════════
//
// ── EL DEFECTO, CON SU NÚMERO ──────────────────────────────────────────────
//
// Registrada la "Venta #67" con una modalidad, el carrito quedaba vacío y el
// panel seguía en el selector: "Elegí la modalidad" con las opciones en $0,00.
// El cajero tenía que apretar "← Volver" para poder cobrar la siguiente, y nada
// en la pantalla decía que había que hacerlo.
//
// ── LO QUE ESTOS DOS CANDADOS PRUEBAN Y LO QUE NO ──────────────────────────
//
// `renderToStaticMarkup` dibuja el estado INICIAL: no hay clicks ni estado, así
// que desde acá no se puede entrar al selector y despues vaciar el carrito. Lo
// que sí se puede afirmar es el ESTADO AL QUE HAY QUE VOLVER, que es la mitad
// que se puede romper en silencio: si mañana el panel con el carrito vacío
// dibujara un total con recargo, esto se pone rojo.
//
// La secuencia completa —tocar Mercado Pago, vaciar el carrito y comprobar que
// el panel volvió solo— la ejerce `scripts/capturas-cobro-modalidades.mjs`
// contra un navegador de verdad, sobre el andamio.

test("con el carrito vacío el panel está en modo simple y no pide elegir modalidad", () => {
  const vacio = totalesPorOpcionDeCobro({ carrito: [], medios: MEDIOS });
  const html = dibujarPanel({ subtotal: 0, previewPorOpcion: vacio });

  assert.equal(html.includes("Elegí la modalidad"), false);
  assert.equal(html.includes("Volver"), false, "quedó adentro de una pantalla de segundo nivel");
  assert.ok(html.includes("Elegí cómo cobrar"), "no volvió al panel de medios");
});

test("con el carrito vacío el total NO arrastra el recargo de la venta anterior", () => {
  // El preview se recalcula con el carrito vacío, así que todas las opciones dan
  // cero y no hay ningún medio que "difiera": el panel muestra un único total en
  // cero, que es lo mismo que mostraba antes de que existieran las modalidades.
  const vacio = totalesPorOpcionDeCobro({ carrito: [], medios: MEDIOS });
  const html = dibujarPanel({ subtotal: 0, previewPorOpcion: vacio });

  assert.ok(html.includes("Total a cobrar"));
  assert.equal(html.includes("Total según el medio"), false, "sin carrito no hay rango que mostrar");
  assert.ok(html.includes("$0,00"));
  for (const arrastre of ["2.080,00", "2.160,00", "2.120,00"]) {
    assert.equal(html.includes(arrastre), false, `quedó pegado el importe ${arrastre}`);
  }
});
