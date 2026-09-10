// Candados de la resolución del SHA desplegado.
//
// Lo que se defiende acá es una sola cosa y viene de un caso real: **el chequeo
// de migraciones no puede depender de estar AFUERA del servidor.** El
// 2026-09-10 el despliegue se corrió desde el propio VPS, donde el alias ssh
// `vps-erp` no resuelve, y el modo automático salía con 2 sin poder mirar nada.
//
// Las dos lecturas —local y remota— se inyectan, así que los tres entornos se
// ejercen sin Docker y sin ssh. Y en el caso del VPS no alcanza con comprobar
// que el origen sea "local": se afirma además que la vía remota **no se llamó**,
// que es la mitad que el origen no prueba.
//
// Correr con: node --test lib/deploy/shaDesplegado.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolverShaDesplegado,
  shaDeLaEtiqueta,
  repositorioDeLaEtiqueta,
  ShaIndeterminado,
  IMAGEN_PRODUCCION,
  CONTENEDOR_APP,
  ALIAS_VPS,
} from "./shaDesplegado.mjs";

const SHA = "f63c092869715573381690d914cd51b21487873e";
const OTRO = "edad85fba53620555b6b74f7906fd3ff2eb9c449";
const ETIQUETA = `${IMAGEN_PRODUCCION}:${SHA}`;

/** Un lector que anota si lo llamaron, para poder afirmar que NO lo llamaron. */
function lector(resultado) {
  const espia = () => {
    espia.llamadas++;
    if (resultado instanceof Error) throw resultado;
    return resultado;
  };
  espia.llamadas = 0;
  return espia;
}

const sinDocker = () =>
  new Error("Cannot connect to the Docker daemon at unix:///var/run/docker.sock");
const sinAlias = () => new Error("ssh: Could not resolve hostname vps-erp: Name or service not known");
const sinSsh = () => new Error("spawnSync ssh ENOENT");

// ---------------------------------------------------------------------------
// 1 · Con Docker local, el SHA sale de acá y no se sale a la red
// ---------------------------------------------------------------------------

test("con el contenedor visible desde acá, el SHA sale de la lectura LOCAL", () => {
  const local = lector(ETIQUETA);
  const remoto = lector(new Error("no tendría que haberse llamado"));

  const r = resolverShaDesplegado({ leerLocal: local, leerRemoto: remoto });

  assert.equal(r.sha, SHA);
  assert.equal(r.origen, "local");
  assert.equal(local.llamadas, 1);
  assert.equal(remoto.llamadas, 0, "no hay motivo para salir a la red teniendo el dato acá");
});

test("la evidencia dice CON QUÉ se estableció, no solo cuál es", () => {
  const r = resolverShaDesplegado({ leerLocal: lector(ETIQUETA), leerRemoto: lector(ETIQUETA) });

  // Un informe que dice "el SHA es tal" y no dice de dónde salió obliga a
  // confiar. La evidencia es lo que lo vuelve verificable por otro.
  assert.match(r.evidencia.como, /docker inspect/);
  assert.match(r.evidencia.como, new RegExp(CONTENEDOR_APP));
  assert.equal(r.evidencia.etiqueta, ETIQUETA);
  assert.equal(r.evidencia.contenedor, CONTENEDOR_APP);
});

// ---------------------------------------------------------------------------
// 2 · Sin Docker local, se usa la vía remota — que es la de siempre
// ---------------------------------------------------------------------------

test("sin contenedor visible acá, el SHA se pide por ssh", () => {
  const local = lector(sinDocker());
  const remoto = lector(ETIQUETA);

  const r = resolverShaDesplegado({ leerLocal: local, leerRemoto: remoto });

  assert.equal(r.sha, SHA);
  assert.equal(r.origen, "remoto");
  assert.equal(local.llamadas, 1);
  assert.equal(remoto.llamadas, 1);
  assert.match(r.evidencia.como, new RegExp(`ssh ${ALIAS_VPS}`));
  assert.equal(r.evidencia.alias, ALIAS_VPS);
});

test("una máquina de desarrollo sin el contenedor tampoco es un error", () => {
  // `docker inspect` de un contenedor que no existe falla con este texto. Es el
  // caso normal de la notebook, y tiene que caer al camino remoto sin ruido.
  const local = lector(new Error(`Error: No such object: ${CONTENEDOR_APP}`));
  const r = resolverShaDesplegado({ leerLocal: local, leerRemoto: lector(ETIQUETA) });
  assert.equal(r.origen, "remoto");
});

// ---------------------------------------------------------------------------
// 3 y 8 · EL CASO QUE FALLÓ: adentro del VPS, sin alias ssh
// ---------------------------------------------------------------------------

test("DENTRO DEL VPS, SIN ALIAS SSH, RESUELVE IGUAL Y NUNCA INTENTA SSH", () => {
  // Ésta es la simulación exacta del 2026-09-10:
  //   · el proceso corre dentro del servidor;
  //   · Docker está disponible localmente;
  //   · el alias `vps-erp` no existe;
  //   · el contenedor que atiende tiene un SHA conocido.
  //
  // Antes de este arreglo, el único camino automático era el remoto y esto
  // salía con 2 — o sea que la guardia habría denegado TODOS los despliegues
  // hechos desde el propio servidor.
  const local = lector(ETIQUETA);
  const remoto = lector(sinAlias());

  const r = resolverShaDesplegado({ leerLocal: local, leerRemoto: remoto });

  assert.equal(r.sha, SHA);
  assert.equal(r.origen, "local");
  assert.equal(
    remoto.llamadas,
    0,
    "no basta con que resuelva: no tiene que intentar ssh cuando el dato está acá"
  );
});

test("y tampoco depende de que ssh exista como programa", () => {
  const remoto = lector(sinSsh());
  const r = resolverShaDesplegado({ leerLocal: lector(ETIQUETA), leerRemoto: remoto });
  assert.equal(r.origen, "local");
  assert.equal(remoto.llamadas, 0);
});

// ---------------------------------------------------------------------------
// 8 · Si ninguna fuente sirve, el error dice qué se intentó y qué hacer
// ---------------------------------------------------------------------------

test("SIN NINGUNA FUENTE, FALLA CERRADO Y EL ERROR ES ACCIONABLE", () => {
  let e;
  try {
    resolverShaDesplegado({ leerLocal: lector(sinDocker()), leerRemoto: lector(sinAlias()) });
    assert.fail("tenía que lanzar");
  } catch (err) {
    e = err;
  }

  assert.ok(e instanceof ShaIndeterminado, "el tipo es el que el clasificador traduce a exit 2");
  // Los dos intentos, con su motivo: sin esto el que lee no sabe si el problema
  // es Docker, el alias, la llave o el contenedor.
  assert.match(e.message, /docker inspect/);
  assert.match(e.message, /Cannot connect to the Docker daemon/);
  assert.match(e.message, new RegExp(`ssh ${ALIAS_VPS}`));
  assert.match(e.message, /Could not resolve hostname/);
  // Y la salida explícita, que es lo que convierte un error en algo que se puede
  // resolver sin venir a leer el código.
  assert.match(e.message, /--desde <SHA_QUE_ESTÁ_ATENDIENDO>/);
});

// ---------------------------------------------------------------------------
// La lectura local tiene que ser CONFIABLE, no solo posible
// ---------------------------------------------------------------------------

test("UN CONTENEDOR CON EL MISMO NOMBRE PERO OTRA IMAGEN NO SIRVE COMO BASE", () => {
  // El sondeo de capacidad es "¿veo el contenedor que atiende?". Sin exigir el
  // repositorio, cualquier contenedor llamado erpazul_app en una máquina de
  // desarrollo contestaría que sí y su SHA se tomaría como base del rango.
  assert.throws(
    () =>
      resolverShaDesplegado({
        leerLocal: lector(`registry.interna/otra/cosa:${SHA}`),
        leerRemoto: lector(ETIQUETA),
      }),
    /su imagen no es la de producción/
  );
});

test("y ese caso NO se disimula cayendo al camino remoto", () => {
  // Sería cómodo seguir de largo hacia ssh y devolver el SHA correcto. Sería
  // también tapar una máquina mal configurada con una respuesta buena, y el día
  // que el remoto tampoco esté, el diagnóstico va a apuntar al lugar equivocado.
  const remoto = lector(ETIQUETA);
  assert.throws(
    () => resolverShaDesplegado({ leerLocal: lector(`otra/cosa:${SHA}`), leerRemoto: remoto }),
    ShaIndeterminado
  );
  assert.equal(remoto.llamadas, 0);
});

test("con imagenEsperada en null se acepta cualquier repositorio", () => {
  // El escape existe para los candados y para un registry que cambie, no para
  // el uso normal: el default es el repositorio de producción.
  const r = resolverShaDesplegado({
    leerLocal: lector(`otra/cosa:${SHA}`),
    leerRemoto: lector(ETIQUETA),
    imagenEsperada: null,
  });
  assert.equal(r.origen, "local");
  assert.equal(r.sha, SHA);
});

// ---------------------------------------------------------------------------
// Las dos piezas puras que sostienen todo lo de arriba
// ---------------------------------------------------------------------------

test("de una etiqueta con SHA completo sale el SHA, en minúsculas y sin saltos", () => {
  assert.equal(shaDeLaEtiqueta(ETIQUETA), SHA);
  assert.equal(shaDeLaEtiqueta(`  ghcr.io/x/y:${OTRO.toUpperCase()}\n`), OTRO);
});

test("UNA ETIQUETA MÓVIL NO SIRVE COMO BASE", () => {
  // Misma razón por la que producción despliega solo por SHA completo: `latest`
  // apunta a lo último que se construyó y mañana señala otra cosa.
  for (const mala of [
    `${IMAGEN_PRODUCCION}:latest`,
    "erpazul-app:latest",
    "ghcr.io/x/y:e93b9eb",
    "ghcr.io/x/y",
    "",
    null,
    undefined,
  ]) {
    assert.throws(() => shaDeLaEtiqueta(mala), /no está etiquetada con un SHA de 40/, String(mala));
  }
});

test("el repositorio de una etiqueta se lee sin confundirse con el puerto", () => {
  assert.equal(repositorioDeLaEtiqueta(ETIQUETA), IMAGEN_PRODUCCION);
  assert.equal(repositorioDeLaEtiqueta("registry:5000/x/y:abc"), "registry:5000/x/y");
  assert.equal(repositorioDeLaEtiqueta("sinetiqueta"), "");
});

test("el repositorio de producción es el que el despliegue fija por SHA", () => {
  // Si alguien lo cambia sin cambiar el compose, la lectura local va a rechazar
  // el contenedor de verdad y el despliegue se va a frenar sin motivo.
  assert.equal(IMAGEN_PRODUCCION, "ghcr.io/islaemanuel25-glitch/erpmanual");
});
