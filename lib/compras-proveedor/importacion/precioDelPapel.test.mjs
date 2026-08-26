// EL PRECIO EFECTIVO DE UN RENGLÓN CON BONIFICACIÓN.
//
// ── DE DÓNDE SALIÓ ─────────────────────────────────────────────────────────
//
// El importador tomaba la columna "PRECIO" como precio del papel. En una factura
// con bonificación esa columna es la de LISTA. Un renglón de 12 unidades a
// 8.168,94 con 14 % de bonificación cierra en 87.045,75, o sea 7.253,81 por
// unidad; el ERP se llevaba 8.168,94 y escribía un 12,6 % de más.
//
// Los números de acá son sintéticos y elegidos para reproducir esa aritmética.
// No hay ninguna factura real en el repo.

import test from "node:test";
import assert from "node:assert/strict";

import {
  ORIGEN_PRECIO_PAPEL,
  precioFinalDelRenglon,
  verificarSumaDeSubtotales,
} from "./precioDelPapel.js";

// El caso que dio origen a la tanda, con los números del ejemplo.
const RENGLON = Object.freeze({
  cantidad: 12,
  precioImpreso: 8168.94,
  bonificacionPct: 14,
  subtotal: 87045.75,
  haySubtotalImpreso: true,
});

test("PRIORIDAD 1. el subtotal manda: 87.045,75 entre 12 son 7.253,81", () => {
  const r = precioFinalDelRenglon(RENGLON);
  assert.equal(r.precioFinal, 7253.81);
  assert.equal(r.origen, ORIGEN_PRECIO_PAPEL.SUBTOTAL);
  assert.equal(r.requiereRevision, false);
});

test("PRIORIDAD 1. el subtotal le gana al precio de lista Y a la multiplicación", () => {
  const r = precioFinalDelRenglon(RENGLON);

  // Contra el defecto: NO puede devolver el precio impreso.
  assert.notEqual(r.precioFinal, 8168.94, "volvió a tomar la columna PRECIO como precio final");

  // Y contra el atajo plausible: `precio × (1 − bonif)` da 7.025,29, que NO es
  // lo que el papel cobra. La diferencia son 217,96 sobre el renglón que el 14 %
  // no explica — puede ser una bonificación en cascada, un redondeo del
  // proveedor o un ajuste. El papel manda.
  const porLaMultiplicacion = Math.round(8168.94 * (1 - 14 / 100) * 100) / 100;
  assert.equal(porLaMultiplicacion, 7025.29);
  assert.notEqual(r.precioFinal, porLaMultiplicacion, "usó la multiplicación existiendo un subtotal impreso");

  // El subtotal reconstruido desde el precio final vuelve al papel.
  assert.equal(Math.round(r.precioFinal * 12 * 100) / 100, 87045.72);
});

test("PRIORIDAD 2. sin subtotal, el descuento es el respaldo", () => {
  const r = precioFinalDelRenglon({
    cantidad: 12,
    precioImpreso: 8168.94,
    bonificacionPct: 14,
    subtotal: null,
    haySubtotalImpreso: false,
  });
  assert.equal(r.precioFinal, 7025.29);
  assert.equal(r.origen, ORIGEN_PRECIO_PAPEL.DESCUENTO);
  assert.equal(r.requiereRevision, false);
});

test("PRIORIDAD 3. sin subtotal y sin descuento se conserva el precio impreso", () => {
  const r = precioFinalDelRenglon({
    cantidad: 12,
    precioImpreso: 8168.94,
    bonificacionPct: null,
    subtotal: null,
    haySubtotalImpreso: false,
  });
  assert.equal(r.precioFinal, 8168.94, "cambió el comportamiento anterior");
  assert.equal(r.origen, ORIGEN_PRECIO_PAPEL.PRECIO_IMPRESO);
  assert.equal(r.requiereRevision, false);

  // Una bonificación de CERO es lo mismo que no tenerla: no se descuenta nada.
  const conCero = precioFinalDelRenglon({
    cantidad: 12,
    precioImpreso: 8168.94,
    bonificacionPct: 0,
    subtotal: null,
    haySubtotalImpreso: false,
  });
  assert.equal(conCero.precioFinal, 8168.94);
  assert.equal(conCero.origen, ORIGEN_PRECIO_PAPEL.PRECIO_IMPRESO);
});

test("CONTRAPRUEBA DEL ORDEN. si el descuento se evaluara primero, el caso real daría 7.025,29", () => {
  // Este candado existe para que dar vuelta las dos ramas se ponga rojo. Con el
  // orden invertido, el renglón del ejemplo devolvería la multiplicación —que es
  // 228,52 más barata por unidad que lo que el papel cobra— y nadie lo vería:
  // los dos números son plausibles y ninguno es el precio de lista.
  const r = precioFinalDelRenglon(RENGLON);
  assert.equal(r.origen, ORIGEN_PRECIO_PAPEL.SUBTOTAL, "el descuento le ganó al subtotal");
  assert.equal(r.precioFinal, 7253.81);
});

test("EL SUBTOTAL DERIVADO NO SE USA: sin columna impresa, no es un subtotal", () => {
  // ── EL AGUJERO QUE ESTE CANDADO TAPA ────────────────────────────────────
  //
  // `subtotal` se puede calcular con `cantidad × precio`. Si el lector lo
  // completa cuando el papel no lo trae —y un campo obligatorio en una salida
  // estructurada es una orden de inventar—, en una factura CON bonificación
  // devolvería `12 × 8.168,94`, y `subtotal ÷ cantidad` daría exactamente el
  // precio de lista. O sea el defecto original, disfrazado de arreglo.
  const derivado = 12 * 8168.94;
  const r = precioFinalDelRenglon({
    cantidad: 12,
    precioImpreso: 8168.94,
    bonificacionPct: 14,
    subtotal: derivado,
    haySubtotalImpreso: false,
  });
  assert.notEqual(r.precioFinal, 8168.94, "usó un subtotal calculado y volvió al precio de lista");
  assert.equal(r.origen, ORIGEN_PRECIO_PAPEL.DESCUENTO, "no bajó al escalón del descuento");
  assert.equal(r.precioFinal, 7025.29);
});

test("EL LECTOR QUE NO CONTESTA NO AUTORIZA: null no es sí", () => {
  // `haySubtotalImpreso` en null significa "no sé". Tratarlo como sí sería
  // confiar en un número que puede estar calculado.
  const r = precioFinalDelRenglon({ ...RENGLON, haySubtotalImpreso: null });
  assert.equal(r.origen, ORIGEN_PRECIO_PAPEL.DESCUENTO);
  assert.notEqual(r.precioFinal, 7253.81);
});

test("CANTIDAD CERO O INVÁLIDA CON SUBTOTAL: revisión, nunca un precio silencioso", () => {
  for (const cantidad of [0, null, "", "abc", -3]) {
    const r = precioFinalDelRenglon({ ...RENGLON, cantidad });
    assert.equal(r.precioFinal, null, `con cantidad ${JSON.stringify(cantidad)} inventó un precio`);
    assert.equal(r.requiereRevision, true, `con cantidad ${JSON.stringify(cantidad)} no pidió revisión`);
    assert.ok(r.motivo, "pidió revisión sin decir por qué");
    // Y en particular NO cae al precio de lista, que sería el defecto original.
    assert.notEqual(r.precioFinal, 8168.94);
  }
});

test("SUBTOTAL INVÁLIDO: ni NaN ni cero", () => {
  const negativo = precioFinalDelRenglon({ ...RENGLON, subtotal: -1 });
  assert.equal(negativo.precioFinal, null);
  assert.equal(negativo.requiereRevision, true);

  // Un subtotal que no es número cae al escalón siguiente, no a NaN.
  const basura = precioFinalDelRenglon({ ...RENGLON, subtotal: "no es un número" });
  assert.equal(basura.origen, ORIGEN_PRECIO_PAPEL.DESCUENTO);
  assert.ok(Number.isFinite(basura.precioFinal));
});

test("BONIFICACIÓN FUERA DE RANGO O SIN PRECIO: revisión", () => {
  const absurda = precioFinalDelRenglon({
    cantidad: 12, precioImpreso: 100, bonificacionPct: 140, subtotal: null, haySubtotalImpreso: false,
  });
  assert.equal(absurda.precioFinal, null);
  assert.equal(absurda.requiereRevision, true);

  const sinPrecio = precioFinalDelRenglon({
    cantidad: 12, precioImpreso: null, bonificacionPct: 14, subtotal: null, haySubtotalImpreso: false,
  });
  assert.equal(sinPrecio.precioFinal, null);
  assert.equal(sinPrecio.requiereRevision, true, "consta que hay descuento y no hay con qué aplicarlo");
});

test("UN RENGLÓN SIN NINGÚN DATO DE PRECIO NO ES UN ERROR", () => {
  // Una planilla de pedido no trae precios. Eso no se revisa: se resuelve con el
  // costo del sistema. Marcarlo como pendiente frenaría el flujo entero.
  const r = precioFinalDelRenglon({
    cantidad: 12, precioImpreso: null, bonificacionPct: null, subtotal: null, haySubtotalImpreso: false,
  });
  assert.equal(r.precioFinal, null);
  assert.equal(r.requiereRevision, false);
  assert.equal(r.origen, null);
});

test("EL 0,14 DE UNA CELDA CON FORMATO PORCENTAJE NO SE CONFUNDE CON 0,14 %", () => {
  // La normalización vive en `excelFilas`; acá se comprueba que este módulo
  // recibe ya el número en escala de porcentaje y no lo vuelve a tocar.
  const r = precioFinalDelRenglon({
    cantidad: 1, precioImpreso: 100, bonificacionPct: 14, subtotal: null, haySubtotalImpreso: false,
  });
  assert.equal(r.precioFinal, 86);
});

test("REDONDEO. la división se cierra al centavo y no arrastra decimales", () => {
  const r = precioFinalDelRenglon({
    cantidad: 3, precioImpreso: null, bonificacionPct: null, subtotal: 10, haySubtotalImpreso: true,
  });
  // 10 / 3 son 3,3333…: se guarda 3,33 y no un número con catorce decimales que
  // la pantalla muestre distinto de lo que el borrador escribe.
  assert.equal(r.precioFinal, 3.33);
  assert.equal(String(r.precioFinal).length <= 5, true);
});

// ── LA SUMA DE LOS SUBTOTALES CONTRA EL TOTAL ─────────────────────────────

test("CUADRE. una diferencia de centavos por redondeo NO bloquea", () => {
  // Tres renglones que el proveedor redondeó cada uno por su lado.
  const r = verificarSumaDeSubtotales({
    subtotales: [87045.75, 1000.01, 499.99],
    totalDocumento: 88545.73,
    hayTotalImpreso: true,
  });
  assert.equal(r.cierra, true, "un par de centavos frenó el documento");
  assert.equal(r.suma, 88545.75);
  assert.equal(Math.abs(r.diferencia) <= r.tolerancia, true);
});

test("CUADRE. una diferencia grande se informa", () => {
  const r = verificarSumaDeSubtotales({
    subtotales: [87045.75, 1000, 500],
    totalDocumento: 80000,
    hayTotalImpreso: true,
  });
  assert.equal(r.cierra, false);
  assert.equal(r.suma, 88545.75);
  assert.equal(r.diferencia, 8545.75);
});

test("CUADRE. sin total impreso el resultado es NULL, que no es lo mismo que cierra", () => {
  // "No se pudo comparar" y "comparé y da bien" son afirmaciones distintas. Un
  // `true` por omisión haría que un remito sin total pareciera verificado.
  const sinBooleano = verificarSumaDeSubtotales({
    subtotales: [10, 20],
    totalDocumento: 30,
    hayTotalImpreso: false,
  });
  assert.equal(sinBooleano.cierra, null);
  assert.ok(sinBooleano.porque);

  const sinNumero = verificarSumaDeSubtotales({
    subtotales: [10, 20],
    totalDocumento: null,
    hayTotalImpreso: true,
  });
  assert.equal(sinNumero.cierra, null);

  const sinSubtotales = verificarSumaDeSubtotales({
    subtotales: [null, null],
    totalDocumento: 30,
    hayTotalImpreso: true,
  });
  assert.equal(sinSubtotales.cierra, null);
});

test("CUADRE. la tolerancia se acumula por renglón y no es un centavo fijo", () => {
  // Cuarenta renglones, cada uno redondeado un centavo para el mismo lado.
  const subtotales = Array.from({ length: 40 }, () => 10.01);
  const total = 400;
  const r = verificarSumaDeSubtotales({ subtotales, totalDocumento: total, hayTotalImpreso: true });
  assert.equal(r.suma, 400.4);
  assert.equal(r.tolerancia, 0.4, "la tolerancia no acompaña a la cantidad de renglones");
  assert.equal(r.cierra, true);

  // Y un centavo más que la tolerancia ya no cierra: no es un colador.
  const apretado = verificarSumaDeSubtotales({
    subtotales, totalDocumento: 399.99, hayTotalImpreso: true,
  });
  assert.equal(apretado.cierra, false);
});
