// EL CÓDIGO INTERNO POR PROVEEDOR NO ES UN ID, Y NO ES EL SKU.
//
// ── EL DEFECTO QUE ESTOS CANDADOS EXISTEN PARA NO REPETIR ──────────────────
//
// La tarjeta del celular mostraba, bajo el rótulo "Cod. int.", esto:
//
//     codigoInterno={muestraCodigoInterno ? p.id ?? p.productoLocalId : false}
//
// O sea la CLAVE PRIMARIA de la tabla. En la captura de revisión se ve:
// `361 LATA X24` decía "Cod. int. 2023", que es su id. En las 2.600 filas.
//
// No era un dato aproximado ni un formato distinto: era un número técnico
// presentado como un código comercial. Quien lo cotejara contra una lista de
// precios del proveedor no iba a encontrar nada, y no tenía cómo saber por qué —
// el número existía, se veía prolijo, y estaba mal.
//
// **Nada lo atajaba.** No es un error de tipos —los dos son números—, no rompe el
// build, no pone roja ninguna suite, y en la pantalla se ve igual de bien que el
// dato correcto. Solo se encuentra sabiendo qué tiene que decir ese renglón.
//
// El dato correcto ya venía en la respuesta del listado: `codigoInterno`, que el
// servidor arma desde `ProductoCodigoProveedor` prefiriendo el del proveedor
// principal. No hizo falta ninguna consulta nueva.
//
// ── POR QUÉ SON CANDADOS DE TEXTO Y NO DE RENDER ──────────────────────────
//
// Porque lo que hay que impedir es que alguien vuelva a ESCRIBIR el fallback. Un
// candado de render probaría que con estos datos de prueba sale este texto, y el
// defecto vivía justo en la elección del dato, no en el dibujo.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");

// Los comentarios se sacan ANTES de mirar: un candado que busca texto encuentra
// la prosa que lo explica y se pone verde —o rojo— por el motivo equivocado. Ya
// pasó tres veces en este repo, y la peor fue un VERDE falso. Este archivo
// mismo nombra el fallback prohibido en su encabezado.
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const PAGINA = leer("app/modulos/productos/page.jsx");
const RUTA = leer("app/api/productos/listar/route.js");
const TABLA = leer("components/productos/SunmiTablaProductos.jsx");

/** Lo que la pantalla le pasa a la tarjeta como código interno. */
function loQueSePasa(fuente) {
  const m = fuente.match(/codigoInterno=\{([^}]*)\}/);
  assert.ok(m, "la tarjeta dejó de recibir un código interno");
  return m[1];
}

test("G1. la tarjeta recibe el `codigoInterno` que arma el listado", () => {
  assert.match(
    loQueSePasa(PAGINA),
    /p\.codigoInterno/,
    "la tarjeta dejó de usar el código que ya viene en la respuesta"
  );
});

test("G2. y NUNCA un id técnico como reemplazo", () => {
  // ── EL CANDADO QUE HABRÍA ATAJADO EL DEFECTO ────────────────────────────
  //
  // Se mira SOLO la expresión que va a ese prop, no el archivo entero: `p.id` se
  // usa legítimamente en veinte lados de esta pantalla —la key de la lista, el
  // argumento de Editar— y prohibirlo en todo el archivo sería un candado que
  // hay que apagar la primera vez que estorba.
  const expresion = loQueSePasa(PAGINA);
  assert.doesNotMatch(expresion, /\bp\.id\b/, "volvió el id del producto como código interno");
  assert.doesNotMatch(
    expresion,
    /productoLocalId/,
    "volvió el id del ProductoLocal como código interno"
  );
});

test("G3. y el SKU tampoco: es otro concepto", () => {
  // El SKU es del negocio propio; el código interno por proveedor es el que usa
  // el proveedor en SU lista. Confundirlos hace que la conciliación machee contra
  // el catálogo equivocado.
  assert.doesNotMatch(loQueSePasa(PAGINA), /\bp\.sku\b/, "el SKU se presentó como código del proveedor");
});

test("G4. contraprueba de G2 y G3: el analizador ve de verdad la expresión", () => {
  // Si `loQueSePasa` devolviera vacío, los tres candados de arriba pasarían sin
  // mirar nada — que es exactamente la forma del falso verde.
  const expresion = loQueSePasa(PAGINA);
  assert.ok(expresion.trim().length > 0, "la expresión salió vacía");
  // Y reconoce los patrones prohibidos cuando SÍ están.
  assert.match("muestra ? p.id ?? p.productoLocalId : false", /\bp\.id\b/);
  assert.match("muestra ? p.sku : false", /\bp\.sku\b/);
});

test("G5. el servidor sigue armando el código desde ProductoCodigoProveedor", () => {
  // Es de donde tiene que salir. Si el listado dejara de traerlo, la pantalla
  // recibiría `undefined` y la tarjeta diría "Sin cód. prov." en todo el
  // catálogo — silencioso y masivo.
  assert.match(RUTA, /codigosProveedor:/, "el listado dejó de traer los códigos del proveedor");
  assert.match(RUTA, /codigoInterno:/, "el listado dejó de exponer `codigoInterno`");
  assert.match(
    RUTA,
    /c\.proveedorId === p\.proveedor_id/,
    "se perdió la preferencia por el código del proveedor PRINCIPAL"
  );
});

test("G6. y no se agregó una segunda consulta para resolverlo", () => {
  // El pedido era explícito: el endpoint YA lo trae. Una consulta por tarjeta
  // sería 25 viajes más por página.
  const consultas = (RUTA.match(/productoCodigoProveedor\./g) || []).length;
  assert.equal(
    consultas,
    1,
    `el listado consulta ProductoCodigoProveedor ${consultas} veces: tiene que alcanzar con el include`
  );
});

test("G7. la tabla de escritorio ya usaba el dato correcto, y sigue", () => {
  // Se revisó por pedido explícito. `SunmiTablaProductos` dibuja `row[c.key]`, o
  // sea `row.codigoInterno` — el mismo campo del listado. No estaba mezclando id
  // ni SKU: el defecto era solo del celular.
  //
  // Este candado deja constancia de que se miró, y sirve para que la columna no
  // se "arregle" copiando lo que hacía la tarjeta.
  assert.match(TABLA, /codigoInterno:\s*\{/, "se fue la definición de la columna");
  assert.doesNotMatch(
    TABLA,
    /codigoInterno[^}]*row\.id/,
    "la columna de escritorio empezó a mostrar el id"
  );
  // Y el SKU sigue siendo su propia columna, separada.
  assert.match(TABLA, /sku:\s*\{/, "se fue la columna de SKU: es un concepto distinto");
});

test("G8. el rótulo dice de quién es el código", () => {
  // "Código interno" a secas es lo que dejó que un id pasara por código. El
  // nombre largo hace que un id ahí adentro se vea mal a simple vista.
  assert.match(
    PAGINA,
    /label: "Código interno por proveedor"/,
    "el selector de columnas volvió al nombre corto"
  );
});
