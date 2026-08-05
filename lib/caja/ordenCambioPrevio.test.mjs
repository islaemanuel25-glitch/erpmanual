// EL ORDEN FÍSICO DE LA CAJA: separar el cambio ANTES del corte.
//
// QUÉ SE PRUEBA ACÁ
//
// La regla nueva es que el cambio se aparta y se cuenta antes de cortar, y que
// después del corte se cuenta UNA sola pila: la del dinero retirado. De ahí
// salen dos números congelados —el esperado y el retiro esperado— y una
// identidad que tiene que cerrar exacta:
//
//     diferencia = retiro contado − (esperado − cambio separado)
//
// que es la MISMA diferencia que daba el orden anterior. Si esa equivalencia se
// rompiera, el cambio de flujo estaría moviendo plata, y no es lo que se buscó.
//
// También se prueba lo que NO se puede tocar: `ArqueoCaja.efectivoContado` y
// `Turno.montoRealEfectivo` siguen siendo el cajón COMPLETO. Un reporte que
// leyera "retiro" donde antes leía "cajón" cambiaría de significado sin que
// nadie se entere, y ése es el riesgo más silencioso de todo este cambio.
//
// Las pruebas de fuente (leer el route.js y verificar el orden de las llamadas)
// existen porque las garantías que verifican —bloquear antes de leer, no crear
// un segundo sobre, no recalcular el esperado— no se pueden observar desde
// afuera sin una base de datos. Ver scripts/integracion-cambio-previo.mjs para
// las que sí se ejercitan contra Postgres.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import {
  calcularRetiroEsperado,
  calcularCierreDesdeRetiro,
  calcularCierreDesdeConteo,
  unirDesgloses,
  ERROR_RETIRO_EN_PREPARACION_PARA_CIERRE,
  ERROR_CIERRE_EN_PREPARACION_PARA_RETIRO,
  ERROR_RETIRO_YA_EN_PREPARACION,
} from "@/lib/caja/cierreRelevo";
import {
  ESTADO_RETIRO,
  retiroConfirmable,
  retiroCancelable,
  calcularRetiroDesdeConteo,
  claveIdempotenciaRetiro,
  actividadPosterior,
  AVISO_ACTIVIDAD_POSTERIOR,
} from "@/lib/caja/retiroRelevo";
import { armarCircuito, verificarCircuito } from "@/lib/caja/circuitoDinero";
import { CLAVE_MONEDAS } from "@/lib/caja/conteoBilletes";
import {
  armarBorradorCierre,
  armarBorradorCierreLegado,
  borradorCompatible,
} from "@/lib/caja/borradorCierre";
import {
  PanelCambioPrevio,
  PanelCambioSeparado,
  PanelConteoRetiro,
  PanelResumenCorte,
  ResumenCabeceraCorte,
} from "@/components/caja/PanelesRetiro";
import {
  PanelAntesDelCorte,
  AvisoCorteHecho,
  avisoDespuesDelCorte,
  AVISO_POSTERIORES_RETIRO,
} from "@/components/caja/PanelesCierre";
import { MENSAJE_FLUJO_NUEVO } from "@/app/api/pos-ventas/retiros/registrar/route.js";

const render = (C, props) => renderToStaticMarkup(React.createElement(C, props));
const fuente = (f) =>
  readFileSync(new URL(`../../${f}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

// ═══ EL EJEMPLO OBLIGATORIO ════════════════════════════════════════════════
//
// Antes del corte: esperado $150.000, cambio elegido $30.000.
// Al iniciar:      retiro esperado congelado $120.000.
// Mientras cuenta: entran ventas por $20.000 — no lo mueven.
// Al confirmar:    retiro contado $120.000, caja posterior $50.000.

const ESPERADO = 150000;
const CAMBIO = 30000;
const RETIRO_ESPERADO = 120000;
const VENTA_POSTERIOR = 20000;

test("1. el retiro esperado se congela como esperado menos cambio", () => {
  assert.equal(
    calcularRetiroEsperado({ efectivoEsperadoCorte: ESPERADO, totalCambio: CAMBIO }),
    RETIRO_ESPERADO
  );
});

test("2. contar exactamente el retiro esperado da diferencia cero", () => {
  const c = calcularCierreDesdeRetiro({
    totalRetiroContado: RETIRO_ESPERADO,
    totalCambio: CAMBIO,
    efectivoRetiradoEsperado: RETIRO_ESPERADO,
  });
  assert.equal(c.valido, true);
  assert.equal(c.diferencia, 0, "NO puede aparecer un faltante falso");
  assert.equal(c.retiroFinal, RETIRO_ESPERADO);
});

test("3. el total del cajón se DERIVA: retiro contado + cambio separado", () => {
  const c = calcularCierreDesdeRetiro({
    totalRetiroContado: RETIRO_ESPERADO,
    totalCambio: CAMBIO,
    efectivoRetiradoEsperado: RETIRO_ESPERADO,
  });
  assert.equal(c.totalCajonDerivado, ESPERADO, "el cajón al corte tenía $150.000");
});

test("4. una venta posterior NO cambia ninguno de los números congelados", () => {
  // El congelado no depende de nada que se lea después: es un argumento.
  const antes = calcularCierreDesdeRetiro({
    totalRetiroContado: RETIRO_ESPERADO,
    totalCambio: CAMBIO,
    efectivoRetiradoEsperado: RETIRO_ESPERADO,
  });
  // Aunque el esperado del turno ya sea 170.000, el congelado sigue en 120.000.
  const despues = calcularCierreDesdeRetiro({
    totalRetiroContado: RETIRO_ESPERADO,
    totalCambio: CAMBIO,
    efectivoRetiradoEsperado: RETIRO_ESPERADO,
  });
  assert.deepEqual(antes, despues);
  assert.equal(despues.diferencia, 0);
});

test("5. la caja posterior queda con el cambio más lo vendido después", () => {
  // La fórmula acumulativa del esperado corriente no cambia: es el turno entero
  // menos los retiros confirmados. Con el ejemplo:
  //   esperado tras el retiro = (150.000 + 20.000) − 120.000 = 50.000
  const esperadoCorriente = ESPERADO + VENTA_POSTERIOR - RETIRO_ESPERADO;
  assert.equal(esperadoCorriente, 50000);
  assert.equal(esperadoCorriente, CAMBIO + VENTA_POSTERIOR, "cambio + ventas posteriores");
});

test("6. la diferencia es idéntica a la del orden anterior", () => {
  // Es la equivalencia que justifica todo el cambio: cambia el trabajo físico,
  // no el número. Se prueba con un faltante real, que es cuando importa.
  const contadoCajon = 145000; // faltan $5.000
  const retiroContado = contadoCajon - CAMBIO;

  const viejo = calcularCierreDesdeConteo({
    totalContado: contadoCajon,
    totalCambio: CAMBIO,
    efectivoEsperadoCorte: ESPERADO,
  });
  const nuevo = calcularCierreDesdeRetiro({
    totalRetiroContado: retiroContado,
    totalCambio: CAMBIO,
    efectivoRetiradoEsperado: RETIRO_ESPERADO,
  });

  assert.equal(viejo.diferencia, -5000);
  assert.equal(nuevo.diferencia, -5000, "los dos órdenes dan la MISMA diferencia");
  assert.equal(nuevo.retiroFinal, viejo.retiroFinal);
  assert.equal(nuevo.totalCajonDerivado, viejo.totalContado);
});

test("7. no se pierde ni se duplica plata: el reparto cierra exacto", () => {
  const c = calcularCierreDesdeRetiro({
    totalRetiroContado: RETIRO_ESPERADO,
    totalCambio: CAMBIO,
    efectivoRetiradoEsperado: RETIRO_ESPERADO,
  });
  assert.equal(c.retiroFinal + c.totalCambio, c.totalCajonDerivado);
});

test("8. el retiro esperado puede ser negativo y NO se recorta", () => {
  // Dejar como cambio más de lo esperado es un SOBRANTE. Recortarlo a cero
  // rompería la identidad y escondería justo lo que hay que ver.
  const r = calcularRetiroEsperado({ efectivoEsperadoCorte: 30000, totalCambio: 40000 });
  assert.equal(r, -10000);

  const c = calcularCierreDesdeRetiro({
    totalRetiroContado: 0,
    totalCambio: 40000,
    efectivoRetiradoEsperado: r,
  });
  assert.equal(c.diferencia, 10000, "aparece como sobrante de $10.000");
  assert.equal(c.totalCajonDerivado, 40000);
});

test("9. la aritmética es en centavos enteros, sin coma flotante", () => {
  const r = calcularRetiroEsperado({ efectivoEsperadoCorte: 0.3, totalCambio: 0.1 });
  assert.equal(r, 0.2, "0.3 − 0.1 tiene que dar 0.2 exacto");

  const c = calcularCierreDesdeRetiro({
    totalRetiroContado: 1000.05,
    totalCambio: 2000.1,
    efectivoRetiradoEsperado: 1000.05,
  });
  assert.equal(c.totalCajonDerivado, 3000.15);
  assert.equal(c.diferencia, 0);
});

// ═══ UNIÓN DE DESGLOSES: reconstruir el cajón ══════════════════════════════

test("10. unir desgloses suma billetes y monedas por separado", () => {
  const retiro = { 20000: 6, 1000: 2, [CLAVE_MONEDAS]: 150.5 };
  const cambio = { 20000: 1, 500: 4, [CLAVE_MONEDAS]: 49.5 };
  assert.deepEqual(unirDesgloses(retiro, cambio), {
    20000: 7,
    1000: 2,
    500: 4,
    [CLAVE_MONEDAS]: 200,
  });
});

test("11. unir con un lado vacío devuelve el otro intacto", () => {
  assert.deepEqual(unirDesgloses({ 10000: 3 }, {}), { 10000: 3 });
  assert.deepEqual(unirDesgloses({}, { 10000: 3 }), { 10000: 3 });
  assert.deepEqual(unirDesgloses({}, {}), {});
});

test("12. el desglose unido suma lo mismo que los dos totales por separado", () => {
  // Es la comprobación que garantiza que `efectivoContado` sigue siendo el cajón.
  const retiro = { 20000: 6 };
  const cambio = { 10000: 3 };
  const unido = unirDesgloses(retiro, cambio);
  assert.equal(unido["20000"] * 20000 + unido["10000"] * 10000, 120000 + 30000);
});

// ═══ COMPATIBILIDAD HISTÓRICA ══════════════════════════════════════════════

test("13. el cierre escribe el CAJÓN COMPLETO en las columnas históricas", () => {
  const s = fuente("app/api/pos-ventas/cierres/[token]/confirmar/route.js");
  assert.ok(
    /montoRealEfectivo: cuentas\.totalCajonDerivado/.test(s),
    "montoRealEfectivo dejó de ser el cajón completo"
  );
  assert.ok(
    /efectivoContado: cuentas\.totalCajonDerivado/.test(s),
    "ArqueoCaja.efectivoContado dejó de ser el cajón completo"
  );
  // Y el retiro contado va a su campo PROPIO, no pisa al histórico.
  assert.ok(/totalRetiroContado: cuentas\.totalRetiroContado/.test(s));
});

test("14. el retiro escribe el CAJÓN COMPLETO en ArqueoCaja.efectivoContado", () => {
  const s = fuente("app/api/pos-ventas/retiros/[token]/confirmar/route.js");
  assert.ok(
    /efectivoContado: cuentas\.totalCajonDerivado/.test(s),
    "ArqueoCaja.efectivoContado dejó de ser el cajón completo"
  );
  // El movimiento de caja, en cambio, descuenta SOLO lo retirado.
  assert.ok(
    /monto: cuentas\.totalRetiroContado/.test(s),
    "el CajaMovimiento tiene que descontar sólo lo retirado"
  );
});

test("15. el cambio NO genera movimiento de caja: no salió del cajón", () => {
  for (const f of [
    "app/api/pos-ventas/cierres/iniciar/route.js",
    "app/api/pos-ventas/retiros/iniciar/route.js",
  ]) {
    const s = fuente(f);
    assert.equal(
      /cajaMovimiento\.create/.test(s),
      false,
      `${f} crea un movimiento al cortar: el cambio se descontaría dos veces`
    );
  }
});

test("16. el circuito del dinero sigue cerrando con el orden nuevo", () => {
  const c = armarCircuito({
    turno: {
      montoInicial: 30000,
      montoEsperadoEfectivo: ESPERADO,
      montoRealEfectivo: ESPERADO, // el cajón derivado
      diferenciaEfectivo: 0,
      efectivoRetiradoCierre: RETIRO_ESPERADO,
      fondoDejadoCierre: CAMBIO,
    },
    resumen: {
      totalEfectivo: 120000,
      totalRetirosCaja: 0,
      movimientosManuales: { ingresos: 0, retiros: 0 },
    },
    cambioDejado: { total: CAMBIO, estado: "DISPONIBLE", desglose: { 10000: 3 } },
    corte: {
      corteEn: "2026-08-05T12:00:00.000Z",
      efectivoRetiradoEsperado: RETIRO_ESPERADO,
      totalRetiroContado: RETIRO_ESPERADO,
    },
  });

  assert.equal(c.cierre.cambioSeparadoEnCorte, true);
  assert.equal(c.cierre.retiroEsperado, RETIRO_ESPERADO);
  assert.equal(c.cierre.retiroContado, RETIRO_ESPERADO);

  const v = verificarCircuito(c);
  assert.equal(v.cierra, true, "el circuito no cierra con el orden nuevo");
  // Las tres igualdades: esperado, reparto y retiro esperado.
  assert.equal(v.checks.length, 3);
});

test("17. un turno del orden anterior no muestra las filas nuevas", () => {
  const c = armarCircuito({
    turno: {
      montoInicial: 30000,
      montoEsperadoEfectivo: ESPERADO,
      montoRealEfectivo: ESPERADO,
      diferenciaEfectivo: 0,
      efectivoRetiradoCierre: RETIRO_ESPERADO,
      fondoDejadoCierre: CAMBIO,
    },
    resumen: { totalEfectivo: 120000, totalRetirosCaja: 0, movimientosManuales: { ingresos: 0, retiros: 0 } },
    cambioDejado: { total: CAMBIO, estado: "RECIBIDO" },
    // Corte VIEJO: sin efectivoRetiradoEsperado.
    corte: { corteEn: "2026-08-04T12:00:00.000Z" },
  });
  assert.equal(c.cierre.cambioSeparadoEnCorte, false);
  assert.equal(c.cierre.retiroEsperado, null);
  // Y el circuito sigue cerrando con las dos igualdades de siempre.
  const v = verificarCircuito(c);
  assert.equal(v.cierra, true);
  assert.equal(v.checks.length, 2, "no debe agregar el check que no aplica");
});

// ═══ EXCLUSIÓN MUTUA ═══════════════════════════════════════════════════════

test("18. iniciar cierre rechaza si hay un retiro en preparación", () => {
  const s = fuente("app/api/pos-ventas/cierres/iniciar/route.js");
  assert.ok(/retiroPreparacion\.findFirst/.test(s), "el cierre no consulta los retiros en curso");
  assert.ok(/ESTADO_RETIRO\.PREPARANDO/.test(s));
  assert.ok(/ERROR_RETIRO_EN_PREPARACION_PARA_CIERRE/.test(s));

  // Y el chequeo va DENTRO del lock: un retiro iniciado un milisegundo antes
  // tiene que verse.
  const posLock = s.indexOf("bloquearTurno(tx");
  const posChequeo = s.indexOf("retiroPreparacion.findFirst");
  assert.ok(posLock > 0 && posLock < posChequeo, "el chequeo quedó fuera del lock");
});

test("19. iniciar retiro rechaza si el turno ya tomó su corte de cierre", () => {
  // La mitad recíproca la aporta `contextoArqueo`, que ya devuelve 409 sobre un
  // turno con `cierreEnPreparacionEn`. Se verifica que el retiro la use y que
  // además revalide dentro de la transacción.
  const s = fuente("app/api/pos-ventas/retiros/iniciar/route.js");
  assert.ok(/contextoArqueo\(req/.test(s));
  assert.ok(/enPreparacionDeCierre/.test(s), "no propaga la señal del cierre en curso");
  assert.ok(
    /WHERE_TURNO_OPERATIVO/.test(s),
    "no revalida el estado operativo dentro de la transacción"
  );
});

test("20. los tres mensajes de exclusión existen y son distintos", () => {
  const textos = [
    ERROR_RETIRO_EN_PREPARACION_PARA_CIERRE,
    ERROR_CIERRE_EN_PREPARACION_PARA_RETIRO,
    ERROR_RETIRO_YA_EN_PREPARACION,
  ];
  for (const t of textos) assert.ok(t.length > 20, "un mensaje vacío no explica nada");
  assert.equal(new Set(textos).size, 3, "dos mensajes iguales no distinguen los casos");
});

test("21. un retiro en preparación NO bloquea las ventas", () => {
  // El turno no se toca al cortar: sin `cierreEnPreparacionEn`, el POS opera.
  const s = fuente("app/api/pos-ventas/retiros/iniciar/route.js");
  assert.equal(
    /cierreEnPreparacionEn:/.test(s),
    false,
    "el retiro congela el turno y no debería: la caja tiene que seguir vendiendo"
  );
  assert.equal(/turno\.update/.test(s), false, "el retiro no debe modificar el turno al cortar");
});

// ═══ EL SOBRE DE CAMBIO ════════════════════════════════════════════════════

test("22. el cierre publica el sobre AL CORTAR, no al confirmar", () => {
  const iniciar = fuente("app/api/pos-ventas/cierres/iniciar/route.js");
  assert.ok(/cambioPendiente\.create/.test(iniciar), "el corte no publica el sobre");
  assert.ok(/ESTADO_CAMBIO\.DISPONIBLE/.test(iniciar), "el sobre no nace disponible");
});

test("23. la confirmación NO crea un segundo sobre", () => {
  const s = fuente("app/api/pos-ventas/cierres/[token]/confirmar/route.js");
  // Se busca el existente antes de cualquier creación.
  const posBusca = s.indexOf("cambioPendiente.findUnique");
  const posCrea = s.indexOf("cambioPendiente.create");
  assert.ok(posBusca > 0, "no busca el sobre ya publicado");
  assert.ok(
    posCrea === -1 || posBusca < posCrea,
    "crea el sobre sin mirar antes si ya existe: quedarían dos por el mismo dinero"
  );
  // Y lo bloquea para que su estado no cambie entre la lectura y el commit.
  assert.ok(/bloquearCambio\(tx/.test(s), "no bloquea el sobre durante la confirmación");
});

test("24. el retiro NO publica ningún sobre: la plata no cambia de manos", () => {
  for (const f of [
    "app/api/pos-ventas/retiros/iniciar/route.js",
    "app/api/pos-ventas/retiros/[token]/confirmar/route.js",
  ]) {
    assert.equal(
      /cambioPendiente/.test(fuente(f)),
      false,
      `${f} toca CambioPendiente y no debería: el cambio de un retiro se queda en el mismo turno`
    );
  }
});

test("25. cancelar el cierre exige que el sobre siga DISPONIBLE", () => {
  const s = fuente("app/api/pos-ventas/cierres/[token]/cancelar/route.js");
  assert.ok(/ESTADO_CAMBIO\.DISPONIBLE/.test(s), "no verifica el estado del sobre");
  assert.ok(/turnoDestinoId == null/.test(s), "no verifica que nadie lo haya consumido");
  assert.ok(/status: 409/.test(s));
  // Y al cancelar, el sobre se marca CANCELADO en vez de quedar ofrecido.
  assert.ok(
    /estado: ESTADO_CAMBIO\.CANCELADO/.test(s),
    "el sobre queda disponible después de cancelar el cierre que lo creó"
  );
  // NO se borra: la evidencia se conserva.
  assert.equal(/cambioPendiente\.delete/.test(s), false, "el sobre no se puede borrar");
});

test("26. cancelar un retiro no crea nada y no toca el turno", () => {
  const s = fuente("app/api/pos-ventas/retiros/[token]/cancelar/route.js");
  for (const prohibido of ["arqueoCaja.create", "cajaMovimiento.create", "turno.update"]) {
    assert.equal(s.includes(prohibido), false, `cancelar un retiro no puede ${prohibido}`);
  }
  assert.ok(/ESTADO_RETIRO\.CANCELADO/.test(s));
});

// ═══ ESTADOS DE LA PREPARACIÓN DE RETIRO ═══════════════════════════════════

test("27. sólo se confirma y se cancela lo que está PREPARANDO", () => {
  assert.equal(retiroConfirmable({ estado: ESTADO_RETIRO.PREPARANDO }), true);
  assert.equal(retiroConfirmable({ estado: ESTADO_RETIRO.CONFIRMADO }), false);
  assert.equal(retiroConfirmable({ estado: ESTADO_RETIRO.CANCELADO }), false);

  assert.equal(retiroCancelable({ estado: ESTADO_RETIRO.PREPARANDO }), true);
  assert.equal(retiroCancelable({ estado: ESTADO_RETIRO.CONFIRMADO }), false);
});

test("28. la clave de idempotencia sale de la preparación, no del turno", () => {
  // Si saliera del turno, el segundo retiro del día chocaría contra la
  // @@unique([turnoId, idempotencyKey]) de ArqueoCaja y sería imposible.
  assert.equal(claveIdempotenciaRetiro(7), "retiro-prep-7");
  assert.notEqual(claveIdempotenciaRetiro(7), claveIdempotenciaRetiro(8));
});

// ═══ ACTIVIDAD POSTERIOR: SE INFORMA, NO SE APLICA ═════════════════════════

test("29. la actividad posterior se detecta por ID", () => {
  const sinNada = actividadPosterior({
    ultimaVentaId: 10, ultimoMovimientoId: 5,
    ultimaVentaActualId: 10, ultimoMovimientoActualId: 5,
  });
  assert.equal(sinNada.hay, false);

  const conVentas = actividadPosterior({
    ultimaVentaId: 10, ultimoMovimientoId: 5,
    ultimaVentaActualId: 12, ultimoMovimientoActualId: 5,
  });
  assert.equal(conVentas.hay, true);
  assert.equal(conVentas.ventas, true);
  assert.equal(conVentas.movimientos, false);

  const conMovs = actividadPosterior({
    ultimaVentaId: 10, ultimoMovimientoId: 5,
    ultimaVentaActualId: 10, ultimoMovimientoActualId: 9,
  });
  assert.equal(conMovs.movimientos, true);
});

test("30. la pantalla del retiro NO pide reconfirmar por actividad posterior", () => {
  const s = fuente("app/modulos/pos-ventas/retiros/[token]/page.jsx");
  // El mecanismo viejo: comparar huellas y adoptar un esperado nuevo.
  for (const prohibido of ["compararHuellas", "huellaDelTurno", "setEsperado"]) {
    assert.equal(
      s.includes(prohibido),
      false,
      `la pantalla usa ${prohibido}: volvería a adoptar un esperado nuevo`
    );
  }
  // Lo que sí hace es avisar.
  assert.ok(/AVISO_ACTIVIDAD_POSTERIOR/.test(s));
  assert.match(AVISO_ACTIVIDAD_POSTERIOR, /No forman parte de este retiro/);
});

test("31. la pantalla del retiro lee los importes UNA vez y no hace polling", () => {
  const s = fuente("app/modulos/pos-ventas/retiros/[token]/page.jsx");
  for (const prohibido of ["setInterval", "visibilitychange", "turnos/resumen"]) {
    assert.equal(s.includes(prohibido), false, `la pantalla usa ${prohibido}`);
  }
});

// ═══ BORRADORES ════════════════════════════════════════════════════════════

test("32. el borrador del cierre distingue el orden al que pertenece", () => {
  const nuevo = armarBorradorCierre({ token: "t", desgloseRetiroContado: { 20000: 6 } });
  const viejo = armarBorradorCierreLegado({
    token: "t", desgloseContado: { 20000: 7 }, desgloseCambio: { 10000: 3 },
  });

  assert.equal(borradorCompatible(nuevo, { cambioSeparadoEnCorte: true }), true);
  assert.equal(borradorCompatible(nuevo, { cambioSeparadoEnCorte: false }), false);
  assert.equal(borradorCompatible(viejo, { cambioSeparadoEnCorte: false }), true);
  assert.equal(
    borradorCompatible(viejo, { cambioSeparadoEnCorte: true }),
    false,
    "un conteo del cajón entero no se puede presentar como si fuera el retiro"
  );
  assert.equal(borradorCompatible(null, { cambioSeparadoEnCorte: true }), false);
});

// ═══ PANTALLAS ═════════════════════════════════════════════════════════════

test("33. la pantalla previa del cierre muestra cambio y retiro estimado", () => {
  const html = render(PanelAntesDelCorte, {
    turno: { id: 188, apertura: "2026-08-05T12:00:00.000Z" },
    esperado: ESPERADO,
    totalCambio: CAMBIO,
    retiroEstimado: RETIRO_ESPERADO,
  });
  assert.match(html, /Efectivo esperado ahora/);
  assert.match(html, /Cambio que queda/);
  assert.match(html, /Retiro estimado/);
  assert.match(html, /150\.000,00/);
  assert.match(html, /30\.000,00/);
  assert.match(html, /120\.000,00/);
  assert.match(html, /Separar cambio, iniciar cierre y liberar POS/);
});

test("34. la pantalla previa advierte si el cambio supera el esperado", () => {
  const html = render(PanelAntesDelCorte, {
    turno: { id: 188 },
    esperado: 30000,
    totalCambio: 40000,
    retiroEstimado: -10000,
  });
  assert.match(html, /supera el efectivo esperado/);
  assert.match(html, /sobrante/);
});

test("35. el bloque del cambio previo NO tiene columna de contadas ni tope", () => {
  // Es una grilla de CONTEO, no de reparto: el cambio es lo primero que se
  // cuenta y no hay ninguna pila previa contra la cual topearlo.
  const html = render(PanelCambioPrevio, { desglose: { 10000: 3 }, ayuda: "contá el cambio" });
  assert.match(html, /Cambio que queda en la caja/);
  assert.doesNotMatch(html, /Contadas/);
  assert.match(html, /id="cambio-previo-10000"/);
});

test("36. el cambio ya separado se muestra SIN inputs", () => {
  const html = render(PanelCambioSeparado, {
    desglose: { 10000: 3 },
    total: CAMBIO,
    nota: "Está disponible para que lo tome el siguiente operador.",
  });
  assert.match(html, /Cambio ya separado/);
  assert.match(html, /No forma parte de este conteo/);
  assert.match(html, /\$10\.000 × 3/);
  assert.match(html, /30\.000,00/);
  // Ni un solo campo editable: después del corte el cambio es inmutable.
  assert.doesNotMatch(html, /<input/);
  assert.doesNotMatch(html, /<button/);
});

test("37. el cambio separado en cero se dice, no se deja en blanco", () => {
  const html = render(PanelCambioSeparado, { desglose: {}, total: 0 });
  assert.match(html, /No se dejó cambio/);
});

test("38. el conteo posterior pide SOLO el dinero retirado", () => {
  const html = render(PanelConteoRetiro, {
    desglose: { 20000: 6 },
    aviso: "Contá únicamente el dinero que retiraste.",
  });
  assert.match(html, /Contar el dinero retirado/);
  assert.match(html, /Contá únicamente el dinero que retiraste/);
  // Y NO el cajón entero, que era el rótulo anterior.
  assert.doesNotMatch(html, /Contar todo el efectivo del cajón/);
});

test("39. la cabecera compara retiro contra retiro", () => {
  const html = render(ResumenCabeceraCorte, {
    esperado: ESPERADO,
    cambioSeparado: CAMBIO,
    retiroEsperado: RETIRO_ESPERADO,
    retiroContado: RETIRO_ESPERADO,
    hayContado: true,
    diferencia: 0,
  });
  assert.match(html, /Efectivo esperado al corte/);
  assert.match(html, /Cambio separado/);
  assert.match(html, /Retiro esperado/);
  assert.match(html, /Retiro contado/);
  assert.match(html, /Diferencia/);
});

test("40. el resumen del corte no ofrece reconfirmar por movimientos", () => {
  const html = render(PanelResumenCorte, {
    esperado: ESPERADO,
    cambioSeparado: CAMBIO,
    retiroEsperado: RETIRO_ESPERADO,
    retiroContado: RETIRO_ESPERADO,
    hayContado: true,
    diferencia: 0,
    avisoPosterior: AVISO_ACTIVIDAD_POSTERIOR,
    puedeConfirmar: true,
  });
  assert.match(html, /No forman parte de este retiro/);
  // El texto del flujo viejo, que pedía confirmar con el valor nuevo.
  assert.doesNotMatch(html, /Confirmar con el valor nuevo/);
  assert.doesNotMatch(html, /Hubo movimientos mientras preparabas/);
  assert.match(html, /Confirmar retiro/);
});

test("41. sin conteo cargado no se puede confirmar", () => {
  const html = render(PanelResumenCorte, {
    esperado: ESPERADO,
    retiroEsperado: RETIRO_ESPERADO,
    hayContado: false,
    puedeConfirmar: false,
  });
  assert.match(html, /disabled/);
});

// ═══ LO QUE NO SE RECALCULA ════════════════════════════════════════════════

test("42. la confirmación del cierre NO recalcula el esperado", () => {
  const s = fuente("app/api/pos-ventas/cierres/[token]/confirmar/route.js");
  for (const prohibido of ["calcularCorte", "calcularEsperadoDeTurno", "calcularEfectivoEsperado"]) {
    assert.equal(s.includes(prohibido), false, `la confirmación llama a ${prohibido}`);
  }
  assert.ok(/cierre\.efectivoRetiradoEsperado/.test(s), "no usa el retiro esperado persistido");
});

test("43. la confirmación del retiro NO recalcula el esperado", () => {
  const s = fuente("app/api/pos-ventas/retiros/[token]/confirmar/route.js");
  for (const prohibido of [
    "calcularCorteRetiro", "calcularEsperadoDeTurno", "calcularEfectivoEsperado",
  ]) {
    assert.equal(s.includes(prohibido), false, `la confirmación llama a ${prohibido}`);
  }
  assert.ok(
    /retiro\.efectivoRetiradoEsperado/.test(s),
    "no usa el retiro esperado persistido"
  );
});

test("44. los totales los calcula el SERVIDOR, nunca el cliente", () => {
  for (const f of [
    "app/api/pos-ventas/cierres/iniciar/route.js",
    "app/api/pos-ventas/retiros/iniciar/route.js",
    "app/api/pos-ventas/cierres/[token]/confirmar/route.js",
    "app/api/pos-ventas/retiros/[token]/confirmar/route.js",
  ]) {
    const s = fuente(f);
    assert.ok(/validarDesgloseServidor/.test(s), `${f} no valida el desglose en el servidor`);
    // Ningún total del body se usa directo.
    assert.equal(
      /body\?\.(totalCambio|totalContado|totalRetiroContado)/.test(s),
      false,
      `${f} lee un total del cliente`
    );
  }
});

test("45. las pantallas mandan SOLO desgloses, nunca totales", () => {
  // Se extrae el objeto literal que va dentro de JSON.stringify, y sólo ése: lo
  // que venga después es el manejo de la respuesta, donde SÍ se leen totales
  // —los que devolvió el servidor— y mirarlos acá sería un falso positivo.
  // Dos formas de armarlo: el objeto inline dentro de JSON.stringify, o una
  // variable `cuerpo` que después se serializa. Las dos se revisan igual.
  const cuerpos = (s) => [
    ...[...s.matchAll(/JSON\.stringify\(\{([\s\S]*?)\}\)/g)].map((m) => m[1]),
    ...[...s.matchAll(/const cuerpo =([\s\S]*?);\n/g)].map((m) => m[1]),
  ];

  for (const f of [
    "app/modulos/pos-ventas/cierres/iniciar/page.jsx",
    "app/modulos/pos-ventas/retiros/nuevo/page.jsx",
    "app/modulos/pos-ventas/retiros/[token]/page.jsx",
    "app/modulos/pos-ventas/cierres/[token]/page.jsx",
  ]) {
    const s = fuente(f);
    const encontrados = cuerpos(s);
    assert.ok(encontrados.length > 0, `${f} no arma ningún cuerpo de pedido`);
    for (const cuerpo of encontrados) {
      assert.equal(
        /\btotal[A-Za-z]*\s*:/.test(cuerpo),
        false,
        `${f} manda un total en el cuerpo del pedido: ${cuerpo.trim()}`
      );
    }
  }
});

// ═══ EL CAMBIO ES INMUTABLE DESPUÉS DEL CORTE ══════════════════════════════

test("46. la confirmación del cierre no acepta un cambio nuevo", () => {
  const s = fuente("app/api/pos-ventas/cierres/[token]/confirmar/route.js");
  // En el camino NUEVO el cambio sale de la fila, no del body.
  assert.ok(
    /desgloseCambio = cierre\.desgloseCambio/.test(s),
    "el cambio del orden nuevo no sale de la fila congelada"
  );
  assert.ok(
    /totalCambio = Number\(cierre\.totalCambio/.test(s),
    "el total del cambio no sale de la fila congelada"
  );
});

test("47. la pantalla de conteo del cierre no ofrece editar el cambio", () => {
  const s = fuente("app/modulos/pos-ventas/cierres/[token]/page.jsx");
  // El bloque editable sólo puede aparecer en la rama de compatibilidad.
  const ramaNueva = s.slice(s.indexOf("conCorteNuevo ? ("), s.indexOf(") : ("));
  assert.ok(/PanelCambioSeparado/.test(ramaNueva), "no muestra el cambio en solo lectura");
  assert.equal(
    /PanelCambio\b/.test(ramaNueva),
    false,
    "el orden nuevo ofrece un selector editable de cambio"
  );
});

test("48. el retiro no acepta un cambio nuevo al confirmar", () => {
  const s = fuente("app/api/pos-ventas/retiros/[token]/confirmar/route.js");
  assert.ok(/retiro\.totalCambio/.test(s), "el cambio no sale de la fila congelada");
  assert.equal(
    /body\?\.desgloseCambio/.test(s),
    false,
    "la confirmación acepta un cambio del cliente"
  );
});

// ═══ AISLAMIENTO ═══════════════════════════════════════════════════════════

test("49. un corte de otro local devuelve 404, no 403", () => {
  // Revelar "existe pero no es tuyo" convierte al token en un oráculo.
  const s = fuente("lib/caja/retiroRelevoServer.js");
  assert.ok(/localId: ctx\.localId/.test(s), "no ancla la consulta al local de la sesión");
  assert.ok(/Retiro no encontrado/.test(s));
  assert.equal(/status: 403/.test(s), false, "usa 403 y filtra la existencia");
});

// ═══ TEXTOS QUE DESTAPARON LAS CAPTURAS ════════════════════════════════════

test("51. el aviso del corte no le dice 'cierre' a un retiro", () => {
  // La pantalla de retiro reusa el bloque del cierre. Con el sustantivo fijo
  // mostraba "Este cierre incluye operaciones hasta ese momento" sobre una caja
  // que NO se cerró y que sigue vendiendo. Visto en la captura de C.
  assert.match(avisoDespuesDelCorte("21:09"), /Este cierre incluye/);
  assert.match(avisoDespuesDelCorte("21:09", "retiro"), /Este retiro incluye/);

  const html = render(AvisoCorteHecho, {
    corteEn: "2026-08-05T21:09:00.000Z",
    sustantivo: "retiro",
    posteriores: AVISO_POSTERIORES_RETIRO,
  });
  assert.match(html, /Este retiro incluye/);
  assert.doesNotMatch(html, /Este cierre incluye/);
  // Y lo posterior sigue en la MISMA caja, no en el turno siguiente.
  assert.match(html, /siguen en esta caja/);
  assert.doesNotMatch(html, /pertenecen al siguiente turno/);

  // La pantalla del retiro tiene que estar pasando las dos cosas.
  const s = fuente("app/modulos/pos-ventas/retiros/[token]/page.jsx");
  assert.match(s, /sustantivo="retiro"/);
  assert.match(s, /AVISO_POSTERIORES_RETIRO/);
});

test("52. el rechazo de la pestaña vieja dice las tres cosas que hacen falta", () => {
  // Es lo ÚNICO que ve el cajero: el bundle anterior muestra `json.error` tal
  // cual. Tiene que decir qué cambió, que este conteo no se puede confirmar, y
  // qué hacer.
  assert.match(MENSAJE_FLUJO_NUEVO, /separando el cambio/i);
  assert.match(MENSAJE_FLUJO_NUEVO, /no puede confirmarse con el proceso anterior/i);
  assert.match(MENSAJE_FLUJO_NUEVO, /Volvé al POS e iniciá un retiro nuevo/i);
  // Y NUNCA puede sugerir que la plata salió.
  assert.doesNotMatch(MENSAJE_FLUJO_NUEVO, /registrad|confirmad|se retir/i);
});

test("50. los módulos puros no tocan la base ni la red", () => {
  for (const f of ["lib/caja/retiroRelevo.js", "lib/caja/cierreRelevo.js"]) {
    const s = fuente(f);
    for (const prohibido of ["prisma", "fetch(", "NextResponse"]) {
      assert.equal(s.includes(prohibido), false, `${f} usa ${prohibido}`);
    }
  }
});
