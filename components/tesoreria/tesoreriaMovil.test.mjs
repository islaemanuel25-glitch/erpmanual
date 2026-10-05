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

import PantallaTesoreria, { SinTurnoConCajas, TurnoConCajas } from "@/components/tesoreria/PantallaTesoreria.jsx";
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
  INSIGNIA_TESORERIA,
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
  // Desde la migración 20261004200000_turno_operativo cada caja nueva trae el
  // turno que eligió al abrirse; es la forma que da `leerTesoreria`.
  turnoOperativoId: 31,
  turnoOperativoNombre: "Mañana",
  turnoOperativoOrden: 0,
  fechaOperativa: new Date("2026-10-04T00:00:00.000Z"),
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
// `turno`: el turno operativo congelado en el acto, como lo trae el SELECT real;
// null = verificación anterior al turno operativo.
const TURNO_DEL_ACTO = { id: 31, nombre: "Mañana" };
const filaDeVerificacion = (id, fotos, { importeVerificado, verificadaPor = { id: 1, nombre: "Laura Ruiz" }, operador = null, observacion = null, turno = TURNO_DEL_ACTO } = {}) => {
  const declarado = fotos.reduce((s, f) => s + f.monto, 0);
  return {
    id, localId: LOCAL, importeDeclarado: declarado, importeVerificado, diferencia: importeVerificado - declarado,
    estado: "VIGENTE", vigente: true, verificadaPorUsuarioId: verificadaPor?.id ?? 1, verificadaPorOperadorId: operador,
    verificadaEn: new Date("2026-10-04T14:32:00-03:00"), observacion, idempotencyKey: `k${id}`, anuladaEn: null,
    anuladaPorUsuarioId: null, motivoAnulacion: null, verificadaPor, anuladaPor: null,
    turnoOperativoId: turno?.id ?? null,
    fechaOperativa: turno ? new Date("2026-10-04T00:00:00.000Z") : null,
    turnoOperativo: turno,
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

test("[5b] «Aplicar» del calendario llega: la pantalla pasa todo lo que el kit llama al aplicar", () => {
  // El kit, al aplicar, llama `onChangeDesde` y `onChangeHasta` SIN `?.` y recién
  // después `onApply`. Faltando uno, «Aplicar» tira y el rango nunca llega: así
  // se encontró, en el navegador. La lista sale del kit, no se escribe acá.
  const kit = fuente("components/sunmi/SunmiDateRangePicker.jsx");
  const inicio = kit.indexOf("const handleApply");
  assert.ok(inicio >= 0, "el kit ya no tiene handleApply: releer este candado");
  const cuerpo = kit.slice(inicio, kit.indexOf("};", inicio));
  const obligatorios = [...cuerpo.matchAll(/\b(on[A-Z]\w*)\(/g)].map((m) => m[1]);
  assert.ok(obligatorios.length >= 2, `el kit cambió lo que llama al aplicar: ${obligatorios}`);
  const uso = fuente("components/tesoreria/PantallaTesoreria.jsx").match(/<SunmiDateRangePicker[\s\S]*?\/>/)?.[0];
  assert.ok(uso, "la pantalla dejó de usar el calendario del kit");
  for (const p of [...obligatorios, "onApply"]) assert.match(uso, new RegExp(`\\b${p}=\\{`), `falta ${p}: «Aplicar» no llegaría`);
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

test("[9][45] los totales de COBRADO POR POS y EFECTIVO ENTREGADO son los del servidor, tal cual: no se recalculan", () => {
  // Desde el rediseño móvil (Figma EVJ2KvVCrY0oVSowfboymQ) la pantalla ya no
  // dibuja la "Base conocida": la jerarquía es COBRADO POR POS → EFECTIVO
  // ENTREGADO → por turno. Lo que este candado defiende sigue igual: cada
  // número es el del servidor, sin una cuenta del cliente en el medio.
  const d = datos(ESC.pendiente());
  // Centinelas que ninguna cuenta del cliente podría producir.
  Object.assign(d.tesoreria.resumen, {
    cobradoPorPosDeclarado: 123457.89, efectivoCobradoDeclarado: 8888.88, digitalCobradoDeclarado: 6666.66, efectivoDeclaradoEntregado: 7777.77,
  });
  Object.assign(d.tesoreria.resumen.verificacion, { efectivoVerificado: 4444.44, entregadoPendienteDeVerificar: 3333.33 });
  const t = texto(pantalla(d));
  assert.match(t, /COBRADO POR POS \$123\.457,89 En efectivo \$8\.888,88 Digital \$6\.666,66/);
  assert.match(t, /EFECTIVO ENTREGADO \$7\.777,77 Verificado \$4\.444,44 Falta verificar \$3\.333,33/);
  assert.doesNotMatch(t, /\bsaldo disponible|patrimonio|caja fuerte/i);
  for (const f of ["PantallaTesoreria.jsx", "PiezasTesoreria.jsx"]) {
    assert.doesNotMatch(fuente(`components/tesoreria/${f}`), /cobradoPorPosDeclarado\s*[-+*]|efectivoDeclaradoEntregado\s*[-+*]|digitalCobradoDeclarado\s*[-+*]/, f);
  }
});

test("[10] pendiente: insignia «Sin verificar», lo que falta contar y el botón", () => {
  const t = texto(pantalla(datos(ESC.pendiente())));
  assert.match(t, /EFECTIVO ENTREGADO \$110\.000,00 Verificado \$0,00 Falta verificar \$110\.000,00/);
  assert.match(t, /Mañana 2 cajas Sin verificar \$110\.000,00 Efectivo entregado Verificado \$0,00 Falta \$110\.000,00 Verificar efectivo/);
  assert.doesNotMatch(t, /\bPendiente\b/, "el estado interno PENDIENTE se lee «Sin verificar»");
});

test("[11] correcto: insignia «Verificado», sin renglón de diferencia vacío", () => {
  const t = texto(pantalla(datos(ESC.correcto())));
  assert.match(t, /Mañana 2 cajas Verificado \$110\.000,00 Efectivo entregado Verificado \$110\.000,00 Falta \$0,00/);
  assert.doesNotMatch(t, /\bCorrecto\b/);
  assert.doesNotMatch(t, /Diferencia/, "con $0 de diferencia no se dibuja el renglón");
  assert.equal(botonDe(pantalla(datos(ESC.correcto())), "Verificar efectivo"), null, "ya está todo verificado");
  assert.match(t, /Ver verificación/);
});

test("[12] con diferencia: −$2.000 · Falta, del acto entero, en el turno y en el efectivo entregado", () => {
  const t = texto(pantalla(datos(ESC.diferencia())));
  assert.match(t, /Con diferencia/);
  assert.match(t, /EFECTIVO ENTREGADO \$110\.000,00 Verificado \$108\.000,00 Falta verificar \$0,00 Diferencia −\$2\.000,00 · Falta/);
  assert.match(t, /Falta \$0,00 Diferencia −\$2\.000,00 · Falta/);
  // Sobra se dice con su palabra, no solo con el color.
  const sobra = ESC.correcto();
  sobra.verificaciones = [acto(9, [{ id: 11, monto: 50000, turnoId: 1, clase: "RECAUDACION", instante: MAÑANA }, { id: 12, monto: 50000, turnoId: 1 }, { id: 21, monto: 10000, turnoId: 2 }], { importeVerificado: 110500 })];
  assert.match(texto(pantalla(datos(sobra))), /Diferencia \+\$500,00 · Sobra/);
});

test("[13][36] parcial: «Verificar efectivo» con SOLO las entregas pendientes", () => {
  const d = datos(ESC.parcial());
  const t = texto(pantalla(d));
  assert.match(t, /Parcial \$110\.000,00 Efectivo entregado Verificado \$100\.000,00 Falta \$10\.000,00 Verificar efectivo/);
  const g = lecturaDelGrupo(d.tesoreria, grupoDe(d));
  assert.deepEqual(g.pendientes.map((e) => e.cajaMovimientoId), [21]);
  assert.deepEqual(g.pendientes.map((e) => e.estadoVerificacion), ["PENDIENTE"]);
  // Lo que abre la hoja son esas pendientes, nada más.
  assert.match(fuente("components/tesoreria/TableroTesoreria.jsx"), /setVerificando\(\{ entregas: g\.pendientes,/);
});

test("[13b] la tarjeta del turno cerrada no lista los nombres de sus cajas: dice cuántas", () => {
  // En el navegador, un turno de 14 cajas listaba diez nombres. La tarjeta dice
  // cuántas son; los nombres aparecen al abrir «Ver cajas».
  const cierre = (id, turnoId, monto) => mov(id, turnoId, CLASE_MOVIMIENTO.CIERRE, monto);
  const d = datos(base({
    cajas: [caja(1), caja(2), caja(3), caja(4), caja(5)],
    movimientos: [cierre(12, 1, 50000), cierre(21, 2, 10000), cierre(31, 3, 7000), cierre(41, 4, 4000), cierre(51, 5, 2000)],
    pagosProveedor: [],
    verificaciones: [acto(9, [{ id: 12, monto: 50000, turnoId: 1 }], { importeVerificado: 50000 })],
  }));
  const t = texto(pantalla(d));
  assert.match(t, /Mañana 5 cajas Parcial/);
  assert.match(t, /Ver cajas \(5\)/);
  assert.doesNotMatch(t, /\bAna\b|\bPedro\b|Caja #/, "la tarjeta cerrada volvió a nombrar las cajas");
});

test("[14] requiere revisión: aviso, insignia y entrada al detalle; nada se recalcula", () => {
  const d = datos(ESC.revision());
  const t = texto(pantalla(d));
  assert.match(t, /Una verificación requiere revisión/);
  assert.match(t, /Ver verificación #9/);
  assert.match(t, /Requiere revisión/);
  assert.match(t, /Una entrega cambió después de verificarla\. Lo verificado no se recalculó\./);
  assert.ok(botonDe(pantalla(d), "Revisar verificación"));
  const det = texto(pantalla(d, { vista: "verificacion", verificacion: 9 }));
  assert.match(det, /cambió después de verificar/);
});

test("[15] sin importe declarado: se dice, nunca «$0»", () => {
  const d = datos(ESC.sinImporte());
  const t = texto(pantalla(d));
  assert.match(t, /Sin importe declarado/);
  assert.match(t, /cerró sin conteo: no hay importe para verificar/);
  const turno = texto(pantalla(d, { vista: "turno", grupo: grupoDe(d) }));
  assert.match(turno, /Carla Sin importe declarado Caja #3 · 08:02 a 14:10/);
  assert.doesNotMatch(turno, /Carla \$0/);
  const det = texto(pantalla(d, { vista: "caja", caja: 3 }));
  assert.match(det, /EFECTIVO ENTREGADO Sin importe declarado/);
  assert.doesNotMatch(det, /EFECTIVO ENTREGADO \$0/);
});

// ── 16-21 · TURNO Y CAJA ─────────────────────────────────────────────────

test("[16] detalle de turno: la misma tarjeta con sus cajas, cada una con su operador real y su caja, sin «Caja 1»", () => {
  const d = datos(ESC.pendiente());
  const t = texto(pantalla(d, { vista: "turno", grupo: grupoDe(d) }));
  assert.match(t, /\$110\.000,00 Efectivo entregado/);
  assert.doesNotMatch(t, /COBRADO DECLARADO|Cobrado declarado/);
  assert.match(t, /CAJAS DEL TURNO Ana \$100\.000,00 Caja #1 · 08:02 a 14:10/);
  assert.match(t, /Pedro \$10\.000,00 Caja #2 · 08:02 a 14:10/);
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
  // El enlace vuelve al TURNO de la caja, por su nombre del catálogo.
  assert.match(t, /Ir a Mañana/);
  // En las cajas del turno, el retiro y el cierre de Ana, juntos y una vez.
  const turno = texto(pantalla(d, { vista: "turno", grupo: grupoDe(d) }));
  assert.match(turno, /Ana \$100\.000,00/);
  assert.doesNotMatch(turno, /\$200\.000/);
});

test("[19] las diferencias de caja no se compensan: cada una «Diferencia de caja» con su signo y su palabra, y ninguna suma", () => {
  const d = datos(ESC.pendiente());
  const t = texto(pantalla(d, { vista: "turno", grupo: grupoDe(d) }));
  assert.match(t, /Ana \$100\.000,00 Caja #1 · 08:02 a 14:10 Diferencia de caja −\$5\.000,00 · Falta/);
  assert.match(t, /Pedro \$10\.000,00 Caja #2 · 08:02 a 14:10 Diferencia de caja \+\$5\.000,00 · Sobra/);
  // −5.000 y +5.000 no dan un turno "sin diferencia": no hay total de
  // diferencias de caja, y la diferencia del turno —de Tesorería— no aparece
  // porque nadie contó todavía.
  assert.doesNotMatch(t, /Diferencia del turno|Total diferencias|Diferencia −|Diferencia \+|Diferencia \$/i);
  assert.equal((t.match(/Diferencia de caja/g) || []).length, 2);
});

test("[20][21] los pagos desde caja se informan como incluidos y NO restan", () => {
  const d = datos(ESC.pendiente());
  const t = texto(pantalla(d));
  assert.match(t, /Pagado desde cajas \$20\.000,00 no resta/);
  // Lo que sale por fuera son los exteriores: 30.000 + 12.000, sin los 20.000 de la caja.
  assert.match(t, /Total egresos exteriores −\$42\.000,00/);
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

test("[24][25] lo digital va en «COBRADO POR POS», por medio; nunca acreditado ni conciliado", () => {
  const t = texto(pantalla(datos(ESC.pendiente())));
  // Total = efectivo vendido (101.000 + 10.000) + digital (5.000 + 5.000), del
  // servidor. En el orden canónico de medios (`ORDEN_MEDIO`): crédito antes
  // que Mercado Pago.
  assert.match(t, /COBRADO POR POS \$121\.000,00 En efectivo \$111\.000,00 Digital \$10\.000,00 Crédito \$5\.000,00 Mercado Pago \$5\.000,00/);
  assert.doesNotMatch(t, /acreditad|conciliad|saldo (de )?Mercado Pago|saldo banco/i);
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
  // La insignia CORRECTO se lee «Verificado» desde el rediseño: un solo juego
  // de textos para el mismo estado.
  assert.match(ok, /ANTES DE CONFIRMAR Verificado Declarado \$110\.000,00 Contado \$110\.000,00 Diferencia Tesorería \$0,00/);
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

test("[TO] la tarjeta del turno se llama por el turno y no lleva un rango horario", () => {
  const d = datos(ESC.pendiente());
  const html = pantalla(d);
  const t = texto(html);
  // "Mañana" con sus dos cajas; nada de "4 cajas · 00:03 a 19:15".
  assert.match(t, /Mañana 2 cajas/);
  assert.doesNotMatch(t, /\d+ cajas? · \d{2}:\d{2} a \d{2}:\d{2}/, "volvió el rango horario a la tarjeta del turno");
  // En Semana, cada turno dice de qué día es.
  const semana = texto(pantalla(datos(ESC.pendiente(), { unidad: "SEMANA" }), { unidad: "SEMANA" }));
  assert.match(semana, /Mañana Domingo 4 de octubre · 2 cajas/);
  // El detalle del turno lleva siempre el día.
  assert.match(texto(pantalla(d, { vista: "turno", grupo: grupoDe(d) })), /Domingo 4 de octubre · 2 cajas/);
});

test("[TO-9] una verificación anterior al turno operativo se lee como tal y con sus importes del acto", () => {
  const vieja = base({
    verificaciones: [acto(9, [{ id: 21, monto: 10000, turnoId: 2 }], { importeVerificado: 9800, turno: null })],
  });
  const t = texto(pantalla(datos(vieja), { vista: "verificacion", verificacion: 9 }));
  assert.match(t, /Verificación anterior al turno operativo/);
  // Lo verificado es lo que se congeló: no se recalcula.
  assert.match(t, /−\$200,00/);
  assert.match(t, /\$9\.800,00/);
  // Una con turno nombra el turno y el día que se verificó.
  const nueva = base({ verificaciones: [acto(9, [{ id: 21, monto: 10000, turnoId: 2 }], { importeVerificado: 10000 })] });
  assert.match(texto(pantalla(datos(nueva), { vista: "verificacion", verificacion: 9 })), /Mañana · Domingo 4 de octubre/);
});

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

test("[37b] un nombre de usuario sin espacios corta adentro de su renglón: no tapa el rótulo ni sale de la tarjeta", () => {
  // En el navegador a 360 px, «Verificó» con un usuario largo y sin espacios se
  // encimaba con el rótulo y se salía de la tarjeta: el valor del renglón era
  // `shrink-0`, pensado para importes. Las filas de nombre lo piden aparte.
  const largo = "cajero.casianocasas.turnonoche.reemplazo";
  const esc = base({ verificaciones: [acto(9, [{ id: 21, monto: 10000, turnoId: 2 }], { importeVerificado: 10000, verificadaPor: { id: 1, nombre: largo }, operador: 33 })] });
  const html = pantalla(datos(esc), { vista: "verificacion", verificacion: 9 });
  for (const valor of [largo, "#33"]) {
    const div = html.match(new RegExp(`<div class="([^"]*)">${valor.replace(/\./g, "\\.")}</div>`));
    assert.ok(div, `no se encontró el valor ${valor}`);
    assert.match(div[1], /\bmin-w-0\b/, `${valor}: el valor no puede encogerse`);
    assert.match(div[1], /\bbreak-words\b/, `${valor}: el valor no corta adentro de la palabra`);
    assert.doesNotMatch(div[1], /\bshrink-0\b/, `${valor}: volvió a ser rígido y tapa el rótulo`);
  }
  // Los importes siguen sin cortarse: el renglón por defecto no cambió.
  assert.match(html, /<div class="shrink-0 text-sm3 [^"]*">\$10\.000,00<\/div>/);
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

test("[41b] con el teclado abierto, los campos de texto de las hojas no se aplastan", () => {
  // El cuerpo de la hoja del kit es una columna flex con scroll. Con el teclado
  // abierto, en el navegador a 360 × 480, la observación de «Verificar» se
  // aplastó de 48 px a 9: no se veía lo escrito. Cada textarea de una hoja de
  // Tesorería tiene que llegar a la pantalla con `shrink-0`.
  const d = datos(ESC.pendiente());
  const acto9 = datos(ESC.diferencia()).tesoreria.verificaciones[0];
  const hojas = {
    observación: renderToStaticMarkup(React.createElement(PasoConfirmar, { entregas: pendientesDe(d), cajas: [], texto: "1", contadoCentavos: 100, observacion: "", onObservacion: nada, onConfirmar: nada, onCambiarImporte: nada })),
    motivo: renderToStaticMarkup(React.createElement(ContenidoAnular, { acto: acto9, motivo: "", onMotivo: nada, onAnular: nada, onCancelar: nada })),
  };
  for (const [campo, html] of Object.entries(hojas)) {
    const areas = html.match(/<textarea[^>]*>/g) || [];
    assert.ok(areas.length > 0, `la hoja del ${campo} ya no tiene textarea: releer este candado`);
    for (const a of areas) assert.match(a, /class="[^"]*\bshrink-0\b/, `el ${campo} se aplasta con el teclado`);
  }
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
  assert.match(t, /EFECTIVO ENTREGADO \$110\.000,00 Verificado \$0,00/);
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

// ── A-I · EL REDISEÑO MÓVIL (Figma EVJ2KvVCrY0oVSowfboymQ 351:499 / 351:620 / 351:707) ──
//
// La jerarquía es COBRADO POR POS → EFECTIVO ENTREGADO → EFECTIVO ENTREGADO
// POR TURNO → cajas. Lo que se defiende acá es lo que separa esos bloques:
// lo digital no baja al turno, lo cobrado no es la cifra del turno, las
// diferencias de caja no se juntan, y lo que no tiene turno se puede verificar.

const SIN_TO = { turnoOperativoId: null, turnoOperativoNombre: null, turnoOperativoOrden: null, fechaOperativa: null };
/** Las dos cajas de Mañana y una tercera, legacy, sin turno, con su cierre de $8.000. */
const conSinTurno = (extra = {}) =>
  base({
    cajas: [caja(1, { diferenciaEfectivo: -5000 }), caja(2, { diferenciaEfectivo: 5000 }), caja(3, SIN_TO)],
    movimientos: [...base().movimientos, mov(31, 3, CLASE_MOVIMIENTO.CIERRE, 8000)],
    ...extra,
  });
const tarjetaDe = (d, clave, extra = {}) =>
  renderToStaticMarkup(
    React.createElement(TurnoConCajas, {
      g: lecturaDelGrupo(d.tesoreria, clave), verificaciones: d.tesoreria.verificaciones,
      puedeVerificar: true, onVerificar: nada, onIr: nada, unidad: "DIA", ...extra,
    })
  );
const sinTurnoDe = (d, clave, extra = {}) =>
  renderToStaticMarkup(
    React.createElement(SinTurnoConCajas, {
      g: lecturaDelGrupo(d.tesoreria, clave), verificaciones: d.tesoreria.verificaciones,
      puedeVerificar: true, onVerificar: nada, onIr: nada, unidad: "DIA", ...extra,
    })
  );
const claveSinTurno = (d) => d.tesoreria.grupos.find((g) => g.sinTurno).clave;
const claveConTurno = (d) => d.tesoreria.grupos.find((g) => !g.sinTurno).clave;

test("[A] COBRADO POR POS: total, efectivo y digital por medio, del servidor; FIADO no es cobro", () => {
  const esc = ESC.pendiente();
  esc.ventas = [...esc.ventas, venta(1, "FIADO", 9000, { esFiado: true, formaPago: "fiado" })];
  const d = datos(esc);
  const html = pantalla(d);
  const bloque = texto(html.match(/<section[^>]*data-cobrado-por-pos[\s\S]*?<\/section>/)?.[0] ?? "");
  assert.match(bloque, /^COBRADO POR POS \$121\.000,00 En efectivo \$111\.000,00 Digital \$10\.000,00 Crédito \$5\.000,00 Mercado Pago \$5\.000,00/);
  assert.equal(d.tesoreria.resumen.cobradoPorPosDeclarado, 121000, "el fiado entró al total cobrado");
  assert.doesNotMatch(texto(html), /fiado/i, "el fiado se presentó como dinero");
  // Es el primer bloque de la pantalla y va antes de lo entregado.
  assert.ok(html.indexOf("data-cobrado-por-pos") < html.indexOf("data-efectivo-entregado"));
  assert.ok(html.indexOf("data-efectivo-entregado") < html.indexOf("data-tarjeta-turno"));
});

test("[B] EFECTIVO ENTREGADO: entregado, verificado y falta verificar del servidor, con su barra", () => {
  const d = datos(ESC.parcial());
  const html = pantalla(d);
  const v = d.tesoreria.resumen.verificacion;
  assert.equal(d.tesoreria.resumen.efectivoDeclaradoEntregado, 110000);
  assert.equal(v.efectivoVerificado, 100000);
  assert.equal(v.entregadoPendienteDeVerificar, 10000);
  assert.match(texto(html), /EFECTIVO ENTREGADO \$110\.000,00 Verificado \$100\.000,00 Falta verificar \$10\.000,00/);
  assert.match(html, /data-efectivo-entregado/);
  assert.match(html, /data-avance/);
});

test("[C] una tarjeta por turno, con el nombre del catálogo, sus cajas, el efectivo protagonista y el avance", () => {
  const esc = base({
    cajas: [caja(1), caja(2), caja(3, { turnoOperativoId: 32, turnoOperativoNombre: "Siesta larga", turnoOperativoOrden: 1 })],
    movimientos: [...base().movimientos, mov(31, 3, CLASE_MOVIMIENTO.CIERRE, 8000)],
  });
  const d = datos(esc);
  const html = pantalla(d);
  assert.equal((html.match(/data-tarjeta-turno=/g) || []).length, 2, "una tarjeta por turno operativo");
  const t = texto(html);
  assert.match(t, /Mañana 2 cajas Sin verificar \$110\.000,00 Efectivo entregado/);
  assert.match(t, /Siesta larga 1 caja Sin verificar \$8\.000,00 Efectivo entregado/);
  // El nombre es el del catálogo del local: la pantalla no conoce ninguno.
  for (const f of ["PantallaTesoreria.jsx", "PiezasTesoreria.jsx", "DetallesTesoreria.jsx"]) {
    assert.doesNotMatch(fuente(`components/tesoreria/${f}`), /["'`>](Mañana|Tarde|Noche|Siesta)\b/, f);
  }
  // La cifra protagonista de la tarjeta es el efectivo ENTREGADO del turno, en el token grande.
  const cifra = tarjetaDe(d, claveConTurno(d)).match(/<div[^>]*data-efectivo-del-turno[^>]*>([^<]*)</);
  assert.ok(cifra, "la tarjeta perdió su cifra protagonista");
  assert.match(cifra[0], /text-xl3/);
  assert.equal(cifra[1], "$110.000,00");
  assert.match(tarjetaDe(d, claveConTurno(d)), /data-avance/);
});

test("[D] la tarjeta del turno no lleva lo digital ni lo cobrado: solo efectivo entregado", () => {
  const d = datos(ESC.pendiente());
  for (const abierto of [false, true]) {
    const t = texto(tarjetaDe(d, claveConTurno(d), { abiertoInicial: abierto }));
    assert.doesNotMatch(t, /Mercado ?Pago|Cr[ée]dito|D[ée]bito|Transferencia|Digital|\bQR\b/i, "lo digital bajó a la tarjeta del turno");
    assert.doesNotMatch(t, /cobrado/i, "lo cobrado volvió a la tarjeta del turno");
    assert.doesNotMatch(t, /\$121\.000|\$10\.000,00 Digital/, "la cifra del turno salió de lo cobrado");
  }
});

test("[E] «Ver cajas (N)» abre las cajas dentro de la misma tarjeta y pasa a «Ocultar cajas»", () => {
  const d = datos(ESC.pendiente());
  const cerrada = texto(tarjetaDe(d, claveConTurno(d)));
  assert.match(cerrada, /Ver cajas \(2\)/);
  assert.doesNotMatch(cerrada, /CAJAS DEL TURNO|Ocultar cajas/);
  const html = tarjetaDe(d, claveConTurno(d), { abiertoInicial: true });
  // Inline: las cajas están adentro de la sección de la tarjeta, no en otra vista.
  assert.match(html, /<section[^>]*data-tarjeta-turno[\s\S]*data-cajas-del-turno[\s\S]*<\/section>$/);
  const t = texto(html);
  assert.match(t, /Ocultar cajas/);
  assert.match(t, /CAJAS DEL TURNO Ana \$100\.000,00 Caja #1 · 08:02 a 14:10 Diferencia de caja −\$5\.000,00 · Falta/);
  assert.match(t, /Pedro \$10\.000,00 Caja #2 · 08:02 a 14:10 Diferencia de caja \+\$5\.000,00 · Sobra/);
  // El estado lo dice el turno: no se repite en cada caja.
  assert.equal((t.match(/Sin verificar/g) || []).length, 1, "la insignia del turno se repitió en cada caja");
  // Cada diferencia de caja sola: dos renglones, ninguno junta las dos.
  assert.equal((html.match(/data-diferencia-de-caja/g) || []).length, 2);
  assert.doesNotMatch(t, /Diferencia \$0|Diferencia −|Diferencia \+|Total diferencias/i, "las diferencias de caja se compensaron");
});

test("[F] «Sin turno asignado» va al final, secundario, y se puede verificar mientras falte", () => {
  const d = datos(conSinTurno());
  const html = pantalla(d);
  assert.ok(html.indexOf("data-sin-turno") > html.lastIndexOf("data-tarjeta-turno"), "sin turno no quedó al final");
  assert.equal((html.match(/data-tarjeta-turno=/g) || []).length, 1, "sin turno se dibujó como un turno más");
  const seco = sinTurnoDe(d, claveSinTurno(d));
  const t = texto(seco);
  assert.match(t, /^Sin turno asignado 1 caja · falta \$8\.000,00 \$8\.000,00 Verificar ›$/);
  assert.ok(botonDe(seco, "Verificar"), "sin turno perdió la verificación");
  // Lo que abre la hoja son sus pendientes, como en cualquier turno.
  assert.deepEqual(lecturaDelGrupo(d.tesoreria, claveSinTurno(d)).pendientes.map((e) => e.cajaMovimientoId), [31]);
  // Sin permiso, no hay "Verificar": se puede ver.
  assert.equal(botonDe(sinTurnoDe(d, claveSinTurno(d), { puedeVerificar: false }), "Verificar"), null);
  assert.match(texto(sinTurnoDe(d, claveSinTurno(d), { puedeVerificar: false })), /\$8\.000,00 Ver ›$/);
  // Verificada, "Ver" abre sus cajas inline.
  const hecha = datos(conSinTurno({ verificaciones: [acto(9, [{ id: 31, monto: 8000, turnoId: 3 }], { importeVerificado: 8000, turno: null })] }));
  assert.equal(botonDe(sinTurnoDe(hecha, claveSinTurno(hecha)), "Verificar"), null);
  assert.match(texto(sinTurnoDe(hecha, claveSinTurno(hecha), { abiertoInicial: true })), /Ocultar › CAJAS DEL TURNO Carla \$8\.000,00 Caja #3/);
});

test("[G] los estados se leen «Sin verificar» y «Verificado», del mismo juego de insignias", () => {
  assert.equal(INSIGNIA_TESORERIA[ESTADO_TESORERIA.PENDIENTE].texto, "Sin verificar");
  assert.equal(INSIGNIA_TESORERIA[ESTADO_TESORERIA.CORRECTO].texto, "Verificado");
  const pend = texto(pantalla(datos(ESC.pendiente())));
  const ok = texto(pantalla(datos(ESC.correcto())));
  assert.match(pend, /Sin verificar/);
  assert.match(ok, /Mañana 2 cajas Verificado/);
  for (const t of [pend, ok]) {
    assert.doesNotMatch(t, /\bPendiente\b|\bCorrecto\b/);
    // "Declarado" quedó para lo que de verdad lo es (la caja sin conteo), no como rótulo.
    assert.doesNotMatch(t, /\bDeclarado\b/);
  }
  // Ninguna pieza escribe el estado a mano: la insignia lee el juego único.
  // ("Verificado" sí aparece literal, como rótulo del IMPORTE contado.)
  for (const f of ["PantallaTesoreria.jsx", "PiezasTesoreria.jsx", "DetallesTesoreria.jsx"]) {
    assert.doesNotMatch(fuente(`components/tesoreria/${f}`), /["'`>]Sin verificar["'`<]/, f);
  }
  assert.match(fuente("components/tesoreria/PiezasTesoreria.jsx"), /INSIGNIA_TESORERIA\[estado\]/);
});

test("[H] Día, Semana, Mes y Otro siguen, con el local del servidor", () => {
  const html = pantalla(datos(ESC.pendiente()));
  const t = texto(html);
  for (const chip of ["Día", "Semana", "Mes", "Otro"]) assert.ok(botonDe(html, chip), `falta el chip ${chip}`);
  assert.match(t, /Casiano Casas/);
  for (const unidad of ["SEMANA", "MES"]) {
    assert.match(texto(pantalla(datos(ESC.pendiente(), { unidad }), { unidad })), /COBRADO POR POS[\s\S]*EFECTIVO ENTREGADO[\s\S]*EFECTIVO ENTREGADO POR TURNO/);
  }
});

test("[I] el rediseño no trae colores fijos: todo sale de los tokens del tema", () => {
  for (const f of ["PantallaTesoreria.jsx", "PiezasTesoreria.jsx", "DetallesTesoreria.jsx"]) {
    const src = fuente(`components/tesoreria/${f}`);
    assert.doesNotMatch(src, /\b(text|bg|border|from|to|ring)-(amber|red|green|emerald|slate|cyan|sky|rose|yellow|gray|zinc|white|black)(-\d|\b)/, f);
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|rgb\(/, f);
  }
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
