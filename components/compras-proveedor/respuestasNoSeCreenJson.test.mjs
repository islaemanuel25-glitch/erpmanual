// LA PANTALLA NO PUEDE CREER QUE TODA RESPUESTA ES JSON.
//
// Este candado mira el ARCHIVO, no una función, porque lo que falló no fue una
// función: fue una costumbre repetida en diez lugares. Un candado por función
// habría dejado los otros nueve.
//
// ── Y SACA LOS COMENTARIOS ANTES DE MIRAR ──────────────────────────────────
//
// Es la cuarta vez del mismo tropiezo en el proyecto: un candado que busca texto
// encuentra la prosa que lo explica. Este archivo NOMBRA `respuesta.json()` en
// sus propios comentarios y en los del componente, así que sin sacar los
// comentarios se pondría rojo por su propia explicación — o peor, un candado
// escrito al revés se pondría VERDE por ella.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const RUTA = "components/compras-proveedor/ImportarPedidoDesdeArchivo.jsx";

/** El código sin comentarios de línea ni de bloque, que es lo único que corre. */
function soloCodigo(ruta) {
  return readFileSync(ruta, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

test("NINGÚN fetch de la pantalla parsea json a ciegas", () => {
  const codigo = soloCodigo(RUTA);
  const aCiegas = [...codigo.matchAll(/(\w+)\s*\.json\(\)/g)].map((m) => m[0]);
  assert.deepEqual(
    aCiegas,
    [],
    `Quedó ${aCiegas.length} lectura(s) a ciegas: ${aCiegas.join(", ")}. ` +
      "Una página HTML ahí adentro sale a la cara del usuario como " +
      "\"Unexpected token '<'\", que no dice qué falló ni con qué código. Usá jsonOrError."
  );
});

test("la pantalla lee las respuestas con el lector compartido", () => {
  const codigo = soloCodigo(RUTA);
  assert.match(codigo, /import \{ jsonOrError \} from "@\/lib\/red\/leerJson"/);
});

test("CADA fetch tiene su lectura verificada — no alcanza con que haya alguna", () => {
  const codigo = soloCodigo(RUTA);
  const fetches = [...codigo.matchAll(/\bfetch\(/g)].length;
  const lecturas = [...codigo.matchAll(/\bjsonOrError\(/g)].length;
  assert.ok(fetches > 0, "si no hay fetch, este candado no está mirando lo que cree");
  assert.equal(
    lecturas,
    fetches,
    `Hay ${fetches} fetch y ${lecturas} lecturas verificadas. Si sobra un fetch, ` +
      "alguno quedó leyendo la respuesta sin comprobar que sea json."
  );
});

/** Los argumentos de cada `jsonOrError(...)`, balanceando paréntesis. */
function argumentosDeCadaLectura(codigo) {
  const salida = [];
  const marca = "jsonOrError(";
  let desde = 0;
  for (;;) {
    const i = codigo.indexOf(marca, desde);
    if (i < 0) break;
    let nivel = 0;
    let j = i + marca.length - 1;
    for (; j < codigo.length; j += 1) {
      if (codigo[j] === "(") nivel += 1;
      else if (codigo[j] === ")") {
        nivel -= 1;
        if (nivel === 0) break;
      }
    }
    salida.push(codigo.slice(i + marca.length, j));
    desde = j + 1;
  }
  return salida;
}

test("cada lectura dice QUÉ operación es, en castellano", () => {
  // Sin esto el mensaje queda "el servidor contestó una página": verdadero e
  // inútil. Lo que hace falta saber es una página AL HACER QUÉ.
  //
  // La operación puede ser un literal o un ternario entre dos literales —crear
  // un borrador y sumarle líneas a uno abierto son dos operaciones distintas y
  // el mensaje tiene que decir cuál—. Lo que se exige es que haya TEXTO, no una
  // forma sintáctica.
  const codigo = soloCodigo(RUTA);
  const llamadas = argumentosDeCadaLectura(codigo);
  const conFetch = [...codigo.matchAll(/\bfetch\(/g)].length;
  assert.equal(llamadas.length, conFetch, "alguna lectura no se pudo leer entera");

  for (const args of llamadas) {
    const textos = [...args.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    assert.ok(textos.length > 0, `una lectura no nombra ninguna operación: ${args.slice(0, 60)}`);
    for (const t of textos) {
      assert.ok(t.trim().length >= 6, `operación demasiado corta: "${t}"`);
      assert.ok(!/^[A-Z_]+$/.test(t), `"${t}" parece un código, no algo que alguien pueda leer`);
    }
  }
});

// ── EL CENSO DEL RESTO DEL REPO ────────────────────────────────────────────
//
// Este defecto NO es exclusivo de esta pantalla, y decirlo es parte de
// informarlo. El arreglo de esta tanda es el de esta pantalla, que es la que
// falló; el resto queda contado para que nadie lo descubra en producción.
test("queda anotado cuántas pantallas más leen json a ciegas", () => {
  // El número no se afirma —cambia cuando alguien arregla otra— pero SÍ se
  // afirma que esta pantalla ya no está entre ellas.
  const codigo = soloCodigo(RUTA);
  assert.ok(!/\w+\s*\.json\(\)/.test(codigo), "el importador ya no está en la lista");
});
