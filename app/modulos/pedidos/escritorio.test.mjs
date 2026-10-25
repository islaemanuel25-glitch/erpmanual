// LA VERSIÓN DE COMPUTADORA DE PEDIDOS AL DEPÓSITO, DESDE lg.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pedidos/escritorio.test.mjs
//
// `components/pedidos/PedidosEscritorio.jsx`, montada por la página entera con
// el arnés (`montarPantallaPedidos.mjs`) y las respuestas REALES de las rutas
// sobre erpazul_al, con la ventana de computadora: la página monta solo esta
// composición (`montaje.test.mjs`). Que el teléfono no cambió lo dice
// `celularIntacto.test.mjs`.
//
// El diseño es el del 2026-10-25: la barra fija con el buscador, la categoría,
// "Ver fotos" y la acción principal; las dos pestañas; la lista de punta a
// punta con su pie. Sin el panel "Tu pedido" y sin el stock del depósito.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

const { real, montar, desmontarTodo, tocar, asentar, llamadas, modal, escritorio, navegacion } = await import("./montarPantallaPedidos.mjs");

afterEach(desmontarTodo);

// ── LO QUE SE MIRA ────────────────────────────────────────────────────────

const enEscritorio = () => escritorio();
const botonesE = () => [...enEscritorio().querySelectorAll("button")];
const botonE = (t) => botonesE().find((b) => b.textContent.trim().startsWith(t)) ?? null;
const textoE = () => enEscritorio().textContent;
const barra = () => enEscritorio().querySelector("[data-barra-pedido]");
const herramientas = () => enEscritorio().querySelector("[data-herramientas-pedido]");
const pestanas = () => enEscritorio().querySelector("[data-pestanas-pedido]");
const lista = () => enEscritorio().querySelector("[data-lista-pedido]");
const pie = () => enEscritorio().querySelector("[data-pie-lista]");
const tabla = () => enEscritorio().querySelector("table");
const nombres = () => [...tabla().querySelectorAll("tbody tr [data-nombre-producto]")].map((n) => n.textContent);
/** Una fila de la lista, por el nombre del producto. */
function fila(nombre) {
  const tr = [...(tabla()?.querySelectorAll("tbody tr") ?? [])].find((f) => f.querySelector("[data-nombre-producto]")?.textContent === nombre);
  if (!tr) return null;
  return {
    tr,
    celdas: [...tr.querySelectorAll("td")].map((td) => td.textContent.trim()),
    nombre: tr.querySelector("[data-nombre-producto]"),
    campo: tr.querySelector(`input[aria-label="Cantidad de ${nombre}"]`),
    mas: tr.querySelector('button[aria-label^="Sumar uno"]'),
    sacar: [...tr.querySelectorAll("button")].find((b) => b.textContent.trim() === "Sacar del pedido") ?? null,
    sePidePor: tr.querySelector("[data-se-pide-por] span"),
    marca: tr.querySelector("[data-marca-cambio]")?.textContent ?? null,
  };
}
const setCantidades = (pedidos) => llamadas(pedidos, "/api/pedidos/set-cantidad").map((p) => p.cuerpo);
const id = (n) => real.catalogo.cuerpo.items.find((i) => i.nombre === n).productoLocalId;

const conFecha = (r, fecha) => ({ ...r, cuerpo: { ...r.cuerpo, pendiente: { ...r.cuerpo.pendiente, solicitadoAt: fecha.toISOString() } } });
const enviadoHoy = () => conFecha(real.carritoPendiente, new Date());

// Con la ventana de computadora, que es la única que lo monta. No tiene
// página de entrada.
const montarE = (r) => montar({ ...r, ancho: "escritorio" });

// ── LA BARRA ──────────────────────────────────────────────────────────────

test("la barra es fija, va arriba de la lista, y la lista no está adentro", async () => {
  await montarE({ inicio: real.carritoBorrador });
  assert.match(barra().className, /\bsticky\b/);
  assert.match(barra().className, /\btop-0\b/);
  assert.match(barra().className, /sunmi-bg-card/, "la barra no tiene el fondo de superficie");
  assert.match(barra().className, /border-b sunmi-divider/, "la barra sin su borde inferior");
  assert.ok(!barra().contains(tabla()), "la lista quedó adentro de la barra");
  assert.ok(barra().compareDocumentPosition(lista()) & 4, "la barra no está arriba de la lista");
  // La tabla no scrollea por su cuenta: lo que se mueve es la página.
  assert.doesNotMatch(tabla().parentElement.className, /max-h-|overflow-y-auto/);
});

test("armando, línea 1: buscador, Categoría, Ver fotos apagado y Enviar pedido (N), en ese orden", async () => {
  await montarE({ inicio: real.carritoBorrador });
  const h = herramientas();
  const buscador = h.querySelector('input[placeholder="Buscar producto o código"]');
  assert.ok(buscador, "falta el buscador");
  assert.match(buscador.closest(".flex-1")?.className ?? "", /flex-1/, "el buscador no ocupa el ancho disponible");
  assert.match(h.textContent, /Categoría/);
  assert.match(h.textContent, /Todas · 3/);
  assert.match(h.textContent, /Ver fotos/);
  const enviar = botonE("Enviar pedido al depósito (2)");
  assert.ok(enviar && h.contains(enviar), "el botón principal no está en la línea 1");
  assert.match(enviar.className, /sunmi-btn-primary/);
  assert.equal(enviar.disabled, false);
  const orden = (a, b) => a.compareDocumentPosition(b) & 4;
  assert.ok(orden(buscador, h.querySelector("[data-ver-fotos-escritorio]")) && orden(h.querySelector("[data-ver-fotos-escritorio]"), enviar));
  // "Ver fotos" apagado por defecto: sin miniaturas.
  assert.ok(!tabla().querySelector("[data-tarjeta-foto], [data-tarjeta-inicial]"), "Ver fotos arrancó prendido");
});

test("armando, línea 2: las dos pestañas, de dónde a dónde y Pedidos anteriores", async () => {
  await montarE({ inicio: real.carritoBorrador });
  const { local, deposito } = real.opciones.cuerpo;
  const p = pestanas();
  assert.deepEqual([...p.querySelectorAll("button")].map((b) => b.textContent.trim()), ["Todos los productos", "Lo que pedí · 2", "Pedidos anteriores"]);
  assert.match(botonE("Todos los productos").className, /sunmi-btn-amber/, "la activa no está en amber");
  assert.match(botonE("Lo que pedí").className, /sunmi-btn-slate/);
  assert.match(botonE("Pedidos anteriores").className, /sunmi-btn-slate/);
  const texto = [...p.querySelectorAll("span")].find((s) => s.textContent.includes("→"));
  assert.equal(texto.textContent, `${local.nombre} → ${deposito.nombre} · se guarda solo`);
  assert.match(texto.className, /sunmi-text-muted/);
  assert.ok(!botonE("Cancelar pedido"), "armando no se cancela");
  await tocar(botonE("Pedidos anteriores"));
  assert.deepEqual(navegacion.at(-1), ["push", "/modulos/pedidos/historial"]);
});

test("sin pedido: Enviar pedido al depósito (0) apagado, y Lo que pedí · 0", async () => {
  await montarE({ inicio: real.carritoVacio });
  assert.equal(botonE("Enviar pedido al depósito (0)").disabled, true);
  assert.ok(botonE("Lo que pedí · 0"));
  assert.ok(tabla(), "sin pedido no hay lista");
});

test("lo viejo no está: ni el panel Tu pedido, ni la franja, ni el paginador del kit", async () => {
  await montarE({ inicio: real.carritoBorrador });
  assert.ok(!enEscritorio().querySelector("[data-panel-pedido], [data-franja-pedido], [data-paginador]"));
  assert.doesNotMatch(textoE(), /Tu pedido|Productos en el pedido|← Volver/);
});

// ── LA LISTA ──────────────────────────────────────────────────────────────

test("la lista: cinco columnas, encabezado chico en el fondo de la app, en una tarjeta con borde", async () => {
  await montarE({ inicio: real.carritoBorrador });
  assert.match(lista().className, /rounded-xl2/);
  assert.match(lista().className, /\bborder\b/);
  const th = [...tabla().querySelectorAll("thead th")];
  assert.deepEqual(th.map((t) => t.textContent.trim()), ["Producto", "Categoría", "Se pide por", "Cantidad", ""]);
  for (const t of th) {
    assert.match(t.className, /sunmi-surface/, "el encabezado no va en el fondo de la app");
    assert.match(t.className, /text-xs2/, "el encabezado no va en letra chica");
  }
});

test("cada renglón: nombre, categoría suave, Se pide por de la tarjeta del teléfono, y sin stock", async () => {
  await montarE({ inicio: real.carritoBorrador });
  assert.deepEqual(nombres(), ["Agua x6", "Coca 2L", "Yerba 1kg"]);
  const agua = fila("Agua x6");
  assert.equal(agua.celdas[1], "Bebidas 1792755397920");
  assert.match(agua.tr.querySelectorAll("td")[1].innerHTML, /sunmi-text-muted/);
  // `textoDeUnidad` de `TarjetaPedido`, en la etiqueta chica del kit (slate).
  assert.equal(agua.sePidePor.textContent, "Por BULTO de 6 u");
  assert.match(agua.sePidePor.className, /sunmi-badge-muted/);
  assert.match(agua.sePidePor.className, /font-semibold/);
  assert.equal(fila("Coca 2L").sePidePor.textContent, "UNIDAD");
  // El stock del depósito (50 en los tres) no está en ninguna celda.
  for (const n of nombres()) assert.ok(!fila(n).celdas.includes("50"), `${n} muestra el stock`);
  assert.doesNotMatch(textoE(), /stock/i);
});

test("con cantidad: negrita, fondo de la app y el borde del campo en acento; sin cantidad, el 0 de guía", async () => {
  await montarE({ inicio: real.carritoBorrador });
  const coca = fila("Coca 2L");
  assert.match(coca.nombre.className, /font-bold/);
  assert.match(coca.tr.className, /sunmi-surface/);
  assert.equal(coca.campo.value, "3");
  assert.match(coca.campo.className, /sunmi-border-accent/);
  const yerba = fila("Yerba 1kg");
  assert.doesNotMatch(yerba.nombre.className, /font-bold/);
  assert.doesNotMatch(yerba.tr.className, /sunmi-surface/);
  assert.doesNotMatch(yerba.campo.className, /sunmi-border-accent/);
  // El 0 como guía gris: el campo vacío y el 0 de placeholder.
  assert.equal(yerba.campo.value, "");
  assert.equal(yerba.campo.getAttribute("placeholder"), "0");
});

test("Sacar del pedido: solo con cantidad, deja 0, y su columna tiene el ancho reservado siempre", async () => {
  const { pedidos } = await montarE({ inicio: real.carritoBorrador });
  const th = [...tabla().querySelectorAll("thead th")].at(-1);
  assert.match(th.className, /\bw-36\b/, "la columna de Sacar no tiene ancho fijo");
  assert.ok(!fila("Yerba 1kg").sacar, "sin cantidad apareció Sacar");
  const sacar = fila("Coca 2L").sacar;
  assert.ok(sacar, "con cantidad no está Sacar");
  for (const c of ["sunmi-text-danger", "sunmi-border", "sunmi-bg-card"]) assert.match(sacar.className, new RegExp(c));
  await tocar(sacar);
  assert.deepEqual(setCantidades(pedidos).at(-1), { productoLocalId: id("Coca 2L"), cantidad: 0, unidad: "UNIDAD" });
  assert.ok(!fila("Coca 2L").sacar, "después de sacar quedó el botón");
  assert.equal(fila("Coca 2L").campo.value, "");
  assert.ok(botonE("Enviar pedido al depósito (1)"));
});

test("armando: cada cambio va por set-cantidad al instante —se guarda solo— y cuenta en el botón y en la pestaña", async () => {
  const { pedidos } = await montarE({ inicio: real.carritoBorrador });
  await tocar(fila("Yerba 1kg").mas);
  assert.deepEqual(setCantidades(pedidos).at(-1), { productoLocalId: id("Yerba 1kg"), cantidad: 1, unidad: "UNIDAD" });
  assert.ok(botonE("Enviar pedido al depósito (3)"));
  assert.ok(botonE("Lo que pedí · 3"));
  await tocar(fila("Agua x6").mas);
  assert.deepEqual(setCantidades(pedidos).at(-1), { productoLocalId: id("Agua x6"), cantidad: 3, unidad: "BULTO" });
});

test("Ver fotos: la miniatura o la inicial antes del nombre, con la clave del celular", async () => {
  try { localStorage.setItem("pedidos_ver_fotos", "1"); } catch {}
  await montarE({ inicio: real.carritoBorrador });
  assert.ok(fila("Agua x6").tr.querySelector("[data-tarjeta-foto]"), "el agua sin su foto");
  assert.ok(fila("Coca 2L").tr.querySelector("[data-tarjeta-inicial]"), "la coca sin su inicial");
  const foto = fila("Agua x6").tr.querySelector("[data-tarjeta-foto]");
  assert.ok(foto.compareDocumentPosition(fila("Agua x6").nombre) & 4, "la foto no va antes del nombre");
});

// ── EL PIE ────────────────────────────────────────────────────────────────

test("el pie: «1 a 3 de 3» y Mostrar 25 / 50 / 100 con la elegida en primary", async () => {
  const { pedidos } = await montarE({ inicio: real.carritoBorrador });
  assert.match(pie().textContent, /1 a 3 de 3/);
  const mostrar = pie().querySelector("[data-mostrar]");
  assert.match(mostrar.textContent, /^Mostrar/);
  const opciones = [...mostrar.querySelectorAll("button")];
  assert.deepEqual(opciones.map((b) => b.textContent.trim()), ["25", "50", "100"]);
  assert.deepEqual(opciones.map((b) => /sunmi-btn-primary/.test(b.className)), [false, true, false]);
  assert.ok(opciones.filter((b) => /sunmi-btn-slate/.test(b.className)).length === 2);
  // Con una sola página no hay flechas.
  assert.ok(!pie().querySelector('button[aria-label="Página anterior"]'));
  await tocar(opciones[0]);
  await asentar(400);
  assert.equal(llamadas(pedidos, "/api/pedidos/catalogo").at(-1).params.pageSize, "25");
  assert.equal(localStorage.getItem("pedidos_page_size"), "25");
  assert.match(pie().querySelector("[data-mostrar] button").className, /sunmi-btn-primary/);
});

// ── LO QUE PEDÍ ───────────────────────────────────────────────────────────

test("Lo que pedí: solo lo cargado, la pestaña en amber, y el pie cuenta sin Mostrar", async () => {
  await montarE({ inicio: real.carritoBorrador });
  await tocar(fila("Yerba 1kg").mas);
  await tocar(botonE("Lo que pedí · 3"));
  assert.match(botonE("Lo que pedí").className, /sunmi-btn-amber/);
  assert.match(botonE("Todos los productos").className, /sunmi-btn-slate/);
  assert.deepEqual(nombres(), ["Coca 2L", "Agua x6", "Yerba 1kg"]);
  // La categoría también acá: sale de lo que trajo el catálogo.
  assert.equal(fila("Yerba 1kg").celdas[1], "Almacén 1792755397920");
  assert.equal(pie().textContent, "3 productos en el pedido");
  assert.ok(!pie().querySelector("[data-mostrar]"), "en Lo que pedí apareció Mostrar");
  // Sacar lo saca de la lista.
  await tocar(fila("Coca 2L").sacar);
  assert.deepEqual(nombres(), ["Agua x6", "Yerba 1kg"]);
  assert.equal(pie().textContent, "2 productos en el pedido");
  await tocar(botonE("Todos los productos"));
  assert.deepEqual(nombres(), ["Agua x6", "Coca 2L", "Yerba 1kg"]);
});

// ── ENVIAR ────────────────────────────────────────────────────────────────

test("Enviar pedido al depósito envía al primer toque, sin nada en el medio, y sigue en Enviado", async () => {
  const { pedidos } = await montarE({ inicio: real.carritoBorrador, solicitar: [real.solicitado] });
  const antes = pedidos.length;
  await tocar(botonE("Enviar pedido al depósito (2)"));
  await asentar(200);
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/solicitar").length, 1, "no envió al primer toque");
  assert.equal(pedidos[antes].ruta, "/api/pos-transferencias/solicitar", "algo se pidió antes del envío");
  assert.deepEqual(pedidos[antes].cuerpo, { posId: real.carritoBorrador.cuerpo.posId });
  assert.ok(!modal(), "apareció un segundo paso");
  assert.ok(botonE("Agregar al pedido (0)"), "después de enviar no quedó en el modo sumar");
  // La fecha es la real del fixture: "hoy" o la corta, según cuándo corra.
  assert.match(pestanas().textContent, /Enviado (hoy|\d\d\/\d\d) \d\d:\d\d · podés sumar/);
});

// ── ENVIADO: EL MODO SUMAR ────────────────────────────────────────────────

test("enviado: cuándo se envió, Agregar al pedido apagado y Cancelar pedido rojo en la línea 2", async () => {
  await montarE({ inicio: enviadoHoy() });
  assert.match(pestanas().textContent, /Enviado hoy \d\d:\d\d · podés sumar hasta que el depósito lo empiece/);
  const agregar = botonE("Agregar al pedido (0)");
  assert.ok(agregar && agregar.disabled);
  assert.match(agregar.className, /sunmi-btn-primary/);
  assert.ok(!botonE("Enviar pedido al depósito"));
  const cancelar = botonE("Cancelar pedido");
  assert.ok(cancelar && pestanas().contains(cancelar));
  assert.match(cancelar.className, /sunmi-btn-red/);
});

test("enviado otro día: fecha corta y hora", async () => {
  await montarE({ inicio: conFecha(real.carritoPendiente, new Date(Date.now() - 3 * 24 * 3600 * 1000)) });
  assert.match(pestanas().textContent, /Enviado \d\d\/\d\d \d\d:\d\d · podés sumar/);
});

test("enviado: nada se escribe hasta Agregar al pedido, y la fila marca lo pendiente", async () => {
  const { pedidos } = await montarE({ inicio: enviadoHoy(), sumar: [real.mainSumado] });
  await tocar(fila("Yerba 1kg").mas);
  await tocar(fila("Agua x6").mas);
  assert.equal(setCantidades(pedidos).length, 0, "el modo sumar llamó a set-cantidad");
  assert.equal(llamadas(pedidos, "/api/pedidos/sumar-al-enviado").length, 0, "se escribió sin confirmar");
  assert.equal(fila("Yerba 1kg").marca, "nuevo, sin confirmar");
  assert.equal(fila("Agua x6").marca, "2 → 3, sin confirmar");
  assert.equal(fila("Coca 2L").marca, null);
  assert.ok(botonE("Lo que pedí · 3"), "lo nuevo no cuenta en Lo que pedí");

  await tocar(botonE("Agregar al pedido (2)"));
  const envios = llamadas(pedidos, "/api/pedidos/sumar-al-enviado");
  assert.equal(envios.length, 1, "no fue una sola confirmación");
  assert.equal(envios[0].cuerpo.posId, real.carritoPendiente.cuerpo.pendiente.posId);
  assert.deepEqual(
    envios[0].cuerpo.cambios.map((c) => c.productoLocalId).sort(),
    [id("Yerba 1kg"), id("Agua x6")].sort()
  );
  assert.match(document.body.textContent, /Se agregaron 2 cambios al pedido/);
  assert.ok(botonE("Agregar al pedido (0)"));
});

test("enviado: un 409 al confirmar avisa arriba en la barra, descarta los cambios y pasa a Preparando", async () => {
  const { estado } = await montarE({ inicio: enviadoHoy(), sumar: [real.sumarEmpezado] });
  await tocar(fila("Yerba 1kg").mas);
  estado.carrito = real.empezadoCarrito;
  await tocar(botonE("Agregar al pedido (1)"));
  const aviso = enEscritorio().querySelector("[data-aviso-escritorio]");
  assert.ok(aviso, "el aviso no salió");
  assert.match(aviso.textContent, /El depósito ya está preparando tu pedido\. Ya no se puede cambiar\./);
  assert.ok(barra().contains(aviso), "el aviso no está en la barra");
  assert.ok(aviso.compareDocumentPosition(pestanas()) & 4, "el aviso no está arriba");
  assert.match(pestanas().textContent, /El depósito lo está preparando/);
});

test("la hoja de descartar: con cambios, Pedidos anteriores pregunta; sin cambios, sale", async () => {
  await montarE({ inicio: enviadoHoy() });
  await tocar(fila("Yerba 1kg").mas);
  await tocar(botonE("Pedidos anteriores"));
  assert.ok(modal(), "con cambios, Pedidos anteriores no preguntó");
  assert.match(modal().textContent, /Tenés 1 cambio sin confirmar\. ¿Descartarlos\?/);
  await tocar([...modal().querySelectorAll("button")].find((b) => b.textContent.trim() === "Seguir cargando"));
  assert.ok(!modal());
  assert.equal(fila("Yerba 1kg").campo.value, "1", "Seguir cargando perdió el cambio");
  assert.equal(navegacion.length, 0, "Seguir cargando se fue");
  await tocar(botonE("Pedidos anteriores"));
  await tocar([...modal().querySelectorAll("button")].find((b) => b.textContent.trim() === "Descartar"));
  assert.deepEqual(navegacion.at(-1), ["push", "/modulos/pedidos/historial"]);
});

test("cancelar: con la hoja, y después de cancelar vuelve a armar", async () => {
  const { pedidos } = await montarE({ inicio: enviadoHoy(), cancelar: [real.cancelado] });
  await tocar(botonE("Cancelar pedido"));
  assert.ok(modal(), "no abrió la hoja");
  assert.match(modal().textContent, /¿Cancelar el pedido solicitado\?/);
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/cancelar").length, 0, "abrir la hoja canceló");
  await tocar([...modal().querySelectorAll("button")].find((b) => b.textContent.trim() === "Cancelar pedido"));
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/cancelar").length, 1);
  assert.ok(botonE("Enviar pedido al depósito"), "después de cancelar no volvió a armar");
});

// ── PREPARANDO ────────────────────────────────────────────────────────────

test("preparando: solo Lo que pedí, sin herramientas, y nada que tocar en la lista", async () => {
  await montarE({ inicio: conFecha(real.empezadoCarrito, new Date()) });
  assert.ok(!herramientas(), "con herramientas");
  assert.deepEqual([...pestanas().querySelectorAll("button")].map((b) => b.textContent.trim()), ["Lo que pedí · 3", "Pedidos anteriores"]);
  assert.match(botonE("Lo que pedí").className, /sunmi-btn-amber/);
  assert.match(pestanas().textContent, /El depósito lo está preparando/);
  assert.deepEqual(nombres(), ["ACEITE", "ARROZ", "GALLETITAS"]);
  assert.equal(tabla().querySelectorAll("tbody button, tbody input").length, 0, "en la lista hay algo que tocar");
  assert.deepEqual([...tabla().querySelectorAll("[data-cantidad-pedido]")].map((c) => c.textContent), ["2", "5", "4"]);
  assert.equal(pie().textContent, "3 productos en el pedido");
});
