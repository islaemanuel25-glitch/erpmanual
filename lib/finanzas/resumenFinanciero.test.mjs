// CANDADO: LAS MÉTRICAS DEL PERÍODO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/finanzas/resumenFinanciero.test.mjs
//
// ── DE DÓNDE SALEN LOS FIXTURES, QUE ES LA PRIMERA PREGUNTA ──────────────
//
// De la forma EXACTA que produce `SELECT_VENTA` en
// `app/api/finanzas/tablero/route.js`, y hay un candado abajo que compara las
// dos listas de campos. Es el defecto que este repo tiene anotado como el que
// más se repite: un fixture plausible escrito a mano sobre una combinación que
// el endpoint nunca manda deja el candado VERDE para siempre sin cubrir nada.
//
// Y los importes van como CADENAS —"1000.00"— porque eso es lo que devuelve
// Prisma para un `Decimal`, no un número. Con números, la conversión a centavos
// nunca se ejercería sobre la forma real.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  FUENTE_COSTO_VENDIDO,
  METRICAS_NO_DISPONIBLES,
  TEXTOS_DEL_RESUMEN,
  desglosarCaja,
  desglosarCobros,
  resumenDelPeriodo,
} from "@/lib/finanzas/resumenFinanciero";
import { getRangoArgentina } from "@/lib/fechas/rangoArgentina";
import { desglosarVentas } from "@/lib/caja/efectivoEsperado";
import { clasificarMovimientos, soloManuales, soloRecaudacion } from "@/lib/finanzas/movimientosDeCaja";
import { hechoDeMovimiento } from "@/lib/finanzas/actividadFinanciera";

const sinComentarios = (ruta) =>
  readFileSync(ruta, "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/** Una venta con la forma que manda el endpoint. */
function venta({ id, total, costoTotal, gananciaBruta, pagos, turnoId = 10, comisionPendiente = false }) {
  return {
    id,
    total,
    costoTotal,
    gananciaBruta,
    turnoId,
    // Booleano real de la base: toda fila lo tiene desde su migración.
    comisionPendiente,
    esFiado: (pagos || []).some((p) => p.medio === "FIADO"),
    formaPago: pagos?.[0]?.medio || "EFECTIVO",
    comisionBancaria: String(
      (pagos || []).reduce((a, p) => a + Number(p.comision || 0), 0).toFixed(2)
    ),
    netoRecibido: String((pagos || []).reduce((a, p) => a + Number(p.neto || 0), 0).toFixed(2)),
    pagos: pagos || [],
  };
}

const tender = (medio, monto, comision = "0.00") => ({
  medio,
  monto,
  comision,
  neto: String((Number(monto) - Number(comision)).toFixed(2)),
});

// ── EL PERÍODO, ARMADO COMO LO ARMA LA RUTA ──────────────────────────────
//
// `desde`/`hasta` son los días del rango y `instanteFin` el fin del último día
// argentino, el MISMO `fechaFin` que sale de `getRangoArgentina` en el tablero.
const RANGO = { desde: "2026-09-20", hasta: "2026-09-26" };
const PERIODO = { ...RANGO, instanteFin: getRangoArgentina(RANGO.desde, RANGO.hasta).fechaFin };

/** Una columna `DATE` como la devuelve Prisma: medianoche UTC de ese día. */
const dia = (iso) => new Date(`${iso}T00:00:00.000Z`);
/** Un instante argentino. */
const ar = (iso) => new Date(`${iso}-03:00`);

// ══════════════════════════════════════════════════════════════════════════
// 4 · EL COSTO SE SUMA SOBRE EL MISMO UNIVERSO QUE EL TOTAL
// ══════════════════════════════════════════════════════════════════════════

test("R1 · ventas y costo salen del MISMO recorrido, fila por fila", () => {
  const ventas = [
    venta({ id: 1, total: "1000.00", costoTotal: "600.00", gananciaBruta: "400.00", pagos: [tender("EFECTIVO", "1000.00")] }),
    venta({ id: 2, total: "500.50", costoTotal: "300.25", gananciaBruta: "200.25", pagos: [tender("EFECTIVO", "500.50")] }),
  ];
  const r = resumenDelPeriodo({ ventas });

  assert.equal(r.ventas, 1500.5);
  assert.equal(r.costoVendido, 900.25);
  assert.equal(r.margenBruto, 600.25);
  assert.equal(r.cantidadVentas, 2);
});

test("R2 · una venta SIN costo cargado aporta 0 al costo y su total igual suma", () => {
  // Es el caso real que rompería una suma hecha con dos consultas separadas: si
  // el costo se pidiera aparte con un filtro propio, esta venta podría entrar en
  // una suma y no en la otra. Acá es la misma iteración, así que no puede pasar.
  const ventas = [
    venta({ id: 1, total: "1000.00", costoTotal: "0.00", gananciaBruta: "1000.00", pagos: [tender("EFECTIVO", "1000.00")] }),
  ];
  const r = resumenDelPeriodo({ ventas });
  assert.equal(r.ventas, 1000);
  assert.equal(r.costoVendido, 0);
  assert.equal(r.margenBruto, 1000);
});

test("R3 · CONTRAPRUEBA: sacar una venta del universo mueve las DOS sumas", () => {
  // Si alguna vez el costo se sumara sobre otro conjunto, este candado se pone
  // rojo: acá se quita una fila y se exige que las dos bajen a la vez.
  const todas = [
    venta({ id: 1, total: "1000.00", costoTotal: "600.00", gananciaBruta: "400.00", pagos: [tender("EFECTIVO", "1000.00")] }),
    venta({ id: 2, total: "400.00", costoTotal: "250.00", gananciaBruta: "150.00", pagos: [tender("EFECTIVO", "400.00")] }),
  ];
  const completo = resumenDelPeriodo({ ventas: todas });
  const recortado = resumenDelPeriodo({ ventas: todas.slice(0, 1) });

  assert.equal(completo.ventas - recortado.ventas, 400);
  assert.equal(completo.costoVendido - recortado.costoVendido, 250);
});

test("R4 · los centavos no derivan: 0,1 + 0,2 da 0,30 y no 0,30000000000000004", () => {
  const ventas = [
    venta({ id: 1, total: "0.10", costoTotal: "0.00", gananciaBruta: "0.10", pagos: [tender("EFECTIVO", "0.10")] }),
    venta({ id: 2, total: "0.20", costoTotal: "0.00", gananciaBruta: "0.20", pagos: [tender("EFECTIVO", "0.20")] }),
  ];
  assert.equal(resumenDelPeriodo({ ventas }).ventas, 0.3);
});

// ══════════════════════════════════════════════════════════════════════════
// EL MARGEN: LA RESTA, Y POR QUÉ NO ES `gananciaBruta`
// ══════════════════════════════════════════════════════════════════════════

test("R5 · sin recargo, la resta y el campo persistido COINCIDEN", () => {
  const ventas = [
    venta({ id: 1, total: "1000.00", costoTotal: "600.00", gananciaBruta: "400.00", pagos: [tender("EFECTIVO", "1000.00")] }),
  ];
  const r = resumenDelPeriodo({ ventas });
  assert.equal(r.margenBruto, 400);
  assert.equal(r.controlMargen.difiere, false);
  assert.equal(r.controlMargen.diferencia, 0);
});

test("R6 · CON RECARGO DE PAGO DIFIEREN, Y ÉSE ES EL MOTIVO DE USAR LA RESTA", () => {
  // La medición que justifica la decisión, ejercida y no afirmada. El POS
  // calcula `gananciaBruta = totalAntesRecargo - costoTotal`
  // (app/api/pos-ventas/crear/route.js), así que con un recargo de $50 el campo
  // vale 50 menos que `total - costoTotal`.
  //
  // Finanzas muestra ventas, costo y margen juntos: si el margen saliera del
  // campo, los tres números de la pantalla no cerrarían y se leería como un
  // error de la pantalla.
  const ventas = [
    venta({
      id: 1,
      total: "1050.00", // 1000 de mercadería + 50 de recargo por medio de pago
      costoTotal: "600.00",
      gananciaBruta: "400.00", // = totalAntesRecargo(1000) − costo(600)
      pagos: [tender("CREDITO", "1050.00", "73.50")],
    }),
  ];
  const r = resumenDelPeriodo({ ventas });

  assert.equal(r.margenBruto, 450, "el margen que se muestra es ventas menos costo");
  assert.equal(r.controlMargen.sumaGananciaBrutaPersistida, 400);
  assert.equal(r.controlMargen.difiere, true, "los dos tienen que diferir con recargo");
  assert.equal(r.controlMargen.diferencia, 50, "la diferencia es exactamente el recargo");
  // Y los tres números de la pantalla cierran entre ellos.
  assert.equal(r.ventas - r.costoVendido, r.margenBruto);
});

// ══════════════════════════════════════════════════════════════════════════
// LOS COBROS SALEN DE `VentaPago`, NO DE `formaPago`
// ══════════════════════════════════════════════════════════════════════════

test("R7 · un pago DIVIDIDO se desglosa por tender, no se atribuye entero a formaPago", () => {
  // Es la prueba de que no se reconstruye desde `formaPago`: esta venta tiene
  // `formaPago: "EFECTIVO"` y $600 de los $1000 entraron por débito.
  const ventas = [
    venta({
      id: 1,
      total: "1000.00",
      costoTotal: "0.00",
      gananciaBruta: "1000.00",
      pagos: [tender("EFECTIVO", "400.00"), tender("DEBITO", "600.00", "42.00")],
    }),
  ];
  const { medios, efectivo, digital, comisiones } = desglosarCobros(ventas);

  assert.equal(efectivo, 400);
  assert.equal(digital, 600);
  assert.equal(comisiones, 42);
  assert.deepEqual(
    medios.map((m) => [m.medio, m.monto]),
    [
      ["EFECTIVO", 400],
      ["DEBITO", 600],
    ]
  );
});

test("R8 · una venta HISTÓRICA sin filas en VentaPago igual aporta su tender", () => {
  // `tendersParaAgregar` cae a `formaPago + total` solo cuando NO hay pagos. Si
  // el desglose ignorara ese caso, las ventas viejas desaparecerían del bloque
  // de cobros mientras siguen sumando en "Ventas" — dos números que no cierran.
  const historica = {
    id: 9,
    total: "250.00",
    costoTotal: "100.00",
    gananciaBruta: "150.00",
    turnoId: 10,
    esFiado: false,
    formaPago: "efectivo",
    comisionBancaria: "0.00",
    netoRecibido: "250.00",
    pagos: [],
  };
  const { medios, efectivo } = desglosarCobros([historica]);
  assert.equal(efectivo, 250);
  assert.deepEqual(medios.map((m) => m.medio), ["EFECTIVO"]);
});

test("R9 · el FIADO se muestra y se marca: no es un cobro", () => {
  const ventas = [
    venta({ id: 1, total: "800.00", costoTotal: "500.00", gananciaBruta: "300.00", pagos: [tender("FIADO", "800.00")] }),
  ];
  const d = desglosarCobros(ventas);
  const fiado = d.medios.find((m) => m.medio === "FIADO");

  assert.equal(fiado.monto, 800);
  assert.equal(fiado.esCobro, false, "el fiado no puede presentarse como cobro");
  assert.equal(d.fiado, 800);
  assert.equal(d.efectivo, 0);
  assert.equal(d.digital, 0, "el fiado no es digital");
  assert.equal(fiado.comision, 0, "el fiado no cobra comisión");
  assert.equal(fiado.neto, 0, "el fiado no tiene neto: no entró plata");
});

test("R10 · LOS TOTALES DEL DESGLOSE CIERRAN CONTRA LOS DE CAJA, sobre el mismo insumo", () => {
  // Es el candado anti-deriva: si alguien reescribiera la clasificación de
  // medios en Finanzas, este se pone rojo. Las dos funciones tienen que dar lo
  // mismo porque miran el mismo hecho.
  const ventas = [
    venta({ id: 1, total: "1000.00", costoTotal: "0.00", gananciaBruta: "1000.00", pagos: [tender("EFECTIVO", "400.00"), tender("DEBITO", "600.00", "42.00")] }),
    venta({ id: 2, total: "800.00", costoTotal: "0.00", gananciaBruta: "800.00", pagos: [tender("FIADO", "800.00")] }),
    venta({ id: 3, total: "300.00", costoTotal: "0.00", gananciaBruta: "300.00", pagos: [tender("MERCADOPAGO", "300.00", "21.00")] }),
  ];
  const finanzas = desglosarCobros(ventas);
  const caja = desglosarVentas(ventas);

  assert.equal(finanzas.efectivo, caja.efectivoCentavos / 100);
  assert.equal(finanzas.digital, caja.digitalCentavos / 100);
  assert.equal(finanzas.fiado, caja.fiadoCentavos / 100);
  assert.equal(finanzas.comisiones, caja.comisionCentavos / 100);
  assert.equal(finanzas.netoDigital, caja.netoDigitalCentavos / 100);

  // Y la suma de los medios es el total vendido: no se pierde ni se duplica uno.
  const sumaMedios = finanzas.medios.reduce((a, m) => a + m.monto, 0);
  assert.equal(sumaMedios, 2100);
});

test("R11 · un medio que no aparece en el período NO se dibuja en cero", () => {
  const ventas = [
    venta({ id: 1, total: "100.00", costoTotal: "0.00", gananciaBruta: "100.00", pagos: [tender("EFECTIVO", "100.00")] }),
  ];
  const { medios } = desglosarCobros(ventas);
  assert.deepEqual(medios.map((m) => m.medio), ["EFECTIVO"]);
});

// ══════════════════════════════════════════════════════════════════════════
// 10 · UN RETIRO DE CAJA ES UN RETIRO, NO UN GASTO
// ══════════════════════════════════════════════════════════════════════════

const MOVS = [
  { id: 1, tipo: "RETIRO", monto: "25000.00", motivo: "Panadería", createdAt: new Date("2026-09-12T14:00:00Z"), turnoId: 10 },
  { id: 2, tipo: "INGRESO", monto: "10000.00", motivo: "Cambio", createdAt: new Date("2026-09-12T15:00:00Z"), turnoId: 10 },
  { id: 3, tipo: "RETIRO", monto: "103400.00", motivo: "Retiro de recaudación", createdAt: new Date("2026-09-12T20:00:00Z"), turnoId: 10 },
];

test("R12 · los manuales y la recaudación NO se suman juntos", () => {
  // Mover plata no es gastarla: el retiro de recaudación es la venta que ya se
  // contó, saliendo del cajón. Mezclarlo con los manuales daría un renglón de
  // $128.400 que se lee como plata que se fue del negocio.
  const clasificados = clasificarMovimientos(MOVS, { idsDeRecaudacion: new Set([3]) });
  const caja = desglosarCaja({
    manuales: soloManuales(clasificados),
    recaudacion: soloRecaudacion(clasificados),
  });

  assert.equal(caja.retiros, 25000, "los retiros manuales son solo los de Caja +/−");
  assert.equal(caja.ingresos, 10000);
  assert.equal(caja.retirosDeRecaudacion, 103400);
  assert.equal(caja.cantidadRetiros, 1);
  assert.equal(caja.cantidadRetirosDeRecaudacion, 1);
});

test("R13 · CONTRAPRUEBA: sin la clasificación, el retiro manual se infla", () => {
  // Si alguien pasara la lista sin clasificar —o clasificara por el TEXTO del
  // motivo, que es libre— el número cambia. Se ejerce el caso malo a propósito
  // para que la diferencia quede medida y no afirmada.
  const sinClasificar = desglosarCaja({ manuales: MOVS, recaudacion: [] });
  assert.equal(sinClasificar.retiros, 128400);
  assert.notEqual(sinClasificar.retiros, 25000);
});

test("R14 · EN NINGÚN LADO SE LE DICE GASTO A UN RETIRO", () => {
  // ── POR QUÉ NO ALCANZA CON BUSCAR LA PALABRA ──────────────────────────
  //
  // "Gastos operativos" SÍ aparece, y tiene que aparecer: es el rótulo de la
  // métrica que NO existe. Un candado que prohibiera la palabra se pondría rojo
  // por el texto correcto, y para pasarlo alguien sacaría justo el aviso que
  // este módulo tiene que dar.
  //
  // Lo que se prohíbe es la palabra en un rótulo de MOVIMIENTO. Por eso se
  // ejercen los rótulos de verdad —los que devuelve la función— y el código se
  // mira solo donde hay rótulos de caja. Los comentarios se sacan antes: este
  // proyecto ya tuvo tres candados que encontraban su patrón en prosa y uno de
  // ellos dio VERDE con el chequeo sacado.
  // Los rótulos DE VERDAD, ejercidos sobre los tres casos que existen.
  const clasificados = clasificarMovimientos(MOVS, { idsDeRecaudacion: new Set([3]) });
  for (const m of clasificados) {
    const h = hechoDeMovimiento(m);
    assert.doesNotMatch(h.titulo, /gasto/i, `el hecho ${m.id} se llama "${h.titulo}"`);
  }
  assert.deepEqual(
    clasificados.map((m) => hechoDeMovimiento(m).titulo),
    ["Retiro de caja", "Ingreso de caja", "Retiro de recaudación"]
  );

  for (const ruta of [
    "components/finanzas/DiaDeActividad.jsx",
    "components/finanzas/DetalleDeTurno.jsx",
  ]) {
    const codigo = sinComentarios(ruta);
    // Un literal de rótulo que diga "gasto". En estas dos pantallas no hay
    // ninguna métrica no disponible, así que cualquier aparición sería un
    // movimiento mal nombrado.
    assert.doesNotMatch(
      codigo,
      /["'][^"']*\bgasto/i,
      `${ruta} le dice gasto a un movimiento de caja`
    );
  }

  // Y en el resumen, la palabra solo puede vivir donde se habla de GASTOS DE
  // VERDAD: el bloque de textos del resumen —las limitaciones del resultado
  // hablan de los gastos registrados— y los `import` de los módulos de gastos,
  // que son rutas y no rótulos. Desde que el resumen suma gastos esto es lo que
  // cambió: antes la palabra solo podía estar en las métricas no disponibles.
  // Lo que se sigue afirmando es lo mismo: ningún rótulo de MOVIMIENTO de caja
  // se llama gasto. Se recortan esos bloques y se mira el resto.
  //
  // Y se mira LITERAL POR LITERAL. El patrón anterior —una comilla y después la
  // palabra, sin otra comilla en el medio— no reconocía dónde termina una
  // cadena: arrancaba en la comilla de CIERRE de un literal y encontraba la
  // palabra en el código de después. Con los identificadores `gastos` del
  // resumen nuevo eso daba rojo sobre código que no es ningún rótulo.
  const resumen = sinComentarios("lib/finanzas/resumenFinanciero.js");
  const bloqueTextos = /export const TEXTOS_DEL_RESUMEN = Object\.freeze\(\{[\s\S]*?\n\}\);/;
  assert.match(resumen, bloqueTextos, "desapareció el bloque de textos: el recorte dejaría de probar nada");
  const sinLosTextos = resumen
    .replace(/export const METRICAS_NO_DISPONIBLES = Object\.freeze\(\[[\s\S]*?\n\]\);/, "")
    .replace(bloqueTextos, "")
    .replace(/^import[\s\S]*?from\s+"[^"]+";$/gm, "");
  const literales = [...sinLosTextos.matchAll(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g)].map((m) => m[0]);
  assert.ok(literales.length >= 5, `se leyeron muy pocos literales: ${literales.join(", ")}`);
  const conGasto = literales.filter((l) => /\bgasto/i.test(l));
  assert.deepEqual(conGasto, [], "aparece un rótulo con la palabra gasto fuera de los textos del resumen");
});

test("R15 · y el motivo se muestra TAL CUAL, sin interpretar", () => {
  const h = hechoDeMovimiento(MOVS[0]);
  assert.equal(h.titulo, "Retiro de caja");
  assert.equal(h.sale, true);
  // Y el motivo va tal cual, sin interpretar.
  assert.equal(h.subtitulo, "Motivo: Panadería");
  assert.equal(h.origen.tipo, "CajaMovimiento");
  assert.equal(h.origen.turnoId, 10);
});

// ══════════════════════════════════════════════════════════════════════════
// 11 y 12 · LO QUE NO EXISTE NO SE INFORMA EN CERO
// ══════════════════════════════════════════════════════════════════════════

// ── LO QUE ESTOS TRES AFIRMABAN, Y POR QUÉ CAMBIARON ─────────────────────
//
// Hasta esta tanda, R16 y R16b exigían que gastos, pagos a proveedores y
// resultado viajaran como NO DISPONIBLES, y R17 que el resumen no tuviera
// ningún campo de gasto ni de resultado: el resumen no los sumaba y un cero
// habría mentido. Ahora los suma, desde sus tablas. Lo que se sigue
// protegiendo es la misma regla con otro objeto: lo que el modelo NO permite
// saber —dónde quedó la plata— viaja como ausencia con motivo, y ningún campo
// del resumen lo afirma.

test("R16b · lo que ya se calcula NO sigue figurando como no disponible", () => {
  const r = resumenDelPeriodo({ ventas: [], manuales: [], recaudacion: [] });
  const claves = r.noDisponible.map((m) => m.clave);
  for (const calculada of ["gastosOperativos", "pagosAProveedores", "resultadoReal"]) {
    assert.equal(claves.includes(calculada), false, `"${calculada}" se calcula y sigue anunciada como no disponible`);
  }
});

test("R16 · EL DINERO QUE QUEDÓ VIAJA COMO NO DISPONIBLE, con su motivo", () => {
  const r = resumenDelPeriodo({ ventas: [], manuales: [], recaudacion: [] });
  const quedo = r.noDisponible.find((m) => m.clave === "dineroQueQuedo");
  assert.ok(quedo, "falta el dinero que quedó");
  assert.match(quedo.motivo, /banco/);
  assert.match(quedo.motivo, /Mercado Pago/);

  // Y CADA UNA TRAE SU MOTIVO. Sin el motivo, "Todavía no disponible" es una
  // promesa vacía y nadie sabe qué falta para que exista.
  for (const m of r.noDisponible) {
    assert.ok(m.rotulo && m.rotulo.length > 0, `${m.clave} sin rótulo`);
    assert.ok(m.motivo && m.motivo.length > 10, `${m.clave} sin motivo`);
  }
});

test("R17 · EL RESUMEN NO TIENE NINGÚN CAMPO DE SALDO NI DE DINERO QUE QUEDÓ", () => {
  // La contraprueba del cero, sobre lo que hoy no se sabe: si mañana alguien
  // agrega `dineroQueQuedo: 0` o un saldo de Mercado Pago, la pantalla lo
  // dibujaría como un importe. Se recorre el resumen ENTERO, con todos los
  // insumos y su período, no solo el primer nivel.
  const r = resumenDelPeriodo({ ventas: [], manuales: [], recaudacion: [], periodo: PERIODO });
  const claves = [];
  const recorrer = (o) => {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      claves.push(k);
      if (k !== "noDisponible") recorrer(v);
    }
  };
  recorrer(r);
  for (const prohibido of [/quedo/i, /^saldo(Caja|Banco|MercadoPago|Mp)/i, /disponible$/i, /tesoreria/i]) {
    const encontrada = claves.find((k) => prohibido.test(k) && k !== "noDisponible");
    assert.equal(encontrada, undefined, `el resumen expone "${encontrada}": afirmaría algo que el ERP no sabe`);
  }
});

test("R18 · un período VACÍO da cero en lo que SÍ se mide, y eso está bien", () => {
  // La distinción que importa: "no se vendió nada" es una medición y vale cero;
  // "no hay gastos registrados" no es una medición y no vale cero.
  const r = resumenDelPeriodo({ ventas: [], manuales: [], recaudacion: [] });
  assert.equal(r.ventas, 0);
  assert.equal(r.costoVendido, 0);
  assert.equal(r.margenBruto, 0);
  assert.equal(r.cantidadVentas, 0);
  assert.deepEqual(r.cobros.medios, []);
});

test("R19 · la pantalla NO llama ganancia al margen bruto", () => {
  const pantalla = sinComentarios("components/finanzas/ResumenDelPeriodo.jsx");

  // Se miran los RÓTULOS, no cualquier aparición de la palabra: la nota del
  // margen dice "No es la ganancia del negocio", que es justamente la
  // aclaración que hay que conservar. Un candado que prohibiera la palabra se
  // pondría rojo por el texto correcto.
  const rotulos = [...pantalla.matchAll(/rotulo=["']([^"']+)["']/g)].map((m) => m[1]);
  assert.ok(rotulos.length >= 4, `se leyeron muy pocos rótulos: ${rotulos.join(", ")}`);
  for (const r of rotulos) {
    assert.doesNotMatch(r, /ganancia/i, `el rótulo "${r}" llama ganancia a una métrica`);
  }
  assert.ok(rotulos.includes("Margen bruto"), "desapareció el rótulo del margen");
  assert.match(
    pantalla,
    /No es la ganancia del negocio/,
    "desapareció la aclaración de que el margen no es la ganancia"
  );
  assert.match(
    pantalla,
    /Todavía no disponible/,
    "desapareció el bloque de lo que no se puede calcular"
  );
});

// ══════════════════════════════════════════════════════════════════════════
// EL FIXTURE TIENE LA FORMA DEL DATO REAL
// ══════════════════════════════════════════════════════════════════════════

test("R20 · los campos del fixture son los que el endpoint pide de verdad", () => {
  // El defecto que este repo marca como el que más se repite: un candado
  // montado sobre un dato que el endpoint NUNCA manda queda verde para siempre.
  // Acá se leen los campos de `SELECT_VENTA` en la ruta y se exige que el
  // fixture los tenga todos.
  const ruta = sinComentarios("app/api/finanzas/tablero/route.js");
  const bloque = ruta.match(/const SELECT_VENTA = \{([\s\S]*?)\n\};/);
  assert.ok(bloque, "no se encontró SELECT_VENTA en la ruta");

  const campos = [...bloque[1].matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
  assert.ok(campos.length >= 8, `se leyeron muy pocos campos: ${campos.join(", ")}`);

  const fixture = venta({ id: 1, total: "1.00", costoTotal: "0.00", gananciaBruta: "1.00", pagos: [tender("EFECTIVO", "1.00")] });
  for (const c of campos) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(fixture, c),
      `el endpoint manda "${c}" y el fixture no lo tiene: el candado estaría probando otra forma`
    );
  }
});

test("R21 · y las métricas no disponibles están congeladas: no se pueden mutar", () => {
  // Es un arreglo exportado y compartido entre requests. Sin congelarlo, un
  // consumidor distraído podría vaciarlo y la pantalla dejaría de avisar.
  assert.throws(() => METRICAS_NO_DISPONIBLES.push({ clave: "x" }));
});

// ══════════════════════════════════════════════════════════════════════════
// PR 1 DE "¿DÓNDE QUEDÓ LA PLATA?": GASTOS, PAGOS, DEUDAS, COBROS Y RESULTADO
// ══════════════════════════════════════════════════════════════════════════
//
// ── DE DÓNDE SALEN ESTOS FIXTURES ────────────────────────────────────────
//
// De los `select` de `app/api/finanzas/tablero/route.js`, y F0 los compara
// campo por campo contra la ruta. Fechas de columna `DATE` como medianoche UTC
// —así las devuelve Prisma—, instantes como `Date`, importes como cadenas.

const pago = (medio, monto) => ({ medio, monto });
const pagoCon = (monto, fecha) => ({ monto, fecha });
const gasto = (total, fecha, pagos = []) => ({ total, fecha: dia(fecha), pagos });
const cuenta = (total, createdAt, pagos = []) => ({ total, createdAt, pagos });
const cobroCC = (monto, tipo = "PAGO", direccion = "CREDITO") => ({ tipo, direccion, monto });

const selectDe = (ruta, patron) => {
  const m = ruta.match(patron);
  assert.ok(m, `no se encontró la consulta ${patron}`);
  return [...m[1].matchAll(/(\w+):/g)].map((x) => x[1]).sort();
};

test("F0 · los fixtures tienen la forma de lo que la ruta pide de verdad", () => {
  const ruta = sinComentarios("app/api/finanzas/tablero/route.js");
  const llaves = (o) => Object.keys(o).sort();

  assert.deepEqual(
    selectDe(ruta, /prisma\.pagoProveedor\.findMany\(\{\s*where:\s*\{\s*localOrigenId[\s\S]*?select:\s*\{([^}]*)\}/),
    llaves(pago("EFECTIVO", "1.00"))
  );
  assert.deepEqual(
    selectDe(ruta, /prisma\.pagoGasto\.findMany\(\{\s*where:\s*\{\s*localOrigenId[\s\S]*?select:\s*\{([^}]*)\}/),
    llaves(pago("EFECTIVO", "1.00"))
  );
  assert.deepEqual(selectDe(ruta, /prisma\.gasto\.findMany\(\{[\s\S]*?select:\s*\{([^}]*)\}/), llaves(gasto("1.00", "2026-09-20")));
  assert.deepEqual(
    selectDe(ruta, /prisma\.cuentaPorPagarProveedor\.findMany\(\{[\s\S]*?select:\s*\{([^}]*)\}/),
    llaves(cuenta("1.00", new Date()))
  );
  assert.deepEqual(
    selectDe(ruta, /const pagosHastaElCorte = \{[\s\S]*?select:\s*\{([^}]*)\}/),
    llaves(pagoCon("1.00", new Date()))
  );
  assert.deepEqual(selectDe(ruta, /prisma\.movimientoCuenta\.findMany\(\{[\s\S]*?select:\s*\{([^}]*)\}/), llaves(cobroCC("1.00")));
});

test("F1 · la ruta le pasa al resumen TODOS los insumos nuevos y el período", () => {
  // El lugar donde el dato se arma. Sin esto, la función sabe sumar gastos y la
  // pantalla recibiría ceros por defecto: "no hubo gastos" sin haber mirado.
  const ruta = sinComentarios("app/api/finanzas/tablero/route.js");
  const llamada = ruta.match(/resumenDelPeriodo\(\{([\s\S]*?)\n {4}\}\);/);
  assert.ok(llamada, "no se encontró la llamada al resumen");
  for (const clave of ["pagosAProveedores", "pagosDeGastos", "gastos", "cuentasProveedor", "cobrosCuentaCorriente"]) {
    assert.match(llamada[1], new RegExp(`\\b${clave}\\b`), `la ruta no le pasa "${clave}"`);
  }
  assert.match(llamada[1], /periodo:\s*\{\s*desde:\s*rango\.desde,\s*hasta:\s*rango\.hasta,\s*instanteFin:\s*fechaFin\s*\}/);
});

test("F2 · cada consulta corta por la columna de PROPIEDAD de su hecho", () => {
  // Aislamiento depósito / local: la deuda es de quien la originó, el pago sale
  // de su ubicación, el gasto es de quien lo consumió. Un filtro "del grupo"
  // mezclaría las cuentas de todos.
  const ruta = sinComentarios("app/api/finanzas/tablero/route.js");
  assert.match(ruta, /prisma\.pagoProveedor\.findMany\(\{\s*where:\s*\{\s*localOrigenId:\s*localId,\s*fecha:\s*\{\s*gte:\s*fechaInicio,\s*lte:\s*fechaFin\s*\}/);
  assert.match(ruta, /prisma\.pagoGasto\.findMany\(\{\s*where:\s*\{\s*localOrigenId:\s*localId,\s*fecha:\s*\{\s*gte:\s*fechaInicio,\s*lte:\s*fechaFin\s*\}/);
  assert.match(ruta, /prisma\.gasto\.findMany\(\{\s*where:\s*\{\s*grupoId:\s*vista\.grupoId,\s*localId,\s*fecha:\s*\{\s*lte:\s*corteDia\s*\}/);
  assert.match(ruta, /prisma\.cuentaPorPagarProveedor\.findMany\(\{\s*where:\s*\{\s*grupoId:\s*vista\.grupoId,\s*localGastoId:\s*localId,\s*createdAt:\s*\{\s*lte:\s*fechaFin\s*\}/);
  assert.match(ruta, /const pagosHastaElCorte = \{\s*where:\s*\{\s*fecha:\s*\{\s*lte:\s*fechaFin\s*\}\s*\}/);
  assert.match(ruta, /const corteDia = aFechaDeBase\(rango\.hasta\);/);
});

// ── GASTOS ───────────────────────────────────────────────────────────────

test("G1 · gasto DEVENGADO por Gasto.fecha: dentro del período entra, fuera no", () => {
  const r = resumenDelPeriodo({
    gastos: [
      gasto("1000.00", "2026-09-19"), // un día antes: no es de este período
      gasto("2000.00", "2026-09-20"), // primer día
      gasto("3000.00", "2026-09-26"), // último día
    ],
    periodo: PERIODO,
  });
  assert.equal(r.gastos.devengados, 5000);
  assert.equal(r.gastos.cantidad, 2);
});

test("G2 · un gasto NO es su pago: devengar no es salida, pagar no es devengar", () => {
  // Devengado y sin pagar: está en gastos y en el resultado, no en salidas.
  const sinPagar = resumenDelPeriodo({ gastos: [gasto("8000.00", "2026-09-22")], periodo: PERIODO });
  assert.equal(sinPagar.gastos.devengados, 8000);
  assert.equal(sinPagar.salidas.total, 0);
  assert.equal(sinPagar.resultadoEconomico.resultado, -8000);

  // Pagado en este período un gasto de OTRO: es salida, no devengado de éste.
  const soloElPago = resumenDelPeriodo({ pagosDeGastos: [pago("TRANSFERENCIA", "3000.00")], periodo: PERIODO });
  assert.equal(soloElPago.salidas.total, 3000);
  assert.equal(soloElPago.gastos.devengados, 0);
  assert.equal(soloElPago.resultadoEconomico.resultado, 0, "un pago no es un gasto del resultado");
});

// ── PAGOS ────────────────────────────────────────────────────────────────

test("P1 · pagos de gastos: total y desglose por medio, en el orden del catálogo", () => {
  const r = resumenDelPeriodo({
    pagosDeGastos: [pago("OTRO", "100.00"), pago("EFECTIVO", "300.00"), pago("TRANSFERENCIA", "200.00"), pago("EFECTIVO", "0.10")],
  });
  assert.equal(r.pagosDeGastos.total, 600.1);
  assert.equal(r.pagosDeGastos.cantidad, 4);
  assert.deepEqual(
    r.pagosDeGastos.porMedio.map((m) => [m.medio, m.monto, m.cantidad]),
    [["EFECTIVO", 300.1, 2], ["TRANSFERENCIA", 200, 1], ["OTRO", 100, 1]]
  );
  assert.equal(r.pagosDeGastos.porMedio[0].rotulo, "Efectivo");
  assert.equal(r.pagosDeGastos.porMedio[0].esEfectivo, true);
});

test("P2 · pagos a proveedores: total y desglose por medio; un medio desconocido no se pierde", () => {
  const r = resumenDelPeriodo({
    pagosAProveedores: [pago("MERCADO_PAGO", "500.00"), pago("EFECTIVO", "250.00"), pago("RARO", "1.00")],
  });
  assert.equal(r.pagosAProveedores.total, 751);
  assert.deepEqual(r.pagosAProveedores.porMedio.map((m) => m.medio), ["EFECTIVO", "MERCADO_PAGO", "RARO"]);
  assert.equal(r.pagosAProveedores.porMedio[1].rotulo, "Mercado Pago");
  assert.equal(r.salidas.pagosAProveedores, 751);
  assert.equal(r.salidas.total, 751);
});

// ── OBLIGACIONES AL CIERRE ───────────────────────────────────────────────

test("O1 · saldo con proveedores AL CIERRE HISTÓRICO: un pago posterior no lo achica", () => {
  const r = resumenDelPeriodo({
    cuentasProveedor: [
      cuenta("1000.00", ar("2026-09-21T10:00:00"), [
        pagoCon("400.00", ar("2026-09-23T12:00:00")), // dentro del período
        pagoCon("600.00", ar("2026-09-28T09:00:00")), // DESPUÉS del cierre
      ]),
    ],
    periodo: PERIODO,
  });
  // Hoy esa cuenta está PAGADA. Al cierre del 26 se debían 600.
  assert.equal(r.obligaciones.corte, "2026-09-26");
  assert.equal(r.obligaciones.proveedores.saldo, 600);
  assert.equal(r.obligaciones.proveedores.cantidad, 1);
});

test("O2 · el último instante del día argentino de cierre todavía es del período", () => {
  const r = resumenDelPeriodo({
    cuentasProveedor: [
      cuenta("1000.00", ar("2026-09-26T23:59:59.999"), [pagoCon("1000.00", ar("2026-09-27T00:00:00.000"))]),
    ],
    periodo: PERIODO,
  });
  // Nació el 26 a las 23:59:59.999 y se pagó el 27 a las 00:00: al cierre se debía entera.
  assert.equal(r.obligaciones.proveedores.saldo, 1000);
});

test("O3 · una deuda nacida DESPUÉS del cierre no estaba; una saldada antes, tampoco", () => {
  const r = resumenDelPeriodo({
    cuentasProveedor: [
      cuenta("500.00", ar("2026-09-27T08:00:00")), // nació después
      cuenta("300.00", ar("2026-09-10T08:00:00"), [pagoCon("300.00", ar("2026-09-15T08:00:00"))]), // saldada antes
      cuenta("200.00", ar("2026-09-01T08:00:00")), // vieja y abierta: sigue debiéndose
    ],
    periodo: PERIODO,
  });
  assert.equal(r.obligaciones.proveedores.saldo, 200);
  assert.equal(r.obligaciones.proveedores.cantidad, 1);
});

test("O4 · gasto pendiente al cierre: por Gasto.fecha y pagos hasta el corte", () => {
  const r = resumenDelPeriodo({
    gastos: [
      gasto("8000.00", "2026-09-22", [pagoCon("3000.00", ar("2026-09-24T10:00:00")), pagoCon("5000.00", ar("2026-10-02T10:00:00"))]),
      gasto("1500.00", "2026-08-31"), // de antes, sin pagar: sigue abierto
      gasto("900.00", "2026-09-27"), // corresponde a después del cierre
      gasto("700.00", "2026-09-21", [pagoCon("700.00", ar("2026-09-21T18:00:00"))]), // pagado en el período
    ],
    periodo: PERIODO,
  });
  // 8000 − 3000 (el pago de octubre no cuenta) + 1500 = 6500, en dos gastos.
  assert.equal(r.obligaciones.gastos.saldo, 6500);
  assert.equal(r.obligaciones.gastos.cantidad, 2);
  // Y una obligación pendiente NO es plata que salió.
  assert.equal(r.salidas.total, 0);
});

test("O5 · sin período no se inventan fechas: gastos, deudas y resultado vuelven null", () => {
  const r = resumenDelPeriodo({ gastos: [gasto("1.00", "2026-09-22")], cuentasProveedor: [cuenta("1.00", new Date())] });
  assert.equal(r.gastos, null);
  assert.equal(r.obligaciones, null);
  assert.equal(r.resultadoEconomico, null, "un resultado con gastos en cero afirmaría que no hubo");
});

// ── COBROS DE CUENTA CORRIENTE ───────────────────────────────────────────

test("CC1 · el cobro de cuenta corriente ENTRA, sin medio y sin destino", () => {
  const r = resumenDelPeriodo({
    ventas: [venta({ id: 1, total: "100.00", costoTotal: "0.00", gananciaBruta: "100.00", pagos: [tender("EFECTIVO", "100.00")] })],
    cobrosCuentaCorriente: [cobroCC("5000.00"), cobroCC("250.00"), cobroCC("999.00", "AJUSTE", "CREDITO")],
  });
  assert.equal(r.cobrosCuentaCorriente.total, 5250, "un AJUSTE no es plata que entró");
  assert.equal(r.cobrosCuentaCorriente.cantidad, 2);
  assert.equal(r.cobrosCuentaCorriente.medioConocido, false);
  assert.equal(r.cobrosCuentaCorriente.destinoConocido, false);
  assert.equal(r.cobrosCuentaCorriente.rotulo, "Cobros de cuenta corriente — medio/destino desconocido");
  assert.equal(r.cobrosCuentaCorriente.rotulo, TEXTOS_DEL_RESUMEN.cobrosCuentaCorriente);

  // NO se atribuye a ningún medio: el efectivo y la recaudación siguen siendo
  // solo los de la venta.
  assert.equal(r.cobros.efectivo, 100);
  assert.equal(r.recaudacionAlVender.bruta, 100);
  assert.deepEqual(r.cobros.medios.map((m) => m.medio), ["EFECTIVO"]);
  // Y no es venta ni resultado: el fiado ya se vendió el día que se fió.
  assert.equal(r.ventas, 100);
});

test("CC2 · el FIADO no es dinero cobrado al vender; su cobro posterior sí entra, aparte", () => {
  const ventas = [venta({ id: 1, total: "800.00", costoTotal: "500.00", gananciaBruta: "300.00", pagos: [tender("FIADO", "800.00")] })];
  const alVender = resumenDelPeriodo({ ventas, periodo: PERIODO });
  assert.equal(alVender.ventas, 800, "es venta");
  assert.equal(alVender.recaudacionAlVender.bruta, 0, "no entró plata");
  assert.equal(alVender.recaudacionAlVender.neta, 0);
  assert.equal(alVender.resultadoEconomico.resultado, 300, "el resultado es económico: la venta fiada cuenta");

  const cobro = resumenDelPeriodo({ cobrosCuentaCorriente: [cobroCC("800.00")], periodo: PERIODO });
  assert.equal(cobro.cobrosCuentaCorriente.total, 800);
  assert.equal(cobro.ventas, 0, "cobrar el fiado no es vender otra vez");
  assert.equal(cobro.resultadoEconomico.resultado, 0);
});

// ── COMISIONES ───────────────────────────────────────────────────────────

const CON_COMISION = [
  venta({ id: 1, total: "1000.00", costoTotal: "600.00", gananciaBruta: "400.00", pagos: [tender("EFECTIVO", "400.00"), tender("DEBITO", "600.00", "18.00")] }),
  venta({ id: 2, total: "300.00", costoTotal: "100.00", gananciaBruta: "200.00", pagos: [tender("MERCADOPAGO", "300.00", "18.00")] }),
];

test("CM1 · la comisión es la de VentaPago, y se descuenta UNA vez en cada lado", () => {
  const r = resumenDelPeriodo({ ventas: CON_COMISION, periodo: PERIODO });
  assert.equal(r.comisiones.total, 36);
  assert.equal(r.comisiones.total, r.cobros.comisiones, "es el mismo número, no otra suma");
  assert.equal(r.comisiones.exacta, true);

  // FLUJO: lo que entró al vender, bruto y neto. El neto ya descontó la comisión.
  assert.equal(r.recaudacionAlVender.bruta, 1300);
  assert.equal(r.recaudacionAlVender.neta, 1264);
  assert.equal(r.recaudacionAlVender.bruta - r.recaudacionAlVender.comisiones, r.recaudacionAlVender.neta);

  // RESULTADO: ventas − costo − comisión. La comisión se resta acá, y la neta
  // del flujo NO entra en el resultado: si entrara, se restaría dos veces.
  assert.equal(r.resultadoEconomico.resultado, 1300 - 700 - 36);
});

test("CM2 · con comisionPendiente el número se marca: no es exacto y el neto puede ser menor", () => {
  const ventas = [
    ...CON_COMISION,
    venta({ id: 3, total: "200.00", costoTotal: "100.00", gananciaBruta: "100.00", pagos: [tender("CREDITO", "200.00")], comisionPendiente: true }),
  ];
  const r = resumenDelPeriodo({ ventas, periodo: PERIODO });
  assert.equal(r.comisiones.exacta, false);
  assert.equal(r.comisiones.ventasConComisionPendiente, 1);
  assert.equal(r.recaudacionAlVender.netaPuedeSerMenor, true);
  const lim = r.resultadoEconomico.limitaciones.find((l) => l.clave === "COMISIONES_PENDIENTES");
  assert.ok(lim, "el resultado no avisa que faltan comisiones");
  assert.equal(lim.cantidad, 1);
});

test("CM3 · falla cerrado: una venta sin la bandera en la consulta cuenta como pendiente", () => {
  const sinBandera = { ...CON_COMISION[0] };
  delete sinBandera.comisionPendiente;
  const r = resumenDelPeriodo({ ventas: [sinBandera] });
  assert.equal(r.comisiones.exacta, false);
});

// ── RESULTADO ECONÓMICO ──────────────────────────────────────────────────

test("RE1 · ventas − costo vendido − gastos devengados − comisiones, con el ejemplo de la auditoría", () => {
  const ventas = [
    venta({ id: 1, total: "50000.00", costoTotal: "35000.00", gananciaBruta: "15000.00", pagos: [tender("EFECTIVO", "50000.00")] }),
    venta({ id: 2, total: "20000.00", costoTotal: "14000.00", gananciaBruta: "6000.00", pagos: [tender("DEBITO", "20000.00", "600.00")] }),
    venta({ id: 3, total: "15000.00", costoTotal: "10500.00", gananciaBruta: "4500.00", pagos: [tender("MERCADOPAGO", "15000.00", "900.00")] }),
    venta({ id: 4, total: "15000.00", costoTotal: "10500.00", gananciaBruta: "4500.00", pagos: [tender("FIADO", "15000.00")] }),
  ];
  const r = resumenDelPeriodo({
    ventas,
    gastos: [gasto("8000.00", "2026-09-23", [pagoCon("3000.00", ar("2026-09-24T10:00:00"))])],
    pagosDeGastos: [pago("TRANSFERENCIA", "3000.00")],
    // Una COMPRA de 40.000 con 25.000 pagados: deuda y salida, no resultado.
    cuentasProveedor: [cuenta("40000.00", ar("2026-09-21T10:00:00"), [pagoCon("25000.00", ar("2026-09-21T11:00:00"))])],
    pagosAProveedores: [pago("EFECTIVO", "25000.00")],
    periodo: PERIODO,
  });
  const re = r.resultadoEconomico;
  assert.equal(re.ventas, 100000);
  assert.equal(re.costoVendido, 70000);
  assert.equal(re.gastosDevengados, 8000, "el gasto entero, no lo pagado");
  assert.equal(re.comisiones, 1500);
  assert.equal(re.resultado, 20500);
  assert.equal(re.resultado, r.margenBruto - re.gastosDevengados - re.comisiones);

  // Y los otros números no se mezclan con el resultado.
  assert.equal(r.recaudacionAlVender.neta, 83500);
  assert.equal(r.salidas.total, 28000);
  assert.equal(r.obligaciones.proveedores.saldo, 15000);
  assert.equal(r.obligaciones.gastos.saldo, 5000);
});

test("RE2 · una COMPRA no es gasto operativo: no toca el resultado, toca la deuda", () => {
  const base = resumenDelPeriodo({ periodo: PERIODO });
  const conCompra = resumenDelPeriodo({ cuentasProveedor: [cuenta("40000.00", ar("2026-09-21T10:00:00"))], periodo: PERIODO });
  assert.equal(conCompra.resultadoEconomico.resultado, base.resultadoEconomico.resultado);
  assert.equal(conCompra.gastos.devengados, 0);
  assert.equal(conCompra.obligaciones.proveedores.saldo, 40000);
  // Pagarla es salida de dinero, y tampoco toca el resultado.
  const pagada = resumenDelPeriodo({ pagosAProveedores: [pago("EFECTIVO", "40000.00")], periodo: PERIODO });
  assert.equal(pagada.salidas.total, 40000);
  assert.equal(pagada.resultadoEconomico.resultado, 0);
});

test("RE3 · con recargo: el resultado parte del total con recargo, igual que el margen", () => {
  // La misma venta de R6: 1.000 de mercadería + 50 de recargo, comisión 73,50.
  const ventas = [venta({ id: 1, total: "1050.00", costoTotal: "600.00", gananciaBruta: "400.00", pagos: [tender("CREDITO", "1050.00", "73.50")] })];
  const r = resumenDelPeriodo({ ventas, periodo: PERIODO });
  assert.equal(r.margenBruto, 450);
  assert.equal(r.resultadoEconomico.resultado, 376.5, "450 − 73,50: el recargo suma, la comisión resta, una vez cada uno");
});

test("RE4 · el costo vendido es Venta.costoTotal y NADA del Libro de Stock ni de Costos", () => {
  const r = resumenDelPeriodo({ ventas: CON_COMISION, periodo: PERIODO });
  assert.equal(r.resultadoEconomico.fuenteCostoVendido, FUENTE_COSTO_VENDIDO);
  assert.equal(r.resultadoEconomico.costoVendido, r.costoVendido, "el mismo costo de arriba, no otro");

  // Ni la pieza pura ni la ruta pueden leer los libros: sumar los dos costos
  // sería contar dos veces la mercadería vendida.
  const libros = /libroCostos|costoBaseVersion|costoUbicacionVersion|movimientoStock|valorDelStock|stock\/libro/i;
  assert.doesNotMatch(sinComentarios("lib/finanzas/resumenFinanciero.js"), libros);
  assert.doesNotMatch(sinComentarios("app/api/finanzas/tablero/route.js"), libros);
});

test("RE5 · las limitaciones se dicen: gastos siempre, costo cero y retiros sin clasificar cuando pasan", () => {
  const limpio = resumenDelPeriodo({ ventas: CON_COMISION, periodo: PERIODO });
  assert.deepEqual(limpio.resultadoEconomico.limitaciones.map((l) => l.clave), ["GASTOS_REGISTRADOS"]);

  const r = resumenDelPeriodo({
    ventas: [venta({ id: 9, total: "100.00", costoTotal: "0.00", gananciaBruta: "100.00", pagos: [tender("EFECTIVO", "100.00")] })],
    manuales: [{ id: 1, tipo: "RETIRO", monto: "2000.00", motivo: "flete", createdAt: new Date(), turnoId: 1 }],
    periodo: PERIODO,
  });
  const claves = r.resultadoEconomico.limitaciones.map((l) => l.clave);
  assert.deepEqual(claves, ["GASTOS_REGISTRADOS", "VENTAS_SIN_COSTO", "RETIROS_SIN_CLASIFICAR"]);
  const retiros = r.resultadoEconomico.limitaciones.find((l) => l.clave === "RETIROS_SIN_CLASIFICAR");
  assert.equal(retiros.importe, 2000);
  // El retiro manual NO se resta: no se sabe si fue un gasto.
  assert.equal(r.resultadoEconomico.resultado, 100);
  for (const l of r.resultadoEconomico.limitaciones) assert.ok(l.motivo.length > 20, `${l.clave} sin motivo`);
});

test("RE6 · compatibilidad: los campos de siempre conservan forma y valor con los insumos nuevos", () => {
  const solo = resumenDelPeriodo({ ventas: CON_COMISION });
  const con = resumenDelPeriodo({
    ventas: CON_COMISION,
    pagosAProveedores: [pago("EFECTIVO", "1.00")],
    pagosDeGastos: [pago("EFECTIVO", "1.00")],
    gastos: [gasto("1.00", "2026-09-22")],
    cuentasProveedor: [cuenta("1.00", ar("2026-09-21T10:00:00"))],
    cobrosCuentaCorriente: [cobroCC("1.00")],
    periodo: PERIODO,
  });
  for (const campo of ["cantidadVentas", "ventas", "costoVendido", "margenBruto", "controlMargen", "cobros", "caja", "noDisponible"]) {
    assert.deepEqual(con[campo], solo[campo], `cambió "${campo}"`);
  }
});
