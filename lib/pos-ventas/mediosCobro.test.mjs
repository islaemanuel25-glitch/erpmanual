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
  componerMedios,
  resolverComision,
  validarMedios,
  mediosVisibles,
  ordenarMedios,
  recargosDeMedios,
  comisionesDeMedios,
  claveEdicionDe,
  parsearClaveEdicion,
  normalizarEntrada,
  PREFIJO_CLAVE_DEFECTO,
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

test("SIN GRUPO NI OVERRIDE NO HAY NÚMERO: queda sin configurar", () => {
  // Acá había un 7 de respaldo. No era una regla de negocio de nadie —venía del
  // `@default(7)` de la base y de un `?? 7` copiado en tres rutas— y decidía
  // cuánto se le descontaba al comercio en cada venta.
  const r = resolverComision({ tipoContable: "CREDITO", comisionPct: null }, null);
  assert.equal(r.pct, null, "un porcentaje inventado sería peor que no tener ninguno");
  assert.equal(r.origen, "sin-configurar");
});

test("y sigue siendo HEREDADA, porque el local no decidió nada", () => {
  // El día que se configure la comisión del grupo, este local la toma solo. Si
  // se marcara como propia estaríamos diciendo que el local eligió no tener
  // comisión, que es justo la confusión que esto viene a evitar.
  const r = resolverComision({ tipoContable: "CREDITO", comisionPct: null }, null);
  assert.equal(r.heredada, true);
});

test("un grupo con las tres comisiones en null es un grupo válido", () => {
  // Es el estado de un grupo recién creado desde que la columna dejó de tener
  // `@default(7)`.
  const grupoNuevo = { comisionDebito: null, comisionCredito: null, comisionMercadopago: null };
  for (const tipo of ["DEBITO", "CREDITO", "MERCADOPAGO"]) {
    const r = resolverComision({ tipoContable: tipo, comisionPct: null }, grupoNuevo);
    assert.equal(r.pct, null, tipo);
    assert.equal(r.origen, "sin-configurar", tipo);
  }
});

test("EL GRUPO QUE HOY TIENE 7 GUARDADO SIGUE RESOLVIENDO 7", () => {
  // Es el requisito de no regresión de la migración: el valor no se toca y se
  // sigue heredando, pero ahora porque está ALMACENADO y no porque el código lo
  // invente.
  const grupoActual = { comisionDebito: 7, comisionCredito: 7, comisionMercadopago: 7 };
  const r = resolverComision({ tipoContable: "DEBITO", comisionPct: null }, grupoActual);
  assert.equal(r.pct, 7);
  assert.equal(r.origen, "grupo");
  assert.equal(r.heredada, true);
});

test("un 0 en el local es una comisión CONOCIDA de 0 %, no una ausencia", () => {
  const r = resolverComision({ tipoContable: "DEBITO", comisionPct: 0 }, { comisionDebito: 9 });
  assert.equal(r.pct, 0);
  assert.equal(r.origen, "local");
  assert.equal(r.heredada, false, "alguien lo decidió para este local");
});

test("comisionesDeMedios NO convierte la ausencia en 0: la deja afuera", () => {
  // Es el lugar exacto donde un dato faltante se habría vuelto una comisión de
  // cero, en silencio y con cara de medición.
  const mapa = comisionesDeMedios([
    { tipoContable: "DEBITO", comisionPct: null },
    { tipoContable: "CREDITO", comisionPct: 0 },
    { tipoContable: "MERCADOPAGO", comisionPct: 5 },
  ]);
  assert.equal("DEBITO" in mapa, false, "sin configurar no entra al mapa");
  assert.equal(mapa.CREDITO, 0, "el 0 explícito sí, porque es un número");
  assert.equal(mapa.MERCADOPAGO, 5);
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

// ══════════════════════════════════════════════════════════════════════════
// QUE NUNCA QUEDE EL LOCAL SIN MEDIOS ACTIVOS
// ══════════════════════════════════════════════════════════════════════════
//
// La regla vive acá y NO en cada verbo. Antes DELETE la defendía con un `count`
// propio y PATCH no la defendía con nada, así que apagar el único medio activo
// dejaba el POS sin botones por un camino y no por el otro. Una regla escrita dos
// veces es una regla que va a estar en un solo lado.

test("apagar el ÚNICO medio activo se rechaza", () => {
  const r = validarMedios([
    { nombre: "Efectivo", activo: false, tipoContable: "EFECTIVO" },
    { nombre: "Débito", activo: false, tipoContable: "DEBITO" },
  ]);
  assert.equal(r.valido, false);
  assert.equal(r.motivo, "SIN_ACTIVOS");
  // Tiene que decir qué pasa en la caja, no nombrar una condición.
  assert.match(r.error, /sin botones|no hay con qué cobrar|medio de cobro activo/);
});

test("con dos activos, apagar uno se permite", () => {
  const r = validarMedios([
    { nombre: "Efectivo", activo: true, tipoContable: "EFECTIVO" },
    { nombre: "Débito", activo: false, tipoContable: "DEBITO" },
  ]);
  assert.equal(r.valido, true);
});

test("una configuración vacía tampoco pasa", () => {
  // El resultado de borrar la última fila. Un local sin filas usa los defaults,
  // pero un local que TENÍA configuración y se quedó sin nada no vuelve solo a
  // los defaults: quedaría sin medios.
  assert.equal(validarMedios([]).valido, false);
  assert.equal(validarMedios([]).motivo, "SIN_ACTIVOS");
});

test("los dos motivos se distinguen, porque se arreglan distinto", () => {
  const duplicado = validarMedios([
    { nombre: "A", activo: true, tipoContable: "DEBITO" },
    { nombre: "B", activo: true, tipoContable: "DEBITO" },
  ]);
  assert.equal(duplicado.motivo, "TIPO_DUPLICADO");
  assert.equal(validarMedios([{ nombre: "A", activo: false, tipoContable: "DEBITO" }]).motivo, "SIN_ACTIVOS");
});

// ══════════════════════════════════════════════════════════════════════════
// LA CLAVE DE EDICIÓN: CÓMO SE PIDE EDITAR ALGO QUE TODAVÍA NO EXISTE
// ══════════════════════════════════════════════════════════════════════════
//
// La pantalla recibe la clave y la devuelve. No la arma, no la parsea y no tiene
// ninguna regla del tipo "si el id es null mandá un 0".

test("un medio materializado se direcciona por su id", () => {
  assert.equal(claveEdicionDe({ id: 12, tipoContable: "DEBITO" }), "12");
});

test("un default se direcciona por su tipo, con prefijo y sin número mágico", () => {
  const clave = claveEdicionDe({ id: null, tipoContable: "DEBITO" });
  assert.equal(clave, `${PREFIJO_CLAVE_DEFECTO}DEBITO`);
  assert.equal(/^\d+$/.test(clave), false, "no puede parecer un id, o alguien lo va a tratar como uno");
});

test("componerMedios le pone la clave a todos, existan o no", () => {
  const defaults = componerMedios({ filas: [], configuracionGrupo: GRUPO });
  assert.ok(defaults.every((m) => m.claveEdicion), "un default sin clave no se podría editar");
  assert.ok(defaults.every((m) => m.id === null));

  const configurado = componerMedios({
    filas: [{ id: 7, nombre: "Efectivo", activo: true, orden: 1, tipoContable: "EFECTIVO" }],
    configuracionGrupo: GRUPO,
  });
  assert.equal(configurado[0].claveEdicion, "7");
});

test("la clave se lee de vuelta a lo que era: ida y vuelta sin pérdida", () => {
  assert.deepEqual(parsearClaveEdicion(claveEdicionDe({ id: 12 })), { clase: "id", id: 12 });
  assert.deepEqual(parsearClaveEdicion(claveEdicionDe({ id: null, tipoContable: "CREDITO" })), {
    clase: "defecto",
    tipoContable: "CREDITO",
  });
});

test("una clave que no direcciona nada se rechaza antes de tocar la base", () => {
  for (const basura of [null, "", "  ", "0", "-3", "abc", "1.5", `${PREFIJO_CLAVE_DEFECTO}CRIPTO`]) {
    assert.equal(parsearClaveEdicion(basura), null, `"${basura}" no debería direccionar nada`);
  }
  // FIADO tampoco: no es un medio de cobro, así que no hay default suyo.
  assert.equal(parsearClaveEdicion(`${PREFIJO_CLAVE_DEFECTO}FIADO`), null);
});

// ══════════════════════════════════════════════════════════════════════════
// EL RECARGO ENTRA POR LA MISMA PUERTA PERO NO SE GUARDA EN LA MISMA TABLA
// ══════════════════════════════════════════════════════════════════════════

test("el recargo sale en un campo aparte, no mezclado con los del medio", () => {
  // Si viniera mezclado, un `update` que pase los campos de largo lo mandaría a
  // una columna que no existe. Sale separado para que quien escribe TENGA que
  // decidir dónde va.
  const r = normalizarEntrada({ nombre: "Débito", tipoContable: "DEBITO", recargoPct: 5 });
  assert.equal(r.valido, true);
  assert.equal(r.recargoPct, 5);
  assert.equal("recargo" in r, false);
});

test("no mencionar el recargo es distinto de ponerlo en 0", () => {
  // `undefined` es "el pedido no habla del recargo" y no toca la fila. 0 es "no
  // se le cobra recargo" y sí se guarda. Confundirlos borraría configuración.
  const sinTocar = normalizarEntrada({ nombre: "Débito", tipoContable: "DEBITO" });
  assert.equal(sinTocar.recargoPct, undefined);

  const enCero = normalizarEntrada({ nombre: "Débito", tipoContable: "DEBITO", recargoPct: 0 });
  assert.equal(enCero.recargoPct, 0);
});

test("un recargo fuera de rango se rechaza con el mismo criterio que la ruta de recargos", () => {
  assert.equal(normalizarEntrada({ nombre: "D", tipoContable: "DEBITO", recargoPct: 250 }).valido, false);
  assert.equal(normalizarEntrada({ nombre: "D", tipoContable: "DEBITO", recargoPct: -1 }).valido, false);
  assert.equal(normalizarEntrada({ nombre: "D", tipoContable: "DEBITO", recargoPct: "x" }).valido, false);
});
