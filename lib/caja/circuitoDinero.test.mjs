// EL CIRCUITO DEL DINERO: que nada se cuente dos veces.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/circuitoDinero.test.mjs
//
// La prueba central es el ejemplo del pedido, y lo que verifica no es que las
// sumas den: es que el CAMBIO DEJADO no se cuente como dinero retirado ni como
// ingreso del turno siguiente. Ese es el error que este módulo existe para
// impedir, y es invisible si solo se miran totales.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { armarCircuito, verificarCircuito, etiquetaEstadoCambio } from "@/lib/caja/circuitoDinero";
import { estadoDelTurno, ESTADO_TURNO } from "@/lib/caja/cierreRelevo";
import CircuitoDelDinero from "@/components/turnos/CircuitoDelDinero";

const render = (Comp, props) => renderToStaticMarkup(createElement(Comp, props));
const fuente = (f) => readFileSync(f, "utf8");
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{?\s*\/\/.*$/gm, "");

// ── EL EJEMPLO OBLIGATORIO ──────────────────────────────────────────────────
//
//   Turno A: apertura $30.000, ventas $100.000, retiro parcial $70.000.
//   Esperado al corte: 30.000 + 100.000 − 70.000 = $60.000.
//   Cuenta $60.000, deja $30.000 de cambio, retira final $30.000.
//   Dinero que SALIÓ: 70.000 + 30.000 = $100.000.
//   Los $30.000 pasan al turno B y NO aumentan la recaudación.

const TURNO_A = {
  id: 188,
  montoInicial: 30000,
  montoEsperadoEfectivo: 60000,
  montoRealEfectivo: 60000,
  diferenciaEfectivo: 0,
  efectivoRetiradoCierre: 30000,
  fondoDejadoCierre: 30000,
  cierre: "2026-08-04T22:00:00.000Z",
  cierreEnPreparacionEn: "2026-08-04T21:50:00.000Z",
};

const RESUMEN_A = {
  totalEfectivo: 100000,
  // `totalRetirosCaja` viene de turnos/resumen, que EXCLUYE el movimiento del
  // retiro final: son los $70.000 del parcial, nada más. El final se lee de
  // `Turno.efectivoRetiradoCierre`.
  totalRetirosCaja: 70000,
  movimientosManuales: { ingresos: 0, retiros: 0, neto: 0, cantidad: 0, detalle: [] },
};

const CAMBIO_DEJADO_A = {
  id: 7,
  estado: "RECIBIDO",
  turnoOrigenId: 188,
  turnoDestinoId: 189,
  total: 30000,
  desglose: { 1000: 10, 500: 20, 200: 50 },
  totalRecibido: 30000,
  desgloseRecibido: { 1000: 10, 500: 20, 200: 50 },
  diferencia: 0,
  operadorOrigen: "María Gómez",
  operadorRecibio: "Juan Pérez",
};

const CORTE_A = { corteEn: "2026-08-04T21:50:00.000Z", estado: "CONFIRMADO", efectivoEsperadoCorte: 60000 };

test("1. el ejemplo del pedido: salieron $100.000 del local", () => {
  const c = armarCircuito({ turno: TURNO_A, resumen: RESUMEN_A, cambioDejado: CAMBIO_DEJADO_A, corte: CORTE_A });
  assert.equal(c.retirosRecaudacion, 70000, "el retiro parcial");
  assert.equal(c.cierre.retiroFinal, 30000, "el retiro final");
  assert.equal(c.totales.salioDelLocal, 100000);
});

test("2. y los $30.000 de cambio NO se cuentan como salida", () => {
  const c = armarCircuito({ turno: TURNO_A, resumen: RESUMEN_A, cambioDejado: CAMBIO_DEJADO_A, corte: CORTE_A });
  assert.equal(c.totales.transferidoAlSiguiente, 30000);
  // La prueba de fondo: si el cambio se sumara a "salió", darían $130.000.
  assert.notEqual(c.totales.salioDelLocal, 130000);
  assert.equal(c.totales.salioDelLocal, 100000);
});

test("3. el circuito CIERRA: las dos igualdades se cumplen", () => {
  const c = armarCircuito({ turno: TURNO_A, resumen: RESUMEN_A, cambioDejado: CAMBIO_DEJADO_A, corte: CORTE_A });
  const v = verificarCircuito(c);
  assert.equal(v.verificable, true);
  assert.equal(v.cierra, true, JSON.stringify(v.checks, null, 2));
  // 30.000 + 100.000 − 70.000 = 60.000 esperado
  assert.equal(v.checks[0].izquierda, 60000);
  assert.equal(v.checks[0].derecha, 60000);
  // 60.000 contado = 30.000 retiro final + 30.000 cambio
  assert.equal(v.checks[1].izquierda, 60000);
  assert.equal(v.checks[1].derecha, 60000);
});

test("4. el turno B recibe $30.000 y NO son un ingreso nuevo", () => {
  const TURNO_B = { id: 189, montoInicial: 30000 };
  const RECIBIDO_B = { ...CAMBIO_DEJADO_A, turnoDestinoId: 189 };
  const c = armarCircuito({
    turno: TURNO_B,
    resumen: { totalEfectivo: 0, totalRetirosCaja: 0, movimientosManuales: { ingresos: 0, retiros: 0 } },
    cambioRecibido: RECIBIDO_B,
  });
  assert.equal(c.apertura.montoInicial, 30000);
  assert.equal(c.apertura.vieneDeCambio, true);
  assert.equal(c.totales.recibidoDelAnterior, 30000);
  // Y NO figura como ingreso manual: los $30.000 no entran por Caja +.
  assert.equal(c.ingresosManuales, 0);
  assert.equal(c.totales.salioDelLocal, 0);
});

test("5. sumando los dos turnos, los $30.000 aparecen UNA sola vez", () => {
  const a = armarCircuito({ turno: TURNO_A, resumen: RESUMEN_A, cambioDejado: CAMBIO_DEJADO_A, corte: CORTE_A });
  const b = armarCircuito({
    turno: { id: 189, montoInicial: 30000 },
    resumen: { totalEfectivo: 0, totalRetirosCaja: 0, movimientosManuales: { ingresos: 0, retiros: 0 } },
    cambioRecibido: { ...CAMBIO_DEJADO_A, turnoDestinoId: 189 },
  });
  // El total de dinero que salió del LOCAL en el día es la suma de las salidas
  // reales, y el traspaso no aporta nada.
  assert.equal(a.totales.salioDelLocal + b.totales.salioDelLocal, 100000);
  // El traspaso figura una vez como "transferido" en A y una como "recibido" en
  // B: son los dos extremos del MISMO hecho, no dos hechos.
  assert.equal(a.totales.transferidoAlSiguiente, b.totales.recibidoDelAnterior);
});

// ── Retiros: separar las tres clases ────────────────────────────────────────

test("6. los retiros manuales no se confunden con los de recaudación", () => {
  const c = armarCircuito({
    turno: { ...TURNO_A, efectivoRetiradoCierre: 30000 },
    resumen: {
      totalEfectivo: 100000,
      // 5.000 manuales + 65.000 de recaudación. El final (30.000) NO está acá:
      // turnos/resumen lo excluye de la consulta.
      totalRetirosCaja: 70000,
      movimientosManuales: { ingresos: 2000, retiros: 5000 },
    },
    cambioDejado: CAMBIO_DEJADO_A,
  });
  assert.equal(c.retirosManuales, 5000);
  assert.equal(c.retirosRecaudacion, 65000);
  assert.equal(c.cierre.retiroFinal, 30000);
  // Las tres líneas suman EXACTAMENTE el total, sin solaparse.
  assert.equal(c.retirosManuales + c.retirosRecaudacion + c.cierre.retiroFinal, 100000);
  assert.equal(c.totales.salioDelLocal, 100000);
});

test("7. un turno sin retiro final no inventa uno", () => {
  const c = armarCircuito({
    turno: { id: 1, montoInicial: 10000, efectivoRetiradoCierre: null, fondoDejadoCierre: null },
    resumen: { totalEfectivo: 0, totalRetirosCaja: 0, movimientosManuales: { ingresos: 0, retiros: 0 } },
  });
  assert.equal(c.cierre.retiroFinal, null);
  assert.equal(c.totales.salioDelLocal, 0);
});

// ── null ≠ 0 ────────────────────────────────────────────────────────────────

test("8. un turno histórico se marca como tal en vez de mostrar ceros", () => {
  const c = armarCircuito({ turno: { id: 1, montoInicial: 5000 } });
  assert.equal(c.historico, true);
  assert.equal(c.ventasEfectivo, null, "sin resumen no se inventa 0");
  assert.equal(c.cierre.cambioDejado, null);
  assert.equal(c.totales.salioDelLocal, null);
});

test("9. cero declarado y ausencia se distinguen", () => {
  const cero = armarCircuito({
    turno: { id: 1, montoInicial: 5000, efectivoRetiradoCierre: 0, fondoDejadoCierre: 0 },
    resumen: { totalEfectivo: 0, totalRetirosCaja: 0, movimientosManuales: { ingresos: 0, retiros: 0 } },
  });
  assert.equal(cero.cierre.retiroFinal, 0);
  assert.equal(cero.cierre.cambioDejado, 0);
  assert.equal(cero.historico, false);
});

// ── La diferencia de recepción ──────────────────────────────────────────────

test("10. un faltante de recepción se ve, con su motivo y sus dos desgloses", () => {
  const c = armarCircuito({
    turno: { id: 2, montoInicial: 28000 },
    cambioRecibido: {
      turnoOrigenId: 188, total: 30000, totalRecibido: 28000, diferencia: -2000,
      desglose: { 1000: 30 }, desgloseRecibido: { 1000: 28 },
      motivoDiferencia: "faltaban dos billetes",
      operadorOrigen: "María Gómez", operadorRecibio: "Juan Pérez",
    },
  });
  assert.equal(c.apertura.diferencia, -2000);
  assert.equal(c.apertura.totalDeclarado, 30000);
  assert.equal(c.apertura.totalRecibido, 28000);
  assert.equal(c.apertura.montoInicial, 28000, "el inicial es lo contado");
  assert.equal(c.apertura.motivoDiferencia, "faltaban dos billetes");
  assert.deepEqual(c.apertura.desgloseDeclarado, { 1000: 30 });
  assert.deepEqual(c.apertura.desgloseRecibido, { 1000: 28 });
});

// ── Los estados del turno, una sola interpretación ──────────────────────────

test("11. los cuatro estados se derivan de los mismos dos campos", () => {
  assert.equal(estadoDelTurno({ cierre: null, cierreEnPreparacionEn: null }), ESTADO_TURNO.ABIERTO);
  assert.equal(
    estadoDelTurno({ cierre: null, cierreEnPreparacionEn: new Date() }),
    ESTADO_TURNO.CIERRE_EN_PREPARACION
  );
  assert.equal(estadoDelTurno({ cierre: new Date() }), ESTADO_TURNO.CERRADO);
  assert.equal(estadoDelTurno({ cierre: new Date(), anuladoEn: new Date() }), ESTADO_TURNO.ANULADO);
});

test("12. las superficies devuelven el estado, no lo hacen deducir", () => {
  for (const f of [
    "app/api/pos-ventas/turnos/listar/route.js",
    "app/api/pos-ventas/turnos/ventas/route.js",
    "app/api/pos-ventas/turnos/resumen/route.js",
  ]) {
    const s = fuente(f);
    assert.match(s, /estadoDelTurno/, `${f} no usa la fuente única del estado`);
    assert.match(s, /cierreEnPreparacionEn/, `${f} no trae el campo del tercer estado`);
  }
});

test("13. la auditoría de operadores ya no cuenta las cajas cortadas como abiertas", () => {
  const s = fuente("app/api/auditoria-pos-ventas/operadores/route.js");
  assert.match(s, /turnoOperativo\(t\)/);
  assert.doesNotMatch(sinComentarios(s), /t\.cierre === null/);
  assert.match(s, /turnosEnCierre/);
});

// ── Render ──────────────────────────────────────────────────────────────────

test("14. el circuito muestra las tres clases de salida por separado", () => {
  const html = render(CircuitoDelDinero, {
    turno: TURNO_A,
    resumen: { ...RESUMEN_A, relevo: { cambioDejado: CAMBIO_DEJADO_A, corte: CORTE_A, cambioRecibido: null } },
  });
  assert.match(html, /Retiros manuales/);
  assert.match(html, /Retiros de recaudación/);
  assert.match(html, /Retiro final/);
  assert.match(html, /Dinero que salió del local/);
  assert.match(html, /100\.000/);
});

test("15. y dice explícitamente que el cambio no es un retiro", () => {
  const html = render(CircuitoDelDinero, {
    turno: TURNO_A,
    resumen: { ...RESUMEN_A, relevo: { cambioDejado: CAMBIO_DEJADO_A, corte: CORTE_A, cambioRecibido: null } },
  });
  assert.match(html, /No es un gasto ni un retiro/);
  assert.match(html, /Dinero transferido al turno siguiente/);
  assert.match(html, /Recibido por el turno siguiente/);
  // Enlace navegable al turno destino.
  assert.match(html, /\/modulos\/turnos\/189/);
});

test("16. el turno destino muestra de dónde vino el cambio, con las dos columnas", () => {
  const html = render(CircuitoDelDinero, {
    turno: { id: 189, montoInicial: 28000 },
    resumen: {
      totalEfectivo: 0, totalRetirosCaja: 0,
      movimientosManuales: { ingresos: 0, retiros: 0 },
      relevo: {
        cambioRecibido: {
          turnoOrigenId: 188, total: 30000, totalRecibido: 28000, diferencia: -2000,
          desglose: { 1000: 30 }, desgloseRecibido: { 1000: 28 },
          motivoDiferencia: "faltaban dos billetes",
          operadorOrigen: "María Gómez", operadorRecibio: "Juan Pérez",
        },
        cambioDejado: null, corte: null,
      },
    },
  });
  assert.match(html, /Viene del cambio que dejó el turno/);
  assert.match(html, /\/modulos\/turnos\/188/);
  assert.match(html, /María Gómez/);
  assert.match(html, /Juan Pérez/);
  assert.match(html, /Denominaciones declaradas/);
  assert.match(html, /Denominaciones recibidas/);
  assert.match(html, /30 × \$1\.000/);
  assert.match(html, /28 × \$1\.000/);
  assert.match(html, /faltaban dos billetes/);
});

test("17. el circuito avisa cuando NO cierra, en vez de mostrarlo como si diera", () => {
  const html = render(CircuitoDelDinero, {
    // Contado 60.000 pero retiro 30.000 + cambio 20.000 = 50.000: falta explicar 10.000.
    turno: { ...TURNO_A, fondoDejadoCierre: 20000 },
    resumen: {
      ...RESUMEN_A,
      relevo: { cambioDejado: { ...CAMBIO_DEJADO_A, total: 20000 }, corte: CORTE_A, cambioRecibido: null },
    },
  });
  assert.match(html, /El circuito no cierra/);
});

test("18. un turno histórico no muestra una sección de guiones", () => {
  const html = render(CircuitoDelDinero, { turno: { id: 1, montoInicial: 5000 } });
  assert.match(html, /anterior al circuito/);
  assert.doesNotMatch(html, /Dinero que salió del local/);
});

test("19. la cadena vieja de fondo se sigue leyendo en los turnos históricos", () => {
  const html = render(CircuitoDelDinero, {
    turno: {
      id: 50, montoInicial: 10000,
      fondoSugeridoApertura: 12000, fondoRecibidoApertura: 10000,
      diferenciaFondoApertura: -2000, fondoOrigenTurnoId: 49,
      efectivoRetiradoCierre: 5000, fondoDejadoCierre: 10000,
    },
  });
  assert.match(html, /Cadena anterior, hoy desactivada/);
  assert.match(html, /\/modulos\/turnos\/49/);
  assert.match(html, /12\.000/);
});

test("20. las etiquetas de estado del cambio cubren los cinco casos", () => {
  for (const e of ["DISPONIBLE", "RESERVADO", "RECIBIDO", "CANCELADO", "VENCIDO"]) {
    assert.notEqual(etiquetaEstadoCambio(e), "—", `falta la etiqueta de ${e}`);
  }
  assert.equal(etiquetaEstadoCambio("LO_QUE_SEA"), "—");
});

// ── El relevo se lee de su fuente, no se adivina ────────────────────────────

test("21. el traspaso NUNCA se deduce por importe ni por fecha", () => {
  const s = sinComentarios(fuente("app/api/pos-ventas/turnos/resumen/route.js"));
  // El vínculo va por los campos únicos de CambioPendiente.
  assert.match(s, /where: \{ turnoDestinoId: turnoId \}/);
  assert.match(s, /where: \{ turnoOrigenId: turnoId \}/);
  // Y no se busca por total ni por rango de fechas.
  assert.doesNotMatch(s, /cambioPendiente\.findFirst\(\{\s*where:\s*\{\s*total:/);
});

test("22. no se reactivan los campos viejos de fondo en ninguna escritura", () => {
  const VIEJOS = ["fondoSugeridoApertura", "diferenciaFondoApertura", "fondoOrigenTurnoId", "fondoConsumidoEnTurnoId"];
  const ESCRITURAS = [
    "app/api/pos-ventas/cierres/[token]/confirmar/route.js",
    "app/api/pos-ventas/turnos/abrir-con-cambio/route.js",
    "app/api/pos-ventas/turnos/abrir-sin-cambio/route.js",
  ];
  for (const f of ESCRITURAS) {
    const s = sinComentarios(fuente(f));
    for (const campo of VIEJOS) {
      assert.ok(!s.includes(campo), `${f} escribe ${campo}`);
    }
  }
});

test("23. el listado de Cajas ofrece el tercer estado", () => {
  const s = fuente("app/modulos/turnos/page.jsx");
  assert.match(s, /value="en_preparacion"/);
  assert.match(s, /Cierre en preparación/);
  // Y los accesos a las dos bandejas.
  assert.match(s, /pos-ventas\/cierres/);
  assert.match(s, /turnos\/cambios-pendientes/);
});

// ── Terminología: "cambio", no "fondo" ─────────────────────────────────────
//
// El circuito habla de CAMBIO —los billetes que quedan para dar vuelto— y no de
// "fondo". El nombre interno de la columna sigue siendo `fondoDejadoCierre`, que
// no se toca; lo que cambia es lo que lee la persona.

test("25. el circuito rotula 'Cambio inicial', no 'Fondo inicial'", () => {
  const html = render(CircuitoDelDinero, {
    turno: TURNO_A,
    resumen: { ...RESUMEN_A, relevo: { cambioDejado: CAMBIO_DEJADO_A, corte: CORTE_A, cambioRecibido: null } },
  });
  assert.match(html, /Cambio inicial/);
  assert.doesNotMatch(html, /Fondo inicial/);
  assert.doesNotMatch(html, /Monto inicial/);
});

test("26. la rama histórica también habla de cambio", () => {
  const html = render(CircuitoDelDinero, {
    turno: {
      id: 50, montoInicial: 10000,
      fondoSugeridoApertura: 12000, fondoRecibidoApertura: 10000,
      diferenciaFondoApertura: -2000, fondoOrigenTurnoId: 49,
      efectivoRetiradoCierre: 5000, fondoDejadoCierre: 10000,
    },
  });
  assert.match(html, /Cambio que dejó el cierre anterior/);
  assert.match(html, /Cambio realmente recibido/);
  assert.doesNotMatch(html, /Fondo que dejó/);
  assert.doesNotMatch(html, /Fondo realmente/);
});

test("27. ninguna superficie del circuito muestra 'Fondo' a la persona", () => {
  const SUPERFICIES = [
    "components/turnos/CircuitoDelDinero.jsx",
    "components/turnos/ResumenCierre.jsx",
    "app/modulos/turnos/page.jsx",
    "app/modulos/turnos/[id]/page.jsx",
    "app/modulos/turnos/cambios-pendientes/page.jsx",
  ];
  for (const f of SUPERFICIES) {
    const codigo = sinComentarios(fuente(f));
    // Los nombres internos (`fondoDejadoCierre` y compañía) sí pueden estar: lo
    // que no puede es un rótulo con "Fondo" seguido de espacio.
    const rotulos = codigo.match(/["'>]\s*Fondo [^"'<]{2,40}/g) || [];
    assert.deepEqual(rotulos, [], `${f} muestra: ${rotulos.join(" | ")}`);
  }
});

// ── El estado en el encabezado del detalle ─────────────────────────────────

test("28. el detalle rotula ESTADO y nunca 'Cierre: Abierto'", () => {
  const s = fuente("app/modulos/turnos/[id]/page.jsx");
  // La etiqueta del encabezado es "Estado".
  assert.match(s, />Estado<\/span>/);
  // Y los cuatro valores están.
  for (const v of [">Anulado<", ">Cerrado<", ">Cierre en preparación<", ">Abierto<"]) {
    assert.ok(s.includes(v), `falta el estado ${v}`);
  }
  // La etiqueta "Cierre" ya no rotula el estado: solo aparece como fecha.
  const codigo = sinComentarios(s);
  assert.doesNotMatch(codigo, /text-xs">Cierre<\/span>/, "sigue rotulando el estado como 'Cierre'");
});

test("29. el listado usa la fuente única y tiene el cuarto estado", () => {
  const s = fuente("app/modulos/turnos/page.jsx");
  assert.match(s, /estadoDelTurno/);
  assert.match(s, /ESTADO_TURNO\.CIERRE_EN_PREPARACION/);
  assert.match(s, /Cierre en preparación/);
  // La función local de tres casos ya no existe.
  assert.doesNotMatch(sinComentarios(s), /function estadoDe\(/);
  // Y la columna habla de cambio.
  assert.match(s, /"Cambio dejado"/);
});

test("24. el detalle distingue los tres estados y no dice 'Abierto' a una caja cortada", () => {
  const s = fuente("app/modulos/turnos/[id]/page.jsx");
  assert.match(s, /ESTADO_TURNO\.CIERRE_EN_PREPARACION/);
  assert.match(s, /Cierre en preparación/);
  // Y los botones de movimiento solo aparecen si está operativo.
  assert.match(s, /\{operativo && \(/);
});
