// RENDER REAL de la pantalla de cierre de caja, más las reglas del borrador y
// del aviso entre pestañas.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/cierrePantallaRender.test.mjs
//
// POR QUÉ EXISTE
//
// Por lo mismo que la del retiro: un identificador usado sin importar compiló,
// pasó el lint, pasaron más de mil pruebas y reventó en producción, porque
// ninguna prueba EJECUTABA ese JSX. Leerlo como texto y buscar la palabra no
// sirve.
//
// Además fija el contrato de la subetapa: el cierre REUTILIZA los paneles del
// retiro —no los duplica— y todo lo monetario sale del corte congelado.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import {
  PanelConteo,
  PanelCambio,
  PanelResumen,
  PanelMovimientos,
  ResumenCabecera,
} from "@/components/caja/PanelesRetiro";
import {
  PanelAntesDelCorte,
  AvisoCorteHecho,
  FilasResumenCierre,
  FilaCierrePendiente,
  TITULO_CIERRE,
  AVISO_ANTES_DEL_CORTE,
  AVISO_POSTERIORES,
  avisoDespuesDelCorte,
  hora,
} from "@/components/caja/PanelesCierre";
import { GRID_CONTEO, GRID_CAMBIO, CABECERA_BLOQUE, BLOQUE_ALINEADO } from "@/components/caja/geometriaGrilla";
import { CLAVE_MONEDAS } from "@/lib/caja/conteoBilletes";
import {
  armarBorradorCierre,
  guardarBorradorCierre,
  leerBorradorCierre,
  descartarBorradorCierre,
  claveBorradorCierre,
  limpiarBorradoresCierreViejos,
  VENCIMIENTO_HORAS_CIERRE,
} from "@/lib/caja/borradorCierre";
import {
  emitirCorteIniciado,
  escucharCorteIniciado,
  leerSenalVigente,
  limpiarSenal,
  CLAVE_SENAL,
} from "@/lib/caja/senalCierre";

const render = (Comp, props) => renderToStaticMarkup(createElement(Comp, props));

const CONTADO = { 20000: 7, 10000: 1, [CLAVE_MONEDAS]: 450 };
const CAMBIO = { 20000: 1, 10000: 1, [CLAVE_MONEDAS]: 450 };
const CORTE = "2026-08-04T17:32:00.000Z";

const leerFuente = (f) => readFileSync(f, "utf8");
const sinComentarios = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{?\s*\/\/.*$/gm, "");

// ── Antes del corte ─────────────────────────────────────────────────────────

test("1. la pantalla previa NO corta: pide una confirmación explícita", () => {
  const html = render(PanelAntesDelCorte, {
    turno: { id: 188, apertura: "2026-08-04T12:00:00.000Z" },
    operadorNombre: "Marcela",
    localNombre: "Sucursal Centro",
    esperado: 127700,
    confirmando: false,
  });
  // El botón principal está, pero NO corta: abre el modal donde se separa el
  // cambio. La confirmación en dos tiempos la da ese modal.
  assert.match(html, /Iniciar cierre y liberar POS/);
  // Y la grilla de denominaciones NO está en la página: vive en el modal.
  assert.doesNotMatch(html, /Cantidad que se deja/);
  assert.doesNotMatch(html, /id="cambio-previo-/);
  // Tampoco el botón que sí corta.
  assert.doesNotMatch(html, /Separar cambio, iniciar cierre y liberar POS/);
});

test("2. la pantalla previa es una tarjeta simple, sin cifras del cambio", () => {
  // Volvió a ser lo que era: cuatro datos, el efectivo esperado, el aviso y un
  // botón. El cambio y el retiro estimado se ven recién en el modal.
  const html = render(PanelAntesDelCorte, {
    turno: { id: 188, apertura: "2026-08-04T12:00:00.000Z" },
    operadorNombre: "Marcela",
    localNombre: "Sucursal Centro",
    esperado: 127700,
  });
  assert.match(html, /Turno/);
  assert.match(html, /Abierto desde/);
  assert.match(html, /Operador/);
  assert.match(html, /Local/);
  assert.match(html, /Efectivo esperado ahora/);
  assert.match(html, /127\.700,00/);
  assert.match(html, /no formarán parte de este cierre/);

  assert.doesNotMatch(html, /Cambio que queda/);
  assert.doesNotMatch(html, /Retiro estimado/);
});

test("3. antes del corte se ven turno, operador, local y esperado", () => {
  const html = render(PanelAntesDelCorte, {
    turno: { id: 188, apertura: "2026-08-04T12:00:00.000Z" },
    operadorNombre: "Marcela",
    localNombre: "Sucursal Centro",
    esperado: 127700,
  });
  assert.match(html, /#188/);
  assert.match(html, /Marcela/);
  assert.match(html, /Sucursal Centro/);
  assert.match(html, /127\.700/);
  // El esperado de ANTES del corte se rotula "ahora": todavía no hay nada
  // congelado y llamarlo "al corte" sería mentir.
  assert.match(html, /Efectivo esperado ahora/);
});

test("4. el aviso previo es el texto exacto aprobado", () => {
  const html = render(PanelAntesDelCorte, { turno: { id: 1 }, esperado: 0 });
  assert.ok(html.includes(AVISO_ANTES_DEL_CORTE.slice(0, 60)));
  assert.match(
    AVISO_ANTES_DEL_CORTE,
    /El POS quedará disponible para el siguiente operador/
  );
});

// ── Después del corte ───────────────────────────────────────────────────────

test("5. el aviso posterior dice la HORA del corte y qué queda afuera", () => {
  const html = render(AvisoCorteHecho, { corteEn: CORTE });
  assert.match(html, /Corte realizado a las \d{2}:\d{2}/);
  assert.match(html, /Este cierre incluye operaciones hasta ese momento/);
  assert.ok(html.includes(AVISO_POSTERIORES));
  assert.equal(avisoDespuesDelCorte("14:32"), "Corte realizado a las 14:32. Este cierre incluye operaciones hasta ese momento.");
});

test("6. un cierre atrasado lo dice, pero sigue siendo un cierre normal", () => {
  const html = render(AvisoCorteHecho, { corteEn: CORTE, atrasado: true });
  assert.match(html, /atrasado/i);
  // No aparece nada que sugiera que se perdió o que hay que rehacerlo.
  assert.doesNotMatch(html, /vencido|expirado|volver a empezar/i);
});

// ── El resumen ──────────────────────────────────────────────────────────────

test("7. el esperado se rotula AL CORTE, no 'ahora'", () => {
  const cabecera = render(ResumenCabecera, {
    esperado: 127700,
    totalContado: 150450,
    hayContado: true,
    diferencia: 22750,
    totalCambio: 30450,
    totalRetiro: 120000,
    etiquetaEsperado: "Efectivo esperado al corte",
  });
  assert.match(cabecera, /Efectivo esperado al corte/);
  assert.doesNotMatch(cabecera, /Efectivo esperado ahora/);
});

test("8. el resumen del cierre suma hora del corte y quién cierra", () => {
  const html = render(PanelResumen, {
    esperado: 127700,
    totalContado: 150450,
    hayContado: true,
    totalCambio: 30450,
    totalRetiro: 120000,
    diferencia: 22750,
    etiquetaEsperado: "Efectivo esperado al corte",
    filasExtra: createElement(FilasResumenCierre, { corteEn: CORTE, operadorNombre: "Marcela" }),
    textoConfirmar: "Confirmar cierre",
    textoGuardar: "Guardar y continuar después",
    enPestanaNueva: true,
  });
  assert.match(html, /Hora del corte/);
  assert.match(html, /Operador que cierra/);
  assert.match(html, /Marcela/);
  // El valor principal sigue siendo el mismo del retiro.
  assert.match(html, /Total a retirar/);
  assert.match(html, /Confirmar cierre/);
  assert.match(html, /Guardar y continuar después/);
});

test("9. sin conteo no se puede confirmar", () => {
  const html = render(PanelResumen, {
    esperado: 127700,
    hayContado: false,
    puedeConfirmar: false,
    textoConfirmar: "Confirmar cierre",
  });
  assert.match(html, /disabled/);
});

// ── Reutilización real, no copia ────────────────────────────────────────────

test("10. el cierre USA los paneles del retiro: no duplica su JSX", () => {
  const pagina = leerFuente("app/modulos/pos-ventas/cierres/[token]/page.jsx");
  for (const panel of ["PanelConteo", "PanelCambio", "PanelResumen", "PanelMovimientos", "ResumenCabecera"]) {
    assert.ok(
      new RegExp(`\\b${panel}\\b`).test(pagina),
      `la pantalla de cierre no usa ${panel}`
    );
  }
  assert.match(pagina, /from "@\/components\/caja\/PanelesRetiro"/);
  // Y no reimplementa las grillas.
  assert.doesNotMatch(sinComentarios(pagina), /grid-cols-\[3\.6rem/);
});

test("11. las dos pantallas comparten la MISMA geometría de grilla", () => {
  const conteo = render(PanelConteo, { desglose: CONTADO, onDesglose() {} });
  const cambio = render(PanelCambio, {
    desgloseContado: CONTADO,
    desgloseCambio: CAMBIO,
    onDesgloseCambio() {},
    totalCambio: 30450,
    ayuda: "Elegí los billetes y monedas que quedan disponibles para el siguiente operador. Todo lo demás se retira.",
  });
  assert.ok(conteo.includes(GRID_CONTEO));
  assert.ok(cambio.includes(GRID_CAMBIO));
  // Y el alineado vertical de escritorio sigue vigente en los dos bloques.
  for (const html of [conteo, cambio]) {
    assert.ok(html.includes(CABECERA_BLOQUE));
    assert.ok(html.includes(BLOQUE_ALINEADO));
  }
});

test("12. la ayuda del cambio en el cierre habla del SIGUIENTE OPERADOR", () => {
  const html = render(PanelCambio, {
    desgloseContado: CONTADO,
    desgloseCambio: CAMBIO,
    onDesgloseCambio() {},
    totalCambio: 30450,
    ayuda: "Elegí los billetes y monedas que quedan disponibles para el siguiente operador. Todo lo demás se retira.",
  });
  assert.match(html, /Billetes que quedan como cambio/);
  assert.match(html, /disponibles para el siguiente operador/);
});

test("13. el retiro NO cambió: sus textos por defecto siguen intactos", () => {
  // Los parámetros nuevos tienen el valor del retiro como default, así que la
  // pantalla aprobada no se movió ni una coma.
  const cambio = render(PanelCambio, {
    desgloseContado: CONTADO,
    desgloseCambio: CAMBIO,
    onDesgloseCambio() {},
    totalCambio: 30450,
  });
  assert.match(cambio, /quedan en el cajón/);

  const resumen = render(PanelResumen, { esperado: 100, hayContado: true, totalContado: 100 });
  assert.match(resumen, /Confirmar retiro/);
  assert.match(resumen, />Efectivo esperado</);

  const cabecera = render(ResumenCabecera, { esperado: 100 });
  assert.match(cabecera, /Efectivo esperado ahora/);
});

// ── Conteo: solo por denominaciones ─────────────────────────────────────────

test("14. no hay ningún campo de monto total ni de retiro manual", () => {
  const pagina = sinComentarios(leerFuente("app/modulos/pos-ventas/cierres/[token]/page.jsx"));
  assert.doesNotMatch(pagina, /montoContado|modoConteo|MODO_TOTAL/);
  // El retiro sale de una resta, no de un input.
  assert.match(pagina, /calcularRetiroDesdeCambio/);
  const conteo = render(PanelConteo, { desglose: {}, onDesglose() {} });
  assert.match(conteo, /El total se calcula automáticamente/);
});

// ── Lo monetario sale SOLO del corte congelado ──────────────────────────────

test("15. la pantalla del cierre no consulta el resumen vivo del turno", () => {
  const pagina = sinComentarios(leerFuente("app/modulos/pos-ventas/cierres/[token]/page.jsx"));
  assert.doesNotMatch(pagina, /turnos\/resumen/, "estaría releyendo el esperado actual");
  assert.doesNotMatch(pagina, /turnos\/actual/, "no debe depender del turno activo");
  // El esperado sale del corte.
  assert.match(pagina, /efectivoEsperadoCorte/);
});

test("16. la pantalla del cierre NO lee el operador activo", () => {
  const pagina = sinComentarios(leerFuente("app/modulos/pos-ventas/cierres/[token]/page.jsx"));
  // La cookie del operario es del navegador entero: cuando el relevo entra, esta
  // pestaña vería a otro. La autoría sale de lo grabado en el corte.
  assert.doesNotMatch(pagina, /useOperadorContext|useOperadorActivo/);
  assert.match(pagina, /operadorCierre/);
});

test("17. el endpoint del cierre congela los movimientos por ID y excluye los automáticos", () => {
  const ruta = leerFuente("app/api/pos-ventas/cierres/[token]/route.js");
  assert.match(ruta, /lte: cierre\.ultimoMovimientoId/, "la frontera tiene que ir por id");
  assert.match(ruta, /cajaMovimientoRetiroId/, "los retiros automáticos se excluyen por el vínculo");
  // Y no se recalcula nada monetario.
  assert.doesNotMatch(sinComentarios(ruta), /calcularEfectivoEsperado|calcularCorte/);
});

// ── Borrador por token ──────────────────────────────────────────────────────

function storageFalso() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test("18. el borrador se guarda y se recupera POR TOKEN", () => {
  const s = storageFalso();
  const token = "tok-de-prueba-1234567890";
  guardarBorradorCierre(
    s,
    armarBorradorCierre({ token, desgloseRetiroContado: CONTADO, observacion: "media jornada" })
  );
  const b = leerBorradorCierre(s, token);
  // Un solo desglose: el del retiro. El cambio ya se congeló en el corte.
  assert.equal(b.desgloseRetiroContado["20000"], 7);
  assert.equal(b.observacion, "media jornada");
  // La clave NO menciona al usuario: el cierre lo puede terminar otra persona.
  assert.ok(claveBorradorCierre(token).includes(token));
  assert.doesNotMatch(claveBorradorCierre(token), /\.u\d/);
});

test("19. el borrador NO guarda ninguna cifra del servidor", () => {
  const b = armarBorradorCierre({ token: "t", desgloseRetiroContado: CONTADO });
  for (const campo of [
    "efectivoEsperado", "efectivoEsperadoCorte", "diferencia", "totalRetiro",
    "retiroFinal", "efectivoRetiradoEsperado", "totalCambio",
  ]) {
    assert.ok(!(campo in b), `el borrador guarda ${campo} y no debería`);
  }
});

test("20. el borrador de otro token no se mezcla, y uno vencido se descarta", () => {
  const s = storageFalso();
  guardarBorradorCierre(s, armarBorradorCierre({ token: "aaa1234567890123456789", desgloseContado: CONTADO }));
  assert.equal(leerBorradorCierre(s, "bbb1234567890123456789"), null);

  const viejo = armarBorradorCierre({
    token: "ccc1234567890123456789",
    desgloseContado: CONTADO,
    guardadoEn: new Date(Date.now() - (VENCIMIENTO_HORAS_CIERRE + 1) * 3600 * 1000).toISOString(),
  });
  guardarBorradorCierre(s, viejo);
  assert.equal(leerBorradorCierre(s, viejo.token), null, "un borrador vencido no debe recuperarse");
});

test("21. el vencimiento del borrador del cierre es más largo que el del retiro", async () => {
  // Un cierre atrasado sigue siendo confirmable: descartarle el conteo a las 12
  // horas obligaría a contar de nuevo una caja ya contada.
  const { VENCIMIENTO_HORAS } = await import("@/lib/caja/borradorRetiro");
  assert.ok(VENCIMIENTO_HORAS_CIERRE > VENCIMIENTO_HORAS);
});

test("22. limpiar borradores viejos no toca los vigentes", () => {
  const s = storageFalso();
  guardarBorradorCierre(s, armarBorradorCierre({ token: "vigente-123456789012345", desgloseContado: CONTADO }));
  guardarBorradorCierre(s, armarBorradorCierre({
    token: "caduco-1234567890123456",
    desgloseContado: CONTADO,
    guardadoEn: new Date(Date.now() - 999 * 3600 * 1000).toISOString(),
  }));
  const borrados = limpiarBorradoresCierreViejos(s);
  assert.equal(borrados, 1);
  assert.ok(leerBorradorCierre(s, "vigente-123456789012345"));
  descartarBorradorCierre(s, "vigente-123456789012345");
  assert.equal(leerBorradorCierre(s, "vigente-123456789012345"), null);
});

// ── Aviso entre pestañas ────────────────────────────────────────────────────

function ventanaFalsa() {
  const oyentes = new Map();
  const store = storageFalso();
  return {
    localStorage: store,
    addEventListener: (t, f) => oyentes.set(t, [...(oyentes.get(t) || []), f]),
    removeEventListener: (t, f) => oyentes.set(t, (oyentes.get(t) || []).filter((x) => x !== f)),
    disparar: (t, e) => (oyentes.get(t) || []).forEach((f) => f(e)),
    // Sin BroadcastChannel a propósito: se ejercita la red de `storage`, que es
    // el camino que cubre las pestañas dormidas.
  };
}

test("23. el aviso del corte llega a la otra pestaña por storage", () => {
  const v = ventanaFalsa();
  const recibidos = [];
  const parar = escucharCorteIniciado((s) => recibidos.push(s), v);

  emitirCorteIniciado({ turnoId: 188, localId: 4 }, v);
  // Emitir escribe; en un navegador real el evento lo dispara el navegador.
  v.disparar("storage", { key: CLAVE_SENAL, newValue: v.localStorage.getItem(CLAVE_SENAL) });

  assert.equal(recibidos.length, 1);
  assert.equal(recibidos[0].turnoId, 188);
  parar();
});

test("24. el mismo aviso no se procesa dos veces", () => {
  const v = ventanaFalsa();
  const recibidos = [];
  const parar = escucharCorteIniciado((s) => recibidos.push(s), v);
  emitirCorteIniciado({ turnoId: 5, en: "2026-08-04T17:00:00.000Z" }, v);
  const valor = v.localStorage.getItem(CLAVE_SENAL);
  v.disparar("storage", { key: CLAVE_SENAL, newValue: valor });
  v.disparar("storage", { key: CLAVE_SENAL, newValue: valor });
  assert.equal(recibidos.length, 1, "los dos canales entregan lo mismo: hay que deduplicar");
  parar();
});

test("25. una pestaña dormida encuentra el aviso al volver", () => {
  const v = ventanaFalsa();
  emitirCorteIniciado({ turnoId: 77 }, v);
  // Nunca recibió el evento: lo lee de la marca escrita.
  const pendiente = leerSenalVigente(v);
  assert.equal(pendiente.turnoId, 77);
  limpiarSenal(v);
  assert.equal(leerSenalVigente(v), null);
});

test("26. un aviso viejo ya no describe nada", () => {
  const v = ventanaFalsa();
  emitirCorteIniciado({ turnoId: 9, en: new Date(Date.now() - 24 * 3600 * 1000).toISOString() }, v);
  assert.equal(leerSenalVigente(v), null);
});

test("27. el aviso NUNCA lleva el token", () => {
  const v = ventanaFalsa();
  emitirCorteIniciado({ turnoId: 3, localId: 1, token: "no-deberia-viajar" }, v);
  const crudo = v.localStorage.getItem(CLAVE_SENAL);
  assert.doesNotMatch(crudo, /no-deberia-viajar/);
  assert.doesNotMatch(crudo, /token/);
});

// ── La pestaña principal ────────────────────────────────────────────────────

test("28. el POS suelta el turno y cierra la sesión de operario al recibir el aviso", () => {
  const pos = sinComentarios(leerFuente("app/modulos/pos-ventas/page.jsx"));
  assert.match(pos, /escucharCorteIniciado/);
  assert.match(pos, /logoutOperador/);
  // Solo si es SU turno: un corte de otra caja no desloguea a nadie acá.
  assert.match(pos, /senal\.turnoId !== turnoActualRef\.current\?\.id/);
  // Y reacciona también al volver el foco, que es cuando useOperadorActivo
  // revalida.
  assert.match(pos, /visibilitychange/);
  assert.match(pos, /leerSenalVigente/);
});

test("29. el botón del POS ya NO abre el modal clásico", () => {
  const pos = leerFuente("app/modulos/pos-ventas/page.jsx");
  assert.doesNotMatch(sinComentarios(pos), /<ModalCierreTurno/);
  assert.doesNotMatch(sinComentarios(pos), /import ModalCierreTurno/);
  assert.match(pos, /abrirCierre\(turnoActual\.id\)/);
});

test("30. el cierre clásico sigue existiendo pero rechaza un turno con corte", () => {
  // No se borra todavía: queda como vía administrativa acotada.
  const clasico = leerFuente("app/api/pos-ventas/turnos/cerrar/route.js");
  assert.match(clasico, /cierreEnPreparacionEn/);
  assert.match(clasico, /cierre en preparación/i);
  assert.ok(readFileSync("components/pos-ventas/ModalCierreTurno.jsx", "utf8").length > 0);
});

// ── Bandeja de recuperación ─────────────────────────────────────────────────

test("31. la bandeja muestra operador, turno, hora, estado y el botón de continuar", () => {
  const html = render(FilaCierrePendiente, {
    item: {
      id: 1, token: "t", turnoId: 188, corteEn: CORTE,
      efectivoEsperadoCorte: 127700, operadorNombre: "Marcela", atrasado: false,
    },
  });
  assert.match(html, /#188/);
  assert.match(html, /Marcela/);
  assert.match(html, /127\.700/);
  assert.match(html, /Esperando conteo/);
  assert.match(html, /Continuar cierre/);
});

test("32. un pendiente atrasado se marca como tal", () => {
  const html = render(FilaCierrePendiente, {
    item: { id: 1, turnoId: 9, corteEn: CORTE, efectivoEsperadoCorte: 100, atrasado: true },
  });
  assert.match(html, /Atrasado/);
});

test("33. el token no viaja en ningún listado que no sea la bandeja", () => {
  const listar = leerFuente("app/api/pos-ventas/turnos/listar/route.js");
  assert.doesNotMatch(listar, /\btoken\b/);
  const resumen = leerFuente("app/api/pos-ventas/turnos/resumen/route.js");
  assert.doesNotMatch(resumen, /\btoken\b/);
  // La bandeja sí, porque sin él no se puede continuar el cierre.
  const pendientes = leerFuente("app/api/pos-ventas/cierres/pendientes/route.js");
  assert.match(pendientes, /token: f\.token/);
});

// ── Movimientos ─────────────────────────────────────────────────────────────

test("34. los movimientos del cierre se pintan con el panel del retiro", () => {
  const html = render(PanelMovimientos, {
    movimientos: {
      ingresos: 5000, retiros: 1200, neto: 3800, cantidad: 2,
      detalle: [
        { id: 1, tipo: "INGRESO", monto: 5000, motivo: "Aporte de cambio", fecha: "2026-08-04T13:10:00.000Z" },
        { id: 2, tipo: "RETIRO", monto: 1200, motivo: "Compra de bolsas", fecha: "2026-08-04T15:40:00.000Z" },
      ],
    },
  });
  assert.match(html, /Movimientos de caja/);
  assert.match(html, /Aporte de cambio/);
  assert.match(html, /Compra de bolsas/);
  assert.match(html, /No incluye los retiros de recaudación/);
  // Hora y tipo de cada uno.
  assert.match(html, /Ingreso/);
  assert.match(html, /Retiro/);
});

test("35. los agregados de movimientos se convierten de centavos a pesos", async () => {
  // DEFECTO ENCONTRADO EN LAS CAPTURAS: el detalle mostraba +$5.000 y −$1.200
  // mientras el resumen decía $0,00 en las tres líneas. Causa: se leían
  // `agregados.ingresos` y `agregados.retiros`, pero `desglosarMovimientos`
  // devuelve `ingresosCentavos` / `retirosCentavos` — toda la aritmética del
  // circuito va en centavos enteros. Los campos inexistentes daban undefined,
  // que el panel convierte a 0.
  const { desglosarMovimientos, desdeCentavos } = await import("@/lib/caja/efectivoEsperado");
  const d = desglosarMovimientos([
    { tipo: "INGRESO", monto: 5000 },
    { tipo: "RETIRO", monto: 1200 },
    { tipo: "INGRESO", monto: 2500 },
  ]);
  assert.equal(d.ingresos, undefined, "el contrato devuelve centavos, no pesos");
  assert.equal(desdeCentavos(d.ingresosCentavos), 7500);
  assert.equal(desdeCentavos(d.retirosCentavos), 1200);

  const ruta = leerFuente("app/api/pos-ventas/cierres/[token]/route.js");
  assert.match(ruta, /desdeCentavos\(agregados\.ingresosCentavos\)/);
  assert.match(ruta, /desdeCentavos\(agregados\.retirosCentavos\)/);

  // Y el panel los pinta.
  const html = render(PanelMovimientos, {
    movimientos: { ingresos: 7500, retiros: 1200, neto: 6300, cantidad: 3, detalle: [] },
  });
  assert.match(html, /7\.500/);
  assert.match(html, /1\.200/);
  assert.match(html, /6\.300/);
});

test("36. la hora del cierre va en 24 h y el aviso no queda con punto doble", () => {
  // Sin `hour12: false` el ICU devolvía "03:18 p. m." y el aviso terminaba en
  // "…a las 03:18 p. m.." — la plantilla agrega su propio punto.
  const t = "2026-08-04T18:18:00.000Z";
  const h = hora(t);
  assert.doesNotMatch(h, /m\./, `la hora salió en 12 h: "${h}"`);
  assert.match(h, /^\d{2}:\d{2}$/);
  assert.doesNotMatch(avisoDespuesDelCorte(h), /\.\./);
});

test("37. el título de la pantalla es el aprobado", () => {
  assert.equal(TITULO_CIERRE, "Cierre de caja");
  const pagina = leerFuente("app/modulos/pos-ventas/cierres/[token]/page.jsx");
  assert.match(pagina, /TITULO_CIERRE/);
});
