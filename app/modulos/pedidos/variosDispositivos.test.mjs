// VARIAS PERSONAS ARMANDO EL PEDIDO DEL MISMO LOCAL: CADA PANTALLA VE LO DE LOS DEMÁS.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pedidos/variosDispositivos.test.mjs
//
// Lo medido contra Postgres con tres sesiones del mismo local
// (`scripts/pruebas-db/pedidosVariosDispositivos.mjs`, 2026-10-25): en la
// BASE no se pierde nada en ninguno de los cinco casos —un pedido por local,
// renglón por renglón, el último valor gana, lo cargado durante el envío va
// al pedido enviado y con el depósito preparando hay 409—. Lo que se perdía
// era en la PANTALLA: leía el pedido al entrar y nunca más, así que lo que
// cargaba otro dispositivo no aparecía hasta salir y volver; quien seguía
// armando un pedido que otro ya había enviado veía "Enviar" en vez de
// "Agregar al pedido".
//
// Estos candados montan la pantalla —el celular y la computadora— con el
// arnés y las respuestas REALES del fixture, cambian lo que contesta el
// servidor como lo cambiaría otra persona, y vuelven a la pestaña: la
// pantalla tiene que mostrarlo. Con la pantalla de antes (sin
// `useRefrescoDelPedido`) dan rojo: nunca relee.
//
// El refresco cada pocos segundos es el mismo `leer` que el de volver a la
// pestaña; su reloj lo prueba `refrescoDelPedido.test.mjs`.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

const { real, montar, desmontarTodo, tocar, asentar, act, llamadas, tarjeta, abrirCatalogoEscritorio, contenido } = await import(
  "./montarPantallaPedidos.mjs"
);

afterEach(desmontarTodo);

/** Volver a la pestaña: lo que hace la persona al levantar el celular. */
async function volverALaPestana() {
  await act(async () => {
    document.dispatchEvent(new window.Event("visibilitychange"));
  });
  await asentar(100);
}

const id = (n) => real.catalogo.cuerpo.items.find((i) => i.nombre === n).productoLocalId;
const setCantidades = (pedidos) => llamadas(pedidos, "/api/pedidos/set-cantidad").map((p) => p.cuerpo);
const textoBoton = (t) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(t)) ?? null;
const conHoy = (r) => ({ ...r, cuerpo: { ...r.cuerpo, pendiente: { ...r.cuerpo.pendiente, solicitadoAt: new Date().toISOString() } } });

// La computadora: el valor del campo de un renglón del catálogo.
const campoE = (nombre) => document.querySelector(`input[aria-label="Cantidad de ${nombre}"]`);
const montarE = async (r) => {
  const m = await montar({ ...r, ancho: "escritorio" });
  await abrirCatalogoEscritorio();
  return m;
};

// ── 1 y 3 · OTRO CARGA; ESTA PANTALLA LO VE, Y LO SUYO VA SOLO ────────────

test("celular, casos 1 y 3: otro carga productos; al volver a la pestaña aparecen, y lo que toca esta persona viaja solo", async () => {
  const { estado, pedidos } = await montar({ inicio: real.carritoVacio });
  assert.equal(tarjeta("Coca 2L").campo.value, "", "el caso tiene que arrancar sin nada");
  // B carga la coca y el agua desde otro celular.
  estado.carrito = real.carritoBorrador;
  await volverALaPestana();
  assert.equal(tarjeta("Coca 2L").campo.value, "3", "lo que cargó el otro no aparece");
  assert.equal(tarjeta("Agua x6").campo.value, "2");
  assert.match(contenido().textContent, /2 productos en el pedido/);
  assert.ok(textoBoton("Enviar pedido al depósito (2)"), "el botón no cuenta lo del otro");
  // A, ahora, carga la yerba: viaja SOLO la yerba, renglón por renglón.
  await tocar(tarjeta("Yerba 1kg").mas);
  assert.deepEqual(setCantidades(pedidos), [{ productoLocalId: id("Yerba 1kg"), cantidad: 1, unidad: "UNIDAD" }]);
});

test("computadora, casos 1 y 3: lo mismo, y «Lo que pedí» lo cuenta", async () => {
  const { estado, pedidos } = await montarE({ inicio: real.carritoVacio });
  estado.carrito = real.carritoBorrador;
  await volverALaPestana();
  assert.equal(campoE("Coca 2L").value, "3", "lo que cargó el otro no aparece");
  assert.equal(campoE("Agua x6").value, "2");
  assert.ok(textoBoton("Lo que pedí · 2"));
  assert.ok(textoBoton("Enviar pedido al depósito (2)"));
  await tocar(document.querySelector('button[aria-label="Sumar uno a Cantidad de Yerba 1kg"]'));
  assert.deepEqual(setCantidades(pedidos), [{ productoLocalId: id("Yerba 1kg"), cantidad: 1, unidad: "UNIDAD" }]);
});

// ── 2 Y 5 · EL MODO SUMAR: LO CONFIRMADO POR OTRO APARECE, LO MÍO SIGUE ───

test("celular, casos 2 y 5: en modo sumar, otro confirma; aparece, y mi cambio sin confirmar no se pierde ni arrastra lo del otro", async () => {
  const { estado, pedidos } = await montar({ inicio: conHoy(real.carritoPendiente), sumar: [real.mainSumado] });
  // A anota un cambio sin confirmar: el agua de 2 a 3.
  await tocar(tarjeta("Agua x6").mas);
  assert.equal(tarjeta("Agua x6").campo.value, "3");
  // B, desde otro celular, confirmó la coca en 5 y la yerba en 1.
  estado.carrito = real.mainTrasSumar;
  await volverALaPestana();
  assert.equal(tarjeta("Coca 2L").campo.value, "5", "lo que confirmó el otro no aparece");
  assert.equal(tarjeta("Yerba 1kg").campo.value, "1");
  assert.equal(tarjeta("Agua x6").campo.value, "3", "se perdió el cambio sin confirmar de esta persona");
  await tocar(textoBoton("Agregar al pedido (1)"));
  const envios = llamadas(pedidos, "/api/pedidos/sumar-al-enviado");
  assert.equal(envios.length, 1);
  assert.deepEqual(envios[0].cuerpo.cambios, [{ productoLocalId: id("Agua x6"), cantidad: 3, unidad: "BULTO" }], "mandó más que lo que tocó esta persona");
});

test("computadora, casos 2 y 5: lo mismo", async () => {
  const { estado, pedidos } = await montarE({ inicio: conHoy(real.carritoPendiente), sumar: [real.mainSumado] });
  await tocar(document.querySelector('button[aria-label="Sumar uno a Cantidad de Agua x6"]'));
  estado.carrito = real.mainTrasSumar;
  await volverALaPestana();
  assert.equal(campoE("Coca 2L").value, "5", "lo que confirmó el otro no aparece");
  assert.equal(campoE("Yerba 1kg").value, "1");
  assert.equal(campoE("Agua x6").value, "3", "se perdió el cambio sin confirmar");
  await tocar(textoBoton("Agregar al pedido (1)"));
  assert.deepEqual(llamadas(pedidos, "/api/pedidos/sumar-al-enviado")[0].cuerpo.cambios, [{ productoLocalId: id("Agua x6"), cantidad: 3, unidad: "BULTO" }]);
});

// ── 4 · OTRO ENVÍA MIENTRAS ESTA PERSONA ARMA ─────────────────────────────

test("celular, caso 4: otro envía; esta pantalla pasa a sumar al mismo pedido, y lo que carga va como sumar", async () => {
  const { estado, pedidos } = await montar({ inicio: real.carritoBorrador, sumar: [real.mainSumado] });
  assert.ok(textoBoton("Enviar pedido al depósito (2)"));
  estado.carrito = conHoy(real.carritoPendiente);
  await volverALaPestana();
  assert.ok(!textoBoton("Enviar pedido al depósito"), "sigue ofreciendo enviar un pedido que otro ya envió");
  await tocar(tarjeta("Yerba 1kg").mas);
  assert.equal(setCantidades(pedidos).length, 0, "escribió como borrador sobre un pedido enviado");
  await tocar(textoBoton("Agregar al pedido (1)"));
  const [envio] = llamadas(pedidos, "/api/pedidos/sumar-al-enviado");
  assert.equal(envio.cuerpo.posId, real.carritoPendiente.cuerpo.pendiente.posId, "no fue al mismo pedido enviado");
  assert.deepEqual(envio.cuerpo.cambios, [{ productoLocalId: id("Yerba 1kg"), cantidad: 1, unidad: "UNIDAD" }]);
});

test("computadora, caso 4: lo mismo", async () => {
  const { estado, pedidos } = await montarE({ inicio: real.carritoBorrador, sumar: [real.mainSumado] });
  estado.carrito = conHoy(real.carritoPendiente);
  await volverALaPestana();
  assert.ok(!textoBoton("Enviar pedido al depósito"));
  await tocar(document.querySelector('button[aria-label="Sumar uno a Cantidad de Yerba 1kg"]'));
  assert.equal(setCantidades(pedidos).length, 0);
  await tocar(textoBoton("Agregar al pedido (1)"));
  assert.equal(llamadas(pedidos, "/api/pedidos/sumar-al-enviado")[0].cuerpo.posId, real.carritoPendiente.cuerpo.pendiente.posId);
});

test("caso 4 con el depósito ya preparando: la pantalla deja de ofrecer cargar, sin esperar a que la persona toque", async () => {
  const { estado } = await montar({ inicio: conHoy(real.carritoPendiente) });
  estado.carrito = conHoy(real.empezadoCarrito);
  await volverALaPestana();
  assert.ok(!textoBoton("Agregar al pedido"), "sigue ofreciendo sumar a un pedido que el depósito prepara");
  assert.ok(!document.querySelector('[aria-label^="Sumar uno"]'), "sigue habiendo + para tocar");
  assert.match(contenido().textContent, /Preparando/);
  await desmontarTodo();

  const e = await montarE({ inicio: conHoy(real.carritoPendiente) });
  e.estado.carrito = conHoy(real.empezadoCarrito);
  await volverALaPestana();
  assert.ok(document.querySelector('[data-vista="entrada"]'), "la computadora no salió del catálogo");
  assert.match(document.querySelector("[data-etiqueta-en-curso]").textContent, /Preparando en el depósito/);
});

// ── SIN MOVER NADA ────────────────────────────────────────────────────────

test("releer sin cambios no mueve nada: el HTML queda idéntico, en el celular y en la computadora", async () => {
  const { pedidos } = await montar({ inicio: real.carritoBorrador });
  const antes = contenido().innerHTML;
  const lecturas = llamadas(pedidos, "/api/pedidos/carrito").length;
  await volverALaPestana();
  assert.equal(llamadas(pedidos, "/api/pedidos/carrito").length, lecturas + 1, "no releyó");
  assert.equal(contenido().innerHTML, antes);
  await desmontarTodo();

  const e = await montarE({ inicio: real.carritoBorrador });
  const antesE = contenido().innerHTML;
  const lecturasE = llamadas(e.pedidos, "/api/pedidos/carrito").length;
  await volverALaPestana();
  assert.equal(llamadas(e.pedidos, "/api/pedidos/carrito").length, lecturasE + 1, "no releyó");
  assert.equal(contenido().innerHTML, antesE);
});

test("una relectura que vuelve mientras viaja un toque no lo vuelve para atrás (la guardia)", async () => {
  for (const ancho of ["telefono", "escritorio"]) {
    if (ancho === "escritorio") await montarE({ inicio: real.carritoBorrador });
    else await montar({ inicio: real.carritoBorrador });
    // El toque viaja lento: `set-cantidad` no contesta hasta que se suelta.
    const fetchDelArnes = globalThis.fetch;
    let soltar;
    const enVuelo = new Promise((r) => (soltar = r));
    globalThis.fetch = async (url, o) => {
      if (String(url).includes("/api/pedidos/set-cantidad")) await enVuelo;
      return fetchDelArnes(url, o);
    };
    const yerba = () => (ancho === "escritorio" ? campoE("Yerba 1kg") : tarjeta("Yerba 1kg").campo);
    const mas = () =>
      ancho === "escritorio" ? document.querySelector('button[aria-label="Sumar uno a Cantidad de Yerba 1kg"]') : tarjeta("Yerba 1kg").mas;
    await act(async () => mas().click());
    assert.equal(yerba().value, "1");
    // Mientras viaja, la pantalla relee: el servidor todavía no tiene la yerba.
    await volverALaPestana();
    assert.equal(yerba().value, "1", `${ancho}: la relectura vieja volvió la yerba a 0 mientras viajaba el toque`);
    soltar();
    await asentar(100);
    globalThis.fetch = fetchDelArnes;
    await desmontarTodo();
  }
});

test("con la pestaña oculta no lee", async () => {
  const { pedidos } = await montar({ inicio: real.carritoBorrador });
  const lecturas = llamadas(pedidos, "/api/pedidos/carrito").length;
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  try {
    await volverALaPestana();
    assert.equal(llamadas(pedidos, "/api/pedidos/carrito").length, lecturas);
  } finally {
    delete document.visibilityState;
  }
});
