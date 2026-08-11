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
  formatearTamano,
  PERMISOS_PAQUETE_COMPROBANTES,
} from "./retencionImagen.js";

const DIA = 24 * 60 * 60 * 1000;
const HOY = new Date("2026-08-11T10:00:00Z");
const hace = (dias) => new Date(HOY.getTime() - dias * DIA);

const foto = (diasDesdeSubida, extra = {}) => ({
  archivoUbicacion: "/vol/comprobantes/x.jpg",
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
  // La lista de claves va completa a propósito: cualquier campo nuevo cae acá
  // en rojo y obliga a decidirlo, en vez de entrar de contrabando. El
  // 2026-08-11 cayó por `ocupado`/`bytesOcupados`, que Emanuel pidió agregar al
  // mismo aviso para que el tamaño del volumen aparezca solo. Se amplía la
  // lista sabiendo qué se está cambiando; sigue siendo UN aviso.
  assert.deepEqual(Object.keys(a).sort(), [
    "bytesOcupados",
    "cantidad",
    "detalle",
    "diasDelMasUrgente",
    "ocupado",
    "titulo",
  ]);
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
    ENCARGADO: ["compras.ver", "compras.recibir", "compras.revisar", "comprobantes.ver"],
    "DUEÑO_LOCAL": ["compras.ver", "compras.recibir", "compras.crear", "costos.ver", "compras.revisar", "comprobantes.ver"],
  };
  const tiene = (perms) =>
    perms.includes("*") || PERMISOS_PAQUETE_COMPROBANTES.some((p) => perms.includes(p));

  for (const rol of ["Admin", "DUEÑO_LOCAL", "ENCARGADO"]) {
    assert.equal(tiene(rolesReales[rol]), true, `${rol} tiene que ver el aviso`);
  }
  for (const rol of ["CAJERO", "Deposito", "Mini"]) {
    assert.equal(tiene(rolesReales[rol]), false, `${rol} NO tiene que ver el aviso`);
  }
});

// ── Lo ocupado, que va en el mismo aviso ───────────────────────────────────

test("EL AVISO DICE CUÁNTO ESTÁ OCUPANDO", () => {
  // No hay tope de tamaño y hoy sería un número inventado. Lo que sí hay es que
  // el dato aparezca solo, en algo que ya se mira, para que cuando haya varias
  // semanas de uso la medición ya esté hecha.
  const a = avisoDePaquete([foto(5), foto(6)], HOY, { bytesOcupados: 87 * 1024 * 1024 });
  assert.equal(a.ocupado, "87 MB");
  assert.match(a.detalle, /Ocupando 87 MB/);
});

test("sin medición, el aviso de vencimiento vale igual", () => {
  // Si el volumen no está montado no hay cuánto, y eso no puede tapar el aviso
  // de las fotos por vencer, que es lo que de verdad se pierde.
  const a = avisoDePaquete([foto(6)], HOY);
  assert.ok(a);
  assert.equal(a.ocupado, null);
  assert.equal(a.bytesOcupados, null);
  assert.doesNotMatch(a.detalle, /Ocupando/);
});

test("los tamaños se dicen como los diría una persona", () => {
  assert.equal(formatearTamano(0), "0 B");
  assert.equal(formatearTamano(2048), "2 KB");
  assert.equal(formatearTamano(3.5 * 1024 * 1024), "3.5 MB");
  assert.equal(formatearTamano(250 * 1024 * 1024), "250 MB");
  assert.equal(formatearTamano(2.5 * 1024 * 1024 * 1024), "2.5 GB");
  assert.equal(formatearTamano(null), null);
  assert.equal(formatearTamano(-1), null);
  assert.equal(formatearTamano("mucho"), null);
});

// ── Que el volumen lleno NO adelante ningún borrado ────────────────────────

test("NO HAY FORMA DE ADELANTAR EL BORRADO, NI POR ESPACIO", () => {
  // Decidido el 2026-08-11: si el volumen se llena se rechaza la subida, nunca
  // se borra lo más viejo. Borrar antes de tiempo rompe la ventana EN SILENCIO,
  // que es justo lo que la ventana promete no hacer.
  //
  // El candado es de forma: `aBorrarHoy` mira la fecha y NADA MÁS. Si algún día
  // aparece un parámetro de presión —"borrá algo, está lleno"—, este test lo
  // encuentra, porque un argumento de más acá no cambia el resultado.
  const frescas = [foto(0), foto(1), foto(3), foto(6)];
  assert.equal(aBorrarHoy(frescas, HOY).length, 0);
  assert.equal(aBorrarHoy(frescas, HOY, { lleno: true, liberarBytes: 1e9 }).length, 0);
  // Y la mezcla: con el disco "lleno", igual solo sale la vencida.
  const mezcla = [...frescas, foto(9)];
  assert.equal(aBorrarHoy(mezcla, HOY, { lleno: true }).length, 1);
});
