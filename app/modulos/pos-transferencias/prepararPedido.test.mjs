// PREPARAR UN PEDIDO DE LOCAL, EN EL CELULAR.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pos-transferencias/prepararPedido.test.mjs
//
// Diseño aprobado por Emanuel (2026-10-22), la mecánica de la recepción:
// "✓ Va completo", "Corregir" con la hoja y el campo de cantidad, la corregida
// marcada con su línea de acento, la completa achicada, agregar lo que el local
// no pidió, y "Enviar al local" apagado hasta revisar todo.
//
// El servidor contesta con las respuestas REALES de la sección 14 de
// `scripts/pruebas-db/pedidosEnviarCancelar.mjs`: el detalle del pedido, y CADA
// escritura (`detalle/editar`, `agregarItem`) con la respuesta que dio la ruta
// para ese mismo cuerpo. Si la pantalla manda un cuerpo que la ruta no
// contestó en la corrida real, el servidor falla: no hay respuestas escritas a
// mano.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const A = await import("../pedidos/montarPantallaPedidos.mjs");
const { default: Pagina } = await import("./nueva/page.jsx");

afterEach(A.desmontarTodo);

const dep = JSON.parse(readFileSync("app/modulos/pos-transferencias/deposito.fixture.json", "utf8"));
const ids = dep.depositoIds;

/** La respuesta real de la ruta para ese cuerpo, o un fallo del candado. */
function escritura(ruta, cuerpo) {
  const igual = (a, b) => Object.keys(a).every((k) => a[k] === b[k]) && Object.keys(b).every((k) => a[k] === b[k]);
  const e = dep.depositoEscrituras.find((x) => x.ruta === ruta && igual(x.cuerpo, cuerpo));
  assert.ok(e, `la pantalla mandó a ${ruta} un cuerpo que la ruta no contestó en la corrida real: ${JSON.stringify(cuerpo)}`);
  return e.respuesta;
}

const montarPreparar = ({ detalle = dep.depositoDetalleNuevo, enviar = [], posId = ids.p1, ancho = "telefono" } = {}) => {
  const colaEnviar = [...enviar];
  return A.montar({
    pagina: Pagina,
    ancho,
    busqueda: `posId=${posId}`,
    inicio: A.real.carritoVacio,
    otras: {
      "/api/me": dep.depositoMe,
      "/api/operador/me": dep.depositoOperadorMe,
      "/api/pos-transferencias/opciones": dep.depositoOpciones,
      "/api/pos-transferencias/solicitados": dep.depositoSolicitadosNuevo,
      "/api/pos-transferencias/detalle": detalle,
      "/api/pos-transferencias/detalle/editar": ({ cuerpo }) => escritura("/api/pos-transferencias/detalle/editar", cuerpo),
      "/api/pos-transferencias/agregarItem": ({ cuerpo }) => escritura("/api/pos-transferencias/agregarItem", cuerpo),
      "/api/pos-transferencias/buscarProductos": dep.depositoBuscarAzucar,
      "/api/pos-transferencias/enviar": () => colaEnviar.shift(),
      // La pantalla de siempre, si se monta, pide esto: que no se monte lo
      // dicen los candados, no un fallo del servidor.
      "/api/pos-transferencias/nueva": { status: 200, cuerpo: { ok: false, error: "no se esperaba" } },
      [`/api/locales/${dep.depositoOpciones.cuerpo.origen.id}`]: { status: 200, cuerpo: { ok: false } },
    },
  });
};

const linea = (nombre) => document.querySelector(`[data-linea-preparar="${nombre}"]`);
const estadoDe = (nombre) => linea(nombre)?.getAttribute("data-estado") ?? null;
const visibles = () => [...document.querySelectorAll("[data-linea-preparar]")].map((el) => el.getAttribute("data-linea-preparar"));
const filtro = () => A.contenido().querySelector('[role="group"][aria-label="Filtrar productos por estado"]');
// El rótulo y el número son dos nodos (el botón los separa con `gap`, no con
// un espacio): se leen por separado.
function textosEnOrden(el) {
  const caminante = document.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  const textos = [];
  while (caminante.nextNode()) if (caminante.currentNode.textContent.trim()) textos.push(caminante.currentNode.textContent.trim());
  return textos.join(" ");
}
const opciones = () => A.botones(filtro()).map(textosEnOrden);
const elegir = (texto) => A.tocar(A.botones(filtro()).find((b) => b.textContent.startsWith(texto)));
const enviarBoton = () => A.boton("Enviar al local");
const nombres = (detalle) => detalle.cuerpo.item.detalles.map((d) => d.productoNombre);

async function corregir(nombre, valores) {
  await A.tocar(A.boton("Corregir", linea(nombre)) ?? linea(nombre).querySelector("button"));
  const hoja = A.modal();
  assert.ok(hoja, `no se abrió la hoja de ${nombre}`);
  const campos = [...hoja.querySelectorAll("input")];
  assert.equal(campos.length, valores.length, `${nombre}: la hoja tiene ${campos.length} campos`);
  for (const [i, v] of valores.entries()) await A.teclear(campos[i], String(v));
  await A.tocar(A.boton("Guardar", hoja));
}

test("el fixture: cinco renglones sin revisar, uno por bulto, y cada escritura con su respuesta", () => {
  assert.deepEqual(nombres(dep.depositoDetalleNuevo), ["ACEITE", "ARROZ", "FIDEOS", "YERBA", "AGUA X6"]);
  assert.ok(dep.depositoDetalleNuevo.cuerpo.item.detalles.every((d) => d.revisadoEn === null));
  assert.ok(dep.depositoEscrituras.length >= 7);
  assert.ok(dep.depositoEscrituras.every((e) => e.respuesta.cuerpo.ok === true));
  assert.equal(dep.depositoEnviar.cuerpo.ok, true);
});

test("título y Volver en el shell; el Volver vuelve a la entrada", async () => {
  await montarPreparar();
  assert.equal(A.tituloShell(), `Pedido #${ids.p1}`);
  await A.tocar(A.boton("Volver", A.filaShell()));
  assert.deepEqual(A.navegacion.at(-1), ["push", "/modulos/pos-transferencias"]);
  assert.doesNotMatch(A.contenido().textContent, /Productos sugeridos|Preparados \(|Transferencia enviada al local/);
});

test("arriba: el local, Nuevo, el pedido, cuándo y quién, y el avance con su barra", async () => {
  await montarPreparar();
  const t = A.contenido().textContent;
  assert.match(t, new RegExp(ids.local));
  assert.match(t, /Nuevo/);
  assert.match(t, new RegExp(`Pedido #${ids.p1} · (hoy|ayer|\\d\\d/\\d\\d) \\d\\d:\\d\\d · lo pidió ${ids.pidio}`));
  assert.match(t, /0 \/ 5 preparados/);
  assert.match(t, /5 pendientes/);
  assert.equal(A.contenido().querySelector("[data-avance]")?.getAttribute("data-avance"), "0");
  assert.ok(A.contenido().querySelector('input[placeholder="Buscar o escanear producto"]'), "falta el buscador");
});

test("los cuatro filtros con sus cantidades, en Pendientes; la categoría en Todas · 5", async () => {
  await montarPreparar();
  assert.deepEqual(opciones(), ["Pendientes 5", "Con cambios 0", "Preparados 0", "Todos 5"]);
  assert.equal(A.botones(filtro()).find((b) => b.getAttribute("aria-pressed") === "true").textContent.startsWith("Pendientes"), true);
  assert.match(A.contenido().textContent, /Todas · 5/);
});

test("cada renglón dice lo que pidió el local, con ✓ Va completo y Corregir", async () => {
  await montarPreparar();
  assert.deepEqual(visibles(), ["ACEITE", "ARROZ", "FIDEOS", "YERBA", "AGUA X6"]);
  // Decía "Pidió 2 BULTO de 6 u" en una línea suave. Desde el 2026-10-23 es
  // como lo enviado en la recepción: "Pidió" chico y la cantidad en su
  // presentación, resaltada. Cómo se resalta lo afirma
  // `cantidadPedidaDestacada.test.mjs`; acá, qué dice.
  const pidio = (n) => {
    const fila = [...linea(n).querySelectorAll("p")].find((p) => p.firstElementChild?.textContent === "Pidió");
    return fila ? fila.children[1].textContent.trim() : null;
  };
  assert.equal(pidio("ACEITE"), "2 UNIDAD");
  assert.equal(pidio("YERBA"), "4 UNIDAD");
  assert.equal(pidio("AGUA X6"), "2 PACK x6");
  for (const n of visibles()) {
    assert.ok(A.boton("✓ Va completo", linea(n)), `${n} sin Va completo`);
    assert.ok(A.boton("Corregir", linea(n)), `${n} sin Corregir`);
  }
});

test("EL RECORRIDO: va completo, corregir a menos, a 0, bultos con sueltas, agregar, y enviar con todo revisado", async () => {
  const { pedidos } = await montarPreparar({ enviar: [dep.depositoEnviar] });
  assert.ok(enviarBoton().disabled, "Enviar arranca prendido");
  assert.match(A.contenido().textContent, /Falta revisar 5/);

  // Va completo el aceite: sale de Pendientes y se achica en Todos.
  await A.tocar(A.boton("✓ Va completo", linea("ACEITE")));
  assert.ok(!linea("ACEITE"), "el aceite sigue en Pendientes");
  assert.match(A.contenido().textContent, /1 \/ 5 preparados/);

  // La yerba a 0: no va.
  await corregir("YERBA", [0]);
  // El arroz a 1 de 3.
  await corregir("ARROZ", [1]);
  // El agua: 1 bulto y 3 sueltas, los dos campos uno al lado del otro.
  await corregir("AGUA X6", [1, 3]);
  assert.deepEqual(opciones(), ["Pendientes 1", "Con cambios 3", "Preparados 4", "Todos 5"]);

  await elegir("Con cambios");
  assert.deepEqual(visibles(), ["ARROZ", "YERBA", "AGUA X6"]);
  assert.match(linea("YERBA").textContent, /Va 0 · no va/);
  assert.match(linea("ARROZ").textContent, /Va 1 de 3 · falta 2/);
  assert.match(linea("AGUA X6").textContent, /Va 9 u de 12 u · falta 3 u/);
  for (const n of visibles()) {
    assert.match(linea(n).className, /\bsunmi-border-accent\b/, `${n} sin el borde de acento`);
    assert.ok(!A.boton("✓ Va completo", linea(n)), `${n}: una con cambios no ofrece Va completo`);
  }

  // El agua, de vuelta a lo pedido: 2 bultos y 0 sueltas es "va completo".
  await corregir("AGUA X6", [2, 0]);
  assert.ok(!linea("AGUA X6"), "el agua completa sigue en Con cambios");

  // Lo que el local no pidió.
  await A.tocar(A.boton("+ Agregar producto que no pidió"));
  const hoja = A.modal();
  await A.teclear(hoja.querySelector("input"), "AZUC");
  await A.asentar();
  await A.tocar(A.boton("AZUCAR", hoja) ?? [...hoja.querySelectorAll("button")].find((b) => /AZUCAR/.test(b.textContent)));
  assert.match(linea("AZUCAR").textContent, /Agregado · va 1/);
  assert.equal(estadoDe("AZUCAR"), "conCambios");

  // Falta el fideo: Enviar sigue apagado y lo dice.
  assert.ok(enviarBoton().disabled);
  assert.match(A.contenido().textContent, /Falta revisar 1/);
  await elegir("Pendientes");
  await A.tocar(A.boton("✓ Va completo", linea("FIDEOS")));
  assert.deepEqual(opciones(), ["Pendientes 0", "Con cambios 3", "Preparados 6", "Todos 6"]);

  // Las que van completas, achicadas: "✓ <nombre> · va N".
  await elegir("Todos");
  assert.equal(estadoDe("ACEITE"), "completo");
  assert.match(linea("ACEITE").textContent, /ACEITE\s*· va 2/);
  assert.match(linea("AGUA X6").textContent, /AGUA X6\s*· va 2/);
  assert.ok(!A.boton("Corregir", linea("ACEITE")), "la completa quedó con su tarjeta grande");

  // Enviar, con todo revisado.
  assert.ok(!enviarBoton().disabled, "Enviar sigue apagado con todo revisado");
  assert.doesNotMatch(A.contenido().textContent, /Falta revisar/);
  await A.tocar(enviarBoton());
  assert.deepEqual(A.llamadas(pedidos, "/api/pos-transferencias/enviar").map((p) => p.cuerpo), [{ posId: ids.p1 }]);
  assert.match(A.texto(), new RegExp(`Transferencia enviada a ${ids.local}`));
  assert.deepEqual(A.navegacion.at(-1), ["push", "/modulos/pos-transferencias"]);
});

test("escanear un código deja solo ese producto, aunque ya esté preparado", async () => {
  await montarPreparar({ detalle: dep.depositoDetalleTrabajando });
  const fideos = dep.depositoDetalleTrabajando.cuerpo.item.detalles.find((d) => d.productoNombre === "FIDEOS");
  const aceite = dep.depositoDetalleTrabajando.cuerpo.item.detalles.find((d) => d.productoNombre === "ACEITE");
  const campo = A.contenido().querySelector('input[placeholder="Buscar o escanear producto"]');
  await A.teclear(campo, fideos.codigoBarra);
  assert.deepEqual(visibles(), ["FIDEOS"]);
  // El aceite ya va completo y el filtro dice Pendientes: igual aparece.
  await A.teclear(campo, aceite.codigoBarra);
  assert.deepEqual(visibles(), ["ACEITE"]);
});

test("el local sumó antes de que el depósito empiece: al volver a leer, lo nuevo aparece pendiente", async () => {
  assert.deepEqual(nombres(dep.depositoDetalleAntesDeSumar), ["ACEITE"]);
  await montarPreparar({ detalle: dep.depositoDetalleTrasSumar, posId: ids.p2 });
  assert.deepEqual(visibles(), ["ACEITE", "SAL"]);
  assert.ok(A.boton("✓ Va completo", linea("SAL")));
  assert.match(A.contenido().textContent, /0 \/ 2 preparados/);
});

test("en la computadora, la pantalla de siempre", async () => {
  // La de siempre arma un sonido al montarse (`new Audio`), que jsdom no trae:
  // uno mudo, solo para que se pueda montar.
  globalThis.Audio = window.Audio = class {
    play() { return Promise.resolve(); }
    pause() {}
    load() {}
    addEventListener() {}
    removeEventListener() {}
  };
  await montarPreparar({ ancho: "escritorio" });
  assert.ok(!document.querySelector("[data-preparar-pedido]"), "se montó la del celular");
});
