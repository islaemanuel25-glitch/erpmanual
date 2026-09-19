// LOS PRECIOS NO SALEN EN EL DOCUMENTO DEL PROVEEDOR.
//
// Es lo único de esta tanda que, si se rompe, no se nota: el PDF se abre, se ve
// bien y dice de más. No hay pantalla en rojo ni error de compilación — hay un
// proveedor leyendo con qué número esperábamos que facture.
//
// ── DE DÓNDE SALE EL PEDIDO DE PRUEBA, Y POR QUÉ IMPORTA ──────────────────
//
// De `/api/compras-proveedor/obtener?id=1` sobre `erpazul_al`, el pedido que se
// armó de punta a punta desde el Local 1 por la aplicación. Está recortado a lo
// que las funciones leen, y la FORMA es la del endpoint: `precioCosto` llega como
// STRING —"180", no 180—, que es como lo serializa un Decimal de Prisma.
//
// Eso no es un detalle de prolijidad. Un fixture con `precioCosto: 180` numérico
// pasaría igual y dejaría sin probar el `Number()` de la lectura; y al revés, una
// función que comparara con `=== 0` fallaría solo con el string. El CLAUDE.md de
// este repo tiene tres casos seguidos de candados verdes para siempre por un
// fixture "razonable" escrito a mano.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/sinPreciosParaElProveedor.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  textoParaElProveedor,
  textoDeLaPrefactura,
  totalEstimadoDelPedido,
  cantidadDeProductos,
} from "./textoPedido.js";
import {
  DOCUMENTO,
  DOCUMENTO_POR_DEFECTO,
  documentoPedido,
  llevaPrecios,
  nombreDeArchivo,
  tituloDelDocumento,
} from "./documentoDelPedido.js";

/** El pedido #1 de `erpazul_al`, con la forma que devuelve el endpoint. */
const PEDIDO = {
  id: 1,
  estado: "RECIBIDO",
  notas: null,
  fechaConfirmado: "2026-09-19T11:50:53.441Z",
  createdAt: "2026-09-19T11:46:41.012Z",
  proveedor: { id: 1, nombre: "Arcor", telefono: null, email: null },
  deposito: { id: 1, nombre: "Depósito Central" },
  detalles: [
    {
      id: 1,
      cantidad: "2",
      unidad: "BULTO",
      precioCosto: "180",
      producto: { base: { nombre: "ZZCOMPRA DELLOCAL 1789818320", sku: null } },
    },
    {
      id: 4,
      cantidad: "1",
      unidad: "BULTO",
      precioCosto: "90",
      producto: { base: { nombre: "ZZCOMPRA DELLOCAL 1789818551", sku: null } },
    },
  ],
};

// ── LO QUE NO PUEDE ESTAR ─────────────────────────────────────────────────

test("el texto del proveedor NO trae ni un signo de peso", () => {
  const texto = textoParaElProveedor(PEDIDO);
  assert.ok(!texto.includes("$"), `salió dinero en el texto del proveedor:\n${texto}`);
});

test("el texto del proveedor no trae ninguno de los importes del pedido", () => {
  const texto = textoParaElProveedor(PEDIDO);
  // Los cinco números de dinero que este pedido produce: los dos costos, los dos
  // subtotales y el total. Escritos como los escribe el formateador.
  for (const importe of ["180,00", "360,00", "90,00", "450,00"]) {
    assert.ok(!texto.includes(importe), `apareció ${importe} en el texto del proveedor`);
  }
});

test("tampoco trae la palabra total ni el signo de multiplicar", () => {
  const texto = textoParaElProveedor(PEDIDO).toLowerCase();
  assert.ok(!texto.includes("total"), "el texto del proveedor habla de un total");
  assert.ok(!texto.includes("×"), "el texto del proveedor trae el × de cantidad por precio");
});

// ── LO QUE SÍ TIENE QUE ESTAR ─────────────────────────────────────────────

test("el texto del proveedor trae número, fecha, proveedor, depósito y las líneas", () => {
  const texto = textoParaElProveedor(PEDIDO);
  assert.ok(texto.includes("*Pedido #1*"), "falta el número de pedido en negrita");
  assert.ok(texto.includes("19/09/2026"), "falta la fecha");
  assert.ok(texto.includes("Proveedor: Arcor"), "falta el proveedor");
  assert.ok(texto.includes("Depósito: Depósito Central"), "falta el depósito");
  // ── LA CANTIDAD YA NO SE ESCRIBE EN NUESTRO VOCABULARIO ────────────────
  //
  // Decía "2 BULTO". El 2026-09-19 el documento del proveedor pasó a expresar
  // la cantidad con la conversión de la ficha, porque "bulto" es una palabra
  // nuestra y del otro lado nadie sabe si trae 12, 24 o 30.
  //
  // El fixture no carga `unidad_medida`, así que cae en el caso honesto: no se
  // sabe si ese bulto agrupa, y va el número SOLO. Que este candado afirme
  // justamente ese caso es deliberado — es el que no puede inventar nada.
  assert.ok(
    texto.includes("1. ZZCOMPRA DELLOCAL 1789818320: 2"),
    "la línea no trae producto y cantidad"
  );
  assert.ok(
    !texto.includes("BULTO"),
    "el documento del proveedor sigue hablando de BULTO, que es vocabulario nuestro"
  );
  assert.ok(texto.includes("2. ZZCOMPRA DELLOCAL 1789818551: 1"), "falta la segunda línea");
});

test("LOS ASTERISCOS DE NEGRITA DE WHATSAPP SE CONSERVAN", () => {
  // No son decoración: es el medio por el que este texto se manda. Se perdieron
  // una vez en una reescritura y el título quedó como un renglón más.
  assert.match(textoParaElProveedor(PEDIDO), /^\*Pedido #1\* — /);
});

test("las notas siguen yendo al proveedor", () => {
  const texto = textoParaElProveedor({ ...PEDIDO, notas: "Entregar por la puerta de atrás" });
  assert.ok(texto.includes("Notas: Entregar por la puerta de atrás"));
});

// ── LA PREFACTURA NO CAMBIÓ ───────────────────────────────────────────────

test("LA PREFACTURA SALE CARÁCTER POR CARÁCTER COMO SALÍA ANTES", () => {
  // Medido sobre este mismo pedido con el código anterior a partir el documento
  // en dos, corriendo la función real contra la respuesta real del endpoint. Si
  // este candado se pone rojo, la prefactura cambió de contenido — que es
  // exactamente lo que esta tanda dijo que no iba a pasar.
  const esperado = [
    "*Pedido #1* — 19/09/2026",
    "Proveedor: Arcor",
    "Depósito: Depósito Central",
    "",
    "1. ZZCOMPRA DELLOCAL 1789818320: 2 BULTO × $180,00 = $360,00",
    "2. ZZCOMPRA DELLOCAL 1789818551: 1 BULTO × $90,00 = $90,00",
    "",
    "*Total estimado: $450,00*",
  ].join("\n");
  assert.equal(textoDeLaPrefactura(PEDIDO), esperado);
});

test("los dos documentos comparten todo menos el dinero y la unidad", () => {
  // ── POR QUÉ ESTE CANDADO SE ACHICÓ, Y QUÉ SIGUE DEFENDIENDO ────────────
  //
  // Exigía que la prefactura CONTUVIERA cada renglón del documento del
  // proveedor, palabra por palabra. Eso valía cuando la única diferencia era el
  // dinero. Desde el 2026-09-19 hay una segunda diferencia y es deliberada: el
  // documento del proveedor expresa la cantidad convertida —"40 × 24 = 960
  // unidades"— y la prefactura la conserva en bultos, porque se controla contra
  // una factura que viene en bultos y con el costo POR bulto al lado.
  //
  // Lo que el candado existía para atajar sigue atajado: que un dato se agregue
  // a un documento y no al otro. Por eso se comparan el ENCABEZADO entero, la
  // cantidad de renglones y el orden de los productos. Lo único exento es el
  // tramo de la cantidad, que es la diferencia decidida.
  const proveedor = textoParaElProveedor(PEDIDO).split("\n");
  const prefactura = textoDeLaPrefactura(PEDIDO).split("\n");

  // El encabezado —número, fecha, proveedor, depósito— tiene que ser idéntico.
  for (const renglon of proveedor.slice(0, 4)) {
    assert.ok(
      prefactura.includes(renglon),
      `la prefactura perdió un renglón del encabezado: ${renglon}`
    );
  }

  // Y cada línea tiene que existir en las dos, con el mismo número de orden y
  // el mismo producto. Lo que cambia es lo que va después de los dos puntos.
  const lineasDe = (ls) =>
    ls.filter((l) => /^\d+\. /.test(l)).map((l) => l.slice(0, l.indexOf(":")));
  assert.deepEqual(
    lineasDe(prefactura),
    lineasDe(proveedor),
    "los dos documentos no listan los mismos productos en el mismo orden"
  );

  // CONTRAPRUEBA DE LA EXENCIÓN: la prefactura TIENE que seguir en bultos. Sin
  // esto, convertirla también pasaría en verde y nadie se enteraría hasta
  // comparar un renglón contra una factura.
  assert.ok(
    textoDeLaPrefactura(PEDIDO).includes("2 BULTO"),
    "la prefactura dejó de expresar la cantidad en bultos"
  );
});

// ── LAS DOS CUENTAS QUE EL MODAL MUESTRA ──────────────────────────────────

test("el total y el conteo salen de la misma fuente que la prefactura", () => {
  assert.equal(totalEstimadoDelPedido(PEDIDO), 450);
  assert.equal(cantidadDeProductos(PEDIDO), 2);
});

test("una línea SIN costo no suma cero: no suma, y el total no se escribe", () => {
  // El caso real: el pedido #2 de `erpazul_al` tiene su única línea con
  // `precioCosto` en NULL, que es como llega de la base cuando no se cargó.
  const sinCostos = {
    ...PEDIDO,
    detalles: [
      {
        id: 2,
        cantidad: "1",
        unidad: "BULTO",
        precioCosto: null,
        producto: { base: { nombre: "ZZCOMPRA DELDEPO 1789818320", sku: null } },
      },
    ],
  };
  assert.equal(totalEstimadoDelPedido(sinCostos), 0);
  const prefactura = textoDeLaPrefactura(sinCostos);
  assert.ok(
    !prefactura.includes("Total estimado"),
    "escribió un total sobre un pedido sin ningún costo cargado"
  );
  assert.ok(!prefactura.includes("$"), "escribió dinero sobre una línea sin costo");
});

// ── EL DEFAULT CAE DEL LADO SIN PRECIOS ───────────────────────────────────

test("EL DOCUMENTO POR DEFECTO ES EL DEL PROVEEDOR", () => {
  // Es la decisión de seguridad del módulo: un parámetro ausente, un valor mal
  // escrito o un enlace viejo tienen que dar el documento SIN precios.
  assert.equal(DOCUMENTO_POR_DEFECTO, DOCUMENTO.PROVEEDOR);
  assert.equal(llevaPrecios(DOCUMENTO_POR_DEFECTO), false);
  // Y LA CONSTANTE TIENE QUE SER LO QUE LA FUNCIÓN HACE. Sin esta línea, la
  // constante puede decir "proveedor" mientras `documentoPedido` cae en la
  // prefactura: medido, con el default dado vuelta este candado seguía en verde y
  // solo se ponía rojo el de abajo. Un candado que afirma una constante no afirma
  // el comportamiento.
  assert.equal(documentoPedido(undefined), DOCUMENTO_POR_DEFECTO);
});

test("cualquier cosa que no sea exactamente prefactura cae en el del proveedor", () => {
  for (const bruto of [
    undefined,
    null,
    "",
    "PREFACTURA",
    "Prefactura",
    " prefactura",
    "prefactura ",
    "prefacturas",
    "proveedor",
    "cualquiera",
    0,
    true,
  ]) {
    assert.equal(
      llevaPrecios(documentoPedido(bruto)),
      false,
      `${JSON.stringify(bruto)} habilitó los precios`
    );
  }
  // Y el único que sí los habilita.
  assert.equal(llevaPrecios(documentoPedido("prefactura")), true);
});

test("los dos nombres de archivo no se pueden confundir en la carpeta", () => {
  const delProveedor = nombreDeArchivo(DOCUMENTO.PROVEEDOR, 12);
  const laPrefactura = nombreDeArchivo(DOCUMENTO.PREFACTURA, 12);
  assert.notEqual(delProveedor, laPrefactura);
  assert.ok(delProveedor.includes("para-el-proveedor"), delProveedor);
  assert.ok(laPrefactura.includes("prefactura"), laPrefactura);
  // Y ninguno de los dos es prefijo del otro: en una lista ordenada por nombre,
  // dos archivos donde uno empieza igual que el otro se eligen mal.
  assert.ok(!delProveedor.startsWith(laPrefactura.replace(/\.pdf$/, "")));
  assert.ok(!laPrefactura.startsWith(delProveedor.replace(/\.pdf$/, "")));
});

test("el título del PDF también dice para quién es", () => {
  assert.equal(tituloDelDocumento(DOCUMENTO.PROVEEDOR, 12), "Pedido a proveedor #12");
  assert.ok(tituloDelDocumento(DOCUMENTO.PREFACTURA, 12).toLowerCase().includes("prefactura"));
});
