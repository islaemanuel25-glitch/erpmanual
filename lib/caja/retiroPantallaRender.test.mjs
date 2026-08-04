// RENDER REAL de la pantalla de retiro de recaudación.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/retiroPantallaRender.test.mjs
//
// POR QUÉ EXISTE
//
// Ya pasó una vez: un identificador usado sin importar compiló, pasó el lint,
// pasaron más de mil pruebas y reventó en producción, porque ninguna prueba
// EJECUTABA ese JSX. Leer el archivo como texto y buscar la palabra no sirve.
//
// Los tres pasos viven en components/caja/PasosRetiro justamente para poder
// renderizarlos acá con datos armados a mano, sin DOM, sin fetch y sin
// dependencias nuevas: el JSX lo transforma el SWC que Next ya trae.

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import { PasoContar, PasoDefinir, PasoConfirmar } from "@/components/caja/PasosRetiro";
import { MODO_TOTAL, MODO_BILLETES } from "@/lib/caja/conteoBilletes";
import { evaluarRetiro } from "@/lib/caja/retiroDinero";

const render = (Comp, props) => renderToStaticMarkup(createElement(Comp, props));

/** Caso base: esperado 150.000, fondo 30.000, contado exacto, se saca 120.000. */
const CASO = {
  efectivoEsperadoAntes: 150000,
  fondoObjetivo: 30000,
  efectivoContado: 150000,
  efectivoRetirado: 120000,
};
const evaluacion = evaluarRetiro(CASO);

// ── 18. Los tres pasos se renderizan de verdad, en los dos modos ────────────

test("18. los tres pasos renderizan sin ReferenceError, en modo total y en modo billetes", () => {
  // Si algún identificador queda suelto en el JSX, esto explota acá y no en la
  // pantalla de un cajero.
  assert.doesNotThrow(() => {
    for (const modo of [MODO_TOTAL, MODO_BILLETES]) {
      render(PasoContar, {
        modo,
        monto: "150000",
        desglose: { 10000: 15 },
        onModo() {},
        onMonto() {},
        onDesglose() {},
      });
      render(PasoDefinir, {
        modo,
        importe: "120000",
        sugerido: 120000,
        desglose: { 10000: 12 },
        topes: { 10000: 15 },
        totalContado: 150000,
        totalRetiro: 120000,
        fondoObjetivo: 30000,
        fondoFisico: 30000,
        evaluacion,
        onModo() {},
        onImporte() {},
        onDesglose() {},
      });
      render(PasoConfirmar, {
        esperado: 150000,
        totalContado: 150000,
        totalRetiro: 120000,
        fondoObjetivo: 30000,
        fondoFisico: 30000,
        evaluacion,
        observacion: "se lleva Marcela",
        puedeConfirmar: true,
        onObservacion() {},
        onConfirmar() {},
        onGuardarYVolver() {},
      });
    }
  });
});

test("18b. el paso 1 muestra la grilla de billetes solo en modo billetes", () => {
  const base = { monto: "", desglose: {}, onModo() {}, onMonto() {}, onDesglose() {} };

  const total = render(PasoContar, { ...base, modo: MODO_TOTAL });
  assert.match(total, /Monto total contado/);
  assert.doesNotMatch(total, /\$20\.000/, "no debería haber denominaciones en modo total");

  const billetes = render(PasoContar, { ...base, modo: MODO_BILLETES });
  assert.match(billetes, /\$20\.000/);
  assert.match(billetes, /\$100</, "falta la denominación más chica");
  assert.match(billetes, /Monedas \/ otros/);
  assert.doesNotMatch(billetes, /\$5\.000/, "apareció una denominación que no está en la lista");
});

test("18c. el desacople entre el desglose y el monto tipeado se avisa en pantalla", () => {
  const html = render(PasoContar, {
    modo: MODO_TOTAL,
    monto: "100000",
    desglose: { 10000: 15 }, // 150.000, no 100.000
    desacople: true,
    onModo() {},
    onMonto() {},
    onDesglose() {},
  });
  assert.match(html, /150\.000,00/);
  assert.match(html, /100\.000,00/);
  assert.match(html, /Limpiar desglose/);
});

// ── 19. El paso 2 dice la verdad sobre la plata ─────────────────────────────

test("19. el paso 2 muestra recaudación esperada, fondo real que queda y total a retirar", () => {
  const html = render(PasoDefinir, {
    modo: MODO_TOTAL,
    importe: "120000",
    sugerido: 120000,
    desglose: {},
    totalContado: 150000,
    totalRetiro: 120000,
    fondoObjetivo: 30000,
    fondoFisico: 30000,
    evaluacion,
    onModo() {},
    onImporte() {},
    onDesglose() {},
  });
  assert.match(html, /Recaudación esperada/);
  assert.match(html, /Fondo real que queda/);
  assert.match(html, /Total a retirar/);
  assert.match(html, /120\.000,00/);
  assert.match(html, /30\.000,00/);
});

test("19b. si queda menos que el fondo objetivo, se dice — no se afirma que quedó el fondo", () => {
  // Contó 140.000 cuando esperaba 150.000 y sacó igual los 120.000: quedan
  // 20.000 y el objetivo es 30.000.
  const ev = evaluarRetiro({ ...CASO, efectivoContado: 140000 });
  const html = render(PasoDefinir, {
    modo: MODO_TOTAL,
    importe: "120000",
    sugerido: 110000,
    desglose: {},
    totalContado: 140000,
    totalRetiro: 120000,
    fondoObjetivo: 30000,
    fondoFisico: 20000,
    evaluacion: ev,
    onModo() {},
    onImporte() {},
    onDesglose() {},
  });
  assert.match(html, /quedarán \$ 20\.000,00/);
  assert.match(html, /objetivo es \$ 30\.000,00/);
});

test("19c. el tope por denominación se ve en la grilla de retiro", () => {
  const html = render(PasoDefinir, {
    modo: MODO_BILLETES,
    importe: "",
    desglose: { 10000: 9 }, // pide 9 y en el cajón hay 5
    topes: { 10000: 5 },
    totalContado: 50000,
    totalRetiro: 90000,
    fondoObjetivo: 30000,
    fondoFisico: 0,
    evaluacion,
    errorBilletes: "No podés retirar 9 billetes de $10.000: contaste 5.",
    onModo() {},
    onImporte() {},
    onDesglose() {},
  });
  assert.match(html, /contaste 5/);
  assert.match(html, /No podés retirar 9 billetes/);
});

// ── 20. Confirmación, aviso de cambio y reglas transversales ────────────────

test("20. el paso 3 avisa si el esperado cambió y pide confirmar de nuevo", () => {
  const html = render(PasoConfirmar, {
    esperado: 158000,
    totalContado: 150000,
    totalRetiro: 120000,
    fondoObjetivo: 30000,
    fondoFisico: 30000,
    evaluacion,
    observacion: "",
    puedeConfirmar: true,
    cambioEsperado: { cambio: true, anterior: 150000, actual: 158000, diferencia: 8000 },
    onObservacion() {},
    onConfirmar() {},
    onGuardarYVolver() {},
  });
  assert.match(html, /El efectivo esperado cambió/);
  assert.match(html, /8\.000,00/);
  assert.match(html, /Confirmar con el valor nuevo/);
  assert.doesNotMatch(html, />Confirmar retiro</, "no debe ofrecer confirmar como si nada hubiera cambiado");
});

test("20b. sin cambios, el botón confirma normalmente; deshabilitado si no se puede", () => {
  const base = {
    esperado: 150000,
    totalContado: 150000,
    totalRetiro: 120000,
    fondoObjetivo: 30000,
    fondoFisico: 30000,
    evaluacion,
    observacion: "",
    onObservacion() {},
    onConfirmar() {},
    onGuardarYVolver() {},
  };
  const ok = render(PasoConfirmar, { ...base, puedeConfirmar: true });
  assert.match(ok, /Confirmar retiro/);
  assert.doesNotMatch(ok, /Confirmar retiro<\/button>[\s\S]*disabled/);

  const bloqueado = render(PasoConfirmar, { ...base, puedeConfirmar: false });
  assert.match(bloqueado, /disabled/, "sin datos válidos el botón tiene que estar deshabilitado");
});

test("20c. la pantalla nunca habla de arqueo ni pregunta si se retira", () => {
  const htmls = [
    render(PasoContar, { modo: MODO_BILLETES, desglose: {}, onModo() {}, onDesglose() {} }),
    render(PasoDefinir, {
      modo: MODO_BILLETES,
      desglose: {},
      evaluacion,
      fondoObjetivo: 30000,
      fondoFisico: 30000,
      onModo() {},
      onDesglose() {},
    }),
    render(PasoConfirmar, { evaluacion, esperado: 150000, onConfirmar() {}, onGuardarYVolver() {} }),
  ].join("");

  assert.doesNotMatch(htmls, /[Aa]rqueo/, "reapareció la palabra arqueo");
  assert.doesNotMatch(htmls, /Retiro parcial|Cierre final/, "la pantalla no ofrece elegir tipo de retiro");
});

test("20d. el color sale de tokens semánticos, no de clases de color fijas", () => {
  // Un `text-red-500` acá se ve mal en la mitad de los temas del ERP.
  //
  // Se miden solo las clases QUE ESCRIBIMOS: `SunmiCard` ya trae las suyas y
  // arreglarlas es otro trabajo; lo que no puede pasar es que este flujo agregue
  // colores fijos nuevos.
  const claseCard = renderToStaticMarkup(createElement(SunmiCard, {})).match(/class="([\s\S]*?)"/)[1];
  const prefijoCard = claseCard.slice(0, 45);
  const clasesPropias = (html) =>
    [...html.matchAll(/class="([\s\S]*?)"/g)]
      .map((m) => m[1])
      .filter((c) => !c.startsWith(prefijoCard))
      .join(" ");

  const htmls = [
    render(PasoContar, { modo: MODO_BILLETES, desglose: { 10000: 1 }, onModo() {}, onDesglose() {} }),
    render(PasoDefinir, {
      modo: MODO_TOTAL,
      importe: "120000",
      desglose: {},
      totalContado: 150000,
      totalRetiro: 120000,
      fondoObjetivo: 30000,
      fondoFisico: 30000,
      evaluacion,
      errorBilletes: "tope",
      errorReparto: "reparto",
      onModo() {},
      onImporte() {},
      onDesglose() {},
    }),
    render(PasoConfirmar, {
      esperado: 150000,
      evaluacion,
      cambioEsperado: { cambio: true, anterior: 1, actual: 2, diferencia: 1 },
      error: "algo falló",
      onConfirmar() {},
      onGuardarYVolver() {},
    }),
  ].map(clasesPropias).join(" ");

  const colorFijo = /\b(?:text|bg|border)-(?:red|green|blue|amber|yellow|emerald|slate|gray|zinc)-\d{2,3}\b/;
  const encontrado = htmls.match(colorFijo);
  assert.equal(encontrado, null, `color hardcodeado en el JSX de los pasos: ${encontrado?.[0]}`);
  assert.match(htmls, /sunmi-text-/);
});
