// CANDADO: LOS MEDIOS DE COBRO CONFIGURABLES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/mediosCobro.test.mjs
//
// ── LO QUE MÁS SE CUIDA ACÁ ────────────────────────────────────────────────
//
// Que un local SIN configuración se comporte exactamente como el POS de hoy.
// Todo lo demás de esta tanda es funcionalidad nueva que nadie está usando
// todavía; esto es lo único que puede ROMPER algo que ya funciona, en las cinco
// bocas, en cada venta.

import test from "node:test";
import assert from "node:assert/strict";

import {
  MEDIOS_POR_DEFECTO,
  COMISION_PCT_DEFAULT,
  componerMedios,
  resolverComision,
  validarMedios,
  mediosVisibles,
  ordenarMedios,
  recargosDeMedios,
  comisionesDeMedios,
} from "@/lib/pos-ventas/mediosCobro.js";
import { MEDIOS_CON_COMISION } from "@/lib/pos-ventas/pagos.js";

const GRUPO = { comisionDebito: 7, comisionCredito: 7, comisionMercadopago: 7 };

// ══════════════════════════════════════════════════════════════════════════
// SIN CONFIGURAR NADA: EL POS DE HOY
// ══════════════════════════════════════════════════════════════════════════

test("un local sin configuración devuelve los CUATRO medios de hoy, en el orden de hoy", () => {
  const medios = componerMedios({ filas: [], configuracionGrupo: GRUPO });

  assert.deepEqual(
    medios.map((m) => m.tipoContable),
    ["EFECTIVO", "DEBITO", "CREDITO", "MERCADOPAGO"],
    "es el orden exacto de MEDIOS_COBRO de FormaPago.jsx antes de esta tanda"
  );
  assert.deepEqual(
    medios.map((m) => m.nombre),
    ["Efectivo", "Débito", "Crédito", "Mercado Pago"],
    "los nombres salen de MEDIO_LABEL, no de un literal nuevo"
  );
  assert.ok(medios.every((m) => m.activo), "los cuatro visibles");
  assert.ok(medios.every((m) => m.esDefault), "y marcados como default, no como decisión de nadie");
});

test("FIADO NO es un medio de cobro configurable", () => {
  // No entra plata: es una promesa de pago. Es tender único, no admite recargo ni
  // comisión, y el POS ya lo dibuja aparte con sus propias condiciones. Si
  // apareciera acá, pasaría a ser un botón más y perdería todas esas reglas.
  const medios = componerMedios({ filas: [], configuracionGrupo: GRUPO });
  assert.equal(medios.some((m) => m.tipoContable === "FIADO"), false);
  assert.equal(MEDIOS_POR_DEFECTO.some((d) => d.tipoContable === "FIADO"), false);
});

test("sin recargos configurados, ninguno cobra de más", () => {
  const medios = componerMedios({ filas: [], recargosPorMedio: {}, configuracionGrupo: GRUPO });
  assert.deepEqual(medios.map((m) => m.recargoPct), [0, 0, 0, 0]);
});

// ══════════════════════════════════════════════════════════════════════════
// LA COMISIÓN: HEREDADA CONTRA OVERRIDE
// ══════════════════════════════════════════════════════════════════════════

test("comisión local en null: hereda la del grupo, y lo DICE", () => {
  const r = resolverComision({ tipoContable: "DEBITO", comisionPct: null }, { comisionDebito: 7 });
  assert.equal(r.pct, 7);
  assert.equal(r.heredada, true);
  assert.equal(r.origen, "grupo");
});

test("comisión local con valor: manda el override y NO figura como heredada", () => {
  const r = resolverComision({ tipoContable: "DEBITO", comisionPct: 3.5 }, { comisionDebito: 7 });
  assert.equal(r.pct, 3.5);
  assert.equal(r.heredada, false);
  assert.equal(r.origen, "local");
});

test("cambiar la comisión del GRUPO mueve a los heredados y no a los que tienen override", () => {
  // Es la razón de que el null se conserve en vez de backfillear: si al migrar se
  // hubiera copiado el 7 en cada local, este candado sería imposible.
  const sinOverride = { tipoContable: "DEBITO", comisionPct: null };
  const conOverride = { tipoContable: "DEBITO", comisionPct: 3.5 };

  assert.equal(resolverComision(sinOverride, { comisionDebito: 7 }).pct, 7);
  assert.equal(resolverComision(sinOverride, { comisionDebito: 9 }).pct, 9, "sigue al grupo");

  assert.equal(resolverComision(conOverride, { comisionDebito: 7 }).pct, 3.5);
  assert.equal(resolverComision(conOverride, { comisionDebito: 9 }).pct, 3.5, "el override no se mueve");
});

test("sin grupo ni override cae en el 7 de siempre, que es UN solo número", () => {
  // El mismo `?? 7` que `pos-ventas/crear` venía usando. Vive acá una vez: si se
  // cambiara, cambiaría lo que se le cobra al comercio.
  assert.equal(COMISION_PCT_DEFAULT, 7);
  assert.equal(resolverComision({ tipoContable: "CREDITO", comisionPct: null }, null).pct, 7);
  assert.equal(resolverComision({ tipoContable: "CREDITO", comisionPct: null }, null).origen, "default");
});

test("el efectivo no tiene comisión de procesador y no hereda nada", () => {
  const r = resolverComision({ tipoContable: "EFECTIVO", comisionPct: null }, { comisionDebito: 7 });
  assert.equal(r.pct, 0);
  assert.equal(r.heredada, false, "0 acá es un hecho, no una herencia");
  assert.equal(MEDIOS_CON_COMISION.includes("EFECTIVO"), false);
});

// ══════════════════════════════════════════════════════════════════════════
// UN SOLO MEDIO ACTIVO POR TIPO CONTABLE
// ══════════════════════════════════════════════════════════════════════════

test("dos medios ACTIVOS del mismo tipo contable se rechazan", () => {
  const r = validarMedios([
    { nombre: "Débito Banco", activo: true, tipoContable: "DEBITO" },
    { nombre: "MP Débito", activo: true, tipoContable: "DEBITO" },
  ]);
  assert.equal(r.valido, false);
  assert.equal(r.tipoContable, "DEBITO");
  // El mensaje tiene que explicar la CONSECUENCIA, no nombrar una restricción.
  assert.match(r.error, /MP Débito/);
  assert.match(r.error, /Débito Banco/);
  assert.match(r.error, /pago dividido|se rechazaría en la caja/);
});

test("uno activo y otro INACTIVO del mismo tipo: permitido", () => {
  // Guardar un medio apagado con su configuración es justamente para qué sirve
  // `activo`. Solo los activos pueden chocar.
  const r = validarMedios([
    { nombre: "Débito Banco", activo: true, tipoContable: "DEBITO" },
    { nombre: "MP Débito", activo: false, tipoContable: "DEBITO" },
  ]);
  assert.equal(r.valido, true);
});

test("MP Débito + MP Crédito + MP QR conviven: tres tipos contables distintos", () => {
  // El caso que motivó separar tipo contable de procesador. Los tres pasan por
  // Mercado Pago y los tres son cosas distintas en el libro.
  const r = validarMedios([
    { nombre: "MP Débito", activo: true, tipoContable: "DEBITO", procesador: "MERCADOPAGO" },
    { nombre: "MP Crédito", activo: true, tipoContable: "CREDITO", procesador: "MERCADOPAGO" },
    { nombre: "MP QR", activo: true, tipoContable: "MERCADOPAGO", procesador: "MERCADOPAGO" },
    { nombre: "Efectivo", activo: true, tipoContable: "EFECTIVO" },
  ]);
  assert.equal(r.valido, true);
});

test("el mismo procesador repetido NO es problema: lo que choca es el tipo", () => {
  const r = validarMedios([
    { nombre: "MP QR", activo: true, tipoContable: "MERCADOPAGO", procesador: "MERCADOPAGO" },
    { nombre: "Débito", activo: true, tipoContable: "DEBITO", procesador: "MERCADOPAGO" },
  ]);
  assert.equal(r.valido, true);
});

// ══════════════════════════════════════════════════════════════════════════
// NOMBRE, ORDEN Y VISIBILIDAD
// ══════════════════════════════════════════════════════════════════════════

test("el nombre visible NO altera el tipo contable", () => {
  // Es la garantía de que la configuración no reescribe historia: el botón puede
  // llamarse cualquier cosa, la venta congela el tipo.
  const medios = componerMedios({
    filas: [{ id: 1, nombre: "MP Débito", activo: true, orden: 1, tipoContable: "DEBITO", procesador: "MERCADOPAGO", comisionPct: null }],
    configuracionGrupo: GRUPO,
  });
  assert.equal(medios[0].nombre, "MP Débito");
  assert.equal(medios[0].tipoContable, "DEBITO", "el tipo no se mueve con el nombre");
  assert.equal(medios[0].procesador, "MERCADOPAGO");
});

test("el orden configurado manda, y a igualdad desempata el nombre", () => {
  // `orden` no es único: rechazar una edición porque dos empataron en 3 sería
  // molestar por nada. Pero sin desempate estable los botones se moverían solos
  // entre consultas.
  const medios = componerMedios({
    filas: [
      { id: 1, nombre: "Zeta", activo: true, orden: 2, tipoContable: "CREDITO" },
      { id: 2, nombre: "Alfa", activo: true, orden: 2, tipoContable: "DEBITO" },
      { id: 3, nombre: "Primero", activo: true, orden: 1, tipoContable: "EFECTIVO" },
    ],
    configuracionGrupo: GRUPO,
  });
  assert.deepEqual(medios.map((m) => m.nombre), ["Primero", "Alfa", "Zeta"]);
  assert.equal(ordenarMedios({ orden: 1, nombre: "a" }, { orden: 1, nombre: "b" }) < 0, true);
});

test("los inactivos no llegan al POS pero siguen existiendo", () => {
  const medios = componerMedios({
    filas: [
      { id: 1, nombre: "Efectivo", activo: true, orden: 1, tipoContable: "EFECTIVO" },
      { id: 2, nombre: "Crédito", activo: false, orden: 2, tipoContable: "CREDITO" },
    ],
    configuracionGrupo: GRUPO,
  });
  assert.equal(medios.length, 2, "la configuración los conserva");
  assert.deepEqual(mediosVisibles(medios).map((m) => m.nombre), ["Efectivo"]);
});

test("con UNA fila configurada, los defaults ya no se mezclan", () => {
  // Todo o nada: si hubiera mezcla, apagar un medio haría reaparecer los otros
  // tres como defaults y no se podría ocultar nada.
  const medios = componerMedios({
    filas: [{ id: 1, nombre: "Solo efectivo", activo: true, orden: 1, tipoContable: "EFECTIVO" }],
    configuracionGrupo: GRUPO,
  });
  assert.equal(medios.length, 1);
  assert.equal(medios[0].esDefault, false);
});

// ══════════════════════════════════════════════════════════════════════════
// LOS PUENTES HACIA EL MOTOR
// ══════════════════════════════════════════════════════════════════════════

test("el motor recibe TIPOS CONTABLES, nunca nombres visibles", () => {
  // `calcularVentaComercial` razona en tipos porque es lo que congela la venta.
  // Si le llegara el nombre configurado, la condición comercial dependería de
  // cómo alguien decidió llamar a un botón.
  const medios = componerMedios({
    filas: [
      { id: 1, nombre: "MP Débito", activo: true, orden: 1, tipoContable: "DEBITO", comisionPct: 3 },
      { id: 2, nombre: "Apagado", activo: false, orden: 2, tipoContable: "CREDITO", comisionPct: 9 },
    ],
    recargosPorMedio: { DEBITO: 5, CREDITO: 10 },
    configuracionGrupo: GRUPO,
  });

  assert.deepEqual(recargosDeMedios(medios), { DEBITO: 5 }, "solo los activos, y por tipo");
  assert.deepEqual(comisionesDeMedios(medios), { DEBITO: 3, CREDITO: 9 },
    "la comisión sí incluye inactivos: una venta histórica puede tener ese tender");
});

test("el recargo sale de RecargoPagoLocal aunque el medio esté configurado", () => {
  // Fuente única. Si `MedioCobroLocal` tuviera su propia columna de recargo,
  // habría dos números para lo mismo y este candado no podría existir.
  const medios = componerMedios({
    filas: [{ id: 1, nombre: "Débito", activo: true, orden: 1, tipoContable: "DEBITO", comisionPct: null }],
    recargosPorMedio: { DEBITO: 5 },
    configuracionGrupo: GRUPO,
  });
  assert.equal(medios[0].recargoPct, 5);
});

test("recargo y comisión siguen siendo dos números distintos", () => {
  const medios = componerMedios({
    filas: [{ id: 1, nombre: "Débito", activo: true, orden: 1, tipoContable: "DEBITO", comisionPct: 3 }],
    recargosPorMedio: { DEBITO: 5 },
    configuracionGrupo: GRUPO,
  });
  assert.equal(medios[0].recargoPct, 5, "lo paga el CLIENTE y sube el total");
  assert.equal(medios[0].comisionPct, 3, "la paga el COMERCIO y baja el neto");
  assert.notEqual(medios[0].recargoPct, medios[0].comisionPct);
});
