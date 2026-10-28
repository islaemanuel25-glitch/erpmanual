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
  // Decía "Va 0 · no va". Desde el 2026-10-28 un 0 decidido es "No hay", se
  // llegue por el botón o corrigiendo a 0: es el mismo hecho.
  assert.match(linea("YERBA").textContent, /No hay/);
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

test("VOLVER A PENDIENTE: solo en una preparada, debajo de Guardar; la línea y los contadores vuelven atrás", async () => {
  const { pedidos } = await montarPreparar();
  // Pendiente: la hoja no lo ofrece.
  await A.tocar(A.boton("Corregir", linea("ACEITE")));
  assert.ok(A.boton("Guardar", A.modal()), "no se abrió la hoja del aceite");
  assert.ok(!A.boton("Volver a pendiente", A.modal()), "una pendiente ofrece Volver a pendiente");
  await A.tocar(A.boton("Cerrar", A.modal()));
  assert.ok(!A.modal(), "la hoja del aceite no se cerró");

  await A.tocar(A.boton("✓ Va completo", linea("ACEITE")));
  assert.deepEqual(opciones(), ["Pendientes 4", "Con cambios 0", "Preparados 1", "Todos 5"]);
  assert.equal(A.contenido().querySelector("[data-avance]")?.getAttribute("data-avance"), "20");

  // Preparada: el renglón achicado abre la misma hoja, con el botón —un botón
  // del kit, no un link— después de Guardar.
  await elegir("Preparados");
  await A.tocar(linea("ACEITE").querySelector("button"));
  const hoja = A.modal();
  assert.ok(hoja, "el renglón preparado no abrió la hoja");
  const textos = A.botones(hoja).map((b) => b.textContent.trim());
  assert.ok(textos.indexOf("Volver a pendiente") > textos.indexOf("Guardar"), `orden de la hoja: ${json(textos)}`);
  assert.match(A.boton("Volver a pendiente", hoja).className, /\bsunmi-btn/);
  await A.tocar(A.boton("Volver a pendiente", hoja));

  assert.deepEqual(A.llamadas(pedidos, "/api/pos-transferencias/detalle/editar").at(-1).cuerpo, { detalleId: dep.depositoDetalleNuevo.cuerpo.item.detalles[0].detalleId, pendiente: true });
  assert.ok(!A.modal(), "la hoja quedó abierta");
  assert.deepEqual(opciones(), ["Pendientes 5", "Con cambios 0", "Preparados 0", "Todos 5"]);
  assert.match(A.contenido().textContent, /0 \/ 5 preparados/);
  assert.match(A.contenido().textContent, /Falta revisar 5/);
  assert.equal(A.contenido().querySelector("[data-avance]")?.getAttribute("data-avance"), "0");
  await elegir("Pendientes");
  assert.equal(estadoDe("ACEITE"), "pendiente");
  assert.ok(A.boton("✓ Va completo", linea("ACEITE")), "el aceite pendiente no ofrece Va completo");
});

const json = (x) => JSON.stringify(x);

const detalleIdDe = (detalle, nombre) => detalle.cuerpo.item.detalles.find((d) => d.productoNombre === nombre).detalleId;

test("NO HAY en el renglón: un botón al lado de Va completo; revisado en 0, en Con cambios, y se deshace con Volver a pendiente", async () => {
  const { pedidos } = await montarPreparar();
  const ultimoCuerpo = () => A.llamadas(pedidos, "/api/pos-transferencias/detalle/editar").at(-1).cuerpo;
  const noHay = A.boton("No hay", linea("ACEITE"));
  assert.ok(noHay, "el renglón pendiente no tiene No hay");
  assert.match(noHay.className, /\bsunmi-btn/, "No hay no es un botón del kit");
  assert.ok(A.boton("✓ Va completo", linea("ACEITE")), "No hay reemplazó a Va completo");

  await A.tocar(noHay);
  assert.deepEqual(ultimoCuerpo(), { detalleId: detalleIdDe(dep.depositoDetalleNuevo, "ACEITE"), preparado: 0, unidadPreparada: "UNIDAD" });
  assert.ok(!A.modal(), "No hay pidió confirmación");
  assert.deepEqual(opciones(), ["Pendientes 4", "Con cambios 1", "Preparados 1", "Todos 5"]);
  assert.match(A.contenido().textContent, /1 \/ 5 preparados/);
  assert.match(A.contenido().textContent, /Falta revisar 4/);
  assert.equal(A.contenido().querySelector("[data-avance]")?.getAttribute("data-avance"), "20");

  await elegir("Con cambios");
  assert.deepEqual(visibles(), ["ACEITE"]);
  assert.match(linea("ACEITE").textContent, /No hay/);
  assert.doesNotMatch(linea("ACEITE").textContent, /\b[Vv]a \d/, "dice «va N» en vez de No hay");
  assert.ok(!A.boton("No hay", linea("ACEITE")), "uno que ya no hay sigue ofreciendo No hay");

  // La hoja de uno que ya no hay: sin No hay, con Volver a pendiente.
  await A.tocar(A.boton("Corregir", linea("ACEITE")));
  assert.ok(!A.boton("No hay", A.modal()), "la hoja de uno que ya no hay ofrece No hay");
  await A.tocar(A.boton("Volver a pendiente", A.modal()));
  assert.deepEqual(ultimoCuerpo(), { detalleId: detalleIdDe(dep.depositoDetalleNuevo, "ACEITE"), pendiente: true });
  assert.deepEqual(opciones(), ["Pendientes 5", "Con cambios 0", "Preparados 0", "Todos 5"]);
});

test("NO HAY en la hoja: debajo de Guardar, deja la línea en 0 de un toque", async () => {
  const { pedidos } = await montarPreparar();
  await A.tocar(A.boton("Corregir", linea("YERBA")));
  const hoja = A.modal();
  const textos = A.botones(hoja).map((b) => b.textContent.trim());
  assert.ok(textos.indexOf("No hay") > textos.indexOf("Guardar"), `orden de la hoja: ${json(textos)}`);
  await A.tocar(A.boton("No hay", hoja));
  assert.deepEqual(A.llamadas(pedidos, "/api/pos-transferencias/detalle/editar").at(-1).cuerpo, { detalleId: detalleIdDe(dep.depositoDetalleNuevo, "YERBA"), preparado: 0, unidadPreparada: "UNIDAD" });
  assert.ok(!A.modal(), "la hoja quedó abierta");
  await elegir("Con cambios");
  assert.equal(estadoDe("YERBA"), "conCambios");
  assert.match(linea("YERBA").textContent, /No hay/);
});

test("NO HAY en lo que se pesa: al lado de Pesar, el mismo 0", async () => {
  const { pedidos } = await montarPreparar({ detalle: dep.depositoDetallePeso });
  assert.ok(A.boton("Pesar", linea("SALAMETRO")), "se perdió Pesar");
  await A.tocar(A.boton("No hay", linea("SALAMETRO")));
  assert.deepEqual(A.llamadas(pedidos, "/api/pos-transferencias/detalle/editar").at(-1).cuerpo, { detalleId: detalleIdDe(dep.depositoDetallePeso, "SALAMETRO"), preparado: 0, unidadPreparada: "UNIDAD" });
  await elegir("Con cambios");
  assert.equal(estadoDe("SALAMETRO"), "conCambios");
  assert.match(linea("SALAMETRO").textContent, /No hay/);
  assert.doesNotMatch(linea("SALAMETRO").textContent, /KG/, "dice los kilos en vez de No hay");
});

test("POR PESO: pedido en unidades se pesa con «Pesar», en kilos y sin − / +; pedido en kilos va completo con esos kilos", async () => {
  // Sección 14c: 2 SALAMETRO (de pieza: lo pidió en unidades) y 2 QUESO (a granel).
  const { pedidos } = await montarPreparar({ detalle: dep.depositoDetallePeso });
  const ultimoCuerpo = () => A.llamadas(pedidos, "/api/pos-transferencias/detalle/editar").at(-1).cuerpo;
  const pidio = (n) => [...linea(n).querySelectorAll("p")].find((p) => p.firstElementChild?.textContent === "Pidió")?.children[1].textContent.trim();
  assert.deepEqual(visibles(), ["SALAMETRO", "QUESO"]);
  assert.equal(pidio("SALAMETRO"), "2 u");
  assert.equal(pidio("QUESO"), "2,000 KG");
  assert.ok(!A.boton("✓ Va completo", linea("SALAMETRO")), "pedido en unidades ofrece Va completo");
  assert.ok(A.boton("✓ Va completo", linea("QUESO")), "pedido en kilos sin Va completo");

  // El salametro: Pesar abre la hoja, en kilos, vacía y con Guardar apagado.
  await A.tocar(A.boton("Pesar", linea("SALAMETRO")));
  let hoja = A.modal();
  assert.ok(hoja, "Pesar no abrió la hoja");
  assert.match(hoja.textContent, /Pidió 2 u/);
  assert.match(hoja.textContent, /Kilos/);
  assert.doesNotMatch(hoja.textContent, /Unidades/);
  const campos = [...hoja.querySelectorAll("input")];
  assert.equal(campos.length, 1);
  assert.equal(campos[0].value, "");
  assert.equal(campos[0].getAttribute("inputmode"), "decimal");
  assert.equal(A.botones(hoja).filter((b) => /^[−+-]$/.test(b.textContent.trim())).length, 0, "la hoja de kilos tiene − / +");
  assert.ok(A.boton("Guardar", hoja).disabled, "Guardar prendido sin peso");
  await A.teclear(campos[0], "1,853");
  assert.ok(!A.boton("Guardar", hoja).disabled, "Guardar sigue apagado con un peso");
  await A.tocar(A.boton("Guardar", hoja));
  assert.deepEqual(ultimoCuerpo(), { detalleId: dep.depositoDetallePeso.cuerpo.item.detalles.find((d) => d.productoNombre === "SALAMETRO").detalleId, preparado: 1.853, unidadPreparada: "UNIDAD" });
  // Cargar el peso de lo pedido en unidades no es un cambio.
  assert.deepEqual(opciones(), ["Pendientes 1", "Con cambios 0", "Preparados 1", "Todos 2"]);

  // El queso: va completo manda los mismos kilos; corregido, Con cambios.
  await A.tocar(A.boton("✓ Va completo", linea("QUESO")));
  assert.deepEqual(ultimoCuerpo().preparado, 2);
  assert.deepEqual(opciones(), ["Pendientes 0", "Con cambios 0", "Preparados 2", "Todos 2"]);
  await elegir("Todos");
  assert.match(linea("SALAMETRO").textContent, /· va 1,853 KG/);
  await A.tocar(linea("QUESO").querySelector("button"));
  hoja = A.modal();
  assert.equal(hoja.querySelector("input").value, "2,000");
  await A.teclear(hoja.querySelector("input"), "1,85");
  await A.tocar(A.boton("Guardar", hoja));
  assert.equal(ultimoCuerpo().preparado, 1.85);
  assert.equal(estadoDe("QUESO"), "conCambios");
  assert.match(linea("QUESO").textContent, /Va 1,850 KG de 2,000 KG · falta 0,150 KG/);
});

test("enviar y el depósito ya lo había cancelado: el aviso y de vuelta a Pedidos de locales", async () => {
  // La respuesta que dio `enviar` al perder la carrera contra cancelar
  // (sección 15d), y nunca "El local cambió…".
  assert.deepEqual(dep.depositoEnviarPerdioContraCancelar, { status: 409, cuerpo: { ok: false, error: "Este pedido se canceló." } });
  const { pedidos } = await montarPreparar({ enviar: [dep.depositoEnviarPerdioContraCancelar] });
  // Las mismas escrituras que EL RECORRIDO, hasta tener todo revisado.
  await A.tocar(A.boton("✓ Va completo", linea("ACEITE")));
  await corregir("YERBA", [0]);
  await corregir("ARROZ", [1]);
  await corregir("AGUA X6", [1, 3]);
  await elegir("Con cambios");
  await corregir("AGUA X6", [2, 0]);
  await A.tocar(A.boton("+ Agregar producto que no pidió"));
  await A.teclear(A.modal().querySelector("input"), "AZUC");
  await A.asentar();
  await A.tocar([...A.modal().querySelectorAll("button")].find((b) => /AZUCAR/.test(b.textContent)));
  await elegir("Pendientes");
  await A.tocar(A.boton("✓ Va completo", linea("FIDEOS")));
  assert.ok(!enviarBoton().disabled, "Enviar sigue apagado con todo revisado");

  const lecturas = A.llamadas(pedidos, "/api/pos-transferencias/detalle").length;
  await A.tocar(enviarBoton());
  assert.equal(A.llamadas(pedidos, "/api/pos-transferencias/enviar").length, 1);
  assert.match(A.texto(), /Este pedido se canceló\./);
  assert.doesNotMatch(A.texto(), /El local cambió/);
  assert.deepEqual(A.navegacion.at(-1), ["push", "/modulos/pos-transferencias"]);
  assert.equal(A.llamadas(pedidos, "/api/pos-transferencias/detalle").length, lecturas, "volvió a leer un pedido cancelado");
});

test("la hoja de corregir dice lo pedido con el mismo texto que la tarjeta", async () => {
  for (const n of ["ACEITE", "AGUA X6"]) {
    await A.desmontarTodo();
    await montarPreparar();
    const enLaTarjeta = [...linea(n).querySelectorAll("p")].find((p) => p.firstElementChild?.textContent === "Pidió").children[1].textContent.trim();
    await A.tocar(A.boton("Corregir", linea(n)));
    const hoja = A.modal();
    assert.ok(hoja, `no se abrió la hoja de ${n}`);
    assert.ok(hoja.textContent.includes(`Pidió ${enLaTarjeta}`), `${n}: la hoja no dice "Pidió ${enLaTarjeta}": ${hoja.textContent}`);
    assert.doesNotMatch(hoja.textContent, /BULTO de/);
    // El renglón por bulto, con su número.
    if (n === "AGUA X6") assert.ok(hoja.textContent.includes("Pidió 2 PACK x6"));
  }
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
