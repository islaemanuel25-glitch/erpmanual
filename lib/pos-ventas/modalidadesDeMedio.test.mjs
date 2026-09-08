// CANDADOS DEL SERVIDOR DE MODALIDADES.
//
// Todo lo de acá es puro: se ejerce el COMPORTAMIENTO —qué condición sale de qué
// selección, qué número sale de qué condición— y no el texto del código. La parte
// que necesita PostgreSQL —los índices, los snapshots que sobreviven a un borrado,
// el 409 sin filas— vive en `scripts/pruebas-db/mediosCobro.mjs`, que corre
// después de `migrate deploy`.
//
// ── LO QUE ESTOS CANDADOS EXISTEN PARA IMPEDIR ─────────────────────────────
//
// Que vuelva a haber DOS matemáticas. Antes de esta tanda había una sola porque
// una condición comercial se identificaba por su `MedioPago`; ahora hay dos
// entradas —legacy y modalidades— y la tentación de escribir un motor al lado es
// exactamente lo que rompería el preview contra el backend. Varios de estos
// candados no comprueban un número: comprueban que los dos caminos den EL MISMO.

import test from "node:test";
import assert from "node:assert/strict";

import {
  CONFLICTO_COBRO,
  claveCobro,
  cobroLegacyAmbiguo,
  componerModalidades,
  condicionDeMedio,
  condicionDeModalidad,
  condicionLegacy,
  adjuntarModalidades,
  normalizarEntradaModalidad,
  opcionesDeCobro,
  requiereModalidad,
  resolverComisionDeModalidad,
  resolverCondicionDeCobro,
  resolverTenders,
} from "./modalidadesDeMedio.js";
import { aplicarComisionesResueltas, consolidarTenders, derivarCamposVenta } from "./pagos.js";
import { recargoDeCondiciones, recargoDeVenta } from "../recargos-pago/recargoPago.js";
import { calcularVentaComercial } from "../ofertas/motorVenta.js";
import { totalParaCondiciones, totalesPorOpcionDeCobro } from "../ofertas/previewPos.js";

// ── El local de ejemplo, y es EL caso que el modelo viejo no podía ──────────
//
// Mercado Pago con dos modalidades que comparten CREDITO y cobran distinto. Al
// lado, un Banco que también es CREDITO: es lo que prueba que la identidad del
// padre y la de la modalidad no se confunden.
const mercadoPago = {
  id: 10,
  nombre: "Mercado Pago",
  activo: true,
  tipoContable: "MERCADOPAGO",
  procesador: "MERCADOPAGO",
  recargoPct: 0,
  comisionPct: 5,
  modalidades: componerModalidades([
    { id: 101, nombre: "Crédito 1 pago", activo: true, orden: 1, tipoContable: "CREDITO", recargoPct: 4, comisionPct: 3 },
    { id: 102, nombre: "Crédito cuotas", activo: true, orden: 2, tipoContable: "CREDITO", recargoPct: 8, comisionPct: 7 },
    { id: 103, nombre: "QR / saldo", activo: false, orden: 3, tipoContable: "MERCADOPAGO", recargoPct: 1, comisionPct: 2 },
  ]),
};
const bancoCredito = {
  id: 20,
  nombre: "Banco X",
  activo: true,
  tipoContable: "CREDITO",
  procesador: "BANCO",
  recargoPct: 6,
  comisionPct: 9,
  modalidades: [],
};
const efectivo = {
  id: 30,
  nombre: "Efectivo",
  activo: true,
  tipoContable: "EFECTIVO",
  procesador: null,
  recargoPct: 0,
  comisionPct: 0,
  modalidades: [],
};
const MEDIOS = [efectivo, mercadoPago, bancoCredito];
const RECARGOS = { EFECTIVO: 0, DEBITO: 0, CREDITO: 6, MERCADOPAGO: 0 };
const COMISIONES = { CREDITO: 9, DEBITO: 4, MERCADOPAGO: 5 };

const carrito = [
  { productoLocalId: 1, nombre: "Yerba", cantidad: 2, precio: 1000 },
  { productoLocalId: 2, nombre: "Fideos", cantidad: 1, precio: 500 },
];

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTACIÓN LEGACY → CONDICIÓN CANÓNICA
// ═══════════════════════════════════════════════════════════════════════════

test("un cobro legacy se convierte en una condición SIN inventar identidad", () => {
  const c = condicionLegacy("CREDITO", { recargosPorMedio: RECARGOS, comisionPctPorMedio: COMISIONES });
  assert.equal(c.medio, "CREDITO");
  assert.equal(c.recargoPct, 6);
  assert.equal(c.comisionPct, 9);
  // Los cinco de identidad en null: no se inventan ids para un cliente que no
  // los mandó. Una fila de VentaPago así significa lo que siempre significó.
  assert.deepEqual(
    [c.medioCobroLocalId, c.medioNombre, c.procesador, c.modalidadId, c.modalidadNombre],
    [null, null, null, null, null]
  );
});

test("el camino legacy y el canónico dan EXACTAMENTE el mismo recargo", () => {
  // El wrapper viejo tiene que ser una conversión de entrada, no otro algoritmo.
  const porMedios = recargoDeVenta(["EFECTIVO", "CREDITO"], RECARGOS);
  const porCondiciones = recargoDeCondiciones([
    condicionLegacy("EFECTIVO", { recargosPorMedio: RECARGOS }),
    condicionLegacy("CREDITO", { recargosPorMedio: RECARGOS }),
  ]);
  assert.deepEqual(porMedios, { pct: porCondiciones.pct, medio: porCondiciones.medio });
  assert.equal(porMedios.pct, 6);
});

test("el motor sin condiciones se comporta igual que con las condiciones legacy", () => {
  const viejo = calcularVentaComercial({
    lineas: [{ productoLocalId: 1, cantidad: 1, precioNormal: 1000 }],
    mediosUsados: ["CREDITO"],
    recargosPorMedio: RECARGOS,
  });
  const nuevo = calcularVentaComercial({
    lineas: [{ productoLocalId: 1, cantidad: 1, precioNormal: 1000 }],
    condicionesDeCobro: [condicionLegacy("CREDITO", { recargosPorMedio: RECARGOS })],
  });
  assert.equal(viejo.total, nuevo.total);
  assert.equal(viejo.total, 1060);
  assert.equal(viejo.recargoPagoMedio, "CREDITO");
  // Y el camino legacy no inventa un ganador con identidad.
  assert.equal(viejo.recargoPagoModalidadId, null);
  assert.equal(viejo.recargoPagoMedioCobroLocalId, null);
});

// ═══════════════════════════════════════════════════════════════════════════
// EL MAYOR RECARGO, Y QUIÉN LO IMPUSO
// ═══════════════════════════════════════════════════════════════════════════

test("entre dos modalidades del MISMO MedioPago manda la de mayor recargo", () => {
  const unPago = condicionDeModalidad(mercadoPago, mercadoPago.modalidades[0]);
  const cuotas = condicionDeModalidad(mercadoPago, mercadoPago.modalidades[1]);
  const r = recargoDeCondiciones([unPago, cuotas]);

  assert.equal(r.pct, 8);
  assert.equal(r.medio, "CREDITO");
  // Y se sabe CUÁL de las dos, que es lo que un mapa por enum no podía contestar.
  assert.equal(r.ganador.modalidadId, 102);
  assert.equal(r.ganador.modalidadNombre, "Crédito cuotas");
  assert.equal(r.ganador.medioNombre, "Mercado Pago");
});

test("el ganador sale del MISMO cálculo que el porcentaje, y llega a la venta", () => {
  const r = calcularVentaComercial({
    lineas: [{ productoLocalId: 1, cantidad: 1, precioNormal: 1000 }],
    condicionesDeCobro: [
      condicionDeModalidad(mercadoPago, mercadoPago.modalidades[0]),
      condicionDeModalidad(mercadoPago, mercadoPago.modalidades[1]),
    ],
  });
  assert.equal(r.recargoPagoPct, 8);
  assert.equal(r.total, 1080);
  assert.equal(r.recargoPagoMedio, "CREDITO");
  assert.equal(r.recargoPagoMedioCobroLocalId, 10);
  assert.equal(r.recargoPagoMedioNombre, "Mercado Pago");
  assert.equal(r.recargoPagoModalidadId, 102);
  assert.equal(r.recargoPagoModalidadNombre, "Crédito cuotas");
});

test("el empate NO depende del orden en que llegaron los candidatos", () => {
  // Dos modalidades del mismo tipo contable empatadas al 8 %: el ganador tiene
  // que ser el mismo se lean como se lean. Sin esto, el preview y el backend
  // podrían congelar identidades distintas para la misma venta.
  const a = { medio: "CREDITO", recargoPct: 8, medioCobroLocalId: 10, modalidadId: 102, modalidadNombre: "cuotas" };
  const b = { medio: "CREDITO", recargoPct: 8, medioCobroLocalId: 10, modalidadId: 101, modalidadNombre: "1 pago" };

  assert.deepEqual(recargoDeCondiciones([a, b]).ganador, recargoDeCondiciones([b, a]).ganador);
  // La regla concreta, escrita para que se pueda discutir: gana la modalidad de
  // id más bajo. Cuál es importa menos que que sea siempre la misma.
  assert.equal(recargoDeCondiciones([a, b]).ganador.modalidadId, 101);
});

test("el recargo sigue sin prorratearse: la lista manda, no los importes", () => {
  const soloUna = recargoDeCondiciones([condicionDeModalidad(mercadoPago, mercadoPago.modalidades[1])]);
  const conEfectivo = recargoDeCondiciones([
    condicionDeMedio(efectivo),
    condicionDeModalidad(mercadoPago, mercadoPago.modalidades[1]),
  ]);
  assert.equal(soloUna.pct, conEfectivo.pct);
});

// ═══════════════════════════════════════════════════════════════════════════
// DOS MODALIDADES DEL MISMO MedioPago NO SE COLAPSAN
// ═══════════════════════════════════════════════════════════════════════════

test("dos modalidades distintas son DOS tenders aunque compartan CREDITO", () => {
  const r = consolidarTenders(
    [
      { ...condicionDeModalidad(mercadoPago, mercadoPago.modalidades[0]), monto: 100 },
      { ...condicionDeModalidad(mercadoPago, mercadoPago.modalidades[1]), monto: 200 },
    ],
    300
  );
  assert.equal(r.error, undefined);
  assert.equal(r.tenders.length, 2);
  assert.deepEqual(r.tenders.map((t) => t.medio), ["CREDITO", "CREDITO"]);
  assert.deepEqual(r.tenders.map((t) => t.modalidadId), [101, 102]);
});

test("la MISMA modalidad repetida se consolida en uno solo, igual que un medio repetido", () => {
  // Es la semántica que el normalizador legacy tiene desde que existe el pago
  // dividido. Rechazar acá habría sido inventar una segunda regla para el mismo
  // hecho.
  const mod = condicionDeModalidad(mercadoPago, mercadoPago.modalidades[0]);
  const r = consolidarTenders([{ ...mod, monto: 100 }, { ...mod, monto: 200 }], 300);
  assert.equal(r.tenders.length, 1);
  assert.equal(r.tenders[0].monto, 300);
  assert.equal(r.tenders[0].modalidadId, 101);
});

test("un cobro CON modalidad y otro SIN modalidad no se pisan entre sí", () => {
  const r = consolidarTenders(
    [
      { ...condicionDeModalidad(mercadoPago, mercadoPago.modalidades[0]), monto: 100 },
      { ...condicionDeMedio(bancoCredito), monto: 200 },
    ],
    300
  );
  assert.equal(r.tenders.length, 2);
  // Los dos son CREDITO y no son el mismo cobro. Es exactamente lo que los dos
  // índices parciales de la base admiten.
  assert.deepEqual(r.tenders.map((t) => t.medioNombre), ["Mercado Pago", "Banco X"]);
});

test("las reglas de plata de siempre no se aflojaron", () => {
  const mod = condicionDeModalidad(mercadoPago, mercadoPago.modalidades[0]);
  assert.match(consolidarTenders([{ ...mod, monto: 100 }], 300).error, /suma de los pagos/);
  assert.match(consolidarTenders([{ ...mod, monto: 0 }], 300).error, /Monto inválido/);
  assert.match(consolidarTenders([], 300).error, /al menos un pago/);
  assert.match(
    consolidarTenders(
      [{ medio: "FIADO", monto: 100 }, { ...mod, monto: 200 }],
      300
    ).error,
    /FIADO debe ser el único/
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// COMISIÓN POR TENDER
// ═══════════════════════════════════════════════════════════════════════════

test("cada modalidad congela SU comisión en la misma venta", () => {
  const tenders = aplicarComisionesResueltas([
    { ...condicionDeModalidad(mercadoPago, mercadoPago.modalidades[0]), monto: 100 },
    { ...condicionDeModalidad(mercadoPago, mercadoPago.modalidades[1]), monto: 200 },
  ]);

  assert.deepEqual(tenders.map((t) => t.comisionPct), [3, 7]);
  assert.deepEqual(tenders.map((t) => t.comision), [3, 14]);
  assert.deepEqual(tenders.map((t) => t.neto), [97, 186]);
  // Y la identidad viaja intacta hasta la persistencia.
  assert.deepEqual(tenders.map((t) => t.modalidadNombre), ["Crédito 1 pago", "Crédito cuotas"]);
  assert.deepEqual(tenders.map((t) => t.procesador), ["MERCADOPAGO", "MERCADOPAGO"]);
});

test("una comisión sin configurar sigue siendo null y deja la venta pendiente", () => {
  const sinComision = {
    ...condicionDeModalidad(mercadoPago, {
      id: 104, nombre: "Crédito 12", activo: true, orden: 4, tipoContable: "CREDITO", recargoPct: 12, comisionPct: null,
    }),
    monto: 100,
  };
  const tenders = aplicarComisionesResueltas([sinComision]);

  assert.equal(tenders[0].comisionPct, null);
  assert.equal(tenders[0].comision, 0);
  assert.equal(derivarCamposVenta(tenders).comisionPendiente, true);
});

test("una modalidad de EFECTIVO no cobra comisión, y eso NO es un dato que falte", () => {
  const enEfectivo = componerModalidades([
    { id: 201, nombre: "Efectivo QR", activo: true, orden: 1, tipoContable: "EFECTIVO", recargoPct: 0, comisionPct: null },
  ])[0];
  assert.deepEqual(resolverComisionDeModalidad(enEfectivo), { pct: 0, origen: "sin-comision" });

  const tenders = aplicarComisionesResueltas([
    { ...condicionDeModalidad(mercadoPago, enEfectivo), monto: 100 },
  ]);
  assert.equal(tenders[0].comisionPct, null);
  assert.equal(derivarCamposVenta(tenders).comisionPendiente, false);
});

test("la comisión de una modalidad NO se hereda del grupo", () => {
  // El motivo está escrito en `resolverComisionDeModalidad`: ninguna columna de
  // ConfiguracionGrupo corresponde a una modalidad de Mercado Pago, así que
  // heredar devolvería un número ajeno con cara de medición.
  const sinConfigurar = componerModalidades([
    { id: 202, nombre: "Crédito 18", activo: true, orden: 1, tipoContable: "CREDITO", recargoPct: 20, comisionPct: null },
  ])[0];
  assert.equal(resolverComisionDeModalidad(sinConfigurar).origen, "sin-configurar");
  assert.equal(condicionDeModalidad(mercadoPago, sinConfigurar).comisionPct, null);
});

// ═══════════════════════════════════════════════════════════════════════════
// RESOLVER LA SELECCIÓN DEL CAJERO
// ═══════════════════════════════════════════════════════════════════════════

test("un medio SIN modalidades se resuelve con la condición del padre, con identidad", () => {
  const r = resolverCondicionDeCobro({ medio: bancoCredito });
  assert.equal(r.ok, true);
  assert.deepEqual(r.condicion, {
    medioCobroLocalId: 20,
    medioNombre: "Banco X",
    procesador: "BANCO",
    modalidadId: null,
    modalidadNombre: null,
    medio: "CREDITO",
    recargoPct: 6,
    comisionPct: 9,
  });
});

test("con DOS modalidades activas y sin elegir, se RECHAZA", () => {
  const r = resolverCondicionDeCobro({ medio: mercadoPago });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, CONFLICTO_COBRO.MODALIDAD_REQUERIDA);
});

test("con UNA sola modalidad activa el servidor la resuelve solo", () => {
  const unaSola = { ...mercadoPago, modalidades: mercadoPago.modalidades.slice(1, 2) };
  const r = resolverCondicionDeCobro({ medio: unaSola });
  assert.equal(r.ok, true);
  assert.equal(r.resueltaSola, true);
  assert.equal(r.condicion.modalidadId, 102);
  // Y la pantalla no tiene por qué mostrar un selector de una opción.
  assert.equal(requiereModalidad(unaSola), false);
  assert.equal(requiereModalidad(mercadoPago), true);
});

test("una modalidad INACTIVA no se puede cobrar aunque el cliente mande su id", () => {
  const r = resolverCondicionDeCobro({ medio: mercadoPago, modalidadId: 103 });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, CONFLICTO_COBRO.MODALIDAD_INACTIVA);
});

test("un medio DESACTIVADO mientras el POS estaba abierto no cobra en silencio", () => {
  const r = resolverCondicionDeCobro({ medio: { ...bancoCredito, activo: false } });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, CONFLICTO_COBRO.MEDIO_INACTIVO);
});

test("todas las modalidades apagadas devuelven el medio a como estaba antes", () => {
  const apagadas = {
    ...mercadoPago,
    modalidades: mercadoPago.modalidades.map((m) => ({ ...m, activo: false })),
  };
  const r = resolverCondicionDeCobro({ medio: apagadas });
  assert.equal(r.ok, true);
  assert.equal(r.condicion.modalidadId, null);
  assert.equal(r.condicion.medio, "MERCADOPAGO");
});

// ═══════════════════════════════════════════════════════════════════════════
// SEGURIDAD: EL CLIENTE NO ES AUTORIDAD DE NADA
// ═══════════════════════════════════════════════════════════════════════════

test("un medio de OTRO local no existe", () => {
  const r = resolverTenders({ medios: MEDIOS, pagos: [{ medioCobroLocalId: 999, monto: 100 }] });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, CONFLICTO_COBRO.MEDIO_INEXISTENTE);
});

test("una modalidad de OTRO padre no existe", () => {
  // 101 es de Mercado Pago; se la pide colgada de Banco X.
  const r = resolverTenders({ medios: MEDIOS, pagos: [{ medioCobroLocalId: 20, modalidadId: 101, monto: 100 }] });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, CONFLICTO_COBRO.MODALIDAD_INEXISTENTE);
});

test("el porcentaje, la comisión, el tipo y el procesador que manda el cliente se IGNORAN", () => {
  const r = resolverTenders({
    medios: MEDIOS,
    pagos: [
      {
        medioCobroLocalId: 10,
        modalidadId: 102,
        monto: 100,
        // Todo esto es lo que un navegador podría inventar desde la consola.
        recargoPct: 0,
        comisionPct: 0,
        medio: "EFECTIVO",
        tipoContable: "EFECTIVO",
        procesador: "OTRO",
        medioNombre: "Regalo",
        modalidadNombre: "Gratis",
      },
    ],
    recargosPorMedio: RECARGOS,
    comisionPctPorMedio: COMISIONES,
  });

  assert.equal(r.ok, true);
  assert.deepEqual(r.tenders[0], {
    medioCobroLocalId: 10,
    medioNombre: "Mercado Pago",
    procesador: "MERCADOPAGO",
    modalidadId: 102,
    modalidadNombre: "Crédito cuotas",
    medio: "CREDITO",
    recargoPct: 8,
    comisionPct: 7,
    monto: 100,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EL CLIENTE VIEJO DURANTE LA TRANSICIÓN
// ═══════════════════════════════════════════════════════════════════════════

test("un POS viejo NO puede saltear el recargo de una modalidad", () => {
  // `medio: MERCADOPAGO` a secas, con modalidades configuradas adentro: cobrarlo
  // contra RecargoPagoLocal daría 0 % en vez del 8 % de Crédito cuotas.
  const r = resolverTenders({ medios: MEDIOS, pagos: [{ medio: "mercadopago", monto: 100 }] });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, CONFLICTO_COBRO.MODALIDAD_REQUERIDA);
});

test("los demás medios legacy siguen siendo inequívocos y siguen funcionando", () => {
  // Banco X es CREDITO y no tiene modalidades. Que Mercado Pago tenga adentro
  // una modalidad TAMBIÉN clasificada como CREDITO no lo vuelve ambiguo: lo que
  // los distingue es la identidad del botón padre.
  const r = resolverTenders({
    medios: MEDIOS,
    pagos: [{ medio: "credito", monto: 60 }, { medio: "efectivo", monto: 40 }],
    recargosPorMedio: RECARGOS,
    comisionPctPorMedio: COMISIONES,
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.tenders.map((t) => t.medio), ["CREDITO", "EFECTIVO"]);
  assert.deepEqual(r.tenders.map((t) => t.recargoPct), [6, 0]);
  // Y sin identidad inventada.
  assert.deepEqual(r.tenders.map((t) => t.medioCobroLocalId), [null, null]);

  assert.deepEqual(cobroLegacyAmbiguo(MEDIOS, "CREDITO"), { ambiguo: false });
  assert.equal(cobroLegacyAmbiguo(MEDIOS, "MERCADOPAGO").ambiguo, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// OFERTAS SOLO EFECTIVO
// ═══════════════════════════════════════════════════════════════════════════

const ofertaEfectivo = {
  1: { ofertaId: 7, ofertaNombre: "Yerba en efectivo", precioOferta: 800, condicionPago: "SOLO_EFECTIVO" },
};

test("una oferta SOLO_EFECTIVO sigue sin aplicar cuando se paga con una modalidad", () => {
  const r = calcularVentaComercial({
    lineas: [{ productoLocalId: 1, cantidad: 1, precioNormal: 1000 }],
    ofertasPorProductoLocal: ofertaEfectivo,
    condicionesDeCobro: [condicionDeModalidad(mercadoPago, mercadoPago.modalidades[0])],
  });
  assert.equal(r.lineas[0].precioAplicado, 1000);
  assert.equal(r.hayOfertaSoloEfectivoNoAplicada, true);
});

test("una modalidad de tipo EFECTIVO cuenta como efectivo para la oferta", () => {
  // Lo que decide es el TIPO CONTABLE EFECTIVO del tender, sin importar por qué
  // botón se llegó. Que exista una modalidad no puede romper `cumpleCondicionPago`.
  const modEfectivo = componerModalidades([
    { id: 301, nombre: "Efectivo QR", activo: true, orden: 1, tipoContable: "EFECTIVO", recargoPct: 0, comisionPct: null },
  ])[0];
  const r = calcularVentaComercial({
    lineas: [{ productoLocalId: 1, cantidad: 1, precioNormal: 1000 }],
    ofertasPorProductoLocal: ofertaEfectivo,
    condicionesDeCobro: [condicionDeModalidad(mercadoPago, modEfectivo)],
  });
  assert.equal(r.lineas[0].precioAplicado, 800);
  assert.equal(r.total, 800);
});

test("con una modalidad de efectivo Y otra de crédito la oferta NO aplica", () => {
  const modEfectivo = componerModalidades([
    { id: 301, nombre: "Efectivo QR", activo: true, orden: 1, tipoContable: "EFECTIVO", recargoPct: 0, comisionPct: null },
  ])[0];
  const r = calcularVentaComercial({
    lineas: [{ productoLocalId: 1, cantidad: 1, precioNormal: 1000 }],
    ofertasPorProductoLocal: ofertaEfectivo,
    condicionesDeCobro: [
      condicionDeModalidad(mercadoPago, modEfectivo),
      condicionDeModalidad(mercadoPago, mercadoPago.modalidades[0]),
    ],
  });
  assert.equal(r.lineas[0].precioAplicado, 1000);
});

// ═══════════════════════════════════════════════════════════════════════════
// PREVIEW: EL MISMO MOTOR, Y UNA CLAVE QUE NO PISA
// ═══════════════════════════════════════════════════════════════════════════

test("dos modalidades del mismo MedioPago dan DOS previews distintos", () => {
  const previews = totalesPorOpcionDeCobro({ carrito, medios: MEDIOS });
  const claves = Object.keys(previews);

  // Efectivo, Banco X, y las DOS modalidades activas de Mercado Pago. El botón
  // padre de MP no aparece: abre el selector, no cobra.
  assert.equal(claves.length, 4);
  assert.deepEqual(claves.sort(), ["medio:20", "medio:30", "mod:101", "mod:102"]);

  assert.equal(previews["mod:101"].recargoPagoPct, 4);
  assert.equal(previews["mod:102"].recargoPagoPct, 8);
  assert.equal(previews["mod:101"].total, 2600);
  assert.equal(previews["mod:102"].total, 2700);
  // Y el preview dice CUÁL es cada uno, para que la pantalla no tenga que
  // deducirlo del enum —donde los dos dirían CREDITO—.
  assert.deepEqual(
    [previews["mod:101"].modalidadNombre, previews["mod:102"].modalidadNombre],
    ["Crédito 1 pago", "Crédito cuotas"]
  );
});

test("el preview no hace matemática propia: da lo mismo que el motor", () => {
  const previews = totalesPorOpcionDeCobro({ carrito, medios: MEDIOS });
  const condicion = condicionDeModalidad(mercadoPago, mercadoPago.modalidades[1]);

  const delMotor = calcularVentaComercial({
    lineas: carrito.map((i) => ({
      productoLocalId: i.productoLocalId,
      productoBaseId: null,
      nombre: i.nombre,
      cantidad: i.cantidad,
      precioNormal: i.precio,
      esServicio: false,
      subtotalFijado: null,
    })),
    ofertasPorProductoLocal: {},
    condicionesDeCobro: [condicion],
  });

  assert.equal(previews["mod:102"].total, delMotor.total);
  assert.equal(previews["mod:102"].totalAntesRecargo, delMotor.totalAntesRecargo);
  assert.equal(previews["mod:102"].recargoPagoImporte, delMotor.recargoPagoImporte);
  // Y el atajo para el panel de dividir usa el mismo camino.
  assert.equal(totalParaCondiciones({ carrito, condiciones: [condicion] }).total, delMotor.total);
});

test("la clave de una opción no colapsa dos modalidades del mismo tipo contable", () => {
  const a = claveCobro(condicionDeModalidad(mercadoPago, mercadoPago.modalidades[0]));
  const b = claveCobro(condicionDeModalidad(mercadoPago, mercadoPago.modalidades[1]));
  assert.notEqual(a, b);
  // Y un medio sin modalidades se direcciona por su id, no por su tipo: dos
  // medios distintos del mismo tipo tampoco se pisarían.
  assert.equal(claveCobro(condicionDeMedio(bancoCredito)), "medio:20");
  assert.equal(claveCobro(condicionLegacy("CREDITO", {})), "tipo:CREDITO");
});

test("opcionesDeCobro saltea los medios apagados y las modalidades apagadas", () => {
  const opciones = opcionesDeCobro([{ ...bancoCredito, activo: false }, mercadoPago]);
  assert.deepEqual(opciones.map((o) => o.clave), ["mod:101", "mod:102"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSICIÓN Y ENTRADA
// ═══════════════════════════════════════════════════════════════════════════

test("las modalidades se ordenan por orden y desempatan por nombre", () => {
  const compuestas = componerModalidades([
    { id: 2, nombre: "Zeta", activo: true, orden: 1, tipoContable: "CREDITO", recargoPct: 1 },
    { id: 3, nombre: "Alfa", activo: true, orden: 1, tipoContable: "CREDITO", recargoPct: 2 },
    { id: 1, nombre: "Primera", activo: true, orden: 0, tipoContable: "DEBITO", recargoPct: 3 },
  ]);
  assert.deepEqual(compuestas.map((m) => m.nombre), ["Primera", "Alfa", "Zeta"]);
});

test("un medio por DEFECTO no tiene modalidades, y eso es la verdad", () => {
  const compuestos = adjuntarModalidades(
    [{ id: null, nombre: "Crédito", tipoContable: "CREDITO", activo: true }],
    []
  );
  assert.deepEqual(compuestos[0].modalidades, []);
  assert.equal(compuestos[0].requiereModalidad, false);
});

test("adjuntarModalidades le pega a cada medio LAS SUYAS", () => {
  const compuestos = adjuntarModalidades(
    [{ id: 10, nombre: "Mercado Pago" }, { id: 20, nombre: "Banco X" }],
    [
      { id: 10, modalidades: [{ id: 101, nombre: "Crédito", activo: true, orden: 1, tipoContable: "CREDITO", recargoPct: 4 }] },
      { id: 20, modalidades: [] },
    ]
  );
  assert.deepEqual(compuestos[0].modalidades.map((m) => m.id), [101]);
  assert.deepEqual(compuestos[1].modalidades, []);
});

test("la entrada de una modalidad se valida con las MISMAS reglas que la del medio", () => {
  assert.equal(normalizarEntradaModalidad({ nombre: "", tipoContable: "CREDITO" }).valido, false);
  assert.match(normalizarEntradaModalidad({ nombre: "X", tipoContable: "FIADO" }).error, /FIADO/);
  assert.match(normalizarEntradaModalidad({ nombre: "X", tipoContable: "CREDITO", recargoPct: 120 }).error, /recargo/);
  assert.match(
    normalizarEntradaModalidad({ nombre: "X", tipoContable: "CREDITO", comisionPct: 120 }).error,
    /comisión/
  );

  const ok = normalizarEntradaModalidad({ nombre: " Crédito ", tipoContable: "credito" });
  assert.equal(ok.valido, true);
  assert.equal(ok.nombre, "Crédito");
  assert.equal(ok.tipoContable, "CREDITO");
  // Sin recargo declarado = 0, igual que la ausencia de fila en RecargoPagoLocal.
  assert.equal(ok.recargoPct, 0);
  // Sin comisión declarada = sin configurar, que NO es 0.
  assert.equal(ok.comisionPct, null);
});

test("vaciar la comisión vuelve a dejarla sin configurar, y no en cero", () => {
  assert.equal(normalizarEntradaModalidad({ comisionPct: "" }, { parcial: true }).comisionPct, null);
  assert.equal(normalizarEntradaModalidad({ comisionPct: 0 }, { parcial: true }).comisionPct, 0);
  // Un PATCH que no habla de la comisión no la toca.
  assert.equal("comisionPct" in normalizarEntradaModalidad({ nombre: "X" }, { parcial: true }), false);
});
