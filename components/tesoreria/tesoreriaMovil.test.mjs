// CANDADO: LA PANTALLA MÓVIL DE TESORERÍA.
//
//   node --import ./scripts/alias-loader.mjs --test components/tesoreria/tesoreriaMovil.test.mjs
//
// Los números entre corchetes son los de la lista de la tanda (1 a 47).
//
// ── DE DÓNDE SALEN LOS DATOS ─────────────────────────────────────────────
//
// No hay fixtures escritos a mano con la forma "razonable" de la respuesta: cada
// escenario se arma con las MISMAS funciones que usa la ruta —
// `armarLecturaTesoreria` sobre filas con la forma de las consultas,
// `formatoDeVerificacion` sobre filas con la forma de `SELECT_VERIFICACION`, y
// `descripcionFinanciera` para el período—. Y `lecturaReal.fixture.json` es un
// volcado del endpoint de verdad contra PostgreSQL: el candado [F0] compara su
// forma con la de los escenarios, así que si la ruta cambia la forma, esto se
// pone rojo antes de que la pantalla dibuje un campo que ya no viene.
//
// ── CÓMO SE PRUEBA LA INTERACCIÓN ────────────────────────────────────────
//
// El repo no tiene DOM de prueba (ver `cuentaFinancieraDeUnLocal.render.test.mjs`).
// Se renderiza lo presentacional con `renderToStaticMarkup`, se ejercen las
// funciones puras que deciden (`claveParaEnvio`, `cuerpoDeVerificacion`,
// `lecturaDelGrupo`, `consultaDeTesoreria`), se llama a las acciones con un
// `fetch` de mentira y se lee la fuente —sin comentarios— de lo que solo existe
// con React montado (el guardia del doble toque, el recargar después del éxito).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import PantallaTesoreria from "@/components/tesoreria/PantallaTesoreria.jsx";
import { PasoContar, PasoConfirmar } from "@/components/tesoreria/HojaVerificarEfectivo.jsx";
import { ContenidoAnular } from "@/components/tesoreria/HojaAnularVerificacion.jsx";
import { enviarAnulacion, enviarVerificacion, ERROR_SIN_RESPUESTA, URL_VERIFICACIONES } from "@/components/tesoreria/accionesTesoreria.js";
import { armarLecturaTesoreria } from "@/lib/tesoreria/lecturaTesoreria.js";
import { formatoDeVerificacion } from "@/lib/tesoreria/verificacionEfectivoLectura.js";
import { leerPedidoDeVerificacion } from "@/lib/tesoreria/verificacionEfectivo.js";
import { CLASE_MOVIMIENTO } from "@/lib/finanzas/movimientosDeCaja.js";
import { descripcionFinanciera } from "@/lib/finanzas/periodoFinanciero";
import { parseContextoTesoreria, consultaDeTesoreria, urlDeLocalTesoreria } from "@/lib/tesoreria/contextoTesoreria";
import {
  ESTADO_TESORERIA,
  claveParaEnvio,
  cuerpoDeVerificacion,
  leerImporteContado,
  lecturaDelGrupo,
  nuevaClaveDeVerificacion,
} from "@/lib/tesoreria/pantallaTesoreria";

const real = JSON.parse(readFileSync("components/tesoreria/lecturaReal.fixture.json", "utf8"));
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const fuente = (ruta) => sinComentarios(readFileSync(ruta, "utf8"));
const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const nada = () => {};

// ── LOS ESCENARIOS, CON LA FORMA DE LAS CONSULTAS DEL LECTOR ──────────────

const LOCAL = 7;
const HOY = "2026-10-04";
const MAÑANA = new Date("2026-10-04T11:40:00-03:00");
const TARDE = new Date("2026-10-04T14:10:00-03:00");

const caja = (id, extra = {}) => ({
  id,
  localId: LOCAL,
  apertura: new Date("2026-10-04T08:02:00-03:00"),
  cierre: new Date("2026-10-04T14:10:00-03:00"),
  cierreEnPreparacionEn: new Date("2026-10-04T14:05:00-03:00"),
  anuladoEn: null,
  operadorId: 100 + id,
  operadorNombre: ["", "Ana", "Pedro", "Carla"][id] || `Op ${id}`,
  vendedorId: 1,
  vendedorNombre: "Cuenta",
  diferenciaEfectivo: 0,
  ...extra,
});
const mov = (id, turnoId, clase, monto, extra = {}) => ({
  id, turnoId, tipo: "RETIRO", monto, motivo: null, createdAt: TARDE, clase, ...extra,
});
let nVenta = 0;
const venta = (turnoId, medio, monto, extra = {}) => ({
  id: (nVenta += 1), fecha: MAÑANA, turnoId, total: monto, esFiado: false, formaPago: medio.toLowerCase(),
  comisionBancaria: 0, netoRecibido: null, comisionPendiente: false,
  pagos: [{ medio, monto, comision: medio === "EFECTIVO" ? 0 : monto * 0.04, neto: medio === "EFECTIVO" ? monto : monto * 0.96, procesador: null, medioNombre: null, modalidadNombre: null }],
  ...extra,
});
const pagoProveedor = (id, monto, medio, { turnoId = null, cajaMovimientoId = null, nombre = "Molinos del Sur", pedido = 77 } = {}) => ({
  id, fecha: TARDE, monto, medio, turnoId, cajaMovimientoId, nota: null,
  cuenta: { pedidoProveedorId: pedido, proveedor: nombre == null ? null : { nombre } },
});
const pagoGasto = (id, monto, medio, gasto) => ({ id, fecha: TARDE, monto, medio, turnoId: null, cajaMovimientoId: null, nota: null, gasto });
// La fila de `SELECT_VERIFICACION`, como la de `lecturaTesoreria.test.mjs`.
const filaDeVerificacion = (id, fotos, { importeVerificado, verificadaPor = { id: 1, nombre: "Laura Ruiz" }, operador = null, observacion = null } = {}) => {
  const declarado = fotos.reduce((s, f) => s + f.monto, 0);
  return {
    id, localId: LOCAL, importeDeclarado: declarado, importeVerificado, diferencia: importeVerificado - declarado,
    estado: "VIGENTE", vigente: true, verificadaPorUsuarioId: verificadaPor?.id ?? 1, verificadaPorOperadorId: operador,
    verificadaEn: new Date("2026-10-04T14:32:00-03:00"), observacion, idempotencyKey: `k${id}`, anuladaEn: null,
    anuladaPorUsuarioId: null, motivoAnulacion: null, verificadaPor, anuladaPor: null,
    entregas: fotos.map((f) => ({
      cajaMovimientoId: f.id, vigente: true, montoDeclaradoSnapshot: f.monto, localIdSnapshot: LOCAL,
      turnoIdSnapshot: f.turnoId, operadorIdSnapshot: 100 + f.turnoId, claseSnapshot: f.clase || "CIERRE",
      instanteEntregaSnapshot: f.instante || TARDE,
    })),
  };
};
const acto = (...a) => formatoDeVerificacion(filaDeVerificacion(...a));

/** Dos cajas: Ana con retiro $50.000 + cierre $50.000, Pedro con cierre $10.000; MP y crédito. */
function base(extra = {}) {
  return {
    localId: LOCAL,
    cajas: [caja(1, { diferenciaEfectivo: -5000 }), caja(2, { diferenciaEfectivo: 5000 })],
    ventas: [venta(1, "EFECTIVO", 101000), venta(1, "MERCADOPAGO", 5000), venta(2, "CREDITO", 5000), venta(2, "EFECTIVO", 10000)],
    movimientos: [
      mov(11, 1, CLASE_MOVIMIENTO.RECAUDACION, 50000, { createdAt: MAÑANA }),
      mov(12, 1, CLASE_MOVIMIENTO.CIERRE, 50000),
      mov(21, 2, CLASE_MOVIMIENTO.CIERRE, 10000),
      mov(13, 1, CLASE_MOVIMIENTO.PAGO_PROVEEDOR, 20000),
    ],
    pagosProveedor: [pagoProveedor(501, 20000, "EFECTIVO", { turnoId: 1, cajaMovimientoId: 13, nombre: "Panadería La Espiga" }), pagoProveedor(502, 30000, "TRANSFERENCIA")],
    pagosGasto: [pagoGasto(601, 12000, "MERCADO_PAGO", { id: 40, concepto: "Luz", beneficiario: null, categoria: { nombre: "Servicios" } })],
    ...extra,
  };
}
const ESC = {
  pendiente: () => base(),
  correcto: () => base({ verificaciones: [acto(9, [{ id: 11, monto: 50000, turnoId: 1, clase: "RECAUDACION", instante: MAÑANA }, { id: 12, monto: 50000, turnoId: 1 }, { id: 21, monto: 10000, turnoId: 2 }], { importeVerificado: 110000 })] }),
  diferencia: () => base({ verificaciones: [acto(9, [{ id: 11, monto: 50000, turnoId: 1, clase: "RECAUDACION", instante: MAÑANA }, { id: 12, monto: 50000, turnoId: 1 }, { id: 21, monto: 10000, turnoId: 2 }], { importeVerificado: 108000, observacion: "Faltan dos billetes" })] }),
  parcial: () => base({ verificaciones: [acto(9, [{ id: 11, monto: 50000, turnoId: 1, clase: "RECAUDACION", instante: MAÑANA }, { id: 12, monto: 50000, turnoId: 1 }], { importeVerificado: 100000 })] }),
  // La foto dice $10.000 y el cierre de Pedro hoy dice $9.000.
  revision: () => {
    const b = base({ verificaciones: [acto(9, [{ id: 21, monto: 10000, turnoId: 2 }], { importeVerificado: 10000 })] });
    b.movimientos = b.movimientos.map((m) => (m.id === 21 ? { ...m, monto: 9000 } : m));
    return b;
  },
  sinImporte: () => base({ cajas: [caja(1), caja(2), caja(3)], cierresSinConteo: [{ turnoId: 3, instante: TARDE }] }),
  // Un acto con una entrega de ayer (99): cruza el período.
  cruza: () => base({ verificaciones: [acto(9, [{ id: 21, monto: 10000, turnoId: 2 }, { id: 99, monto: 4000, turnoId: 2 }], { importeVerificado: 13900 })] }),
  vacio: () => ({ localId: LOCAL }),
};

function datos(escenario, { unidad = "DIA", puedeVerificar = true, puedeAnular = true, rangoFijo = null } = {}) {
  const tesoreria = armarLecturaTesoreria(escenario);
  const descripcion = descripcionFinanciera({ unidad, desplazamiento: 0, hoy: HOY, rangoFijo });
  return {
    ok: true,
    vista: "UN_LOCAL",
    unidad,
    desplazamiento: unidad === "OTRO" ? null : 0,
    local: { id: LOCAL, nombre: "Casiano Casas", esDeposito: false, inactivo: false, diaDeCorte: 0, sinConfigurar: true },
    periodo: { rango: descripcion.rango, instantes: { desde: "x", hasta: "y" }, descripcion },
    puedeAvanzar: false,
    puedeRetroceder: unidad !== "OTRO",
    primerMovimiento: "2026-09-01",
    puedeVerificarEfectivo: puedeVerificar,
    puedeAnularVerificacion: puedeAnular,
    tesoreria,
  };
}
function pantalla(d, ctx = {}, extra = {}) {
  return renderToStaticMarkup(
    React.createElement(PantallaTesoreria, {
      datos: d, ctx: parseContextoTesoreria(ctx), hoy: HOY,
      onCambiarUnidad: nada, onElegirRango: nada, onAtras: nada, onAdelante: nada, onReintentar: nada,
      onIr: nada, onVolver: nada, onVerificar: nada, onAnular: nada, ...extra,
    })
  );
}
const botonDe = (html, txt) => html.match(new RegExp(`<button[^>]*>[^<]*${txt}[^<]*</button>`))?.[0] ?? null;
const grupoDe = (d) => d.tesoreria.grupos[0].clave;

// ── F0 · LOS ESCENARIOS TIENEN LA FORMA DEL ENDPOINT REAL ────────────────

const llaves = (o) => Object.keys(o || {}).sort();
test("[F0] los escenarios tienen exactamente la forma que devuelve la ruta (volcado real contra PostgreSQL)", () => {
  const d = datos(ESC.diferencia());
  assert.deepEqual(llaves(d), llaves(real));
  assert.deepEqual(llaves(d.tesoreria), llaves(real.tesoreria));
  assert.deepEqual(llaves(d.tesoreria.resumen), llaves(real.tesoreria.resumen));
  assert.deepEqual(llaves(d.tesoreria.resumen.verificacion), llaves(real.tesoreria.resumen.verificacion));
  assert.deepEqual(llaves(d.tesoreria.grupos[0]), llaves(real.tesoreria.grupos[0]));
  assert.deepEqual(llaves(d.tesoreria.grupos[0].cajas[0]), llaves(real.tesoreria.grupos[0].cajas[0]));
  assert.deepEqual(llaves(d.tesoreria.cajas[0]), llaves(real.tesoreria.cajas[0]));
  assert.deepEqual(llaves(d.tesoreria.entregas[0]), llaves(real.tesoreria.entregas[0]));
  assert.deepEqual(llaves(d.tesoreria.verificaciones[0]), llaves(real.tesoreria.verificaciones[0]));
  assert.deepEqual(llaves(d.tesoreria.egresosExteriores[0]), llaves(real.tesoreria.egresosExteriores[0]));
  assert.deepEqual(llaves(d.tesoreria.pagosDesdeCaja[0]), llaves(real.tesoreria.pagosDesdeCaja[0]));
  assert.deepEqual(llaves(d.periodo.descripcion), llaves(real.periodo.descripcion));
});

test("[F0] el volcado real se dibuja en las cuatro vistas sin romperse", () => {
  const t = real.tesoreria;
  for (const ctx of [{}, { vista: "turno", grupo: t.grupos[0].clave }, { vista: "caja", caja: t.cajas[0].turnoId, grupo: t.grupos[0].clave }, { vista: "verificacion", verificacion: t.verificaciones[0].id }]) {
    const html = pantalla(real, ctx);
    assert.ok(html.length > 500, JSON.stringify(ctx));
    assert.doesNotMatch(texto(html), /undefined|null|NaN/, JSON.stringify(ctx));
  }
});

// ── 1-7 · EL ENCABEZADO TEMPORAL Y «OTRO» ────────────────────────────────

test("[1][2][3][4] Día, Semana y Mes con los textos del servidor; el Mes cuenta hasta hoy", () => {
  assert.match(texto(pantalla(datos(ESC.pendiente(), { unidad: "DIA" }), { unidad: "DIA" })), /Domingo 4 de octubre/);
  const semana = texto(pantalla(datos(ESC.pendiente(), { unidad: "SEMANA" }), { unidad: "SEMANA" }));
  assert.match(semana, /Semana en curso/);
  assert.match(semana, /dom 4 al sáb 10 de octubre/);
  const mes = texto(pantalla(datos(ESC.pendiente(), { unidad: "MES" }), { unidad: "MES" }));
  assert.match(mes, /Octubre · en curso/);
  assert.match(mes, /1 al 31 de octubre · van 4 días/);
  assert.doesNotMatch(mes, /van 31 días/);
});

test("[5] Otro: el chip está habilitado, hay calendario de rango y el navegador dice «Período elegido» sin flechas", () => {
  const rangoFijo = { desde: "2026-09-03", hasta: "2026-10-04" };
  const html = pantalla(datos(ESC.pendiente(), { unidad: "OTRO", rangoFijo }), { unidad: "OTRO", desde: rangoFijo.desde, hasta: rangoFijo.hasta });
  const otro = botonDe(html, "Otro");
  assert.ok(otro && !/\bdisabled=""/.test(otro), "Otro quedó apagado como en el resto de Finanzas");
  assert.match(otro, /aria-pressed="true"/);
  assert.match(texto(html), /Período elegido/);
  assert.match(texto(html), /3 de septiembre al dom 4 de octubre/);
  for (const f of ["Período anterior", "Período siguiente"]) {
    assert.match(html.match(new RegExp(`<button[^>]*aria-label="${f}"[^>]*>`))[0], /disabled=""/, f);
  }
  // Sin fechas: no se consulta y se pide el rango.
  const sinRango = texto(pantalla(null, { unidad: "OTRO" }, { faltaRango: true }));
  assert.match(sinRango, /Elegí el período/);
});

test("[6] Desde/Hasta llaman el contrato de #138: unidad=OTRO, las dos fechas, sin desplazamiento", () => {
  const ctx = parseContextoTesoreria({ unidad: "OTRO", desde: "2026-09-03", hasta: "2026-10-04" });
  assert.equal(consultaDeTesoreria(ctx), "entrada=1&unidad=OTRO&desde=2026-09-03&hasta=2026-10-04");
  assert.equal(consultaDeTesoreria(ctx, { destino: 12 }), "destino=12&unidad=OTRO&desde=2026-09-03&hasta=2026-10-04");
  assert.equal(consultaDeTesoreria(parseContextoTesoreria({ unidad: "OTRO", desde: "2026-09-03" })), null, "Otro incompleto no consulta");
  assert.equal(consultaDeTesoreria(parseContextoTesoreria({ unidad: "OTRO", desde: "2026-02-30", hasta: "2026-03-01" })), null, "una fecha inválida en la URL no se manda");
  assert.equal(consultaDeTesoreria(parseContextoTesoreria({ unidad: "MES", desp: "-1" })), "entrada=1&unidad=MES&desplazamiento=-1");
  assert.equal(consultaDeTesoreria(parseContextoTesoreria({})), "entrada=1&unidad=DIA&desplazamiento=0");
});

test("[7] cambiar el período vuelve a pedir; cambiar de vista NO", () => {
  const h = fuente("components/tesoreria/useTesoreria.js");
  assert.match(h, /const consulta = useMemo\(\(\) => consultaDeTesoreria\(ctx, \{ destino \}\), \[ctx, destino\]\);/);
  assert.match(h, /\}, \[consulta\]\);/, "cargar depende de la consulta y de nada más");
  assert.match(h, /useEffect\(\(\) => \{\s*cargar\(\);\s*\}, \[cargar\]\);/);
  // La consulta NO contiene la vista: abrir un turno no vuelve a pedir.
  const a = consultaDeTesoreria(parseContextoTesoreria({ unidad: "SEMANA" }));
  const b = consultaDeTesoreria(parseContextoTesoreria({ unidad: "SEMANA", vista: "turno", grupo: "7:2026-10-04" }));
  assert.equal(a, b);
  assert.notEqual(a, consultaDeTesoreria(parseContextoTesoreria({ unidad: "MES" })));
});

test("[8] el local lo decide el servidor: el depósito entra por ruta con destino y nada se autoriza en React", () => {
  assert.equal(urlDeLocalTesoreria(12, { unidad: "MES" }), "/modulos/finanzas/tesoreria/local/12?unidad=MES");
  const tablero = fuente("components/tesoreria/TableroTesoreria.jsx");
  assert.match(tablero, /t\.datos\?\.vista === "ENTRADA"/);
  assert.match(tablero, /onCambiarLocal=\{destino \?/);
  for (const f of readdirSync("components/tesoreria").filter((x) => /\.(jsx|js)$/.test(x))) {
    assert.doesNotMatch(fuente(`components/tesoreria/${f}`), /checkPerm|es_deposito|permisos\.includes|localDeLaSesion/, `${f} decide alcance o permisos`);
  }
  // Un local ve su nombre sin "cambiar"; el depósito, con el selector.
  assert.doesNotMatch(pantalla(datos(ESC.pendiente())), /Cambiar de local/);
  assert.match(pantalla(datos(ESC.pendiente()), {}, { onCambiarLocal: nada }), /Cambiar de local \(Casiano Casas\)/);
});

// ── 9-15 · LO QUE MUESTRA EL RESUMEN ─────────────────────────────────────

test("[9][45] la base conocida y los totales son los del servidor, tal cual: no se recalculan", () => {
  const d = datos(ESC.pendiente());
  // Centinelas que ninguna cuenta del cliente podría producir.
  Object.assign(d.tesoreria.resumen, {
    baseConocida: 123457.89, efectivoDeclaradoEntregado: 7777.77, digitalCobradoDeclarado: 6666.66, egresosExterioresConocidos: 5555.55,
  });
  const t = texto(pantalla(d));
  assert.match(t, /BASE CONOCIDA DE TESORERÍA \$123\.457,89/);
  assert.match(t, /Efectivo entregado \$7\.777,77 \+ cobrado por POS \$6\.666,66 − egresos exteriores \$5\.555,55/);
  assert.match(t, /No es saldo bancario/);
  assert.doesNotMatch(t, /\bsaldo disponible|patrimonio|caja fuerte/i);
});

test("[10] pendiente: insignia Pendiente, «Parcial» en la base con lo que falta contar, y el botón", () => {
  const t = texto(pantalla(datos(ESC.pendiente())));
  assert.match(t, /Parcial \$110\.000,00 del efectivo sin verificar/);
  assert.match(t, /Pendiente Cobrado declarado/);
  assert.match(t, /Verificar efectivo/);
});

test("[11] correcto: diferencia de Tesorería $0 y quién contó", () => {
  const t = texto(pantalla(datos(ESC.correcto())));
  assert.match(t, /Correcto Cobrado declarado/);
  assert.match(t, /Diferencia Tesorería \$0,00/);
  assert.match(t, /Contó: Laura Ruiz/);
  assert.match(t, /Todo el efectivo declarado está verificado/);
});

test("[12] con diferencia: −$2.000, del acto entero", () => {
  const t = texto(pantalla(datos(ESC.diferencia())));
  assert.match(t, /Con diferencia/);
  assert.match(t, /Diferencia Tesorería −\$2\.000,00 verificado − declarado/);
});

test("[13][36] parcial: «Verificar lo pendiente» con SOLO las entregas pendientes", () => {
  const d = datos(ESC.parcial());
  const t = texto(pantalla(d));
  assert.match(t, /Parcial/);
  assert.match(t, /Verificar lo pendiente · \$10\.000,00/);
  const g = lecturaDelGrupo(d.tesoreria, grupoDe(d));
  assert.deepEqual(g.pendientes.map((e) => e.cajaMovimientoId), [21]);
  assert.deepEqual(g.pendientes.map((e) => e.estadoVerificacion), ["PENDIENTE"]);
  // Lo que abre la hoja son esas pendientes, nada más.
  assert.match(fuente("components/tesoreria/TableroTesoreria.jsx"), /setVerificando\(\{ entregas: g\.pendientes,/);
});

test("[14] requiere revisión: aviso, insignia y entrada al detalle; nada se recalcula", () => {
  const d = datos(ESC.revision());
  const t = texto(pantalla(d));
  assert.match(t, /Una verificación requiere revisión/);
  assert.match(t, /Ver verificación #9/);
  assert.match(t, /Requiere revisión/);
  assert.match(t, /Declarado al verificar Foto histórica, no se recalcula \$10\.000,00/);
  const det = texto(pantalla(d, { vista: "verificacion", verificacion: 9 }));
  assert.match(det, /cambió después de verificar/);
});

test("[15] sin importe declarado: se dice, nunca «$0»", () => {
  const d = datos(ESC.sinImporte());
  const t = texto(pantalla(d));
  assert.match(t, /Sin importe declarado/);
  assert.match(t, /cerró sin conteo: no hay importe declarado. No se toma como \$0/);
  const det = texto(pantalla(d, { vista: "caja", caja: 3 }));
  assert.match(det, /EFECTIVO ENTREGADO Sin importe declarado/);
  assert.doesNotMatch(det, /EFECTIVO ENTREGADO \$0/);
});

// ── 16-21 · TURNO Y CAJA ─────────────────────────────────────────────────

test("[16] detalle de turno: cajas del turno con su etiqueta real, sin «Caja 1»", () => {
  const d = datos(ESC.pendiente());
  const t = texto(pantalla(d, { vista: "turno", grupo: grupoDe(d) }));
  // Cobrado declarado = efectivo entregado (110.000) + digital del POS (10.000).
  assert.match(t, /COBRADO DECLARADO DEL TURNO \$120\.000,00/);
  assert.match(t, /Nadie contó todavía este efectivo/);
  assert.match(t, /CAJAS DEL TURNO/);
  assert.match(t, /Caja de Ana/);
  assert.match(t, /Caja de Pedro/);
  assert.doesNotMatch(t, /Caja \d/);
});

test("[17][18] detalle de caja: retiro y cierre UNA vez cada uno, total sin duplicar", () => {
  const d = datos(ESC.pendiente());
  const t = texto(pantalla(d, { vista: "caja", caja: 1, grupo: grupoDe(d) }));
  assert.match(t, /Retiro de recaudación 11:40 · pendiente de verificar \$50\.000,00/);
  assert.match(t, /Cierre 14:10 · pendiente de verificar \$50\.000,00/);
  assert.match(t, /Total entregado \$100\.000,00/);
  assert.doesNotMatch(t, /\$200\.000/);
  assert.match(t, /Operador Ana/);
  assert.match(t, /Ir a Domingo 4 de octubre/);
  // En la tarjeta del turno, la misma composición, una vez.
  const turno = texto(pantalla(d, { vista: "turno", grupo: grupoDe(d) }));
  assert.match(turno, /Efectivo entregado Retiro \$50\.000,00 \+ cierre \$50\.000,00 \$100\.000,00/);
});

test("[19] las diferencias de caja no se compensan: cada una con su signo y ninguna suma de turno", () => {
  const d = datos(ESC.pendiente());
  const t = texto(pantalla(d, { vista: "turno", grupo: grupoDe(d) }));
  assert.match(t, /Diferencia de caja Del arqueo de esta caja −\$5\.000,00/);
  assert.match(t, /Diferencia de caja Del arqueo de esta caja \+\$5\.000,00/);
  assert.doesNotMatch(t, /Diferencia del turno/i);
  assert.match(t, /no se compensan/);
});

test("[20][21] los pagos desde caja se informan como incluidos y NO restan", () => {
  const d = datos(ESC.pendiente());
  const t = texto(pantalla(d));
  assert.match(t, /Pagado desde cajas \$20\.000,00 no resta/);
  // La resta de la base es la de los exteriores: 30.000 + 12.000, sin los 20.000 de la caja.
  assert.match(t, /− egresos exteriores \$42\.000,00/);
  assert.equal(d.tesoreria.resumen.baseConocida, 110000 + 10000 - 42000);
  const det = texto(pantalla(d, { vista: "caja", caja: 1 }));
  assert.match(det, /PAGOS HECHOS DESDE ESTA CAJA Panadería La Espiga Pago a proveedor · Efectivo · 14:10 \$20\.000,00 ya incluido/);
  assert.match(det, /Ya incluido en el efectivo entregado/);
  for (const f of ["PantallaTesoreria.jsx", "DetallesTesoreria.jsx", "PiezasTesoreria.jsx"]) {
    assert.doesNotMatch(fuente(`components/tesoreria/${f}`), /baseConocida\s*[-+*]|pagosDesdeCajaInformativos\s*[-+]/, f);
  }
});

// ── 22-25 · EGRESOS Y DIGITALES ──────────────────────────────────────────

test("[22][23] egresos exteriores con el proveedor y el gasto reales; lo que vino en null no se inventa", () => {
  const t = texto(pantalla(datos(ESC.pendiente())));
  assert.match(t, /Molinos del Sur Pago a proveedor · Transferencia −\$30\.000,00/);
  assert.match(t, /Luz Gasto · Servicios · Mercado Pago −\$12\.000,00/);
  const sinNombre = ESC.pendiente();
  sinNombre.pagosProveedor = [pagoProveedor(502, 30000, "TRANSFERENCIA", { nombre: null })];
  sinNombre.pagosGasto = [pagoGasto(601, 12000, "OTRO", { id: 40, concepto: null, beneficiario: null, categoria: null })];
  const t2 = texto(pantalla(datos(sinNombre)));
  assert.match(t2, /Pago a proveedor Pago a proveedor · Transferencia −\$30\.000,00/);
  assert.match(t2, /Gasto Gasto · Otro −\$12\.000,00/);
  assert.doesNotMatch(t2, /null|undefined/);
});

test("[24][25] lo digital es «cobrado por POS», con comisión y neto ESTIMADOS; nunca acreditado ni conciliado", () => {
  const t = texto(pantalla(datos(ESC.pendiente())));
  // En el orden canónico de medios (`ORDEN_MEDIO`): crédito antes que Mercado Pago.
  assert.match(t, /COBRADO POR POS Crédito Comisión est\. \$200,00 · neto est\. \$4\.800,00 \$5\.000,00/);
  assert.match(t, /Mercado Pago Comisión est\. \$200,00 · neto est\. \$4\.800,00 \$5\.000,00/);
  assert.match(t, /Total cobrado por POS \$10\.000,00/);
  // La única aparición de esas palabras es la aclaración que las niega.
  const sinAclaracion = t.replace("Todavía no es dinero acreditado ni conciliado con Mercado Pago o el banco.", "");
  assert.doesNotMatch(sinAclaracion, /acreditad|conciliad|saldo (de )?Mercado Pago|saldo banco/i);
});

// ── 26-35 · VERIFICAR EFECTIVO ───────────────────────────────────────────

test("[26][27] «Verificar efectivo» solo con el permiso que dijo el servidor", () => {
  assert.ok(botonDe(pantalla(datos(ESC.pendiente(), { puedeVerificar: true })), "Verificar efectivo"));
  assert.equal(botonDe(pantalla(datos(ESC.pendiente(), { puedeVerificar: false })), "Verificar efectivo"), null);
  const d = datos(ESC.parcial(), { puedeVerificar: false });
  assert.equal(botonDe(pantalla(d), "Verificar lo pendiente"), null);
  assert.equal(botonDe(pantalla(d, { vista: "turno", grupo: grupoDe(d) }), "Verificar"), null);
});

const pendientesDe = (d) => lecturaDelGrupo(d.tesoreria, grupoDe(d)).pendientes;

test("[28] el declarado sale de las entregas y no es un campo: el único input es lo contado", () => {
  const d = datos(ESC.pendiente());
  const html = renderToStaticMarkup(React.createElement(PasoContar, { entregas: pendientesDe(d), cajas: d.tesoreria.cajas, texto: "", onTexto: nada, onCorrecto: nada, onConfirmarImporte: nada }));
  assert.equal((html.match(/<input/g) || []).length, 1);
  assert.match(html, /<input[^>]*id="tesoreria-contado"[^>]*inputMode="decimal"/);
  assert.match(html, /<output[^>]*data-total-declarado[^>]*>\$110\.000,00<\/output>/);
  assert.match(texto(html), /Caja de Ana Retiro \$50\.000,00 \+ cierre \$50\.000,00 \$100\.000,00 Caja de Pedro Cierre \$10\.000,00 \$10\.000,00/);
  assert.match(texto(html), /Sale de las entregas · no se edita/);
});

test("[29][30] Correcto prepara diferencia 0; otro importe la muestra ANTES de confirmar", () => {
  const d = datos(ESC.pendiente());
  const paso = (centavos, txt) =>
    texto(renderToStaticMarkup(React.createElement(PasoConfirmar, { entregas: pendientesDe(d), cajas: d.tesoreria.cajas, texto: txt, contadoCentavos: centavos, observacion: "", onObservacion: nada, onConfirmar: nada, onCambiarImporte: nada })));
  const ok = paso(11000000, "110.000,00");
  assert.match(ok, /ANTES DE CONFIRMAR Correcto Declarado \$110\.000,00 Contado \$110\.000,00 Diferencia Tesorería \$0,00/);
  const dif = paso(10800000, "108.000");
  assert.match(dif, /ANTES DE CONFIRMAR Con diferencia Declarado \$110\.000,00 Contado \$108\.000,00 Diferencia Tesorería −\$2\.000,00 contado − declarado/);
  assert.match(dif, /No cambia la diferencia de ninguna caja/);
  // "Correcto" pone lo contado igual al declarado, en centavos.
  assert.match(fuente("components/tesoreria/HojaVerificarEfectivo.jsx"), /setContado\(aCentavos\(declarado\)\)/);
  // El importe se lee en formato argentino y acepta el cero (un sobre vacío).
  assert.deepEqual(leerImporteContado("108.000"), { centavos: 10800000 });
  assert.deepEqual(leerImporteContado("185.300,50"), { centavos: 18530050 });
  assert.deepEqual(leerImporteContado("0"), { centavos: 0 });
  assert.ok(leerImporteContado("").error);
  assert.ok(leerImporteContado("abc").error);
});

test("[31] el pedido NO lleva declarado, diferencia, local, clase ni fotos, y el servidor lo acepta tal cual", () => {
  const cuerpo = cuerpoDeVerificacion({ cajaMovimientoIds: [12, 11, 21], contadoCentavos: 10800000, idempotencyKey: "verif-7-x-y", observacion: "  falta  " });
  assert.deepEqual(Object.keys(cuerpo).sort(), ["cajaMovimientoIds", "idempotencyKey", "importeVerificado", "observacion"]);
  assert.equal(cuerpo.importeVerificado, 108000);
  assert.equal(cuerpo.observacion, "falta");
  assert.deepEqual(Object.keys(cuerpoDeVerificacion({ cajaMovimientoIds: [1], contadoCentavos: 0, idempotencyKey: "k", observacion: "" })).sort(), ["cajaMovimientoIds", "idempotencyKey", "importeVerificado"]);
  // El MISMO parser de la ruta: si el cliente mandara algo de más, se rechazaría.
  const leido = leerPedidoDeVerificacion(cuerpo);
  assert.equal(leido.error, undefined, leido.error);
  assert.deepEqual(leido.pedido.cajaMovimientoIds, [11, 12, 21]);
  assert.equal(leido.pedido.importeVerificadoCentavos, 10800000);
});

test("[32] la idempotencyKey sobrevive al reintento del mismo intento y cambia con otro contenido", () => {
  let n = 0;
  const generar = () => `clave-${(n += 1)}`;
  const cuerpo = cuerpoDeVerificacion({ cajaMovimientoIds: [11, 12], contadoCentavos: 10000000, idempotencyKey: null, observacion: "" });
  const primero = claveParaEnvio({ clave: null, firma: null }, cuerpo, generar);
  const reintento = claveParaEnvio(primero, { ...cuerpo, cajaMovimientoIds: [12, 11] }, generar);
  assert.equal(reintento.clave, primero.clave, "un reintento del mismo intento cambió la clave");
  const otroImporte = claveParaEnvio(primero, { ...cuerpo, importeVerificado: 99000 }, generar);
  assert.notEqual(otroImporte.clave, primero.clave, "otro importe reusó la clave: el servidor contestaría 409");
  // La clave nace al abrir la hoja (un intento por apertura): cerrada no se
  // monta, así que cada apertura arranca con el intento en blanco. Y respeta el
  // tope del servidor.
  const hoja = fuente("components/tesoreria/HojaVerificarEfectivo.jsx");
  assert.match(hoja, /if \(!abierto\) return null;\s*return <HojaAbierta \{\.\.\.props\} \/>;/);
  assert.match(hoja, /function HojaAbierta\([\s\S]*const intentoRef = useRef\(\{ clave: null, firma: null \}\);/);
  assert.match(hoja, /claveParaEnvio\(intentoRef\.current, cuerpo, \(\) => nuevaClaveDeVerificacion\(localId\)\)/);
  assert.ok(nuevaClaveDeVerificacion(7, Date.now(), "abcdefgh").length <= 120);
});

test("[33] un doble toque no hace dos envíos: guardia por ref y botón apagado mientras viaja", () => {
  const hoja = fuente("components/tesoreria/HojaVerificarEfectivo.jsx");
  const confirmar = hoja.slice(hoja.indexOf("const confirmar = async"));
  // Cada pieza tiene que EXISTIR antes de comparar posiciones: un `indexOf` de
  // algo que se fue da -1, y -1 es "antes" que todo (la contraprueba lo atrapó).
  const pos = (s) => {
    const i = confirmar.indexOf(s);
    assert.ok(i >= 0, `falta «${s}»`);
    return i;
  };
  assert.ok(pos("if (enviandoRef.current) return;") < pos("await enviarVerificacion(cuerpo)"));
  assert.ok(pos("enviandoRef.current = true;") < pos("await enviarVerificacion(cuerpo)"));
  assert.match(hoja, /onClick=\{onConfirmar\} disabled=\{enviando\}/);
  const anular = fuente("components/tesoreria/HojaAnularVerificacion.jsx");
  assert.match(anular, /if \(!texto \|\| !acto \|\| enviandoRef\.current\) return;/);
  const d = datos(ESC.pendiente());
  const enVuelo = renderToStaticMarkup(React.createElement(PasoConfirmar, { entregas: pendientesDe(d), cajas: [], texto: "1", contadoCentavos: 100, observacion: "", onObservacion: nada, onConfirmar: nada, onCambiarImporte: nada, enviando: true }));
  assert.match(botonDe(enVuelo, "Registrando…"), /disabled=""/);
});

test("[34][35] solo un éxito del servidor cierra y relee; un error no se muestra como éxito", async () => {
  const hoja = fuente("components/tesoreria/HojaVerificarEfectivo.jsx");
  const confirmar = hoja.slice(hoja.indexOf("const confirmar = async"));
  const iOk = confirmar.indexOf("if (!r.ok) {");
  const iHecho = confirmar.indexOf("onHecho?.(r)");
  assert.ok(iOk >= 0 && iHecho >= 0 && iOk < iHecho, "onHecho antes de mirar la respuesta");
  const tablero = fuente("components/tesoreria/TableroTesoreria.jsx");
  assert.match(tablero, /onHecho=\{\(\) => \{\s*setVerificando\(null\);\s*t\.recargar\(\);\s*\}\}/);
  // Las acciones devuelven el rechazo del servidor tal cual, y un corte no es un éxito.
  const original = globalThis.fetch;
  try {
    const pedidos = [];
    globalThis.fetch = async (url, init) => {
      pedidos.push({ url, init });
      return { ok: false, status: 409, json: async () => ({ ok: false, codigo: "ENTREGA_YA_VERIFICADA", error: "Ya está verificada." }) };
    };
    const r = await enviarVerificacion({ cajaMovimientoIds: [1], importeVerificado: 1, idempotencyKey: "k" });
    assert.deepEqual([r.ok, r.status, r.codigo, r.error], [false, 409, "ENTREGA_YA_VERIFICADA", "Ya está verificada."]);
    assert.equal(pedidos[0].url, URL_VERIFICACIONES);
    assert.equal(pedidos[0].init.method, "POST");
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    const corte = await enviarVerificacion({ cajaMovimientoIds: [1], importeVerificado: 1, idempotencyKey: "k" });
    assert.deepEqual([corte.ok, corte.error], [false, ERROR_SIN_RESPUESTA]);
    globalThis.fetch = async () => ({ ok: true, status: 201, json: async () => ({ ok: true, repetida: false, verificacion: { id: 3 } }) });
    const bien = await enviarVerificacion({ cajaMovimientoIds: [1], importeVerificado: 1, idempotencyKey: "k" });
    assert.deepEqual([bien.ok, bien.verificacion.id], [true, 3]);
  } finally {
    globalThis.fetch = original;
  }
});

// ── 37-44 · DETALLE Y ANULACIÓN ──────────────────────────────────────────

test("[37][38] el detalle nombra a quien verificó y NO inventa un operador", () => {
  const d = datos(ESC.diferencia());
  const t = texto(pantalla(d, { vista: "verificacion", verificacion: 9 }));
  assert.match(t, /Verificación #9/);
  assert.match(t, /2 cajas incluidas/);
  assert.match(t, /DIFERENCIA TESORERÍA Con diferencia −\$2\.000,00/);
  assert.match(t, /Verificó Usuario del ERP Laura Ruiz/);
  assert.match(t, /Observación Faltan dos billetes/);
  assert.doesNotMatch(t, /Operador del PIN/);
  assert.match(t, /Caja de Ana · retiro de recaudación 11:40 \$50\.000,00/);
  // Con operador sin nombre en la base: se muestra su id, no la cuenta.
  const conOp = base({ verificaciones: [acto(9, [{ id: 21, monto: 10000, turnoId: 2 }], { importeVerificado: 10000, operador: 33 })] });
  const t2 = texto(pantalla(datos(conOp), { vista: "verificacion", verificacion: 9 }));
  assert.match(t2, /Operador Operador del PIN #33/);
  // Sin nombre de usuario: "Sin dato", no otro nombre.
  const sinNombre = base({ verificaciones: [acto(9, [{ id: 21, monto: 10000, turnoId: 2 }], { importeVerificado: 10000, verificadaPor: null })] });
  assert.match(texto(pantalla(datos(sinNombre), { vista: "verificacion", verificacion: 9 })), /Verificó Usuario del ERP Sin dato/);
});

test("[39][40][42] «Anular verificación» solo con el permiso; y no existe «Editar verificación»", () => {
  const con = pantalla(datos(ESC.diferencia(), { puedeAnular: true }), { vista: "verificacion", verificacion: 9 });
  const sin = pantalla(datos(ESC.diferencia(), { puedeAnular: false }), { vista: "verificacion", verificacion: 9 });
  assert.ok(botonDe(con, "Anular verificación"));
  assert.equal(botonDe(sin, "Anular verificación"), null);
  assert.doesNotMatch(texto(con), /Editar verificación/i);
  for (const f of readdirSync("components/tesoreria").filter((x) => /\.(jsx|js)$/.test(x))) {
    assert.doesNotMatch(fuente(`components/tesoreria/${f}`), /Editar verificaci|editarVerificacion/i, f);
  }
});

test("[41] el motivo es obligatorio: vacío o en blanco, el botón no sale", () => {
  const acto9 = datos(ESC.diferencia()).tesoreria.verificaciones[0];
  const boton = (motivo) => botonDe(renderToStaticMarkup(React.createElement(ContenidoAnular, { acto: acto9, motivo, onMotivo: nada, onAnular: nada, onCancelar: nada })), "Anular verificación");
  assert.match(boton(""), /disabled=""/);
  assert.match(boton("   "), /disabled=""/);
  assert.doesNotMatch(boton("El cierre se corrigió"), /disabled=""/);
  assert.match(texto(renderToStaticMarkup(React.createElement(ContenidoAnular, { acto: acto9, motivo: "", onMotivo: nada, onAnular: nada, onCancelar: nada }))), /Las 3 entregas \(\$110\.000,00\) vuelven a quedar pendientes/);
});

test("[43] anular relee del servidor, y sin el acto vigente las entregas vuelven a pendientes", async () => {
  const tablero = fuente("components/tesoreria/TableroTesoreria.jsx");
  assert.match(tablero, /<HojaAnularVerificacion[\s\S]*onHecho=\{\(\) => \{[\s\S]*t\.recargar\(\);/);
  // Lo que lee el servidor después: la anulada ya no es vigente y no viene.
  const despues = datos(base());
  assert.equal(lecturaDelGrupo(despues.tesoreria, grupoDe(despues)).estado, ESTADO_TESORERIA.PENDIENTE);
  // Y la acción va a la ruta real con el motivo y nada más.
  const original = globalThis.fetch;
  try {
    let pedido;
    globalThis.fetch = async (url, init) => {
      pedido = { url, cuerpo: JSON.parse(init.body) };
      return { ok: true, status: 200, json: async () => ({ ok: true, yaEstabaAnulada: false }) };
    };
    const r = await enviarAnulacion(9, "se corrigió el cierre");
    assert.equal(r.ok, true);
    assert.deepEqual(pedido, { url: "/api/finanzas/tesoreria/verificaciones/9/anular", cuerpo: { motivo: "se corrigió el cierre" } });
  } finally {
    globalThis.fetch = original;
  }
});

test("[44] un acto que cruza el período va aparte, entero, y no suma a lo verificado del período", () => {
  const d = datos(ESC.cruza());
  const t = texto(pantalla(d));
  assert.match(t, /VERIFICACIONES QUE CRUZAN ESTE PERÍODO Verificación #9 1 de 2 entregas en este período · 1 caja −\$100,00 diferencia del acto entero/);
  assert.equal(d.tesoreria.resumen.verificacion.efectivoVerificado, 0);
  assert.match(t, /Verificado Contado por el responsable \$0,00/);
});

// ── 46-47 · SOLO LEE, Y FINANZAS SIGUE ENTERA ────────────────────────────

test("[46] el GET no escribe: la lectura no tiene ni un método de escritura; las dos escrituras viven en un solo archivo", () => {
  const hook = fuente("components/tesoreria/useTesoreria.js");
  assert.doesNotMatch(hook, /method:/);
  assert.match(hook, /fetch\(`\$\{URL_TESORERIA\}\?\$\{consulta\}`, \{ cache: "no-store", credentials: "include" \}\)/);
  for (const f of readdirSync("components/tesoreria").filter((x) => /\.(jsx|js)$/.test(x) && x !== "accionesTesoreria.js")) {
    const t = fuente(`components/tesoreria/${f}`);
    assert.doesNotMatch(t, /method:\s*["'`]POST/, f);
    if (f !== "useTesoreria.js") assert.doesNotMatch(t, /\bfetch\(/, `${f} pide datos por su cuenta`);
  }
});

test("[47] la navegación de Finanzas sigue: la página registra título y Volver, y vive en Finanzas", () => {
  for (const p of ["app/modulos/finanzas/tesoreria/page.jsx", "app/modulos/finanzas/tesoreria/local/[localId]/page.jsx"]) {
    const t = fuente(p);
    assert.match(t, /useTituloDePagina\("Tesorería"\)/, p);
    assert.match(t, /useAccionDePagina\(\(\) => <SunmiBackButton href=\{RUTA_(FINANZAS|TESORERIA)\} \/>, \[\]\)/, p);
    assert.match(t, /<AccionDePantalla>\{volver\}<\/AccionDePantalla>/, p);
    assert.match(t, /!permisos\.includes\(PERMISO_VER_TESORERIA\)/, p);
    assert.match(t, /<Suspense/, p);
  }
  // Entrar a un detalle es navegar (el "atrás" vuelve); mover el período, reemplazar.
  const hook = fuente("components/tesoreria/useTesoreria.js");
  assert.match(hook, /if \(navegar\) router\.push\(url\);\s*else router\.replace\(url, \{ scroll: false \}\);/);
  assert.match(hook, /\{ navegar: !reemplazar \}/);
});

test("vacío: un período sin movimientos no dibuja tarjetas en $0", () => {
  const t = texto(pantalla(datos(ESC.vacio())));
  assert.match(t, /No hubo movimientos de Tesorería en este período/);
  assert.doesNotMatch(t, /BASE CONOCIDA|\$0,00/);
});

test("error: se muestra el del servidor y se puede reintentar", () => {
  const html = pantalla(null, {}, { error: "No se pudo armar la lectura de Tesorería: x" });
  assert.match(texto(html), /No se pudo armar la lectura de Tesorería: x/);
  assert.ok(botonDe(html, "Reintentar"));
});
