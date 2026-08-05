// Cómo se muestra una conciliación.
//
// Lo que se prueba acá es lo que rompe la pantalla en silencio: un estado sin
// etiqueta, un motivo que se pierde, un importe nulo mostrado como $0, un color
// sin texto que lo acompañe.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PRESENTACION_ESTADO,
  ESTADOS_FILTRABLES,
  presentarEstado,
  textoDeMotivo,
  textoDeCoincidencia,
  money,
  moneyConSigno,
  porcentaje,
  tonoDiferencia,
  fechaHora,
  tamanoArchivo,
  metricasDeImportacion,
  resumenCoherente,
  proveedorAdmiteImportacion,
  validarArchivoEnCliente,
  mensajeDeError,
} from "./presentacion.js";
import { PRIORIDAD_ESTADO, ESTADO_LINEA } from "./estados.js";
import { MOTIVO_BLOQUEO } from "./calculoCosto.js";
import { MOTIVO_UNIDAD } from "./configuraciones/arcor.js";
import { MOTIVO_CONCILIACION } from "./conciliarLista.js";
import { LIMITES } from "./persistencia.js";

// ═══ ESTADOS ═════════════════════════════════════════════════════════════════

test("1. los ocho estados tienen presentación", () => {
  for (const e of PRIORIDAD_ESTADO) {
    assert.ok(PRESENTACION_ESTADO[e], `falta ${e}`);
  }
  assert.equal(Object.keys(PRESENTACION_ESTADO).length, 8);
});

test("2. cada estado tiene etiqueta, tono Y símbolo", () => {
  // El símbolo es lo que hace que el estado se entienda sin distinguir colores.
  for (const e of PRIORIDAD_ESTADO) {
    const p = presentarEstado(e);
    assert.ok(p.etiqueta.length > 0, `${e} sin etiqueta`);
    assert.ok(p.tono.startsWith("sunmi-"), `${e} usa un color literal: ${p.tono}`);
    assert.ok(p.simbolo.length > 0, `${e} sin símbolo`);
  }
});

test("3. ningún tono es un color hardcodeado de Tailwind", () => {
  const prohibido = /\b(bg|text|border)-(red|amber|cyan|emerald|green|slate|orange)-/;
  for (const e of PRIORIDAD_ESTADO) {
    const p = presentarEstado(e);
    assert.ok(!prohibido.test(p.tono), `${e}: ${p.tono}`);
    assert.ok(!prohibido.test(p.texto), `${e}: ${p.texto}`);
  }
});

test("4. dos estados distintos no comparten etiqueta", () => {
  const etiquetas = PRIORIDAD_ESTADO.map((e) => presentarEstado(e).etiqueta);
  assert.equal(new Set(etiquetas).size, etiquetas.length);
});

test("5. un estado desconocido no rompe la pantalla", () => {
  const p = presentarEstado("INVENTADO");
  assert.equal(p.etiqueta, "INVENTADO");
  assert.ok(p.tono.startsWith("sunmi-"));
});

test("6. el filtro ofrece los ocho, de más grave a más leve", () => {
  assert.equal(ESTADOS_FILTRABLES.length, 8);
  assert.equal(ESTADOS_FILTRABLES[0].valor, ESTADO_LINEA.ERROR);
  assert.equal(ESTADOS_FILTRABLES[7].valor, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
  for (const e of ESTADOS_FILTRABLES) assert.ok(e.etiqueta.length > 0);
});

// ═══ MOTIVOS ═════════════════════════════════════════════════════════════════

test("7. el motivo de unidad incompatible tiene texto", () => {
  const t = textoDeMotivo(MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE);
  assert.match(t, /por unidad/);
  assert.match(t, /por kilo/);
});

test("8. los motivos del proveedor tienen texto", () => {
  for (const m of Object.values(MOTIVO_UNIDAD)) {
    const t = textoDeMotivo(m);
    assert.ok(t.length > 10, `${m} sin texto: "${t}"`);
    assert.notEqual(t, m, `${m} no está traducido`);
  }
});

test("9. los motivos del motor tienen texto", () => {
  for (const m of Object.values(MOTIVO_CONCILIACION)) {
    const t = textoDeMotivo(m);
    assert.ok(t.length > 10, `${m} sin texto`);
  }
});

test("10. un motivo desconocido NO se esconde: se muestra crudo", () => {
  // Esconderlo dejaría al usuario sin lo único que puede corregir.
  assert.equal(textoDeMotivo("ALGO_NUEVO"), "ALGO_NUEVO");
});

test("11. sin motivo no hay texto", () => {
  assert.equal(textoDeMotivo(null), "");
  assert.equal(textoDeMotivo(undefined), "");
  assert.equal(textoDeMotivo(""), "");
});

test("12. los cuatro tipos de coincidencia tienen nombre en castellano", () => {
  for (const t of ["CODIGO_INTERNO", "CODIGO_INTERNO_SIN_CEROS", "AMBIGUA", "NINGUNA"]) {
    assert.ok(textoDeCoincidencia(t).length > 0);
    assert.notEqual(textoDeCoincidencia(t), t);
  }
  assert.equal(textoDeCoincidencia("XX"), "—");
});

// ═══ FORMATOS ════════════════════════════════════════════════════════════════

test("13. los importes se muestran en formato local", () => {
  assert.equal(money(12600), "$ 12.600,00");
  assert.equal(money(1050.5), "$ 1.050,50");
});

test("14. un importe AUSENTE se muestra como raya, no como cero", () => {
  // Mostrar $0,00 donde no hay costo haría creer que el producto vale cero.
  for (const v of [null, undefined, "", NaN, Infinity]) {
    assert.equal(money(v), "—", String(v));
  }
  assert.equal(money(0), "$ 0,00");
});

test("15. la diferencia lleva signo", () => {
  assert.equal(moneyConSigno(200), "+$ 200,00");
  assert.equal(moneyConSigno(-200), "-$ 200,00");
  assert.equal(moneyConSigno(0), "$ 0,00");
  assert.equal(moneyConSigno(null), "—");
});

test("16. los porcentajes son legibles", () => {
  assert.equal(porcentaje(5), "5,00 %");
  assert.equal(porcentaje(29.989999999), "29,99 %");
  assert.equal(porcentaje(30, { conSigno: true }), "+30,00 %");
  assert.equal(porcentaje(null), "—");
});

test("17. el tono de la diferencia distingue subir de bajar", () => {
  assert.equal(tonoDiferencia(200), "sunmi-text-warning");
  assert.equal(tonoDiferencia(-200), "sunmi-text-success");
  assert.equal(tonoDiferencia(0), "sunmi-text-muted");
  assert.equal(tonoDiferencia(null), "sunmi-text-muted");
});

test("18. fechas y tamaños", () => {
  assert.equal(fechaHora(null), "—");
  assert.equal(fechaHora("no es fecha"), "—");
  assert.ok(fechaHora("2026-08-05T02:31:02.000Z").length > 8);
  assert.equal(tamanoArchivo(0), "—");
  assert.equal(tamanoArchivo(500), "500 B");
  assert.equal(tamanoArchivo(69742), "68 KB");
  assert.equal(tamanoArchivo(10 * 1024 * 1024), "10.0 MB");
});

// ═══ RESUMEN ═════════════════════════════════════════════════════════════════

const CAB = {
  totalFilas: 917, listoParaActualizar: 400, sinCambios: 100, noMacheadas: 150,
  codigoDuplicado: 0, factorDudoso: 230, excluidas: 0, bloqueadas: 35, errores: 2,
  variacionAlta: 12, sugerenciasCodigoBarras: 5, faltantes: 3,
};

test("19. el resumen trae las ocho métricas pedidas", () => {
  const m = metricasDeImportacion(CAB);
  assert.equal(m.length, 8);
  assert.deepEqual(m.map((x) => x.etiqueta), [
    "Total", "Listos", "Sin cambios", "Sin vincular",
    "Revisar armado", "Bloqueadas", "Errores", "Variación alta",
  ]);
});

test("20. las métricas salen del backend, no se recalculan", () => {
  const m = metricasDeImportacion(CAB);
  assert.equal(m.find((x) => x.clave === "totalFilas").valor, 917);
  assert.equal(m.find((x) => x.clave === "listoParaActualizar").valor, 400);
  assert.equal(m.find((x) => x.clave === "variacionAlta").valor, 12);
});

test("21. una cabecera vacía muestra ceros, no undefined", () => {
  for (const m of metricasDeImportacion({})) {
    assert.equal(m.valor, 0, m.etiqueta);
  }
});

test("22. los tonos de las métricas son tokens semánticos", () => {
  for (const m of metricasDeImportacion(CAB)) {
    assert.ok(m.tono.startsWith("sunmi-text-"), `${m.etiqueta}: ${m.tono}`);
  }
});

test("23. el resumen cierra contra el total", () => {
  assert.equal(resumenCoherente(CAB), true);
  assert.equal(resumenCoherente({ ...CAB, totalFilas: 900 }), false);
});

// ═══ PROVEEDORES ═════════════════════════════════════════════════════════════

test("24. un proveedor CON parser admite importación", () => {
  const r = proveedorAdmiteImportacion({ id: 1, nombre: "Arcor", parserListaId: "ARCOR_XLSX" });
  assert.equal(r.admite, true);
  assert.equal(r.motivo, null);
});

test("25. un proveedor SIN parser no admite, y se dice por qué", () => {
  const r = proveedorAdmiteImportacion({ id: 2, nombre: "Otro", parserListaId: null });
  assert.equal(r.admite, false);
  assert.match(r.motivo, /formato de su lista/);
});

test("26. sin proveedor elegido", () => {
  assert.equal(proveedorAdmiteImportacion(null).admite, false);
});

// ═══ ARCHIVO ═════════════════════════════════════════════════════════════════

const archivo = (nombre, size) => ({ name: nombre, size });

test("27. un .xlsx dentro del límite pasa", () => {
  assert.equal(validarArchivoEnCliente(archivo("lista.xlsx", 69742), LIMITES).ok, true);
});

test("28. extensión inválida", () => {
  for (const n of ["lista.xls", "lista.csv", "lista.pdf", "lista"]) {
    const r = validarArchivoEnCliente(archivo(n, 100), LIMITES);
    assert.equal(r.ok, false, n);
    assert.match(r.error, /\.xlsx/);
  }
});

test("29. archivo vacío", () => {
  assert.match(validarArchivoEnCliente(archivo("a.xlsx", 0), LIMITES).error, /vacío/);
});

test("30. tamaño excedido", () => {
  const r = validarArchivoEnCliente(archivo("a.xlsx", LIMITES.tamanoMaxBytes + 1), LIMITES);
  assert.equal(r.ok, false);
  assert.match(r.error, /límite/);
});

test("31. sin archivo", () => {
  assert.equal(validarArchivoEnCliente(null, LIMITES).ok, false);
});

test("32. la validación del cliente usa los MISMOS límites que el servidor", () => {
  // Si divergieran, el usuario subiría 10 MB para que el servidor lo rechace.
  assert.equal(validarArchivoEnCliente(archivo("a.xlsx", LIMITES.tamanoMaxBytes), LIMITES).ok, true);
  assert.equal(validarArchivoEnCliente(archivo("a.xlsx", LIMITES.tamanoMaxBytes + 1), LIMITES).ok, false);
});

// ═══ ERRORES DEL SERVIDOR ════════════════════════════════════════════════════

test("33. un error común muestra su mensaje", () => {
  const r = mensajeDeError({ error: "Proveedor no encontrado en tu alcance." }, 404);
  assert.equal(r.mensaje, "Proveedor no encontrado en tu alcance.");
  assert.equal(r.duplicada, false);
  assert.equal(r.importacionId, null);
});

test("34. el 409 de duplicado trae el id y el estado de la existente", () => {
  const r = mensajeDeError(
    {
      error: "Este archivo ya fue importado.",
      importacionExistente: { id: 42, estado: "CONCILIADA", archivoNombre: "lista.xlsx" },
    },
    409
  );
  assert.equal(r.duplicada, true);
  assert.equal(r.importacionId, 42);
  assert.equal(r.estadoExistente, "CONCILIADA");
  assert.match(r.detalle, /#42/);
  assert.match(r.detalle, /CONCILIADA/);
});

test("35. el 409 de una importación DESCARTADA también se explica", () => {
  const r = mensajeDeError(
    { error: "Este archivo ya fue importado.", importacionExistente: { id: 7, estado: "DESCARTADA" } },
    409
  );
  assert.equal(r.duplicada, true);
  assert.equal(r.estadoExistente, "DESCARTADA");
  assert.match(r.detalle, /DESCARTADA/);
});

test("36. una respuesta sin cuerpo no rompe", () => {
  const r = mensajeDeError(null, 500);
  assert.ok(r.mensaje.length > 0);
  assert.equal(r.duplicada, false);
});
