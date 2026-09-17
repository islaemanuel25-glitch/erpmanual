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

// `clavesDelLiteral` vivía acá y leía el literal `erp` de la pantalla vieja del
// detalle. Se fue con ella: era su único uso.

// ── EL CONTRATO DEL CANDIDATO ───────────────────────────────────────────────

// Los dos endpoints que arman candidatos le agregan estos campos ENCIMA de lo
// que devuelve `presentarCandidato`. No están copiados a mano de un lado: el
// candado exige que sigan apareciendo en la ruta, así que borrarlos allá lo
// pone en rojo acá.
const EXTRAS_DE_RUTA = {
  "app/api/proveedores/listas/[id]/filas/[filaId]/candidatos/route.js": ["parecido", "sugerido"],
};

/** Quién lee candidatos, y con qué variable los lee. */
// ── ERA UNA LISTA DE DOS Y QUEDÓ UNO ────────────────────────────────────────
//
// `PanelDecision.jsx` se borró con la pantalla vieja del detalle. No se le
// cambió el fixture al candado ni se lo dejó nombrando un archivo que no
// existe: se sacó el lector que se fue y quedó el que sigue vivo.
//
// Con él se fue también el literal `erp` —lo armaba esa pantalla— y el segundo
// candado de este archivo, que afirmaba sobre ese literal. Un candado cuyo
// sujeto deja de existir no se arregla, se borra: mantenerlo apuntando a otro
// archivo habría sido inventarle un objeto para seguir en verde.
const LECTORES_DE_CANDIDATO = [
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

// ── EL CONTRATO DEL LADO ERP SE FUE CON SU PANTALLA ─────────────────────────
//
// Acá había un segundo candado: afirmaba que todo campo que `PanelDecision`
// leía de `erp` lo escribía la pantalla vieja del detalle. Las dos puntas se
// borraron —el panel y la pantalla— así que no quedó nada que afirmar.
//
// Se anota en vez de borrarlo callado porque el defecto que atajaba es real y
// vuelve si alguien arma otra tabla de comparación: un literal escrito en una
// pantalla y leído en un componente, donde un campo mal escrito no rompe nada y
// dibuja una raya. Si eso vuelve, el candado se vuelve a escribir sobre las dos
// puntas nuevas.
