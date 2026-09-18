// UN TÍTULO DE RUBRO NO ES UN PRODUCTO.
//
// ── EL CASO, CON SUS NÚMEROS ───────────────────────────────────────────────
//
// La lista de Arcor trae títulos de sección —GOLOSINAS, CHOCOLATES, ALIMENTOS—
// con `$0.00` en las dos columnas de precio. Hasta el 2026-09-18 entraban como
// filas de la importación: el archivo de prueba tiene 16 renglones y guardaba 16,
// decía que había salteado 1 —el encabezado— y no había salteado ningún rubro.
//
// El daño no era el ruido. Las tres caían en "no los tenés", que mostraba **6**
// cuando los productos que faltaban de verdad eran **3**, y esa tarjeta lleva a la
// cola donde se vincula un renglón de la lista con un producto del catálogo: el
// módulo llegaba a ofrecer vincular la palabra GOLOSINAS con un producto. En la
// lista real, con 972 renglones y un rubro cada quince, son decenas de filas de
// trabajo inventado.
//
// Y la misma pantalla lo decía de las dos formas a la vez: arriba dibujaba
// GOLOSINAS en "Así quedan los primeros productos", con "Código —" y "$ 0,00", y
// tres renglones más abajo avisaba que salteaba las filas que no son productos.
//
// ── POR QUÉ NO LO ATRAPÓ EL LECTOR ────────────────────────────────────────
//
// Porque `tablaDeArchivo` decide qué es una fila por su FORMA —cuántas celdas
// tiene llenas— y el renglón del rubro tiene tres: el nombre y los dos `$0.00`.
// Para saber que no es un producto hay que mirar el código y el precio, y cuál
// columna es cada cosa lo dice el MAPA, que se aplica un paso después.
//
// Es la misma familia que el CLAUDE.md describe cinco veces sobre el módulo de
// comprobante: cada pieza hacía bien lo suyo y el defecto vivía en el espacio
// entre las dos. El lector no podía saberlo y el que sí podía no preguntaba.
//
//   node --experimental-loader ./scripts/alias-loader.mjs --test lib/proveedores/listas/titulosDeRubroNoSonProductos.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  filasDelArchivo,
  motivoParaNoGuardarla,
  MOTIVO_NO_ES_PRODUCTO,
} from "./importacionGenerica.js";

// El mapa del archivo con forma de Arcor: código 0, descripción 1, U.M. 2,
// cantidad 3, y las dos columnas de precio en 4 y 5.
const MAPEO = { codigo: 0, codigoBarra: null, descripcion: 1, cantidad: 3, descuento: null, precios: [4, 5] };

/** Un renglón de producto, como lo devuelve el lector. */
const producto = (codigo, desc, sinIva, conIva) => ({
  valores: [codigo, desc, "UN", "12", String(sinIva), String(conIva)],
});

/** Un título de rubro, tal cual lo imprime la lista: sin código y con $0.00. */
const rubro = (nombre) => ({ valores: ["", nombre, "", "", "$0.00", "$0.00"] });

/**
 * EL ARCHIVO DEL BANCO DE PRUEBA: 16 renglones, 3 de ellos títulos de rubro.
 *
 * Son los mismos números del informe del recorrido, y por eso este candado
 * reproduce el caso y no uno parecido: `.banco-de-prueba/banco-lista.pdf` tiene
 * exactamente esta forma, y el recorrido midió 16 guardadas sobre 16 renglones.
 */
const ARCHIVO = {
  titulos: ["CODIGO", "DESCRIPCION", "U.M.", "CANT", "S/IVA", "C/IVA"],
  filas: [
    rubro("GOLOSINAS"),
    producto("13113", "MOGUL GOMITAS 30G X 12", 4416.48, 5343.94),
    producto("3113", "MOGUL x1 Kg CONITOS (450u)", 10501.49, 12706.8),
    producto("3096", "MOGUL x1 Kg ANILLOS (157u)", 8742.15, 10578.0),
    rubro("CHOCOLATES"),
    producto("7742", "COFLER AIR BLANCO 27G", 1755.37, 2124.0),
    producto("9155", "MERMELADA DURAZNO 454G", 2100.0, 2541.0),
    producto("7801", "BON O BON LECHE 15G", 4866.54, 5888.51),
    producto("7810", "TOFI CHOCOLATE 18G", 3355.14, 4059.72),
    producto("9140", "ARCOR ARVEJAS 350G", 858.86, 1039.22),
    producto("9101", "POMAROLA TOMATE 340G", 9589.49, 11603.28),
    producto("5001", "TOSTEX CLASICO", 950.41, 1150.0),
    producto("5002", "PRODUCTO SIN COSTO", 2727.27, 3300.0),
    rubro("ALIMENTOS"),
    producto("9160", "ACEITE GIRASOL 900ML", 2525.45, 3055.8),
    producto("9160", "ACEITE GIRASOL 900ML", 2900.83, 3510.0),
  ],
};

test("EL FIXTURE ES EL CASO: 16 renglones y 3 son títulos de rubro", () => {
  // CONTRA EL FIXTURE QUE NO REPRODUCE NADA. Si estos números no fueran los que
  // el recorrido midió, todo lo de abajo estaría probando otro archivo.
  assert.equal(ARCHIVO.filas.length, 16);
  const rubros = ARCHIVO.filas.filter((f) => !String(f.valores[0]).trim());
  assert.equal(rubros.length, 3);
  // Y los tres traen $0.00 en las dos columnas, que es lo que hace el papel: si
  // vinieran vacíos, el descarte por "sin precio" pasaría por un motivo distinto
  // del real.
  for (const r of rubros) {
    assert.equal(r.valores[4], "$0.00");
    assert.equal(r.valores[5], "$0.00");
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LO QUE SE GUARDA Y LO QUE SE CUENTA
// ═══════════════════════════════════════════════════════════════════════════

test("DE 16 RENGLONES SE GUARDAN 13 Y SE CUENTAN 3 SALTEADAS", () => {
  const r = filasDelArchivo({ tabla: ARCHIVO, mapeo: MAPEO, hojaNombre: "Página 1" });

  assert.equal(r.filas.length, 13, "guardó una cantidad distinta de 13 productos");
  assert.equal(r.descartadas.length, 3, "no contó las 3 filas que no son productos");

  // Y ninguna de las guardadas es un rubro. No alcanza con el conteo: 13 y 3
  // también saldría descartando tres productos y guardando un rubro.
  const nombres = r.filas.map((f) => f.descripcionProveedor);
  for (const titulo of ["GOLOSINAS", "CHOCOLATES", "ALIMENTOS"]) {
    assert.ok(!nombres.includes(titulo), `${titulo} se guardó como producto`);
  }

  // Y las tres descartadas son ESAS tres, con su motivo.
  assert.deepEqual(
    r.descartadas.map((d) => d.texto).sort(),
    ["ALIMENTOS", "CHOCOLATES", "GOLOSINAS"]
  );
  for (const d of r.descartadas) {
    assert.equal(d.motivo, MOTIVO_NO_ES_PRODUCTO.SIN_CODIGO);
  }
});

test("NINGUNA PANTALLA PUEDE OFRECER VINCULAR UN TÍTULO", () => {
  // ── QUÉ AFIRMA, Y POR QUÉ ASÍ ───────────────────────────────────────────
  //
  // Lo que ofrecía vincular GOLOSINAS era la cola de "no los tenés", que se
  // alimenta de las filas guardadas de la importación. No hay forma de que una
  // pantalla ofrezca una fila que no existe, así que la afirmación fuerte es
  // ésta: NINGUNA fila guardada carece de código.
  //
  // Se escribe sobre la propiedad y no sobre los tres nombres del fixture: un
  // candado que solo busque "GOLOSINAS" pasa el día que el rubro se llame
  // "PANIFICADOS".
  const r = filasDelArchivo({ tabla: ARCHIVO, mapeo: MAPEO, hojaNombre: "Página 1" });
  const sinCodigo = r.filas.filter((f) => !String(f.codigoCrudo ?? "").trim());
  assert.deepEqual(sinCodigo, [], "hay filas guardadas sin código: son las que se ofrecen para vincular");
});

test("EL `filaExcel` NO DEJA HUECOS al descartar del medio", () => {
  // Los rubros están en los renglones 1, 5 y 14, o sea en el medio. Si el número
  // de fila saliera del índice del archivo, la lista de 13 productos saltaría del
  // 4 al 6 y el primero que la mire va a buscar la fila 5, que no existe.
  const r = filasDelArchivo({ tabla: ARCHIVO, mapeo: MAPEO, hojaNombre: "Página 1" });
  assert.deepEqual(
    r.filas.map((f) => f.filaExcel),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// EL PREDICADO, Y SUS DOS CONDICIONES
// ═══════════════════════════════════════════════════════════════════════════

const fila = (codigoCrudo, preciosPorColumna) => ({ codigoCrudo, preciosPorColumna });

test("SIN CÓDIGO NO ES UN PRODUCTO", () => {
  assert.equal(motivoParaNoGuardarla(fila("", { 4: 100 })), MOTIVO_NO_ES_PRODUCTO.SIN_CODIGO);
  assert.equal(motivoParaNoGuardarla(fila("   ", { 4: 100 })), MOTIVO_NO_ES_PRODUCTO.SIN_CODIGO);
  assert.equal(motivoParaNoGuardarla(fila(null, { 4: 100 })), MOTIVO_NO_ES_PRODUCTO.SIN_CODIGO);
});

test("SIN NINGÚN PRECIO MAYOR QUE CERO TAMPOCO", () => {
  assert.equal(motivoParaNoGuardarla(fila("123", { 4: 0, 5: 0 })), MOTIVO_NO_ES_PRODUCTO.SIN_PRECIO);
  assert.equal(motivoParaNoGuardarla(fila("123", { 4: null, 5: null })), MOTIVO_NO_ES_PRODUCTO.SIN_PRECIO);
  assert.equal(motivoParaNoGuardarla(fila("123", {})), MOTIVO_NO_ES_PRODUCTO.SIN_PRECIO);
  // Un precio negativo no es un precio.
  assert.equal(motivoParaNoGuardarla(fila("123", { 4: -50 })), MOTIVO_NO_ES_PRODUCTO.SIN_PRECIO);
});

test("CON UNA SOLA COLUMNA EN CERO SÍ ES UN PRODUCTO — y esto es lo que no puede romperse", () => {
  // ── EL FALSO POSITIVO QUE HABRÍA COSTADO CARO ───────────────────────────
  //
  // Un archivo con dos columnas de precio puede traer una en cero legítimamente:
  // el proveedor que no informa el sin IVA de un artículo, o la columna de
  // bonificado vacía. Si el descarte pidiera que TODAS las columnas tuvieran
  // precio, esos productos desaparecerían de la lista sin dejar rastro — y
  // desaparecer es mucho peor que sobrar, porque un producto de más se ve y uno
  // de menos no.
  assert.equal(motivoParaNoGuardarla(fila("123", { 4: 0, 5: 1039.22 })), null);
  assert.equal(motivoParaNoGuardarla(fila("123", { 4: 858.86, 5: 0 })), null);
});

test("UN PRODUCTO CON CÓDIGO Y PRECIO SE GUARDA", () => {
  assert.equal(motivoParaNoGuardarla(fila("9140", { 4: 858.86, 5: 1039.22 })), null);
  // Y el código puede ser no numérico: hay proveedores que usan letras.
  assert.equal(motivoParaNoGuardarla(fila("AB-77", { 4: 12.5 })), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// LAS CONTRAPRUEBAS
// ═══════════════════════════════════════════════════════════════════════════

test("CONTRAPRUEBA: sin el descarte, el archivo guarda 16 y no 13", () => {
  // ── POR QUÉ ESTA CONTRAPRUEBA Y NO UN COMENTARIO ────────────────────────
  //
  // Porque "guarda 13" solo prueba algo si se sabe que el archivo tiene 16
  // renglones que ANTES entraban. Acá se ejerce el comportamiento viejo —mapear
  // sin filtrar— y se comprueba que daba 16, o sea que el candado de arriba mide
  // una diferencia real y no una propiedad que el archivo ya tenía.
  //
  // Se reconstruye el camino viejo en vez de llamar a una función: lo que se
  // quiere afirmar es que los 16 renglones TIENEN forma de fila para el lector,
  // que es exactamente por lo que el defecto existía.
  const conForma = ARCHIVO.filas.filter(
    (f) => f.valores.filter((v) => String(v).trim() !== "").length > 1
  );
  assert.equal(conForma.length, 16, "los 16 renglones ya no tienen forma de fila: el caso cambió");

  // Y los tres rubros están entre ellos, con sus tres celdas llenas. Es lo que
  // hacía que el lector no los pudiera distinguir.
  const rubrosConForma = conForma.filter((f) => !String(f.valores[0]).trim());
  assert.equal(rubrosConForma.length, 3);
  for (const r of rubrosConForma) {
    const llenas = r.valores.filter((v) => String(v).trim() !== "").length;
    assert.equal(llenas, 3, "el rubro dejó de tener tres celdas llenas: ya no reproduce el caso");
  }
});

test("CONTRAPRUEBA: el predicado distingue de verdad, no devuelve null a todo", () => {
  // Si `motivoParaNoGuardarla` devolviera siempre null, todos los candados que
  // afirman "sí es un producto" pasarían y el archivo volvería a guardar 16 sin
  // que nada se ponga rojo. Acá se ejerce que sabe decir que NO.
  const dice = [
    motivoParaNoGuardarla(fila("", { 4: 100 })),
    motivoParaNoGuardarla(fila("123", { 4: 0 })),
  ];
  assert.deepEqual(dice, [MOTIVO_NO_ES_PRODUCTO.SIN_CODIGO, MOTIVO_NO_ES_PRODUCTO.SIN_PRECIO]);

  // Y que sabe decir que sí, para el mismo dato con lo que le faltaba puesto.
  assert.equal(motivoParaNoGuardarla(fila("123", { 4: 100 })), null);
});

test("CONTRAPRUEBA: un archivo SIN rubros no pierde ni una fila", () => {
  // El otro lado del descarte, y el que importa para no romper lo que andaba: si
  // el predicado fuera demasiado severo, las listas que hoy se leen bien perderían
  // productos en silencio. Un archivo de puros productos tiene que salir entero.
  const soloProductos = { titulos: ARCHIVO.titulos, filas: ARCHIVO.filas.filter((f) => String(f.valores[0]).trim()) };
  const r = filasDelArchivo({ tabla: soloProductos, mapeo: MAPEO, hojaNombre: "x" });
  assert.equal(r.filas.length, 13);
  assert.deepEqual(r.descartadas, []);
});

test("UN ARCHIVO DE PUROS RUBROS NO DEJA NINGÚN PRODUCTO, y eso se informa", () => {
  // El caso extremo, que existe por un motivo concreto: si alguien mapea la
  // columna de precio a una que no trae números, TODAS las filas quedan sin
  // precio. La lectura devuelve cero productos y el endpoint corta con
  // NINGUN_PRODUCTO en vez de importar una lista vacía "con éxito".
  const puros = { titulos: ARCHIVO.titulos, filas: [rubro("GOLOSINAS"), rubro("CHOCOLATES")] };
  const r = filasDelArchivo({ tabla: puros, mapeo: MAPEO, hojaNombre: "x" });
  assert.equal(r.filas.length, 0);
  assert.equal(r.descartadas.length, 2);
});
