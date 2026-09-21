// AL VINCULAR SE BUSCA ENTRE LO QUE SE LE COMPRA AL PROVEEDOR.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/asociarAlProveedor.test.mjs
//
// ── DE DÓNDE SALE ─────────────────────────────────────────────────────────
//
// El 2026-09-21, recibiendo una factura de Paty, el buscador de la hoja traía
// productos de todo el ERP. Medido ese día: el universo de Paty son **26
// productos** y el catálogo **2.711**. Elegir entre 2.711 para vincular un
// renglón de Paty no es difícil, es peligroso — un vínculo equivocado escribe
// un alias que se repite en cada factura que venga, y el costo entra en el
// producto que no era.
//
// De los once renglones de esa factura, nueve tienen su producto adentro de los
// 26 —"TRENS MANTECA X100 GS 60" es "Manteca Tremblay 100g"— y dos no: un
// Butler y un queso danbo. Ésos dos son exactamente el caso para el que existe
// la salida al catálogo entero, y el motivo por el que esa salida no se puede
// sacar.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  RELACIONES_DE_PROVEEDOR,
  textoDeLaAsociacion,
  yaEsDelProveedor,
} from "@/lib/compras-proveedor/comprobante/asociarAlProveedor";
import { productoDelProveedorWhere } from "@/lib/proveedores/listas/cargaErp";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const PATY = 6;

// ── LA ASOCIACIÓN ─────────────────────────────────────────────────────────

test("SE RECONOCE EN CUALQUIERA DE LAS TRES RELACIONES", () => {
  for (const campo of RELACIONES_DE_PROVEEDOR) {
    assert.equal(yaEsDelProveedor({ id: 1, [campo]: PATY }, PATY), true, `no lo vio en ${campo}`);
  }
  assert.equal(yaEsDelProveedor({ id: 1, proveedor_id: 3 }, PATY), false);
  assert.equal(yaEsDelProveedor(null, PATY), false);
  assert.equal(yaEsDelProveedor({ id: 1, proveedor_id: PATY }, null), false);
});

test("EL AVISO SOLO APARECE CUANDO EL PRODUCTO NO ERA DEL PROVEEDOR", () => {
  // Si ya era suyo no cambió nada, y decirlo sería ruido sobre una pantalla que
  // se usa con el camión en la puerta.
  assert.equal(textoDeLaAsociacion({ accion: "YA_ESTABA" }, "Paty"), null);
  const t = textoDeLaAsociacion({ accion: "POR_ALIAS" }, "Paty");
  assert.match(t, /Paty/);
  assert.match(t, /próxima vez/i, "tiene que decir qué cambia, no qué pasó");
  assert.match(t, /sin salir del proveedor/i);
});

test("LA ASOCIACIÓN ES LA MISMA DEFINICIÓN QUE EL UNIVERSO, NO UNA PARECIDA", () => {
  // Si este módulo llenara un campo que `productoDelProveedorWhere` no mira, el
  // producto quedaría "asociado" y seguiría fuera del universo: la próxima
  // factura volvería a obligar a salir al catálogo entero, sin que nada avise.
  const camposDelUniverso = productoDelProveedorWhere(PATY).OR.map((o) => Object.keys(o)[0]);
  assert.deepEqual([...RELACIONES_DE_PROVEEDOR].sort(), [...camposDelUniverso].sort());
});

// ── Y LAS PANTALLAS ───────────────────────────────────────────────────────

test("EL BUSCADOR DE LA HOJA BUSCA EN EL UNIVERSO DEL PROVEEDOR", () => {
  const piezas = codigoDe("components/comprobantes/PiezasConciliacion.jsx");
  assert.match(
    piezas,
    /\/api\/compras-proveedor\/productos\?proveedorId=/,
    "volvió a buscar en el catálogo entero por defecto"
  );
  assert.match(piezas, /enTodoElCatalogo/, "se perdió la salida al catálogo entero");
  // La salida existe y es explícita: sin ella, un producto que el proveedor
  // trae por primera vez no se podría vincular nunca.
  assert.match(piezas, /TEXTO_TODO_EL_CATALOGO/);
});

test("Y LA HOJA NO OFRECE CANDIDATOS DE AFUERA DEL UNIVERSO", () => {
  const hoja = codigoDe("components/compras-proveedor/HojaCorregirLinea.jsx");
  assert.match(
    hoja,
    /ORIGEN_VINCULO\.ERP_COMPLETO/,
    "volvió a ofrecer como candidatos los productos que la cascada sacó de todo el ERP"
  );
  assert.match(hoja, /proveedorId=\{proveedorId\}/, "la hoja dejó de pasarle el proveedor al buscador");
});

test("VINCULAR NO ESCRIBE SOBRE LA FICHA DEL PRODUCTO", () => {
  // Se intentó llenar `proveedor2_id` y lo frenó un candado que existe desde
  // antes y tiene razón: ninguna ruta de pedido escribe sobre ProductoBase,
  // salvo recibir. Así fue como los costos se filtraban al catálogo sin que
  // nadie lo pidiera. Este candado deja escrito que esa puerta sigue cerrada
  // acá, para que el próximo intento se encuentre con el motivo y no solo con
  // el rojo.
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/vincular/route.js");
  assert.ok(
    !/(productoBase|productoLocal)\.(update|updateMany|upsert)\s*\(/.test(ruta),
    "vincular volvió a escribir sobre el producto"
  );
  // Lo que SÍ hace, y es lo que hace que el producto aparezca la próxima vez.
  assert.match(ruta, /productoCodigoProveedor\.upsert/, "dejó de escribir el alias");
});

test("Y EL ALIAS ES LO QUE SUMA EL PRODUCTO AL CATÁLOGO DEL PROVEEDOR", () => {
  // La otra mitad de la afirmación de arriba: el alias no sirve de nada si el
  // catálogo del proveedor no lo mira. Acá se comprueba que sí.
  const catalogo = codigoDe("app/api/compras-proveedor/productos/route.js");
  assert.match(catalogo, /productoCodigoProveedor\.findMany/);
  assert.match(catalogo, /baseIdsVinculados/, "el catálogo dejó de sumar las bases con alias");
});

test("EL CATÁLOGO DEL PROVEEDOR USA LA FUNCIÓN COMPARTIDA, NO UNA COPIA", () => {
  const ruta = codigoDe("app/api/compras-proveedor/productos/route.js");
  assert.match(ruta, /productoDelProveedorWhere\(proveedorId\)\.OR/);
  // CONTRAPRUEBA de la copia que había: las tres relaciones escritas a mano, de
  // nuevo, al lado de la función que ya las define.
  const copiaAMano = /\{ proveedor2_id: proveedorId \}/.test(ruta);
  assert.equal(copiaAMano, false, "volvió la segunda definición del universo");
});
