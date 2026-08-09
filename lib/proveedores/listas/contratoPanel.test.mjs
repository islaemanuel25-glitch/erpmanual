// EL CANDADO DE LOS CAMPOS QUE NADIE ESCRIBE.
//
// Tres veces pasó lo mismo, y las tres se vieron en producción y no en un test:
//
//   1. `precioCostoActual` contra `precio_costo`. El candidato llegaba de tres
//      lados con tres grafías y `presentarCandidato` leía una sola: el costo
//      viajaba en null y la tarjeta perdía la variación, que es la evidencia que
//      delata cuál candidato es el correcto.
//   2. La fila cruda pasada a `formaDelPanel`, que espera campos ya mapeados.
//   3. `codigoProveedor` singular contra `codigosProveedor` plural. La celda de
//      código mostró una raya en los 317 productos que SÍ tienen código, durante
//      todo el tiempo que la pantalla estuvo desplegada.
//
// Ninguna rompe nada. `undefined` no tira, no compila mal y no pinta rojo: cae
// en el `?? null` de al lado y la pantalla dibuja una raya perfecta. Por eso
// hace falta un candado que MIRE, y no un test que ejercite.
//
// ── QUÉ AFIRMA ──────────────────────────────────────────────────────────────
//
// Que todo campo que un componente lee de un objeto de contrato —el candidato y
// el lado ERP— lo escribe alguien. La lista de escritores no está copiada acá:
// sale de ejecutar al productor —`presentarCandidato` es puro— y de leer el
// literal que arma la pantalla. Copiarla haría que el candado quedara verde
// contra su propia copia el día que el productor cambie.
//
// ── POR QUÉ MIRA EL TEXTO ───────────────────────────────────────────────────
//
// Porque el error vive en el componente, que no se puede ejecutar sin un DOM ni
// sin datos. Leer el texto es lo único que ve la lectura muerta antes de que la
// vea una persona. El precio es que un renombre de la variable local apagaría el
// candado en silencio, así que cada archivo declara con qué variable lee y el
// candado FALLA si esa variable ya no aparece: apagarlo tiene que costar tanto
// como romperlo.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { presentarCandidato } from "./vinculacion.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const leer = (rel) => readFileSync(join(RAIZ, rel), "utf8");

/** Fuera los comentarios: un campo nombrado en una explicación no es una lectura. */
function sinComentarios(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Los campos que `src` lee de `variable`: `variable.loQueSea`. */
function camposLeidos(src, variable) {
  const limpio = sinComentarios(src);
  const re = new RegExp(`\\b${variable}\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)`, "g");
  return new Set([...limpio.matchAll(re)].map((m) => m[1]));
}

/** Las claves de un literal `nombre: { ... }`, contando llaves. */
function clavesDelLiteral(src, nombre) {
  const inicio = src.indexOf(`${nombre}: {`);
  assert.notEqual(inicio, -1, `No se encontró el literal \`${nombre}: {\`. ¿Se renombró?`);
  let i = src.indexOf("{", inicio);
  let nivel = 0;
  let fin = i;
  for (; fin < src.length; fin++) {
    if (src[fin] === "{") nivel++;
    else if (src[fin] === "}") {
      nivel--;
      if (nivel === 0) break;
    }
  }
  const cuerpo = sinComentarios(src.slice(i + 1, fin));
  // Solo el primer nivel: una clave anidada no es del contrato.
  const claves = new Set();
  let prof = 0;
  for (const linea of cuerpo.split("\n")) {
    if (prof === 0) {
      const m = linea.match(/^\s*([A-Za-z_$][\w$]*)\s*:/);
      if (m) claves.add(m[1]);
    }
    for (const ch of linea) {
      if (ch === "{" || ch === "[" || ch === "(") prof++;
      else if (ch === "}" || ch === "]" || ch === ")") prof--;
    }
  }
  return claves;
}

// ── EL CONTRATO DEL CANDIDATO ───────────────────────────────────────────────

// Los dos endpoints que arman candidatos le agregan estos campos ENCIMA de lo
// que devuelve `presentarCandidato`. No están copiados a mano de un lado: el
// candado exige que sigan apareciendo en la ruta, así que borrarlos allá lo
// pone en rojo acá.
const EXTRAS_DE_RUTA = {
  "app/api/proveedores/listas/[id]/filas/[filaId]/candidatos/route.js": ["parecido", "sugerido"],
};

/** Quién lee candidatos, y con qué variable los lee. */
const LECTORES_DE_CANDIDATO = [
  { archivo: "components/proveedores/listas/PanelDecision.jsx", variable: "c" },
  { archivo: "components/proveedores/listas/PanelVincular.jsx", variable: "c" },
];

// Campos que el propio componente le agrega al candidato antes de leerlo. Es
// legítimo, pero tiene que estar declarado: si no, cualquier lectura muerta se
// tapa diciendo "esa la pone el componente".
const AGREGADOS_EN_EL_COMPONENTE = ["etiqueta"];

test("todo campo que un componente lee del candidato lo escribe alguien", () => {
  const escritos = new Set(Object.keys(presentarCandidato({}, {})));
  for (const [archivo, extras] of Object.entries(EXTRAS_DE_RUTA)) {
    const src = leer(archivo);
    for (const campo of extras) {
      assert.ok(
        new RegExp(`\\b${campo}\\s*:`).test(src),
        `${archivo} ya no escribe \`${campo}\`. O se renombró, o el candado quedó mirando un campo que no existe.`
      );
      escritos.add(campo);
    }
  }
  for (const campo of AGREGADOS_EN_EL_COMPONENTE) escritos.add(campo);

  // El lado ERP viaja por el mismo camino que los candidatos —la tabla de
  // comparación los recorre juntos— así que sus campos también valen.
  for (const campo of clavesDelLiteral(leer("app/modulos/proveedores/listas/[id]/page.jsx"), "erp")) {
    escritos.add(campo);
  }

  for (const { archivo, variable } of LECTORES_DE_CANDIDATO) {
    const src = leer(archivo);
    const leidos = camposLeidos(src, variable);
    assert.ok(
      leidos.size > 0,
      `${archivo} ya no lee nada de \`${variable}\`. Si se renombró la variable, hay que actualizar el candado: si no, dejó de mirar.`
    );
    const muertos = [...leidos].filter((campo) => !escritos.has(campo));
    assert.deepEqual(
      muertos,
      [],
      `${archivo} lee campos del candidato que ningún productor escribe: ${muertos.join(", ")}. ` +
        `Escritos hoy: ${[...escritos].sort().join(", ")}.`
    );
  }
});

// ── EL CONTRATO DEL LADO ERP ────────────────────────────────────────────────

test("todo campo que el panel lee del lado ERP lo escribe la pantalla", () => {
  const escritos = clavesDelLiteral(
    leer("app/modulos/proveedores/listas/[id]/page.jsx"),
    "erp"
  );
  const src = leer("components/proveedores/listas/PanelDecision.jsx");
  const leidos = camposLeidos(src, "erp");
  assert.ok(
    leidos.size > 0,
    "PanelDecision ya no lee nada de `erp`. Si se renombró la variable, hay que actualizar el candado."
  );
  const muertos = [...leidos].filter((campo) => !escritos.has(campo));
  assert.deepEqual(
    muertos,
    [],
    `PanelDecision lee campos del ERP que la pantalla no arma: ${muertos.join(", ")}. ` +
      `Escritos hoy: ${[...escritos].sort().join(", ")}.`
  );
});
