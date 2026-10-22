// LA PÁGINA DE ENTRADA DE PEDIDOS AL DEPÓSITO.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pedidos/paginaDeEntrada.test.mjs
//
// Pedido de Emanuel (2026-10-22): al entrar al módulo se ve primero esta
// página, no el catálogo. Una tarjeta "Pedido al depósito" con el pedido en
// curso —ninguno, borrador, enviado sin empezar o empezado— y lo que se puede
// hacer con él; debajo, los últimos tres pedidos y el historial.
//
// Montada con el arnés y las respuestas REALES de las rutas sobre erpazul_al
// (`scripts/pruebas-db/pedidosEnviarCancelar.mjs`): el carrito de cada estado,
// y el historial de un local sin pedidos (sección 0) y de uno con varios y uno
// en curso (sección 11).

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

const {
  real, montar, desmontarTodo, texto, boton, botones, tocar, tarjetas, tarjeta, llamadas, filaShell, modal, entrada, navegacion, contenido,
} = await import("./montarPantallaPedidos.mjs");

afterEach(desmontarTodo);

const pill = () => entrada()?.querySelector("span.inline-block")?.textContent.trim() ?? null;
const acciones = () => botones(entrada()).map((b) => b.textContent.trim());
const anteriores = () => [...document.querySelectorAll("[data-pedido-anterior]")];
const enCatalogo = () => !!contenido().querySelector('input[placeholder="Buscar producto o código"]');

/** La respuesta real con la fecha de envío corrida: lo único que cambia de un día al otro. */
const conFecha = (r, fecha) => ({
  ...r,
  cuerpo: { ...r.cuerpo, pendiente: { ...r.cuerpo.pendiente, solicitadoAt: fecha.toISOString() } },
});

test("el fixture: un carrito por estado, y el historial trae el pedido en curso primero", () => {
  assert.equal(real.carritoVacio.cuerpo.pendiente, null);
  assert.equal(real.carritoVacio.cuerpo.items.length, 0);
  assert.equal(real.carritoBorrador.cuerpo.items.length, 2);
  assert.equal(real.entradaEnviadoCarrito.cuerpo.pendiente.depositoEmpezo, false);
  assert.equal(real.empezadoCarrito.cuerpo.pendiente.depositoEmpezo, true);
  const h = real.entradaHistorial.cuerpo.items;
  assert.equal(h.length, 4);
  assert.equal(h[0].posId, real.entradaEnviadoCarrito.cuerpo.pendiente.posId, "el en curso no es el primero del historial");
  assert.equal(real.historialVacio.cuerpo.items.length, 0);
});

test("se entra por la entrada, no por el catálogo", async () => {
  await montar({ inicio: real.carritoBorrador, enLaEntrada: true });
  assert.ok(entrada(), "no arrancó en la página de entrada");
  assert.ok(!enCatalogo(), "arrancó en el catálogo");
  assert.equal(tarjetas().length, 0, "en la entrada no van las tarjetas de producto");
});

test("sin pedido: No tenés un pedido en curso, y Hacer un pedido abre el catálogo", async () => {
  await montar({ inicio: real.carritoVacio, enLaEntrada: true });
  assert.match(entrada().textContent, /Pedido al depósito/);
  assert.match(entrada().textContent, /No tenés un pedido en curso/);
  assert.equal(pill(), null, "sin pedido no va píldora");
  assert.deepEqual(acciones(), ["Hacer un pedido"]);
  const hacer = boton("Hacer un pedido", entrada());
  assert.match(hacer.className, /sunmi-btn-primary/);
  assert.match(hacer.className, /w-full/);
  // Sin pedidos anteriores, la sección no está.
  assert.ok(!/Pedidos anteriores/.test(texto()), "sin pedidos anteriores se mostró la sección");
  await tocar(hacer);
  assert.ok(!entrada() && enCatalogo(), "no abrió el catálogo");
});

test("borrador: N productos sin enviar, Seguir armando y Ver pedido", async () => {
  await montar({ inicio: real.carritoBorrador, enLaEntrada: true });
  assert.equal(pill(), "Borrador");
  assert.match(entrada().textContent, /2 productos sin enviar/);
  assert.deepEqual(acciones(), ["Seguir armando", "Ver pedido"]);
  assert.match(boton("Seguir armando", entrada()).className, /sunmi-btn-primary/);
  assert.match(boton("Ver pedido", entrada()).className, /sunmi-btn-slate/);
  assert.ok(acciones().every((t) => /w-full/.test(boton(t, entrada()).className)), "no todos de ancho completo");

  await tocar(boton("Ver pedido", entrada()));
  assert.deepEqual(tarjetas().map((t) => t.nombre).sort(), ["Agua x6", "Coca 2L"], "Ver pedido no abrió Ver mi pedido");
  // Abierto desde la entrada, su Volver vuelve a la entrada.
  await tocar(boton("Volver", filaShell()));
  assert.ok(entrada(), "el Volver de Ver mi pedido no volvió a la entrada");

  await tocar(boton("Seguir armando", entrada()));
  assert.ok(enCatalogo(), "Seguir armando no abrió el catálogo");
});

test("enviado sin empezar: la fecha, cuántos, y Sumar productos, Ver pedido y Cancelar pedido", async () => {
  await montar({ inicio: conFecha(real.entradaEnviadoCarrito, new Date()), historial: real.entradaHistorial, enLaEntrada: true });
  assert.equal(pill(), "Enviado");
  assert.match(entrada().textContent, /Enviado hoy \d\d:\d\d · todavía podés sumar productos/);
  assert.match(entrada().textContent, /2 productos en el pedido/);
  assert.deepEqual(acciones(), ["Sumar productos", "Ver pedido", "Cancelar pedido"]);
  assert.match(boton("Sumar productos", entrada()).className, /sunmi-btn-primary/);
  assert.match(boton("Ver pedido", entrada()).className, /sunmi-btn-slate/);
  const cancelar = boton("Cancelar pedido", entrada());
  assert.match(cancelar.className, /sunmi-btn-ghost/);
  assert.match(cancelar.className, /sunmi-text-danger/, "el texto no va en el rojo del tema");
  assert.ok(acciones().every((t) => /w-full/.test(boton(t, entrada()).className)));

  // Cancelar abre la hoja de confirmación que ya existía, y no cancela solo.
  await tocar(cancelar);
  assert.ok(modal(), "no abrió la hoja de confirmación");
  assert.match(modal().textContent, /¿Cancelar el pedido solicitado\?/);
});

test("enviado otro día: fecha corta y hora", async () => {
  const hace3 = new Date(Date.now() - 3 * 24 * 3600 * 1000);
  await montar({ inicio: conFecha(real.entradaEnviadoCarrito, hace3), enLaEntrada: true });
  assert.match(entrada().textContent, /Enviado \d\d\/\d\d \d\d:\d\d · todavía podés sumar productos/);
  assert.doesNotMatch(entrada().textContent, /Enviado hoy/);
});

test("empezado: Preparando, El depósito lo está preparando, y solo Ver pedido, sin cancelar", async () => {
  await montar({ inicio: real.empezadoCarrito, enLaEntrada: true });
  assert.equal(pill(), "Preparando");
  assert.match(entrada().textContent, /El depósito lo está preparando/);
  assert.match(entrada().textContent, /3 productos/);
  assert.deepEqual(acciones(), ["Ver pedido"], "empezado se ofrece algo más que Ver pedido");
  assert.match(boton("Ver pedido", entrada()).className, /sunmi-btn-slate/);

  await tocar(boton("Ver pedido", entrada()));
  const nombres = real.empezadoCarrito.cuerpo.pendiente.items.map((i) => i.nombre).sort();
  assert.deepEqual(tarjetas().map((t) => t.nombre).sort(), nombres, "no abrió lo pedido");
  assert.ok(tarjetas().every((t) => t.campo.disabled && !t.quitar), "la lista no está apagada");
  assert.ok(!boton("Cancelar pedido"), "empezado apareció cancelar");
  await tocar(boton("Volver", filaShell()));
  assert.ok(entrada(), "el Volver no volvió a la entrada");
});

test("pedidos anteriores: los tres últimos sin el en curso, con número, estado, fecha y cuántos, y llevan al historial", async () => {
  await montar({ inicio: conFecha(real.entradaEnviadoCarrito, new Date()), historial: real.entradaHistorial, enLaEntrada: true });
  assert.match(texto(), /Pedidos anteriores/);
  const enCurso = real.entradaEnviadoCarrito.cuerpo.pendiente.posId;
  const esperados = real.entradaHistorial.cuerpo.items.filter((i) => i.posId !== enCurso).slice(0, 3);
  assert.deepEqual(anteriores().map((f) => Number(f.dataset.pedidoAnterior)), esperados.map((i) => i.posId), "no son los tres últimos sin el en curso");
  for (const [i, fila] of anteriores().entries()) {
    const a = esperados[i];
    assert.equal(fila.tagName, "BUTTON", "la fila no es tocable");
    const negrita = fila.querySelector(".font-semibold");
    assert.equal(negrita?.textContent, `Pedido #${a.posId}`);
    assert.match(fila.textContent, new RegExp(`${a.estado} · \\d\\d/\\d\\d · ${a.itemCount} producto`));
    assert.match(fila.textContent, /›/);
  }
  await tocar(anteriores()[0]);
  assert.deepEqual(navegacion.at(-1), ["push", "/modulos/pedidos/historial"], "la fila no lleva al historial");
  await tocar(boton("Ver todo el historial ›"));
  assert.deepEqual(navegacion.at(-1), ["push", "/modulos/pedidos/historial"]);
});

test("el Volver del shell: desde la entrada a donde va hoy; desde el catálogo, a la entrada", async () => {
  await montar({ inicio: real.carritoBorrador, enLaEntrada: true });
  await tocar(boton("Seguir armando", entrada()));
  await tocar(boton("Volver", filaShell()));
  assert.ok(entrada(), "desde el catálogo no volvió a la entrada");
  assert.deepEqual(navegacion, [], "desde el catálogo se fue del módulo");
  await tocar(boton("Volver", filaShell()));
  assert.deepEqual(navegacion, [["back"]], "desde la entrada no volvió a donde se venía");
});

test("409 al sumar (el depósito lo empezó): el aviso, y vuelve a la entrada en Preparando", async () => {
  const { estado } = await montar({
    inicio: conFecha(real.entradaEnviadoCarrito, new Date()),
    setCantidad: real.empezadoSetCantidad,
    enLaEntrada: true,
  });
  await tocar(boton("Sumar productos", entrada()));
  estado.carrito = real.empezadoCarrito;
  await tocar(tarjeta("Yerba 1kg").mas);
  assert.match(texto(), /El depósito ya está preparando tu pedido\. Ya no se puede cambiar\./);
  assert.ok(entrada(), "no volvió a la entrada");
  assert.equal(pill(), "Preparando");
});

test("RECORRIDO: entrar, hacer un pedido, enviar, sumar, volver y cancelar", async () => {
  const { pedidos } = await montar({
    inicio: real.carritoVacio,
    solicitar: [real.solicitado],
    cancelar: [real.cancelado],
    enLaEntrada: true,
  });
  // Entrar: sin pedido.
  assert.match(entrada().textContent, /No tenés un pedido en curso/);
  await tocar(boton("Hacer un pedido", entrada()));

  // Cargar y enviar: un toque, sin segunda confirmación.
  await tocar(tarjeta("Coca 2L").mas);
  const antes = pedidos.length;
  await tocar(boton("Enviar pedido al depósito (1)"));
  const solicitudes = llamadas(pedidos, "/api/pos-transferencias/solicitar");
  assert.equal(solicitudes.length, 1, "Enviar no envió al primer toque");
  assert.equal(pedidos.slice(antes).findIndex((p) => p.ruta === "/api/pos-transferencias/solicitar"), 0, "algo se pidió antes del envío");
  assert.equal(solicitudes[0].cuerpo.posId, real.setCantidad_UNIDAD.cuerpo.posId);

  // Vuelve sola a la entrada, en Enviado, con el aviso.
  assert.ok(entrada(), "después de enviar no volvió a la entrada");
  assert.equal(pill(), "Enviado");
  assert.match(texto(), /Pedido enviado al depósito correctamente/);

  // Sumar productos: el catálogo, y lo que se carga va al pedido.
  await tocar(boton("Sumar productos", entrada()));
  assert.ok(enCatalogo());
  await tocar(tarjeta("Yerba 1kg").mas);
  assert.equal(llamadas(pedidos, "/api/pedidos/set-cantidad").at(-1).cuerpo.cantidad, 1);
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/solicitar").length, 1, "sumar mandó otro envío");

  // Volver: la entrada.
  await tocar(boton("Volver", filaShell()));
  assert.ok(entrada());
  assert.equal(pill(), "Enviado");

  // Cancelar, confirmado en la hoja: la entrada sin pedido.
  await tocar(boton("Cancelar pedido", entrada()));
  await tocar(boton("Cancelar pedido", modal()));
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/cancelar").length, 1);
  assert.ok(entrada(), "después de cancelar no volvió a la entrada");
  assert.match(entrada().textContent, /No tenés un pedido en curso/);
});
