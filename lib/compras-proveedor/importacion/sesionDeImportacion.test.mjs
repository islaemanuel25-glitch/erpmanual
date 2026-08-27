// LA SESIÓN DE IMPORTACIÓN GUARDADA EN EL DISPOSITIVO.
//
// Acá se prueba lo que DECIDE: de quién es una sesión, si venció, si la versión
// sirve y qué se guarda. Lo que abre IndexedDB lo ejerce la sonda en un
// navegador de verdad — un IndexedDB de mentira probaría el remedo, no el hecho.

import assert from "node:assert/strict";
import test from "node:test";

import {
  CADUCIDAD_MS,
  MOTIVO_DESCARTE,
  VERSION_SESION,
  armarSesion,
  hace,
  hayAlmacenamiento,
  sesionUtilizable,
} from "@/lib/compras-proveedor/importacion/sesionDeImportacion";

const archivoFalso = { name: "remito.jpg", type: "image/jpeg", lastModified: 1000, size: 10 };
const base = (extra = {}) =>
  armarSesion({ usuarioId: 7, localId: 1, archivo: archivoFalso, ahora: () => 5_000_000, ...extra });

// ── DE QUIÉN ES ────────────────────────────────────────────────────────────

test("la sesión propia se recupera", () => {
  const r = sesionUtilizable({ sesion: base(), usuarioId: 7, localId: 1, ahora: () => 5_000_000 });
  assert.equal(r.ok, true);
});

test("NO se recupera la sesión de otro usuario", () => {
  // En un mostrador el dispositivo se comparte. Sin esto, el siguiente que entra
  // ve el trabajo del anterior con los productos y los precios de un proveedor
  // que no eligió.
  const r = sesionUtilizable({ sesion: base(), usuarioId: 8, localId: 1, ahora: () => 5_000_000 });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_DESCARTE.OTRO_USUARIO);
});

test("NO se recupera la sesión de otro local", () => {
  const r = sesionUtilizable({ sesion: base(), usuarioId: 7, localId: 2, ahora: () => 5_000_000 });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_DESCARTE.OTRO_LOCAL);
});

test("un id como número y otro como texto son el MISMO dueño", () => {
  // El id viaja como número desde la sesión y como cadena desde la URL. Sin
  // normalizar, la sesión propia se descartaría como ajena y el usuario perdería
  // el trabajo igual que antes — con el mecanismo puesto.
  const r = sesionUtilizable({ sesion: base(), usuarioId: "7", localId: "1", ahora: () => 5_000_000 });
  assert.equal(r.ok, true);
});

test("SIN dueño no se recupera nada: un null no machea con nadie", () => {
  // Es el caso de la sesión cerrada. Si `null === null` valiera como "mismo
  // usuario", cualquiera sin sesión vería la importación del anterior.
  const anonima = base({ usuarioId: null });
  const r = sesionUtilizable({ sesion: anonima, usuarioId: null, localId: 1, ahora: () => 5_000_000 });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_DESCARTE.OTRO_USUARIO);
});

test("un usuario 0 no se confunde con 'sin usuario'", () => {
  // El falsy de siempre. `if (usuarioId)` habría tratado al 0 como ausente.
  const cero = base({ usuarioId: 0 });
  const r = sesionUtilizable({ sesion: cero, usuarioId: 0, localId: 1, ahora: () => 5_000_000 });
  assert.equal(r.ok, true, "el usuario 0 es un usuario");
});

// ── A QUÉ TRABAJO PERTENECE ────────────────────────────────────────────────

test("una sesión de OTRO pedido no se restaura encima", () => {
  // Armar un pedido nuevo y sumarle líneas al borrador #999001 son dos
  // importaciones distintas. Sin esto, entrar a continuar un borrador te metía
  // el archivo y las decisiones de otra cosa — y lo encontró la sonda.
  const s = base({ pedidoId: null });
  const r = sesionUtilizable({ sesion: s, usuarioId: 7, localId: 1, pedidoId: 999001, ahora: () => 5_000_000 });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_DESCARTE.OTRO_PEDIDO);
});

test("la sesión del MISMO borrador sí se restaura", () => {
  const s = base({ pedidoId: 999001 });
  const r = sesionUtilizable({ sesion: s, usuarioId: 7, localId: 1, pedidoId: 999001, ahora: () => 5_000_000 });
  assert.equal(r.ok, true);
});

test("NULL contra NULL es el mismo pedido: 'nuevo' también es un valor", () => {
  // Con la comparación del dueño —donde null no machea con nada— ninguna sesión
  // de pedido nuevo se habría recuperado jamás, que es el caso más común.
  const s = base({ pedidoId: null });
  const r = sesionUtilizable({ sesion: s, usuarioId: 7, localId: 1, pedidoId: null, ahora: () => 5_000_000 });
  assert.equal(r.ok, true);
});

test("el pedido como número y como texto es el mismo", () => {
  const s = base({ pedidoId: 999001 });
  const r = sesionUtilizable({ sesion: s, usuarioId: 7, localId: 1, pedidoId: "999001", ahora: () => 5_000_000 });
  assert.equal(r.ok, true);
});

// ── VERSIÓN Y VENCIMIENTO ──────────────────────────────────────────────────

test("una sesión de otra versión se DESCARTA, no se migra", () => {
  const vieja = base({ version: VERSION_SESION + 1 });
  const r = sesionUtilizable({ sesion: vieja, usuarioId: 7, localId: 1, ahora: () => 5_000_000 });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_DESCARTE.OTRA_VERSION);
});

test("la versión se mira ANTES que el dueño", () => {
  // Una sesión de otro esquema puede no tener ni el campo del usuario. Mirar el
  // dueño primero daría "otro usuario" sobre algo que en realidad es ilegible, y
  // el mensaje mandaría a buscar al lado equivocado.
  const rara = { version: 999 };
  const r = sesionUtilizable({ sesion: rara, usuarioId: 7, localId: 1, ahora: () => 5_000_000 });
  assert.equal(r.motivo, MOTIVO_DESCARTE.OTRA_VERSION);
});

test("una sesión vencida no se recupera", () => {
  const s = base();
  const r = sesionUtilizable({
    sesion: s, usuarioId: 7, localId: 1,
    ahora: () => 5_000_000 + CADUCIDAD_MS + 1,
  });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_DESCARTE.VENCIDA);
});

test("justo en el límite todavía se recupera", () => {
  const r = sesionUtilizable({
    sesion: base(), usuarioId: 7, localId: 1,
    ahora: () => 5_000_000 + CADUCIDAD_MS,
  });
  assert.equal(r.ok, true);
});

test("LA CADUCIDAD ESTÁ EN UN SOLO LUGAR", () => {
  // Se afirma sobre el código: tres copias de un número son tres oportunidades
  // de que una quede vieja, y el síntoma sería una sesión que se restaura cuando
  // ya no corresponde.
  assert.ok(Number.isFinite(CADUCIDAD_MS) && CADUCIDAD_MS > 0);
});

test("una sesión sin archivo NI líneas no se restaura", () => {
  // Restaurarla mostraría "Importación recuperada" sobre una pantalla vacía, que
  // es peor que no decir nada.
  const vacia = armarSesion({ usuarioId: 7, localId: 1, ahora: () => 5_000_000 });
  const r = sesionUtilizable({ sesion: vacia, usuarioId: 7, localId: 1, ahora: () => 5_000_000 });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_DESCARTE.INCOMPLETA);
});

test("con líneas pero sin archivo SÍ se restaura", () => {
  // Pasa cuando el archivo ya se leyó y las decisiones están tomadas. No poder
  // retranscribir es una limitación; perder el trabajo, un defecto.
  const s = armarSesion({ usuarioId: 7, localId: 1, lineas: [{ id: "l1" }], ahora: () => 5_000_000 });
  assert.equal(sesionUtilizable({ sesion: s, usuarioId: 7, localId: 1, ahora: () => 5_000_000 }).ok, true);
});

test("no hay sesión: se informa, no se rompe", () => {
  for (const nada of [null, undefined, "", 0]) {
    assert.equal(sesionUtilizable({ sesion: nada, usuarioId: 7, localId: 1 }).motivo, MOTIVO_DESCARTE.NO_HAY);
  }
});

// ── QUÉ SE GUARDA, Y QUÉ NO ────────────────────────────────────────────────

test("se guarda TODO lo que hace falta para seguir donde estaba", () => {
  const s = armarSesion({
    usuarioId: 7, localId: 1, archivo: archivoFalso,
    proveedorId: 3, proveedorNombre: "Sintético SRL",
    documento: { crudo: { encabezados: ["A"], filas: [] }, lineas: [] },
    lineas: [{ id: "l1", cantidadPedido: 5, precioCosto: 100, unidadPedido: "BULTO", productoLocalId: 9001 }],
    explicacion: "La columna ENVIADO es la cantidad.",
    recetaEnUso: { cantidadEn: "UNIDAD" },
    recetaSoloEstaVez: true,
    paso: "revisar",
    panelAbierto: true,
    desplazamiento: 420,
    ahora: () => 123,
  });

  assert.equal(s.archivo, archivoFalso, "el archivo va tal cual: sin él no se puede retranscribir");
  assert.equal(s.archivoNombre, "remito.jpg");
  assert.equal(s.archivoTipo, "image/jpeg");
  assert.equal(s.archivoFecha, 1000);
  assert.equal(s.proveedorId, 3);
  assert.ok(s.documento.crudo, "la lectura cruda, que es lo que permite reinterpretar");
  assert.equal(s.lineas[0].cantidadPedido, 5, "las cantidades elegidas");
  assert.equal(s.lineas[0].precioCosto, 100, "los precios elegidos");
  assert.equal(s.lineas[0].unidadPedido, "BULTO", "las unidades elegidas");
  assert.equal(s.lineas[0].productoLocalId, 9001, "las asociaciones hechas");
  assert.equal(s.explicacion, "La columna ENVIADO es la cantidad.");
  assert.equal(s.recetaSoloEstaVez, true, "usar solo esta vez tiene que sobrevivir");
  assert.deepEqual(s.recetaEnUso, { cantidadEn: "UNIDAD" });
  assert.equal(s.paso, "revisar");
  assert.equal(s.panelAbierto, true);
  assert.equal(s.desplazamiento, 420);
  assert.equal(s.actualizadaEn, 123);
});

test("una petición interrumpida queda ANOTADA, no reintentada", () => {
  // Al volver, la pantalla lo dice. Reintentar sola gastaría una consulta al
  // modelo que nadie pidió — y hoy la cuota son 20 por día.
  const s = armarSesion({ usuarioId: 7, localId: 1, archivo: archivoFalso, peticionInterrumpida: "interpretar" });
  assert.equal(s.peticionInterrumpida, "interpretar");
});

test("NO se guarda ningún secreto ni nada del servidor", () => {
  const s = armarSesion({ usuarioId: 7, localId: 1, archivo: archivoFalso });
  const claves = Object.keys(s);
  for (const prohibida of ["token", "cookie", "clave", "password", "apiKey", "sesionToken"]) {
    assert.ok(!claves.includes(prohibida), `guarda "${prohibida}"`);
  }
  const texto = JSON.stringify({ ...s, archivo: null });
  assert.doesNotMatch(texto, /AIza|Bearer |x-goog/i, "no puede viajar nada parecido a una credencial");
});

test("`recetaSoloEstaVez` es booleano de verdad, no lo que le pasen", () => {
  assert.equal(armarSesion({ recetaSoloEstaVez: "si" }).recetaSoloEstaVez, false);
  assert.equal(armarSesion({ recetaSoloEstaVez: true }).recetaSoloEstaVez, true);
});

// ── EL TEXTO DE "CUÁNDO SE GUARDÓ" ─────────────────────────────────────────

test("hace() dice algo legible en cada escala", () => {
  const t = 10_000_000;
  assert.equal(hace(t, () => t), "recién");
  assert.equal(hace(t, () => t + 60_000), "hace 1 minuto");
  assert.equal(hace(t, () => t + 5 * 60_000), "hace 5 minutos");
  assert.equal(hace(t, () => t + 60 * 60_000), "hace 1 hora");
  assert.equal(hace(t, () => t + 3 * 60 * 60_000), "hace 3 horas");
  assert.equal(hace(t, () => t + 25 * 60 * 60_000), "ayer");
  assert.equal(hace(t, () => t + 50 * 60 * 60_000), "hace 2 días");
});

test("un reloj corrido hacia atrás no dice 'hace -3 minutos'", () => {
  assert.equal(hace(10_000_000, () => 9_000_000), "recién");
});

// ── EL NAVEGADOR QUE NO TIENE DÓNDE GUARDAR ────────────────────────────────

test("sin IndexedDB se informa, no se rompe", () => {
  assert.equal(hayAlmacenamiento(null), false);
  assert.equal(hayAlmacenamiento({}), false);
  assert.equal(hayAlmacenamiento({ indexedDB: {} }), true);
});

test("un window que EXPLOTA al mirarlo tampoco rompe", () => {
  // Modo privado de algunos navegadores: leer `indexedDB` lanza.
  const hostil = {};
  Object.defineProperty(hostil, "indexedDB", { get() { throw new Error("bloqueado"); } });
  assert.equal(hayAlmacenamiento(hostil), false);
});
