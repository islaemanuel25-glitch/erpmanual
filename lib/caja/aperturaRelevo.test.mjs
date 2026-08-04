// Apertura con relevo: comparación por total Y por denominación, borrador de
// apertura, y RENDER REAL de la pantalla.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/aperturaRelevo.test.mjs
//
// La comparación por composición es lo que esta subetapa agrega al motor. El
// resto —reserva atómica, doble consumo, transacción— ya lo cubre la batería de
// integración de la subetapa B.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import {
  RECEPCION,
  compararComposicion,
  evaluarRecepcionCambio,
  evaluarAperturaSinCambio,
  mensajeRecepcion,
  accionRecepcion,
  avisoApertura,
  MENSAJE_COMPOSICION_DISTINTA,
  esReservaPropia,
  whereReservaPropia,
} from "@/lib/caja/cierreRelevo";
import {
  armarBorradorApertura,
  guardarBorradorApertura,
  leerBorradorApertura,
  descartarBorradorApertura,
  claveBorradorApertura,
  limpiarBorradoresAperturaViejos,
  VENCIMIENTO_HORAS_APERTURA,
} from "@/lib/caja/borradorApertura";
import {
  TarjetaCambio,
  DesgloseResumido,
  PanelCambioEsperado,
  PanelComparacion,
  PanelSinCambio,
  TablaDiferenciasComposicion,
  minutosRestantes,
  AYUDA_CONTEO_APERTURA,
  AYUDA_SIN_CAMBIO,
} from "@/components/caja/PanelesApertura";
import { CLAVE_MONEDAS } from "@/lib/caja/conteoBilletes";

const render = (Comp, props) => renderToStaticMarkup(createElement(Comp, props));
const fuente = (f) => readFileSync(f, "utf8");
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{?\s*\/\/.*$/gm, "");

// El caso del enunciado: mismo total, distinta composición.
const DIEZ_DE_MIL = { 1000: 10 };
const CINCO_DE_DOS_MIL = { 2000: 5 };

// ── Comparación por denominación ────────────────────────────────────────────

test("1. mismo total y mismos billetes: coincide", () => {
  const c = compararComposicion({ desgloseEsperado: DIEZ_DE_MIL, desgloseRecibido: { 1000: 10 } });
  assert.equal(c.coincide, true);
  assert.equal(c.filas.length, 0);
});

test("2. mismo total, distinta composición: NO coincide y dice cuáles", () => {
  // 10 × $1.000 y 5 × $2.000 suman los mismos $10.000, pero con los de $2.000 no
  // se puede dar vuelto de $1.000.
  const c = compararComposicion({ desgloseEsperado: DIEZ_DE_MIL, desgloseRecibido: CINCO_DE_DOS_MIL });
  assert.equal(c.coincide, false);
  const claves = c.filas.map((f) => f.clave).sort();
  assert.deepEqual(claves, ["1000", "2000"]);
  const mil = c.filas.find((f) => f.clave === "1000");
  assert.equal(mil.esperadas, 10);
  assert.equal(mil.recibidas, 0);
  assert.equal(mil.delta, -10);
});

test("3. las monedas se comparan como IMPORTE, no como cantidad", () => {
  const igual = compararComposicion({
    desgloseEsperado: { [CLAVE_MONEDAS]: 450.5 },
    desgloseRecibido: { [CLAVE_MONEDAS]: 450.5 },
  });
  assert.equal(igual.coincide, true);

  const distinto = compararComposicion({
    desgloseEsperado: { [CLAVE_MONEDAS]: 450 },
    desgloseRecibido: { [CLAVE_MONEDAS]: 300 },
  });
  assert.equal(distinto.coincide, false);
  assert.equal(distinto.filas[0].delta, -150);
});

// ── Las cuatro clases de recepción ──────────────────────────────────────────

test("4. COINCIDE: mismo total y mismos billetes, sin pedir nada", () => {
  const r = evaluarRecepcionCambio({
    totalEsperado: 10000, totalRecibido: 10000,
    desgloseEsperado: DIEZ_DE_MIL, desgloseRecibido: { 1000: 10 },
  });
  assert.equal(r.valido, true);
  assert.equal(r.clase, RECEPCION.COINCIDE);
  assert.equal(r.montoInicial, 10000);
  assert.equal(mensajeRecepcion(r.clase), "El cambio recibido coincide con el cierre anterior.");
  assert.equal(accionRecepcion(r.clase), "Confirmar cambio e iniciar turno");
});

test("5. COINCIDE_TOTAL sin confirmar: se frena y explica", () => {
  const r = evaluarRecepcionCambio({
    totalEsperado: 10000, totalRecibido: 10000,
    desgloseEsperado: DIEZ_DE_MIL, desgloseRecibido: CINCO_DE_DOS_MIL,
  });
  assert.equal(r.valido, false);
  assert.equal(r.clase, RECEPCION.COINCIDE_TOTAL);
  assert.equal(r.necesitaConfirmarComposicion, true);
  assert.equal(r.error, MENSAJE_COMPOSICION_DISTINTA);
  assert.equal(r.diferencia, 0, "no hay diferencia de plata: la hay de billetes");
});

test("6. COINCIDE_TOTAL confirmado: abre igual y el monto es lo contado", () => {
  const r = evaluarRecepcionCambio({
    totalEsperado: 10000, totalRecibido: 10000,
    desgloseEsperado: DIEZ_DE_MIL, desgloseRecibido: CINCO_DE_DOS_MIL,
    confirmaComposicion: true,
  });
  assert.equal(r.valido, true);
  assert.equal(r.clase, RECEPCION.COINCIDE_TOTAL);
  assert.equal(r.montoInicial, 10000);
  // La diferencia de composición queda en el resultado para poder registrarla.
  assert.equal(r.composicion.coincide, false);
  assert.equal(r.composicion.filas.length, 2);
  assert.match(mensajeRecepcion(r.clase), /cambió la composición/);
});

test("7. un faltante manda sobre la composición", () => {
  // Con menos plata, lo que importa es el faltante: pedir además que confirme la
  // composición sería pedir dos cosas para el mismo problema.
  const r = evaluarRecepcionCambio({
    totalEsperado: 10000, totalRecibido: 8000,
    desgloseEsperado: DIEZ_DE_MIL, desgloseRecibido: { 2000: 4 },
    motivo: "faltaban dos billetes",
  });
  assert.equal(r.valido, true);
  assert.equal(r.clase, RECEPCION.FALTANTE);
  assert.equal(r.diferencia, -2000);
  assert.equal(r.montoInicial, 8000);
  assert.equal(accionRecepcion(r.clase), "Confirmar faltante e iniciar turno");
});

test("8. faltante y sobrante exigen motivo", () => {
  const falta = evaluarRecepcionCambio({ totalEsperado: 10000, totalRecibido: 8000 });
  assert.equal(falta.valido, false);
  assert.match(falta.error, /Faltan/);

  const sobra = evaluarRecepcionCambio({ totalEsperado: 10000, totalRecibido: 12000 });
  assert.equal(sobra.valido, false);
  assert.match(sobra.error, /Sobran/);
  assert.equal(accionRecepcion(sobra.clase), "Confirmar sobrante e iniciar turno");

  const conMotivo = evaluarRecepcionCambio({
    totalEsperado: 10000, totalRecibido: 12000, motivo: "había uno de más",
  });
  assert.equal(conMotivo.valido, true);
  assert.equal(conMotivo.montoInicial, 12000);
});

test("9. sin desgloses se compara solo por total, como en la subetapa B", () => {
  const r = evaluarRecepcionCambio({ totalEsperado: 10000, totalRecibido: 10000 });
  assert.equal(r.valido, true);
  assert.equal(r.clase, RECEPCION.COINCIDE);
  assert.equal(r.composicion, null);
});

test("10. el monto inicial es SIEMPRE lo contado, nunca lo declarado", () => {
  for (const [esperado, recibido, motivo] of [
    [30000, 28000, "faltaba"],
    [30000, 31500, "sobraba"],
    [30000, 30000, null],
  ]) {
    const r = evaluarRecepcionCambio({ totalEsperado: esperado, totalRecibido: recibido, motivo });
    assert.equal(r.montoInicial, recibido, `con esperado ${esperado} y recibido ${recibido}`);
  }
});

// ── Apertura sin cambio ─────────────────────────────────────────────────────

test("11. abrir sin cambio exige motivo y toma el total contado", () => {
  assert.equal(evaluarAperturaSinCambio({ totalContado: 20000 }).valido, false);
  assert.equal(evaluarAperturaSinCambio({ totalContado: 20000, motivo: "  " }).valido, false);
  const r = evaluarAperturaSinCambio({ totalContado: 20000, motivo: "traje del depósito" });
  assert.equal(r.valido, true);
  assert.equal(r.montoInicial, 20000);
});

// ── Avisos ──────────────────────────────────────────────────────────────────

test("12. el aviso de apertura nombra a quién dejó el cambio", () => {
  assert.match(
    avisoApertura({ clase: RECEPCION.COINCIDE, montoInicial: 30000, quien: "María Gómez" }),
    /Turno abierto con \$30\.000,00 recibidos del cierre de María Gómez\./
  );
  assert.match(
    avisoApertura({ clase: RECEPCION.FALTANTE, diferencia: -10000 }),
    /faltante inicial de \$10\.000,00\. La diferencia quedó registrada\./
  );
  assert.match(
    avisoApertura({ clase: RECEPCION.SOBRANTE, diferencia: 500 }),
    /sobrante inicial de \$500,00/
  );
  assert.match(
    avisoApertura({ clase: RECEPCION.COINCIDE_TOTAL, montoInicial: 30000, quien: "Ana" }),
    /composición de billetes cambió/
  );
});

// ── Borrador de apertura ────────────────────────────────────────────────────

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

const IDENT = { cambioId: 7, usuarioId: 3, operadorId: 11 };

test("13. el borrador se guarda y se recupera por cambio + usuario + operario", () => {
  const s = storageFalso();
  guardarBorradorApertura(s, armarBorradorApertura({ ...IDENT, desgloseRecibido: { 1000: 10 }, motivo: "ok" }));
  const b = leerBorradorApertura(s, IDENT);
  assert.equal(b.desgloseRecibido["1000"], 10);
  assert.equal(b.motivo, "ok");
  assert.ok(claveBorradorApertura(IDENT).includes("c7"));
  assert.ok(claveBorradorApertura(IDENT).includes("u3"));
  assert.ok(claveBorradorApertura(IDENT).includes("o11"));
});

test("14. el conteo de una persona NO le aparece a otra sobre el mismo sobre", () => {
  // Si la reserva vence y otro operador toma el mismo cambio, el conteo del
  // primero no puede aparecerle: estaría firmando algo que no contó.
  const s = storageFalso();
  guardarBorradorApertura(s, armarBorradorApertura({ ...IDENT, desgloseRecibido: { 1000: 10 } }));
  assert.equal(leerBorradorApertura(s, { ...IDENT, usuarioId: 99 }), null);
  assert.equal(leerBorradorApertura(s, { ...IDENT, operadorId: 99 }), null);
  assert.equal(leerBorradorApertura(s, { ...IDENT, cambioId: 99 }), null);
});

test("15. el borrador NO guarda el total: es la suma de las filas", () => {
  const b = armarBorradorApertura({ ...IDENT, desgloseRecibido: { 1000: 10 } });
  for (const campo of ["total", "totalRecibido", "diferencia", "montoInicial"]) {
    assert.ok(!(campo in b), `el borrador guarda ${campo} y no debería`);
  }
});

test("16. un borrador vencido se descarta, y descartar funciona", () => {
  const s = storageFalso();
  guardarBorradorApertura(
    s,
    armarBorradorApertura({
      ...IDENT,
      desgloseRecibido: { 1000: 1 },
      guardadoEn: new Date(Date.now() - (VENCIMIENTO_HORAS_APERTURA + 1) * 3600 * 1000).toISOString(),
    })
  );
  assert.equal(leerBorradorApertura(s, IDENT), null);

  guardarBorradorApertura(s, armarBorradorApertura({ ...IDENT, desgloseRecibido: { 1000: 1 } }));
  assert.ok(leerBorradorApertura(s, IDENT));
  descartarBorradorApertura(s, IDENT);
  assert.equal(leerBorradorApertura(s, IDENT), null);
});

test("17. el barrido limpia los vencidos y deja los vivos", () => {
  const s = storageFalso();
  guardarBorradorApertura(s, armarBorradorApertura({ ...IDENT, desgloseRecibido: { 500: 2 } }));
  guardarBorradorApertura(
    s,
    armarBorradorApertura({
      cambioId: 8, usuarioId: 3, operadorId: 11, desgloseRecibido: { 500: 2 },
      guardadoEn: new Date(Date.now() - 999 * 3600 * 1000).toISOString(),
    })
  );
  assert.equal(limpiarBorradoresAperturaViejos(s), 1);
  assert.ok(leerBorradorApertura(s, IDENT));
});

test("18. el borrador de apertura vence antes que el del cierre", async () => {
  // La reserva es corta; un borrador que la sobreviviera describiría un sobre
  // que ya tomó otro.
  const { VENCIMIENTO_HORAS_CIERRE } = await import("@/lib/caja/borradorCierre");
  assert.ok(VENCIMIENTO_HORAS_APERTURA < VENCIMIENTO_HORAS_CIERRE);
});

// ── Render de la pantalla ───────────────────────────────────────────────────

const SOBRE = {
  id: 5,
  turnoOrigenId: 188,
  total: 30000,
  desglose: { 1000: 10, 500: 20, 200: 50 },
  dejadoEn: "2026-08-04T18:22:00.000Z",
  operadorOrigen: "María Gómez",
  estado: "DISPONIBLE",
  observacion: null,
};

test("19. la tarjeta muestra operador, turno, hora, total y desglose resumido", () => {
  const html = render(TarjetaCambio, { item: SOBRE });
  assert.match(html, /María Gómez/);
  assert.match(html, /Turno #188/);
  assert.match(html, /cerrado \d{2}:\d{2}/);
  assert.match(html, /30\.000/);
  assert.match(html, /10 × \$1\.000/);
  assert.match(html, /20 × \$500/);
  assert.match(html, /50 × \$200/);
  assert.match(html, /Tomar este cambio/);
});

test("20. la tarjeta propia ofrece continuar y dice cuánto resta", () => {
  const enQuince = new Date(Date.now() + 15 * 60000).toISOString();
  const html = render(TarjetaCambio, {
    item: { ...SOBRE, esMio: true, estado: "RESERVADO", reservaVenceEn: enQuince },
  });
  assert.match(html, /Continuar apertura/);
  assert.doesNotMatch(html, /Tomar este cambio/);
  assert.match(html, /Reservado por vos/);
  assert.match(html, /quedan 1[45] minutos/);
});

test("21. el desglose resumido no inventa filas vacías", () => {
  const html = render(DesgloseResumido, { desglose: { 1000: 3, 500: 0 } });
  assert.match(html, /3 × \$1\.000/);
  assert.doesNotMatch(html, /\$500/);
  assert.match(render(DesgloseResumido, { desglose: {} }), /Sin desglose declarado/);
});

test("22. las monedas se muestran como importe, no como cantidad", () => {
  const html = render(DesgloseResumido, { desglose: { [CLAVE_MONEDAS]: 450.5 } });
  assert.match(html, /450,50 en monedas/);
});

test("23. el panel del cambio esperado muestra lo declarado por quien cerró", () => {
  const html = render(PanelCambioEsperado, { cambio: SOBRE });
  assert.match(html, /Cambio que dejó el turno anterior/);
  assert.match(html, /María Gómez/);
  assert.match(html, /Desglose declarado/);
  assert.match(html, /10 × \$1\.000/);
});

test("24. la comparación exige tilde cuando el total coincide y la composición no", () => {
  const html = render(PanelComparacion, {
    totalEsperado: 10000,
    totalRecibido: 10000,
    hayConteo: true,
    diferencia: 0,
    clase: RECEPCION.COINCIDE_TOTAL,
    mensaje: mensajeRecepcion(RECEPCION.COINCIDE_TOTAL),
    diferenciasComposicion: compararComposicion({
      desgloseEsperado: DIEZ_DE_MIL,
      desgloseRecibido: CINCO_DE_DOS_MIL,
    }).filas,
  });
  assert.match(html, /cambió la composición de billetes/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /Diferencias por denominación/);
  assert.match(html, /Verifiqué que el importe es correcto/);
});

test("25. la comparación pide motivo en faltante y sobrante, y no en coincidencia", () => {
  const falta = render(PanelComparacion, {
    totalEsperado: 30000, totalRecibido: 28000, hayConteo: true, diferencia: -2000,
    clase: RECEPCION.FALTANTE, mensaje: mensajeRecepcion(RECEPCION.FALTANTE, -2000),
    accion: accionRecepcion(RECEPCION.FALTANTE),
  });
  assert.match(falta, /¿Por qué falta\?/);
  assert.match(falta, /Confirmar faltante e iniciar turno/);
  assert.match(falta, /Falta \$2\.000,00/);

  const sobra = render(PanelComparacion, {
    totalEsperado: 30000, totalRecibido: 31000, hayConteo: true, diferencia: 1000,
    clase: RECEPCION.SOBRANTE, mensaje: mensajeRecepcion(RECEPCION.SOBRANTE, 1000),
    accion: accionRecepcion(RECEPCION.SOBRANTE),
  });
  assert.match(sobra, /¿Por qué sobra\?/);
  assert.match(sobra, /Confirmar sobrante e iniciar turno/);

  const igual = render(PanelComparacion, {
    totalEsperado: 30000, totalRecibido: 30000, hayConteo: true, diferencia: 0,
    clase: RECEPCION.COINCIDE, mensaje: mensajeRecepcion(RECEPCION.COINCIDE),
  });
  assert.doesNotMatch(igual, /¿Por qué/);
  assert.doesNotMatch(igual, /type="checkbox"/);
  assert.match(igual, /coincide con el cierre anterior/);
});

test("26. la comparación deja claro que se abre con lo CONTADO", () => {
  const html = render(PanelComparacion, {
    totalEsperado: 30000, totalRecibido: 28000, hayConteo: true, diferencia: -2000,
    clase: RECEPCION.FALTANTE, motivo: "faltaba",
  });
  assert.match(html, /Con esto abre la caja/);
  assert.match(html, /28\.000/);
  assert.match(html, /no el declarado/);
});

test("27. la tabla de diferencias por denominación dice esperadas y recibidas", () => {
  const html = render(TablaDiferenciasComposicion, {
    filas: compararComposicion({ desgloseEsperado: DIEZ_DE_MIL, desgloseRecibido: CINCO_DE_DOS_MIL }).filas,
  });
  assert.match(html, /\$1\.000/);
  assert.match(html, /\$2\.000/);
  assert.match(html, /esperadas 10/);
  assert.match(html, /recibidas/);
});

test("28. abrir sin cambio avisa si quedan sobres sin tomar", () => {
  const html = render(PanelSinCambio, { totalContado: 20000, hayConteo: true, motivo: "x", hayPendientes: 2 });
  assert.ok(html.includes(AYUDA_SIN_CAMBIO));
  assert.match(html, /Hay 2 cambios sin tomar/);
  assert.match(html, /Origen del cambio/);
});

test("29. minutosRestantes redondea hacia arriba y detecta el vencimiento", () => {
  const base = Date.parse("2026-08-04T12:00:00.000Z");
  assert.equal(minutosRestantes("2026-08-04T12:10:30.000Z", base), 11);
  assert.ok(minutosRestantes("2026-08-04T11:50:00.000Z", base) < 0);
  assert.equal(minutosRestantes(null), null);
});

// ── Contratos de las pantallas ──────────────────────────────────────────────

test("30. mirar el detalle NO reserva", () => {
  // El endpoint de detalle es de solo lectura. Si escribiera, abrir la pantalla
  // para ver dejaría el sobre trabado para todos.
  const detalle = fuente("app/api/pos-ventas/cambios-pendientes/[id]/route.js");
  const codigo = sinComentarios(detalle);
  assert.doesNotMatch(codigo, /\.update\(|\.updateMany\(|\.create\(/);
  assert.match(codigo, /findFirst/);

  // Y la lista tampoco reserva. Se comprueba que no haya NINGUNA escritura
  // inline: lo único que escribe es `liberarReservasVencidas`, que devuelve a
  // DISPONIBLE lo que ya venció, y `marcarCortesVencidos`, que solo etiqueta.
  // Nótese que la lista SÍ menciona RESERVADO en su `where` —para mostrar la
  // reserva propia— y eso es una lectura, no una escritura: buscar el nombre del
  // estado en el archivo daría un falso positivo.
  const lista = sinComentarios(fuente("app/api/pos-ventas/cambios-pendientes/listar/route.js"));
  assert.doesNotMatch(lista, /prisma\.cambioPendiente\.(update|updateMany|create)\(/);
  assert.match(lista, /prisma\.cambioPendiente\.findMany/);
});

test("31. la reserva ocurre solo al pulsar 'Tomar este cambio'", () => {
  const pagina = sinComentarios(fuente("app/modulos/pos-ventas/aperturas/page.jsx"));
  // Un solo lugar llama a reservar, y es el handler del botón.
  const llamadas = pagina.match(/cambios-pendientes\/reservar/g) || [];
  assert.equal(llamadas.length, 1);
  assert.match(pagina, /onTomar=\{tomar\}/);
});

test("32. la lista oculta reservas ajenas, recibidos y cancelados", () => {
  const lista = fuente("app/api/pos-ventas/cambios-pendientes/listar/route.js");
  // "Ajena" se decide por usuario Y operario: en una sola computadora el usuario
  // es el dispositivo y lo comparten todos los operarios.
  assert.match(lista, /whereReservaPropia\(\{ usuarioId: ctx\.session\.id, operadorId \}\)/);
  assert.match(lista, /esMio/);
  assert.match(lista, /miReserva/);
  assert.match(lista, /getOperadorActivo\(req\)/);
});

test("33. no se puede reservar un segundo cambio con uno propio vivo", () => {
  const reservar = fuente("app/api/pos-ventas/cambios-pendientes/reservar/route.js");
  assert.match(reservar, /UNA RESERVA VIVA POR PERSONA/);
  assert.match(reservar, /reservadoPorUsuarioId: session\.id/);
  assert.match(reservar, /id: \{ not: cambioId \}/);
});

test("34. la apertura no acepta ningún monto total manual", () => {
  for (const f of [
    "app/modulos/pos-ventas/aperturas/[cambioId]/page.jsx",
    "app/modulos/pos-ventas/aperturas/sin-cambio/page.jsx",
  ]) {
    const p = sinComentarios(fuente(f));
    assert.doesNotMatch(p, /montoInicial:\s*Number\(|montoManual|validarFondoManual/);
    assert.match(p, /TablaDenominaciones/);
    assert.match(p, /totalDesglose/);
  }
});

test("35. la pantalla usa la MISMA evaluación que el servidor", () => {
  // Si la pantalla tuviera su propia regla, el operador vería un mensaje y
  // recibiría un error distinto al confirmar.
  const p = fuente("app/modulos/pos-ventas/aperturas/[cambioId]/page.jsx");
  assert.match(p, /evaluarRecepcionCambio/);
  assert.match(p, /from "@\/lib\/caja\/cierreRelevo"/);
});

test("36. el POS ya no abre el modal clásico de apertura", () => {
  const pos = fuente("app/modulos/pos-ventas/page.jsx");
  assert.doesNotMatch(sinComentarios(pos), /<ModalAperturaTurno/);
  assert.doesNotMatch(sinComentarios(pos), /import ModalAperturaTurno/);
  assert.match(pos, /modulos\/pos-ventas\/aperturas/);
  // Pero el componente y el endpoint siguen existiendo.
  assert.ok(fuente("components/pos-ventas/ModalAperturaTurno.jsx").length > 0);
  assert.ok(fuente("app/api/pos-ventas/turnos/abrir/route.js").length > 0);
});

test("37. la apertura clásica NO puede consumir un cambio pendiente", () => {
  const clasico = fuente("app/api/pos-ventas/turnos/abrir/route.js");
  assert.doesNotMatch(clasico, /cambioPendiente|CambioPendiente/);
  assert.doesNotMatch(clasico, /turnoDestinoId/);
});

test("38. la apertura reutiliza la geometría del retiro y del cierre", () => {
  const p = fuente("app/modulos/pos-ventas/aperturas/[cambioId]/page.jsx");
  assert.match(p, /geometriaGrilla/);
  assert.match(p, /BLOQUE_ALINEADO/);
  assert.match(p, /CABECERA_BLOQUE/);
  // Y no reimplementa las columnas.
  assert.doesNotMatch(sinComentarios(p), /grid-cols-\[3\.6rem/);
});

test("39. la ayuda del conteo de apertura es la aprobada", () => {
  assert.equal(
    AYUDA_CONTEO_APERTURA,
    "Contá los billetes y monedas que recibiste. El total se calcula automáticamente."
  );
  assert.equal(AYUDA_SIN_CAMBIO, "Indicá de dónde proviene el cambio con el que abrís la caja.");
});

// ── LA IDENTIDAD EN UNA SOLA COMPUTADORA ────────────────────────────────────
//
// DEFECTO ENCONTRADO EN LA VALIDACIÓN DE UNA PC: la propiedad de una reserva se
// decidía solo por `reservadoPorUsuarioId`. En el escenario real —una máquina en
// el mostrador— ese id es el DISPOSITIVO y lo comparten todos los operarios, así
// que María veía la reserva de Juan como propia y podía consumirla. Reproducido:
// María se logueó después de que Juan reservara y abrió turno con su cambio.

test("41. la reserva es propia solo si coinciden usuario Y operario", () => {
  const deJuan = { reservadoPorUsuarioId: 1, reservadoPorOperadorId: 2 };
  assert.equal(esReservaPropia(deJuan, { usuarioId: 1, operadorId: 2 }), true);
  // Mismo dispositivo, otra persona: NO es suya.
  assert.equal(esReservaPropia(deJuan, { usuarioId: 1, operadorId: 1 }), false);
  // Otro dispositivo: tampoco.
  assert.equal(esReservaPropia(deJuan, { usuarioId: 9, operadorId: 2 }), false);
  // Sin operario en la sesión: no puede reclamar una reserva que sí tiene uno.
  assert.equal(esReservaPropia(deJuan, { usuarioId: 1, operadorId: null }), false);
});

test("42. en un local SIN operarios, el usuario sigue siendo toda la identidad", () => {
  // `reservadoPorOperadorId` en null significa "este local no exige operario":
  // ahí el usuario es la identidad más fina que existe y alcanza.
  const sinOperario = { reservadoPorUsuarioId: 1, reservadoPorOperadorId: null };
  assert.equal(esReservaPropia(sinOperario, { usuarioId: 1, operadorId: null }), true);
  assert.equal(esReservaPropia(sinOperario, { usuarioId: 1, operadorId: 7 }), true);
  assert.equal(esReservaPropia(sinOperario, { usuarioId: 2, operadorId: null }), false);
});

test("43. una reserva sin dueño no es de nadie", () => {
  assert.equal(esReservaPropia({ reservadoPorUsuarioId: null }, { usuarioId: 1 }), false);
  assert.equal(esReservaPropia(null, { usuarioId: 1 }), false);
});

test("44. la condición Prisma dice lo mismo que la función pura", () => {
  const w = whereReservaPropia({ usuarioId: 1, operadorId: 2 });
  assert.equal(w.reservadoPorUsuarioId, 1);
  assert.deepEqual(w.OR, [{ reservadoPorOperadorId: null }, { reservadoPorOperadorId: 2 }]);
});

test("45. los cuatro consumidores usan la identidad completa, no solo el usuario", () => {
  // Si alguno vuelve a comparar solo por usuario, en una sola computadora los
  // operarios se pisan las reservas.
  const archivos = {
    "app/api/pos-ventas/cambios-pendientes/listar/route.js": ["esReservaPropia", "whereReservaPropia"],
    "app/api/pos-ventas/cambios-pendientes/reservar/route.js": ["whereReservaPropia"],
    "app/api/pos-ventas/cambios-pendientes/liberar/route.js": ["esReservaPropia"],
    "app/api/pos-ventas/turnos/abrir-con-cambio/route.js": ["esReservaPropia"],
  };
  for (const [archivo, esperados] of Object.entries(archivos)) {
    const codigo = sinComentarios(fuente(archivo));
    for (const fn of esperados) {
      assert.match(codigo, new RegExp(`\\b${fn}\\(`), `${archivo} no usa ${fn}`);
    }
    // Y ninguno compara el usuario a mano contra la fila.
    assert.doesNotMatch(
      codigo,
      /reservadoPorUsuarioId\s*[=!]==\s*(session\.id|ctx\.session\.id)/,
      `${archivo} sigue comparando solo por usuario`
    );
  }
});

test("40. guardar el borrador no llama a ningún endpoint de creación", () => {
  const p = fuente("app/modulos/pos-ventas/aperturas/[cambioId]/page.jsx");
  const guardar = p.slice(p.indexOf("const guardarSolo"), p.indexOf("const soltar"));
  assert.doesNotMatch(guardar, /fetch\(/, "guardar borrador no debe tocar el servidor");
  assert.match(guardar, /persistir\(\)/);
});
