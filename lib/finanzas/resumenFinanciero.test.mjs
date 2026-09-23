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
  METRICAS_NO_DISPONIBLES,
  desglosarCaja,
  desglosarCobros,
  resumenDelPeriodo,
} from "@/lib/finanzas/resumenFinanciero";
import { desglosarVentas } from "@/lib/caja/efectivoEsperado";
import { clasificarMovimientos, soloManuales, soloRecaudacion } from "@/lib/finanzas/movimientosDeCaja";
import { hechoDeMovimiento } from "@/lib/finanzas/actividadFinanciera";

const sinComentarios = (ruta) =>
  readFileSync(ruta, "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/** Una venta con la forma que manda el endpoint. */
function venta({ id, total, costoTotal, gananciaBruta, pagos, turnoId = 10 }) {
  return {
    id,
    total,
    costoTotal,
    gananciaBruta,
    turnoId,
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

  // Y en el resumen, la palabra solo puede vivir adentro de la lista de
  // métricas NO DISPONIBLES. Se recorta ese bloque y se mira el resto.
  const resumen = sinComentarios("lib/finanzas/resumenFinanciero.js");
  const sinLaLista = resumen.replace(
    /export const METRICAS_NO_DISPONIBLES = Object\.freeze\(\[[\s\S]*?\n\]\);/,
    ""
  );
  assert.match(
    resumen,
    /METRICAS_NO_DISPONIBLES/,
    "desapareció la lista: el recorte de abajo dejaría de probar nada"
  );
  assert.doesNotMatch(
    sinLaLista,
    /["'][^"']*\bgasto/i,
    "aparece un rótulo con la palabra gasto fuera de las métricas no disponibles"
  );
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

test("R16b · EL MOTIVO DE LOS PAGOS A PROVEEDORES DICE QUE SE REGISTRAN, no que no existen", () => {
  // Desde que entró el submódulo, los pagos tienen tabla. Lo que falta es
  // sumarlos al período, y el motivo que ve la pantalla tiene que decir eso.
  // El texto de la primera tanda —"una compra registra la mercadería, no si se
  // pagó"— pasó a ser falso y este candado impide que vuelva.
  const r = resumenDelPeriodo({ ventas: [], manuales: [], recaudacion: [] });
  const pagos = r.noDisponible.find((m) => m.clave === "pagosAProveedores");
  assert.ok(pagos, "faltan los pagos a proveedores");
  assert.match(pagos.motivo, /ya se registran/);
  assert.match(pagos.motivo, /resumen por período/);
  assert.doesNotMatch(pagos.motivo, /no si se pagó/);
});

test("R16 · GASTOS OPERATIVOS Y RESULTADO REAL VIAJAN COMO NO DISPONIBLES", () => {
  const r = resumenDelPeriodo({ ventas: [], manuales: [], recaudacion: [] });
  const claves = r.noDisponible.map((m) => m.clave);

  assert.ok(claves.includes("gastosOperativos"), "faltan los gastos operativos");
  assert.ok(claves.includes("resultadoReal"), "falta el resultado real");
  assert.ok(claves.includes("pagosAProveedores"), "faltan los pagos a proveedores");

  // Y CADA UNA TRAE SU MOTIVO. Sin el motivo, "Todavía no disponible" es una
  // promesa vacía y nadie sabe qué falta para que exista.
  for (const m of r.noDisponible) {
    assert.ok(m.rotulo && m.rotulo.length > 0, `${m.clave} sin rótulo`);
    assert.ok(m.motivo && m.motivo.length > 10, `${m.clave} sin motivo`);
  }
});

test("R17 · EL RESUMEN NO TIENE NINGÚN CAMPO DE GASTO NI DE RESULTADO", () => {
  // La contraprueba del cero: si mañana alguien agrega `gastos: 0` al payload,
  // la pantalla lo dibujaría como un importe y diría que no hubo gastos. Acá se
  // afirma que ese campo NO existe.
  const r = resumenDelPeriodo({ ventas: [], manuales: [], recaudacion: [] });
  for (const prohibido of ["gastos", "gastosOperativos", "resultado", "resultadoReal", "ganancia"]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(r, prohibido),
      false,
      `el resumen expone "${prohibido}": un número ahí afirmaría algo que el ERP no sabe`
    );
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
