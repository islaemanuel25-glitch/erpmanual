// Candados de la ventana de siete días de la imagen del comprobante.
//
// Lo que se protege: que el borrado sea por foto y no en bloque, que confirmar
// no adelante el borrado, y que el aviso sea uno solo.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DIAS_DE_VIDA,
  calcularVencimiento,
  correspondeBorrar,
  aBorrarHoy,
  diasRestantes,
  descargables,
  avisoDePaquete,
  PERMISOS_PAQUETE_FACTURAS,
} from "./retencionImagen.js";

const DIA = 24 * 60 * 60 * 1000;
const HOY = new Date("2026-08-11T10:00:00Z");
const hace = (dias) => new Date(HOY.getTime() - dias * DIA);

const foto = (diasDesdeSubida, extra = {}) => ({
  archivoUbicacion: "/vol/facturas/x.jpg",
  venceEn: calcularVencimiento(hace(diasDesdeSubida)),
  ...extra,
});

test("la ventana es de siete días", () => {
  assert.equal(DIAS_DE_VIDA, 7);
  const v = calcularVencimiento(new Date("2026-08-01T00:00:00Z"));
  assert.equal(v.toISOString(), "2026-08-08T00:00:00.000Z");
});

test("EL BORRADO ES POR FOTO, NO EN BLOQUE", () => {
  // El candado central. Una tanda con fotos de distintos días tiene que borrar
  // solo las vencidas: la versión en bloque se llevaba puesta la de ayer junto
  // con la de la semana pasada.
  const tanda = [
    foto(1, { id: "de ayer" }),
    foto(6, { id: "de hace seis" }),
    foto(7, { id: "vencida justo" }),
    foto(20, { id: "vieja" }),
  ];
  const aBorrar = aBorrarHoy(tanda, HOY).map((c) => c.id);
  assert.deepEqual(aBorrar, ["vencida justo", "vieja"]);
  assert.ok(!aBorrar.includes("de ayer"), "una foto de ayer NO se va con las viejas");
});

test("CONFIRMAR NO ADELANTA EL BORRADO", () => {
  // La segunda revisión del dueño ocurre después de que el personal recibe.
  // Borrar al confirmar le sacaría el papel justo antes de que lo mire.
  const confirmada = foto(2, { confirmadoEn: hace(1) });
  assert.equal(correspondeBorrar(confirmada, HOY), false);
});

test("una imagen ya borrada no se vuelve a borrar", () => {
  assert.equal(correspondeBorrar(foto(20, { imagenBorradaEn: hace(5) }), HOY), false);
});

test("sin archivo no hay nada que borrar", () => {
  assert.equal(correspondeBorrar({ venceEn: hace(10), archivoUbicacion: null }, HOY), false);
});

test("SIN VENCIMIENTO NO SE TOCA: no se adivina", () => {
  // Una fila sin `venceEn` es un dato incompleto, no una foto eterna ni una
  // vencida. Borrarla por las dudas sería destruir sin saber.
  assert.equal(correspondeBorrar({ archivoUbicacion: "/x.jpg", venceEn: null }, HOY), false);
});

test("el borde: el día del vencimiento se borra", () => {
  const justoHoy = { archivoUbicacion: "/x.jpg", venceEn: HOY };
  assert.equal(correspondeBorrar(justoHoy, HOY), true);
  const mañana = { archivoUbicacion: "/x.jpg", venceEn: new Date(HOY.getTime() + DIA) };
  assert.equal(correspondeBorrar(mañana, HOY), false);
});

test("los días restantes se cuentan bien, y en negativo si venció", () => {
  assert.equal(diasRestantes(foto(0), HOY), 7);
  assert.equal(diasRestantes(foto(6), HOY), 1);
  assert.equal(diasRestantes(foto(10), HOY), -3);
});

// ── El paquete ─────────────────────────────────────────────────────────────

test("el paquete lleva solo las que todavía tienen foto", () => {
  const tanda = [foto(1), foto(2, { imagenBorradaEn: hace(0) }), { archivoUbicacion: null }];
  assert.equal(descargables(tanda).length, 1);
});

test("UNA VEZ BORRADA NO HAY PAQUETE QUE LA RECUPERE", () => {
  // La consecuencia aceptada. Si nadie baja el paquete, se pierde.
  const borrada = foto(10, { imagenBorradaEn: hace(3) });
  assert.equal(descargables([borrada]).length, 0);
});

// ── El aviso de la campana ─────────────────────────────────────────────────

test("UN SOLO AVISO, sin escalones", () => {
  // Un aviso a los cinco días y otro a los seis convierte la campana en ruido,
  // y una campana con ruido se deja de mirar.
  const a = avisoDePaquete([foto(5), foto(6)], HOY);
  assert.ok(a);
  assert.equal(a.cantidad, 2);
  assert.equal(a.diasDelMasUrgente, 1);
  assert.deepEqual(Object.keys(a).sort(), ["cantidad", "detalle", "diasDelMasUrgente", "titulo"]);
});

test("sin fotos vivas no hay aviso: la campana no inventa", () => {
  assert.equal(avisoDePaquete([], HOY), null);
  assert.equal(avisoDePaquete([foto(10, { imagenBorradaEn: hace(1) })], HOY), null);
});

test("el aviso NOMBRA LO QUE SE PIERDE, no dice «hay novedades»", () => {
  const a = avisoDePaquete([foto(6)], HOY);
  assert.match(a.detalle, /no hay vuelta|no se recupera/i);
  const hoyMismo = avisoDePaquete([foto(7)], HOY);
  assert.match(hoyMismo.detalle, /hoy/i);
});


test("basura no rompe nada", () => {
  for (const v of [null, undefined, "no soy lista", [null, {}]]) {
    assert.equal(aBorrarHoy(v, HOY).length, 0, JSON.stringify(v));
    assert.equal(descargables(v).length, 0, JSON.stringify(v));
  }
  assert.equal(calcularVencimiento("no soy fecha"), null);
  assert.equal(diasRestantes({}, HOY), null);
});

test("EL PAQUETE LO BAJA SOLO EL DUEÑO O EL ADMIN, medido contra los roles reales", () => {
  const rolesReales = {
    Admin: ["*"],
    Deposito: ["compras.crear", "compras.ver", "proveedores.ver"],
    Mini: ["compras.crear", "compras.ver"],
    CAJERO: [],
    ENCARGADO: ["compras.ver", "compras.recibir"],
    "DUEÑO_LOCAL": ["compras.ver", "compras.recibir", "compras.crear", "costos.ver", "compras.revisar", "comprobantes.ver"],
  };
  const tiene = (perms) =>
    perms.includes("*") || PERMISOS_PAQUETE_FACTURAS.some((p) => perms.includes(p));

  for (const rol of ["Admin", "DUEÑO_LOCAL"]) {
    assert.equal(tiene(rolesReales[rol]), true, `${rol} tiene que ver el aviso`);
  }
  for (const rol of ["CAJERO", "Deposito", "Mini", "ENCARGADO"]) {
    assert.equal(tiene(rolesReales[rol]), false, `${rol} NO tiene que ver el aviso`);
  }
});
