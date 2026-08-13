// Candados del principio: los datos del producto se editan en editar producto,
// y en ningún otro lado.
//
// Dos partes:
//
//   1. EL COMPORTAMIENTO de ir y volver: qué link se arma, a dónde se vuelve, y
//      qué sobrevive del pedido en curso. Son funciones puras y se ejercitan con
//      valores.
//
//   2. QUE NINGUNA RUTA DE PEDIDO ESCRIBA EL COSTO MAESTRO. Ese es el candado
//      que pidió la tanda, y enumera el directorio entero en vez de una lista
//      escrita a mano: una ruta nueva que propague tiene que ponerlo rojo.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/retornoPedido.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ORIGENES,
  PARAM_REABRIR,
  CLAVE_PEDIDO_EN_CURSO,
  linkEditarProducto,
  urlRetornoPedido,
  debeReabrirPedido,
  serializarPedidoEnCurso,
  deserializarPedidoEnCurso,
} from "./retornoPedido.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const qp = (obj) => new URLSearchParams(obj);

// ===========================================================================
// 1. El link de ida
// ===========================================================================

test("el link lleva al producto, con la ubicación, el origen y el PROVEEDOR", () => {
  const url = linkEditarProducto({
    baseId: 565, localId: 1, origen: ORIGENES.PEDIDO_NUEVO, proveedorId: 7,
  });
  assert.equal(
    url,
    "/modulos/productos/565/editar?localId=1&volverA=pedido-nuevo&proveedorId=7"
  );
});

test("sin proveedor NO se arma el link a editar desde un pedido nuevo", () => {
  // ESTE es el caso que rompió la condición de no perder el pedido. La vuelta
  // sin proveedor deja a la pantalla sin saber qué catálogo cargar, así que el
  // pedido guardado no se restaura nunca y se ve vacío.
  //
  // Lo encontró una CAPTURA del viaje completo, no un candado: el candado
  // comprobaba la forma de la URL de vuelta sin preguntarse si esa URL alcanzaba
  // para reconstruir la pantalla.
  for (const prov of [null, undefined, 0, -1, "", "abc"]) {
    assert.equal(
      linkEditarProducto({ baseId: 565, localId: 1, origen: ORIGENES.PEDIDO_NUEVO, proveedorId: prov }),
      null,
      `proveedorId ${JSON.stringify(prov)} no debería armar link`
    );
  }
});

test("desde el detalle de un pedido, el link lleva el id del pedido", () => {
  const url = linkEditarProducto({
    baseId: 565, localId: 2, origen: ORIGENES.PEDIDO_DETALLE, pedidoId: 216,
  });
  assert.equal(url, "/modulos/productos/565/editar?localId=2&volverA=pedido-detalle&pedidoId=216");
});

test("sin producto, sin ubicación o sin origen válido NO se arma link", () => {
  const casos = [
    { baseId: null, localId: 1, origen: ORIGENES.PEDIDO_NUEVO },
    { baseId: 0, localId: 1, origen: ORIGENES.PEDIDO_NUEVO },
    { baseId: 565, localId: null, origen: ORIGENES.PEDIDO_NUEVO },
    { baseId: 565, localId: 1, origen: "cualquier-cosa" },
    { baseId: 565, localId: 1, origen: undefined },
    // Detalle sin pedido: no hay a dónde volver, así que no se ofrece el viaje.
    { baseId: 565, localId: 1, origen: ORIGENES.PEDIDO_DETALLE },
  ];
  for (const c of casos) {
    assert.equal(linkEditarProducto(c), null, `no debería armar link con ${JSON.stringify(c)}`);
  }
});

test("el link nunca sale del sistema", () => {
  // Aunque alguien meta algo raro en el origen, la ruta se arma de este lado.
  for (const origen of ["https://otro.com", "javascript:alert(1)", "//evil", "../../etc"]) {
    assert.equal(linkEditarProducto({ baseId: 1, localId: 1, origen }), null);
  }
});

// ===========================================================================
// 2. La vuelta
// ===========================================================================

test("desde un pedido nuevo se vuelve CON el proveedor y la marca de reabrir", () => {
  const url = urlRetornoPedido(qp({ volverA: "pedido-nuevo", proveedorId: "7" }));
  assert.equal(url, `/modulos/compras-proveedor/nueva?proveedorId=7&${PARAM_REABRIR}=1`);
});

test("volver de un pedido nuevo SIN proveedor no resuelve", () => {
  // Mejor volver al listado de productos que a un pedido que se va a ver vacío.
  assert.equal(urlRetornoPedido(qp({ volverA: "pedido-nuevo" })), null);
  for (const prov of ["0", "-1", "abc", ""]) {
    assert.equal(urlRetornoPedido(qp({ volverA: "pedido-nuevo", proveedorId: prov })), null);
  }
});

test("desde el detalle se vuelve a ESE pedido", () => {
  const url = urlRetornoPedido(qp({ volverA: "pedido-detalle", pedidoId: "216" }));
  assert.equal(url, "/modulos/compras-proveedor/216");
});

test("sin origen válido devuelve null y el llamador usa su comportamiento de siempre", () => {
  // NO inventa un destino: la pantalla de editar producto vuelve al listado.
  assert.equal(urlRetornoPedido(qp({})), null);
  assert.equal(urlRetornoPedido(qp({ volverA: "" })), null);
  assert.equal(urlRetornoPedido(qp({ volverA: "otra-cosa" })), null);
  assert.equal(urlRetornoPedido(null), null);
  assert.equal(urlRetornoPedido({}), null);
});

test("un pedidoId inválido NO se adivina", () => {
  for (const id of ["0", "-1", "abc", "", "1.5"]) {
    assert.equal(
      urlRetornoPedido(qp({ volverA: "pedido-detalle", pedidoId: id })),
      null,
      `pedidoId ${JSON.stringify(id)} no debería resolver`
    );
  }
});

test("NO se acepta una URL de vuelta que venga en la query", () => {
  // El riesgo es un redirect abierto: un link que saque a la persona del sistema
  // desde una pantalla en la que confía. El destino sale de un conjunto cerrado.
  const url = urlRetornoPedido(qp({ volverA: "https://otro.com", returnTo: "https://otro.com", proveedorId: "7" }));
  assert.equal(url, null);
});

test("la marca de reabrir solo se prende con el valor exacto", () => {
  assert.equal(debeReabrirPedido(qp({ [PARAM_REABRIR]: "1" })), true);
  for (const v of ["0", "", "true", "si", "01"]) {
    assert.equal(debeReabrirPedido(qp({ [PARAM_REABRIR]: v })), false, `"${v}" no debería reabrir`);
  }
  assert.equal(debeReabrirPedido(qp({})), false);
});

// ===========================================================================
// 3. EL PEDIDO EN CURSO NO SE PIERDE
// ===========================================================================

test("se guardan las líneas con cantidad, y el viaje de ida y vuelta las conserva", () => {
  const guardado = serializarPedidoEnCurso({
    proveedorId: 7,
    notas: "entrega martes",
    items: [
      { productoLocalId: 11, cantidad: 3, unidadPedido: "BULTO", precioCosto: 1200 },
      { productoLocalId: 12, cantidad: 5, unidadPedido: "UNIDAD", precioCosto: 100 },
    ],
  });
  const vuelta = deserializarPedidoEnCurso(JSON.stringify(guardado));

  assert.equal(vuelta.proveedorId, 7);
  assert.equal(vuelta.notas, "entrega martes");
  assert.equal(vuelta.lineas.length, 2);
  assert.deepEqual(vuelta.lineas[0], { productoLocalId: 11, cantidad: 3, unidadPedido: "BULTO" });
  assert.deepEqual(vuelta.lineas[1], { productoLocalId: 12, cantidad: 5, unidadPedido: "UNIDAD" });
});

test("EL COSTO NO SE GUARDA: al volver se toma el del catálogo", () => {
  // Es la razón de todo el viaje. Si el costo guardado se restaurara, la línea
  // mostraría el viejo justo después de haber ido a cambiarlo.
  const guardado = serializarPedidoEnCurso({
    proveedorId: 7,
    items: [{ productoLocalId: 11, cantidad: 3, unidadPedido: "BULTO", precioCosto: 1200 }],
  });
  assert.equal("precioCosto" in guardado.lineas[0], false);
  assert.equal(JSON.stringify(guardado).includes("1200"), false, "el costo no puede viajar");
});

test("las líneas en cero no se guardan", () => {
  const g = serializarPedidoEnCurso({
    proveedorId: 7,
    items: [
      { productoLocalId: 11, cantidad: 3 },
      { productoLocalId: 12, cantidad: 0 },
      { productoLocalId: 13, cantidad: "" },
    ],
  });
  assert.equal(g.lineas.length, 1);
  assert.equal(g.lineas[0].productoLocalId, 11);
});

test("un pedido vacío o sin proveedor no se guarda", () => {
  assert.equal(serializarPedidoEnCurso({ proveedorId: 7, items: [] }), null);
  assert.equal(serializarPedidoEnCurso({ proveedorId: null, items: [{ productoLocalId: 1, cantidad: 1 }] }), null);
  assert.equal(serializarPedidoEnCurso({}), null);
});

test("un guardado roto o manipulado NO rompe la pantalla del pedido", () => {
  // Devuelve null y la pantalla arranca vacía, que es recuperable. Explotar acá
  // dejaría al usuario sin poder cargar pedidos hasta limpiar el navegador.
  for (const basura of [
    "", "no es json", "{", "null", "[]", "123", '"texto"',
    '{"proveedorId":7}',                               // sin líneas
    '{"proveedorId":0,"lineas":[]}',
    '{"proveedorId":7,"lineas":"no es array"}',
    '{"proveedorId":7,"lineas":[{"cantidad":3}]}',     // línea sin producto
    '{"proveedorId":7,"lineas":[{"productoLocalId":1,"cantidad":0}]}',
    null, undefined, 42, {},
  ]) {
    assert.doesNotThrow(() => deserializarPedidoEnCurso(basura));
    assert.equal(
      deserializarPedidoEnCurso(basura),
      null,
      `${JSON.stringify(basura)} tendría que dar null`
    );
  }
});

test("las notas se conservan pero nunca son undefined", () => {
  const g = serializarPedidoEnCurso({ proveedorId: 7, items: [{ productoLocalId: 1, cantidad: 1 }] });
  assert.equal(g.notas, "");
  const v = deserializarPedidoEnCurso('{"proveedorId":7,"lineas":[{"productoLocalId":1,"cantidad":1}]}');
  assert.equal(v.notas, "");
});

// ===========================================================================
// 4. NINGUNA RUTA DE PEDIDO ESCRIBE EL COSTO MAESTRO
// ===========================================================================
//
// El candado central de la tanda. Enumera TODAS las rutas de compras-proveedor
// recorriendo el directorio, no una lista escrita a mano: una ruta nueva que
// propague el costo tiene que ponerlo rojo sola.

const DIR_RUTAS = path.join(RAIZ, "app/api/compras-proveedor");

function rutasDePedido() {
  const out = [];
  const recorrer = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (e.name === "route.js") out.push(p);
    }
  };
  recorrer(DIR_RUTAS);
  return out;
}

// `recibir` queda AFUERA a propósito y con su motivo: recibir mercadería sí
// mueve el costo, porque ahí se confirma lo que realmente entró y a qué precio.
// La tanda que sacó la propagación fue explícita en no tocarla.
const EXCEPCION_RECIBIR = "recibir";

test("ninguna ruta de pedido propaga el costo maestro (salvo recibir)", () => {
  const culpables = [];
  for (const p of rutasDePedido()) {
    const rel = path.relative(RAIZ, p).replace(/\\/g, "/");
    if (rel.includes(`/${EXCEPCION_RECIBIR}/`)) continue;
    const src = fs.readFileSync(p, "utf8");
    if (/actualizarCostoRealProducto\s*\(/.test(src)) culpables.push(rel);
  }
  assert.deepEqual(
    culpables,
    [],
    `estas rutas de pedido volvieron a escribir el costo maestro: ${culpables.join(", ")}. ` +
      `Los datos del producto se editan en editar producto, no como efecto lateral de cargar un pedido.`
  );
});

test("ninguna ruta de pedido escribe sobre ProductoBase o ProductoLocal (salvo recibir)", () => {
  // Por EFECTO y no por el nombre del helper: alguien podría escribir el costo a
  // mano sin pasar por `actualizarCostoRealProducto` y el candado de arriba no
  // lo vería.
  const culpables = [];
  for (const p of rutasDePedido()) {
    const rel = path.relative(RAIZ, p).replace(/\\/g, "/");
    if (rel.includes(`/${EXCEPCION_RECIBIR}/`)) continue;
    const src = fs.readFileSync(p, "utf8");
    if (/(productoBase|productoLocal)\.(update|updateMany|upsert)\s*\(/.test(src)) {
      culpables.push(rel);
    }
  }
  assert.deepEqual(
    culpables,
    [],
    `estas rutas de pedido escriben sobre el producto: ${culpables.join(", ")}`
  );
});

test("recibir SÍ sigue propagando, y dentro de su transacción", () => {
  // El contraste del candado anterior: si la excepción no se ejerciera, los dos
  // de arriba pasarían aunque alguien hubiera roto recibir también.
  const src = fs.readFileSync(
    path.join(DIR_RUTAS, "recibir/[id]/route.js"),
    "utf8"
  );
  assert.match(src, /actualizarCostoRealProducto\(\s*tx\s*,/);
  assert.match(src, /prisma\.\$transaction\(async \(tx\) => \{/);
});

test("FORMA: el botón de editar producto mira el permiso antes de aparecer", () => {
  // Mira el JSX y lo dice en su nombre: una condición de render no se puede
  // ejercitar desde un módulo puro.
  //
  // Va igual porque `compras.crear` y `productos.editar` son permisos DISTINTOS
  // y separables. Hoy los cuatro roles de erpazul_al que pueden pedir también
  // pueden editar, así que nadie lo vería roto — pero un rol nuevo con uno y no
  // el otro se comería un 403 al apretar un botón que el sistema le ofreció.
  //
  // Lo destapó una mutación: sacar la condición no ponía rojo a nada.
  const carrito = fs.readFileSync(
    path.join(RAIZ, "components/compras-proveedor/CarritoPedido.jsx"),
    "utf8"
  );
  assert.match(
    carrito,
    /\{puedeEditarProducto\s*&&\s*onEditarProducto\s*&&\s*i\.baseId\s*\?/,
    "el botón de editar producto dejó de mirar el permiso: se le ofrece a quien no puede usarlo"
  );

  // Y que la pantalla realmente calcule ese permiso, en vez de pasar `true` fijo.
  const pagina = fs.readFileSync(
    path.join(RAIZ, "app/modulos/compras-proveedor/nueva/page.jsx"),
    "utf8"
  );
  assert.match(pagina, /permisosP\.includes\("productos\.editar"\)/);
  assert.match(pagina, /puedeEditarProducto:\s*puedeEditarProductoP/);
});

test("FORMA: la línea que no se pudo restaurar SE AVISA, no desaparece callada", () => {
  // Restaurar el resto está bien; hacerlo en silencio no: alguien confirmaría el
  // pedido creyendo que está completo.
  const src = fs.readFileSync(
    path.join(RAIZ, "app/modulos/compras-proveedor/nueva/page.jsx"),
    "utf8"
  );
  assert.match(src, /perdidas\.push\(/, "no se registra qué línea se perdió");
  assert.match(src, /if \(perdidas\.length > 0\)/, "no se avisa cuando se perdió alguna");
  assert.match(src, /setAvisoRestauracion\(/, "el aviso no llega a la pantalla");
  // Y que el mensaje nombre CUÁL y POR QUÉ, no "hubo un problema".
  assert.match(src, /ya no aparece/i);
  assert.match(src, /agregalo de nuevo|agregalas de nuevo/i);
});

test("FORMA: el botón de editar producto está en el DETALLE del pedido", () => {
  // El detalle son DOS archivos desde que la tabla se mudó a su componente para
  // poder montarla sola: la página decide el permiso y arma el link de vuelta,
  // la tabla dibuja el botón. Lo que este candado afirma no cambió; lo que
  // cambió es en cuál de los dos mirar cada cosa, y por eso se mira en los dos.
  const pagina = fs.readFileSync(
    path.join(RAIZ, "app/modulos/compras-proveedor/[id]/page.jsx"),
    "utf8"
  );
  const tabla = fs.readFileSync(
    path.join(RAIZ, "components/compras-proveedor/TablaDetallePedido.jsx"),
    "utf8"
  );
  assert.match(pagina, /ORIGENES\.PEDIDO_DETALLE/, "el detalle no usa el origen que le corresponde");
  assert.match(pagina, /pedidoId: pedido\?\.id/, "el link de vuelta no lleva el pedido");
  assert.match(pagina, /permisosP\.includes\("productos\.editar"\)/);
  assert.match(
    tabla,
    /puedeEditarProductoP && base\?\.id \?/,
    "el botón del detalle no mira el permiso"
  );
  // Y que la página se lo siga pasando: si dejara de hacerlo, el botón nunca
  // aparecería y las dos afirmaciones de arriba seguirían siendo ciertas.
  assert.match(pagina, /puedeEditarProductoP=\{puedeEditarProductoP\}/, "la página no le pasa el permiso a la tabla");
  assert.match(pagina, /irAEditarProducto=\{irAEditarProducto\}/, "la página no le pasa la acción");
});

test("crear no deja escrituras sueltas después de crear el pedido", () => {
  // Antes: el pedido se creaba, después un bucle propagaba costos sin
  // transacción, y si fallaba a mitad el mensaje decía "Error interno al crear
  // pedido" mientras el pedido quedaba existiendo.
  //
  // Ahora la ruta tiene UNA escritura —el create anidado, que Prisma
  // transacciona— y nada después. Si alguien agrega otro `await` de escritura
  // después del create, el mensaje vuelve a mentir.
  const src = fs.readFileSync(path.join(DIR_RUTAS, "crear/route.js"), "utf8");
  const despuesDelCreate = src.slice(src.indexOf("prisma.pedidoProveedor.create"));
  const escrituras = despuesDelCreate.match(/await\s+(prisma|tx)\.[a-zA-Z]+\.(create|update|delete|upsert)/g) || [];
  assert.deepEqual(
    escrituras,
    [],
    `crear volvió a tener escrituras después del create: ${escrituras.join(", ")}. ` +
      `O entra todo o no entra nada, o el mensaje de error miente.`
  );
});
