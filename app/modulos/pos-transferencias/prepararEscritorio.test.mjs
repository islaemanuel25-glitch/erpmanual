// PREPARAR UN PEDIDO DE LOCAL, EN LA COMPUTADORA (desde 768 px).
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pos-transferencias/prepararEscritorio.test.mjs
//
// Diseño de Emanuel (2026-10-28): la barra fija con el buscador, la categoría,
// "Falta revisar" y "Enviar al local"; los filtros, el pedido y "⋯"; la barra
// de avance; y la lista PRODUCTO · CATEGORÍA · PIDIÓ · VA · acciones, con dos
// lugares de botón iguales que no se mueven al resolver.
//
// El servidor contesta con las respuestas REALES de las secciones 14, 14c y
// 16 de `scripts/pruebas-db/pedidosEnviarCancelar.mjs`, como los candados del
// celular: si la pantalla manda un cuerpo que la ruta no contestó en la corrida
// real, el servidor falla.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const A = await import("../pedidos/montarPantallaPedidos.mjs");
const { default: Pagina } = await import("./nueva/page.jsx");

afterEach(A.desmontarTodo);

const dep = JSON.parse(readFileSync("app/modulos/pos-transferencias/deposito.fixture.json", "utf8"));
const ids = dep.depositoIds;

function escritura(ruta, cuerpo) {
  const igual = (a, b) => Object.keys(a).every((k) => a[k] === b[k]) && Object.keys(b).every((k) => a[k] === b[k]);
  const e = dep.depositoEscrituras.find((x) => x.ruta === ruta && igual(x.cuerpo, cuerpo));
  assert.ok(e, `la pantalla mandó a ${ruta} un cuerpo que la ruta no contestó en la corrida real: ${JSON.stringify(cuerpo)}`);
  return e.respuesta;
}

const montar = ({ detalle = dep.depositoDetalleNuevo, opciones = dep.depositoOpciones, enviar = [], ancho = "escritorio" } = {}) => {
  const colaEnviar = [...enviar];
  return A.montar({
    pagina: Pagina,
    ancho,
    busqueda: `posId=${ids.p1}`,
    inicio: A.real.carritoVacio,
    otras: {
      "/api/me": dep.depositoMe,
      "/api/operador/me": dep.depositoOperadorMe,
      "/api/pos-transferencias/opciones": opciones,
      "/api/pos-transferencias/solicitados": dep.depositoSolicitadosNuevo,
      "/api/pos-transferencias/detalle": detalle,
      "/api/pos-transferencias/detalle/editar": ({ cuerpo }) => escritura("/api/pos-transferencias/detalle/editar", cuerpo),
      "/api/pos-transferencias/enviar": () => colaEnviar.shift(),
      "/api/pos-transferencias/nueva": { status: 200, cuerpo: { ok: false, error: "no se esperaba" } },
      [`/api/locales/${dep.depositoOpciones.cuerpo.origen.id}`]: { status: 200, cuerpo: { ok: false } },
    },
  });
};

const pantalla = () => document.querySelector("[data-preparar-pedido-escritorio]");
const barra = () => pantalla().querySelector("[data-barra-preparar]");
const fila = (nombre) => [...pantalla().querySelectorAll("tbody tr")].find((tr) => tr.querySelector("[data-nombre-producto]")?.textContent === nombre) ?? null;
const visibles = () => [...pantalla().querySelectorAll("[data-nombre-producto]")].map((el) => el.textContent);
const acciones = (n) => fila(n).querySelector("[data-acciones]");
const campoVa = (n) => fila(n).querySelector("[data-va] input");
const estadoResuelto = (n) => fila(n).querySelector("[data-estado-resuelto]")?.textContent ?? null;
const filtros = () => A.botones(barra().querySelector('[role="group"][aria-label="Filtrar productos por estado"]')).map((b) => b.textContent);
const elegir = (t) => A.tocar(A.botones(barra()).find((b) => b.textContent.startsWith(t)));
const ultimoCuerpo = (pedidos) => A.llamadas(pedidos, "/api/pos-transferencias/detalle/editar").at(-1).cuerpo;
const detalleId = (detalle, n) => detalle.cuerpo.item.detalles.find((d) => d.productoNombre === n).detalleId;
const enter = async (campo) => {
  await A.asentar();
  campo.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await A.asentar();
};

// ── LA PANTALLA DEL CELULAR NO SE TOCA ────────────────────────────────────
// Orden de Emanuel: "NO SE TOCA EN NADA, ni por dentro". La huella es la de
// `git hash-object` del archivo el día que se hizo esta pantalla. Si el
// celular cambia a propósito, en otra tanda, la huella se actualiza en ESE
// commit diciendo por qué; si cambió para servir a esta pantalla, está mal.
test("la pantalla del celular está igual, byte por byte", () => {
  const contenido = readFileSync("components/pos-transferencias/PrepararPedidoCelular.jsx");
  const huella = createHash("sha1").update(`blob ${contenido.length}\0`).update(contenido).digest("hex");
  assert.equal(huella, "001f32faa9a38528753f617ca28b804bb138ebae", "se tocó PrepararPedidoCelular.jsx");
});

test("la barra fija: Volver, buscador, categoría, Falta revisar, Enviar; filtros, el pedido, Agregar y ⋯; el avance", async () => {
  await montar();
  assert.match(barra().className, /\bsticky\b/);
  assert.match(barra().className, /\btop-0\b/);
  const herramientas = barra().querySelector("[data-herramientas-preparar]");
  assert.ok(A.boton("Volver", herramientas), "falta el Volver");
  assert.ok(herramientas.querySelector('input[placeholder="Buscar o escanear producto"]'), "falta el buscador");
  assert.match(herramientas.textContent, /Categoría/);
  assert.match(herramientas.textContent, /Todas · 5/);
  assert.match(herramientas.textContent, /Falta revisar 5/);
  assert.ok(A.boton("Enviar al local", herramientas).disabled, "Enviar arranca prendido");

  assert.deepEqual(filtros(), ["Pendientes 5", "Con cambios 0", "Preparados 0", "Todos 5"]);
  const activo = A.botones(barra()).find((b) => b.getAttribute("aria-pressed") === "true");
  assert.equal(activo.textContent, "Pendientes 5");
  assert.match(activo.className, /\bsunmi-btn-amber\b/, "el filtro activo no está en ámbar");
  assert.match(A.botones(barra()).find((b) => b.textContent === "Todos 5").className, /\bsunmi-btn-slate\b/);
  const linea2 = barra().querySelector("[data-filtros-preparar]");
  assert.match(linea2.textContent, new RegExp(`${ids.local} · .* · 0 / 5 preparados`));
  assert.ok(A.boton("+ Agregar producto que no pidió", linea2));
  assert.ok(linea2.querySelector('button[aria-label="Más acciones"]'), "falta el ⋯");
  assert.equal(barra().querySelector("[data-avance]")?.getAttribute("data-avance"), "0");
});

test("las columnas: PRODUCTO · CATEGORÍA · PIDIÓ · VA · acciones, con el ancho en el encabezado y la tabla fija", async () => {
  await montar();
  const tabla = pantalla().querySelector("[data-lista-preparar] table");
  assert.match(tabla.className, /\btable-fixed\b/);
  const ths = [...tabla.querySelectorAll("thead th")];
  assert.deepEqual(ths.map((th) => th.textContent.trim()), ["Producto", "Categoría", "Pidió", "Va", ""]);
  for (const [i, ancho] of [[1, "w-44"], [2, "w-36"], [3, "w-40"], [4, "w-80"]]) assert.match(ths[i].className, new RegExp(`\\b${ancho}\\b`), ths[i].textContent);
  // PIDIÓ, resaltado con la pieza de siempre (acento y negrita), sin rótulo.
  const pidio = fila("AGUA X6").querySelectorAll("td")[2];
  assert.equal(pidio.textContent.trim(), "2 PACK x6");
  assert.match(pidio.querySelector("span").className, /\bsunmi-text-accent\b/);
  assert.match(pidio.querySelector("span").className, /\bfont-semibold\b/);
  // VA arranca con lo pedido, en la unidad pedida.
  assert.equal(campoVa("AGUA X6").value, "2");
  assert.equal(campoVa("ARROZ").value, "3");
  // El pie, copia del escritorio del local.
  const pie = pantalla().querySelector("[data-pie-lista]");
  assert.match(pie.textContent, /1 a 5 de 5/);
  assert.equal(A.botones(pie.querySelector("[data-mostrar]")).find((b) => b.getAttribute("aria-pressed") === "true").textContent, "50");
});

test("VA COMPLETO, NO HAY, CORREGIDO Y VOLVER A PENDIENTE: el primer lugar cambia de botón a estado y nada más se mueve", async () => {
  const { pedidos } = await montar();
  await elegir("Todos");

  // Pendiente: dos lugares, "✓ Va completo" (acento) y "No hay" (gris).
  const antes = A.botones(acciones("ACEITE")).map((b) => b.textContent);
  assert.deepEqual(antes, ["✓ Va completo", "No hay"]);
  assert.match(A.botones(acciones("ACEITE"))[0].className, /\bsunmi-btn-accent-outline\b/);
  assert.equal(fila("ACEITE").className.includes("sunmi-surface"), false, "la pendiente no tiene el fondo normal");

  await A.tocar(A.boton("✓ Va completo", acciones("ACEITE")));
  assert.deepEqual(ultimoCuerpo(pedidos), { detalleId: detalleId(dep.depositoDetalleNuevo, "ACEITE"), preparado: 2, unidadPreparada: "UNIDAD" });
  // Resuelta: el estado en texto en el primer lugar y "Volver a pendiente" en
  // el segundo. Los mismos dos lugares.
  assert.equal(acciones("ACEITE").children.length, 2);
  assert.equal(estadoResuelto("ACEITE"), "✓ Va completo");
  assert.ok(A.boton("Volver a pendiente", acciones("ACEITE")));
  assert.match(fila("ACEITE").className, /\bsunmi-surface\b/, "la resuelta no tiene el fondo tenue");

  // No hay.
  await A.tocar(A.boton("No hay", acciones("YERBA")));
  assert.deepEqual(ultimoCuerpo(pedidos), { detalleId: detalleId(dep.depositoDetalleNuevo, "YERBA"), preparado: 0, unidadPreparada: "UNIDAD" });
  assert.equal(estadoResuelto("YERBA"), "No hay");

  // Corregido: cambiar VA vuelve el primer botón "✓ Guardar".
  await A.teclear(campoVa("ARROZ"), "1");
  assert.ok(A.boton("✓ Guardar", acciones("ARROZ")), "cambiar VA no cambió el botón a Guardar");
  await A.tocar(A.boton("✓ Guardar", acciones("ARROZ")));
  assert.deepEqual(ultimoCuerpo(pedidos), { detalleId: detalleId(dep.depositoDetalleNuevo, "ARROZ"), preparado: 1, unidadPreparada: "UNIDAD" });
  assert.equal(estadoResuelto("ARROZ"), "✓ Corregido · va 1");
  // Y en una resuelta, el + guarda en el acto, corregido.
  await A.tocar(fila("ARROZ").querySelector('button[aria-label="Sumar uno a Va de ARROZ"]'));
  assert.deepEqual(ultimoCuerpo(pedidos), { detalleId: detalleId(dep.depositoDetalleNuevo, "ARROZ"), preparado: 2, unidadPreparada: "UNIDAD" });
  assert.equal(estadoResuelto("ARROZ"), "✓ Corregido · va 2");

  assert.deepEqual(filtros(), ["Pendientes 2", "Con cambios 2", "Preparados 3", "Todos 5"]);
  assert.match(barra().textContent, /Falta revisar 2/);
  assert.equal(barra().querySelector("[data-avance]")?.getAttribute("data-avance"), "60");

  // Volver a pendiente.
  await A.tocar(A.boton("Volver a pendiente", acciones("ACEITE")));
  assert.deepEqual(ultimoCuerpo(pedidos), { detalleId: detalleId(dep.depositoDetalleNuevo, "ACEITE"), pendiente: true });
  assert.deepEqual(A.botones(acciones("ACEITE")).map((b) => b.textContent), antes);
});

test("Enter en VA hace lo mismo que el primer botón", async () => {
  const { pedidos } = await montar();
  await enter(campoVa("FIDEOS"));
  assert.deepEqual(ultimoCuerpo(pedidos), { detalleId: detalleId(dep.depositoDetalleNuevo, "FIDEOS"), preparado: 1, unidadPreparada: "UNIDAD" });
});

test("escanear el código lleva al renglón y lo deja listo para escribir", async () => {
  await montar();
  const fideos = dep.depositoDetalleNuevo.cuerpo.item.detalles.find((d) => d.productoNombre === "FIDEOS");
  await A.teclear(barra().querySelector('input[placeholder="Buscar o escanear producto"]'), fideos.codigoBarra);
  await A.asentar();
  assert.deepEqual(visibles(), ["FIDEOS"]);
  assert.ok(document.activeElement === campoVa("FIDEOS"), "el campo VA del renglón escaneado no quedó con el foco");
});

test("POR PESO: un campo de kilos del mismo ancho; pedido en unidades arranca vacío y «✓ Guardar peso» espera un peso", async () => {
  const { pedidos } = await montar({ detalle: dep.depositoDetallePeso });
  // El mismo lugar que el − campo +.
  assert.ok(fila("SALAMETRO").querySelector("[data-va]").className === fila("QUESO").querySelector("[data-va]").className);
  assert.equal(fila("SALAMETRO").querySelectorAll("[data-va] button").length, 0, "los kilos tienen − / +");
  assert.equal(campoVa("SALAMETRO").value, "");
  assert.equal(campoVa("SALAMETRO").getAttribute("placeholder"), "kg");
  assert.equal(campoVa("SALAMETRO").getAttribute("inputmode"), "decimal");
  assert.equal(fila("SALAMETRO").querySelectorAll("td")[2].textContent.trim(), "2 u");
  const guardarPeso = () => A.boton("✓ Guardar peso", acciones("SALAMETRO"));
  assert.ok(guardarPeso()?.disabled, "Guardar peso prendido sin peso");
  await A.teclear(campoVa("SALAMETRO"), "1,853");
  assert.ok(!guardarPeso().disabled);
  await A.tocar(guardarPeso());
  assert.deepEqual(ultimoCuerpo(pedidos), { detalleId: detalleId(dep.depositoDetallePeso, "SALAMETRO"), preparado: 1.853, unidadPreparada: "UNIDAD" });

  // Pedido en kilos: arranca con esos kilos y va completo los manda.
  assert.equal(campoVa("QUESO").value, "2,000");
  await A.tocar(A.boton("✓ Va completo", acciones("QUESO")));
  assert.deepEqual(ultimoCuerpo(pedidos), { detalleId: detalleId(dep.depositoDetallePeso, "QUESO"), preparado: 2, unidadPreparada: "UNIDAD" });
  await elegir("Todos");
  assert.equal(estadoResuelto("SALAMETRO"), "✓ Pesado · 1,853 kg");
  assert.equal(estadoResuelto("QUESO"), "✓ Va completo");
  // Resuelto: cambiar los kilos y Enter guarda en el momento.
  await A.teclear(campoVa("QUESO"), "1,85");
  await enter(campoVa("QUESO"));
  assert.deepEqual(ultimoCuerpo(pedidos), { detalleId: detalleId(dep.depositoDetallePeso, "QUESO"), preparado: 1.85, unidadPreparada: "UNIDAD" });
  assert.equal(estadoResuelto("QUESO"), "✓ Pesado · 1,850 kg");
});

test("DOS DEPÓSITOS: «Lo preparó …» debajo del nombre, sin ocupar lugar; el envío tardío avisa", async () => {
  const { pedidos } = await montar({ detalle: dep.depositoDetalleDosDepositos, opciones: dep.depositoOpcionesMercaderia, enviar: [dep.depositoEnviarYaSeEnvio] });
  await elegir("Todos");
  const frio = dep.depositoDetalleDosDepositos.cuerpo.item.detalles.find((d) => d.productoNombre === "HELADO").resueltoPorNombre;
  const rotulo = fila("HELADO").querySelector("[data-lo-preparo]");
  assert.equal(rotulo?.textContent, `Lo preparó ${frio}`);
  assert.match(rotulo.className, /\babsolute\b/, "«Lo preparó» ocupa lugar y agranda la fila");
  assert.match(rotulo.className, /\btext-xs2\b/);
  for (const n of ["ACEITE", "YERBA"]) assert.ok(!fila(n).querySelector("[data-lo-preparo]"), `${n} es de este depósito`);

  const enviar = A.boton("Enviar al local", barra());
  assert.ok(!enviar.disabled, "con cero pendientes, Enviar sigue apagado");
  await A.tocar(enviar);
  assert.equal(A.llamadas(pedidos, "/api/pos-transferencias/enviar").length, 1);
  assert.match(A.texto(), /Este pedido ya se envió\./);
  assert.deepEqual(A.navegacion.at(-1), ["push", "/modulos/pos-transferencias"]);
});

test("por debajo de 768 px, la del celular de siempre", async () => {
  await montar({ ancho: "telefono" });
  assert.ok(!pantalla(), "se montó la de computadora en el teléfono");
  assert.ok(document.querySelector("[data-preparar-pedido]"), "no se montó la del celular");
});
