// LOS BLOQUES POR LOCAL: LA CUENTA QUE EL DEPÓSITO ABRE Y MIRA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/bloquesPorLocal.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  acuerdoDeLocal,
  bloquesPorLocal,
  cuentaDelLocal,
  entraEnLaVistaPrincipal,
  estaRecibida,
  fechaDeCorte,
} from "@/lib/transferencias/bloquesPorLocal";
import { UNIDADES } from "@/lib/transferencias/periodoDePago";

// 2026-09-13 es DOMINGO. Todo se ancla ahí.
const MIERCOLES = "2026-09-16";

const BASE = {
  id: 1,
  nombre: "COCA COLA 2L",
  unidad_medida: "cajon",
  factor_pack: 8,
  precio_costo: 23333.33,
  pesoEsFijo: false,
};

/** Una línea de 4 CAJÓN x8 —32 físicas— que puede llegar completa o no. */
const linea = (recibido) => ({
  cantidad: 32,
  recibido,
  recibidoUnidadesSueltas: 0,
  unidadEnviada: "UNIDAD",
  precioCosto: 23333.33,
  presentacionEnvio: "CAJON",
  cantidadPresentada: 4,
  sueltasEnviadas: 0,
  factorPresentacion: 8,
  pesoPiezaKg: null,
  producto: { base: BASE },
});

const transferencia = (id, destinoId, nombre, estado, fecha, recibido) => ({
  id,
  estado,
  destinoId,
  destino: { id: destinoId, nombre },
  origen: { id: 1, nombre: "depo", es_deposito: true },
  fechaEnvio: `${fecha}T12:00:00.000Z`,
  createdAt: `${fecha}T12:00:00.000Z`,
  detalle: [linea(recibido)],
});

// mini el 7 corta DOMINGO; Casiano corta LUNES. Es el caso que obliga a la tabla.
const ACUERDOS = [
  { localId: 2, diaDeCorte: 0 },
  { localId: 4, diaDeCorte: 1 },
];

test("un bloque por local, con SU período adentro", () => {
  const bs = bloquesPorLocal({
    transferencias: [
      transferencia(1, 2, "mini el 7", "Recibida", "2026-09-14", 4),
      transferencia(2, 4, "Casiano casas", "Recibida", "2026-09-14", 4),
    ],
    acuerdos: ACUERDOS,
    unidad: UNIDADES.SEMANA,
    hoy: MIERCOLES,
  });

  assert.equal(bs.length, 2);
  const mini = bs.find((b) => b.localId === 2);
  const casiano = bs.find((b) => b.localId === 4);

  // LA AFIRMACIÓN CENTRAL: cada bloque trae un rango distinto, porque cada uno
  // tiene su acuerdo. Si los dos dieran igual, la tabla no serviría para nada.
  assert.deepEqual(mini.rango, { desde: "2026-09-13", hasta: "2026-09-19" });
  assert.deepEqual(casiano.rango, { desde: "2026-09-14", hasta: "2026-09-20" });
  assert.notDeepEqual(mini.rango, casiano.rango, "los dos locales comparten período: no se miró el acuerdo");
});

test("y una transferencia puede caer en el período de UNO y no en el del otro", () => {
  // El sábado 2026-09-19 está DENTRO de la semana que corta domingo y dentro de la
  // que corta lunes. El domingo 13 está en la primera y NO en la segunda.
  const bs = bloquesPorLocal({
    transferencias: [
      transferencia(1, 2, "mini el 7", "Recibida", "2026-09-13", 4),
      transferencia(2, 4, "Casiano casas", "Recibida", "2026-09-13", 4),
    ],
    acuerdos: ACUERDOS,
    unidad: UNIDADES.SEMANA,
    hoy: MIERCOLES,
  });

  assert.equal(bs.length, 1, "el local que corta lunes no tendría que tener bloque esa semana");
  assert.equal(bs[0].localId, 2);
});

test("EL IMPORTE ES EL DE LO RECIBIDO, y por eso cambia al contar", () => {
  // Cuatro cajones enviados, valor del remito 93.333,32. Si llegan DOS, lo que el
  // local paga es la mitad — porque paga lo que llegó, no lo que salió.
  const completa = bloquesPorLocal({
    transferencias: [transferencia(1, 2, "mini el 7", "Recibida", "2026-09-14", 4)],
    acuerdos: ACUERDOS,
    hoy: MIERCOLES,
  });
  assert.equal(completa[0].aPagar, 93333.32);

  const mitad = bloquesPorLocal({
    transferencias: [transferencia(1, 2, "mini el 7", "Recibida", "2026-09-14", 2)],
    acuerdos: ACUERDOS,
    hoy: MIERCOLES,
  });
  assert.equal(mitad[0].aPagar, 46666.66, "el importe no siguió a lo contado: se está cobrando el remito");
});

test("sin recepción cargada se debe lo ENVIADO, que es lo correcto", () => {
  // Una transferencia despachada y sin contar se debe entera hasta que alguien
  // diga otra cosa. Es el contrato de `valorizarDetalle`, y acá importa: si cayera
  // en cero, el total del local mentiría hacia abajo justo en lo que falta recibir.
  const bs = bloquesPorLocal({
    transferencias: [transferencia(1, 2, "mini el 7", "Enviada", "2026-09-14", null)],
    acuerdos: ACUERDOS,
    hoy: MIERCOLES,
  });
  assert.equal(bs[0].aPagar, 93333.32);
});

test("el total está ABIERTO mientras quede algo sin recibir", () => {
  const bs = bloquesPorLocal({
    transferencias: [
      transferencia(1, 2, "mini el 7", "Recibida", "2026-09-14", 4),
      transferencia(2, 2, "mini el 7", "Enviada", "2026-09-15", null),
      transferencia(3, 2, "mini el 7", "Recibiendo", "2026-09-15", null),
    ],
    acuerdos: ACUERDOS,
    hoy: MIERCOLES,
  });

  assert.equal(bs[0].cantidadTransferencias, 3);
  assert.equal(bs[0].sinRecibir, 2, "«Recibiendo» es trabajo pendiente: contar no es confirmar");
  assert.equal(bs[0].totalCerrado, false, "el borde en warning tiene que poder decidirse con esto");
});

test("y queda CERRADO cuando están todas recibidas", () => {
  const bs = bloquesPorLocal({
    transferencias: [
      transferencia(1, 2, "mini el 7", "Recibida", "2026-09-14", 4),
      transferencia(2, 2, "mini el 7", "Recibida", "2026-09-15", 4),
    ],
    acuerdos: ACUERDOS,
    hoy: MIERCOLES,
  });
  assert.equal(bs[0].sinRecibir, 0);
  assert.equal(bs[0].totalCerrado, true);
});

test("UN LOCAL SIN MOVIMIENTO NO APARECE", () => {
  // Decisión de producto, no un descuido: la pantalla es una lista de trabajo y
  // una cuenta a cobrar, y un local sin transferencias no es ninguna de las dos.
  // Para verlos todos está el reporte.
  const bs = bloquesPorLocal({
    transferencias: [transferencia(1, 2, "mini el 7", "Recibida", "2026-09-14", 4)],
    acuerdos: ACUERDOS,
    hoy: MIERCOLES,
  });
  assert.equal(bs.length, 1);
  assert.ok(!bs.some((b) => b.localId === 4), "apareció un local sin transferencias en el período");
});

test("LAS CANCELADAS NO ENTRAN, ni al importe ni al conteo", () => {
  const bs = bloquesPorLocal({
    transferencias: [
      transferencia(1, 2, "mini el 7", "Recibida", "2026-09-14", 4),
      transferencia(2, 2, "mini el 7", "Cancelada", "2026-09-15", null),
    ],
    acuerdos: ACUERDOS,
    hoy: MIERCOLES,
  });
  assert.equal(bs[0].cantidadTransferencias, 1);
  assert.equal(bs[0].aPagar, 93333.32, "una cancelada sumó plata que nadie debe");
  assert.equal(entraEnLaVistaPrincipal({ estado: "Cancelada" }), false);
});

test("una relación SIN acuerdo cae al domingo Y QUEDA MARCADA", () => {
  // Las dos cosas juntas. Sin la marca, el domingo por defecto se leería como una
  // decisión que nadie tomó, y la pantalla de configuración no podría decir cuáles
  // faltan.
  const sinAcuerdo = acuerdoDeLocal([], 99);
  assert.equal(sinAcuerdo.diaDeCorte, 0);
  assert.equal(sinAcuerdo.sinConfigurar, true);

  const conAcuerdo = acuerdoDeLocal(ACUERDOS, 4);
  assert.equal(conAcuerdo.diaDeCorte, 1);
  assert.equal(conAcuerdo.sinConfigurar, false);

  // Y un acuerdo con un día imposible se trata como si no estuviera, no como un 9.
  assert.deepEqual(acuerdoDeLocal([{ localId: 7, diaDeCorte: 9 }], 7), {
    diaDeCorte: 0,
    sinConfigurar: true,
  });

  const bs = bloquesPorLocal({
    transferencias: [transferencia(1, 5, "Mini unidas", "Recibida", "2026-09-14", 4)],
    acuerdos: ACUERDOS,
    hoy: MIERCOLES,
  });
  assert.equal(bs[0].sinConfigurar, true, "el bloque no avisa que esa relación no está configurada");
});

test("el período se mide por la fecha de ENVÍO, no por la de recepción", () => {
  // Una transferencia despachada el sábado y recibida el lunes se paga en la
  // semana en que SALIÓ. Y una sin recibir no tiene fecha de recepción: medirla
  // por ahí la dejaría fuera de todo período, justo la que hay que cobrar.
  assert.equal(fechaDeCorte({ fechaEnvio: "2026-09-14T10:00:00Z" }), "2026-09-14T10:00:00Z");
  assert.equal(
    fechaDeCorte({ createdAt: "2026-09-14T10:00:00Z" }),
    "2026-09-14T10:00:00Z",
    "sin fecha de envío tiene que caer a la de creación y no a null"
  );
  assert.equal(estaRecibida({ estado: "Recibida" }), true);
  assert.equal(estaRecibida({ estado: "Recibiendo" }), false);
});

test("LA VISTA DEL LOCAL: sin agrupar, y con las dos secciones ya separadas", () => {
  const c = cuentaDelLocal({
    transferencias: [
      transferencia(1, 2, "mini el 7", "Recibida", "2026-09-14", 4),
      transferencia(2, 2, "mini el 7", "Enviada", "2026-09-15", null),
      transferencia(3, 2, "mini el 7", "Cancelada", "2026-09-15", null),
    ],
    acuerdos: ACUERDOS,
    localId: 2,
    hoy: MIERCOLES,
  });

  assert.equal(c.paraRecibir.length, 1, "la sección PARA RECIBIR no separó bien");
  assert.equal(c.yaRecibidas.length, 1, "la sección YA RECIBIDAS no separó bien");
  assert.equal(c.sinRecibir, 1);
  assert.equal(c.totalCerrado, false);
  // La cancelada no entra en ninguna de las dos ni suma plata.
  assert.equal(c.aPagar, 186666.64);
  assert.deepEqual(c.rango, { desde: "2026-09-13", hasta: "2026-09-19" });
});
