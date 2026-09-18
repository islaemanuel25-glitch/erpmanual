// UNA LISTA SUBIDA PARA CONTROLAR NO ESCRIBE NINGÚN COSTO.
//
// ── POR QUÉ ES UN CANDADO Y NO UN COMENTARIO ───────────────────────────────
//
// Porque es la única promesa que la pantalla le hace al usuario con todas las
// letras: "no se cambió ningún precio". Si eso deja de ser cierto, no hay
// síntoma — los costos quedan escritos y la pantalla sigue diciendo que no tocó
// nada. Es la clase de defecto que se descubre semanas después mirando un
// margen raro, y para entonces nadie puede reconstruir qué lista lo escribió.
//
// ── QUÉ SE AFIRMA, EN DOS NIVELES ─────────────────────────────────────────
//
// 1. `revalidarFila` —la función que decide si una fila se escribe— corta por
//    modo antes que por cualquier otra cosa. Ahí está la garantía: la ruta que
//    aplica hoy es una, y mañana puede haber otra.
// 2. El corte es LO PRIMERO. Una fila de control que además tuviera otro
//    problema tiene que informar que la lista es de control, no el otro
//    problema: si el veredicto dependiera del orden de los `if`, el motivo que
//    ve el usuario cambiaría con cada refactor.
//
// ── Y UNA TERCERA, QUE ES LA QUE MÁS CUESTA VER ───────────────────────────
//
// Que la ruta que aplica TRAIGA el campo `modo` en su `select`. Sin él,
// `modoDeImportacion` lee `undefined`, contesta ACTUALIZAR —que es el default
// correcto para las importaciones viejas, así que no falla ni avisa— y el corte
// no se dispara nunca. El candado quedaría verde afirmando sobre un dato que el
// endpoint no manda, que es el defecto que este repo ya pisó tres veces.
//
//   node --experimental-loader ./scripts/alias-loader.mjs --test lib/proveedores/listas/controlNoEscribe.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { MOTIVO_OMISION, revalidarFila, textoOmision } from "./aplicacion.js";
import { MODO_LISTA } from "./modoDeLaLista.js";
import { ESTADO_LINEA } from "./estados.js";

const RAIZ = path.resolve(import.meta.dirname, "../../..");
const RUTA_APLICAR = "app/api/proveedores/listas/[id]/aplicar/route.js";

const sinComentarios = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/**
 * Una fila QUE SE APLICARÍA. Es lo que hace que el candado afirme algo.
 *
 * La forma sale de lo que persiste la conciliación, no de lo que parecería
 * razonable: estado LISTO_PARA_ACTUALIZAR, sin aplicar, con precio creíble y un
 * producto vivo que se puede tocar. Si el fixture no fuera aplicable, el `no()`
 * saldría por otro motivo y el candado estaría verde sin probar nada.
 */
function filaAplicable() {
  return {
    id: 1,
    aplicada: false,
    estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
    productoBaseId: 7,
    // EL PRECIO Y LA PROPUESTA TIENEN QUE CERRAR ENTRE SÍ. `revalidarFila`
    // recalcula el costo y lo compara contra `costoMaestroPropuesto`: si no dan
    // lo mismo omite por PROPUESTA_DIFERENTE —"no se aplica un número que nadie
    // aprobó"— y la fila no llegaría nunca al corte por modo. Con recargo 0 y
    // esta config, el costo recalculado es el precio tal cual.
    //
    // Y contra el costo de hoy da +15 %, que cae en el 10 a 20 de la cabecera:
    // ni SIN_CAMBIO ni fuera de rango.
    precioConIva: 1150,
    unidadProveedor: "UN",
    unidadesPorBulto: null,
    costoMaestroPropuesto: 1150,
    aumentoEsperadoMinPct: null,
    aumentoEsperadoMaxPct: null,
  };
}

function productoVivo() {
  return {
    id: 7,
    nombre: "MOGUL CONITOS",
    es_combo: false,
    creadoEnLocalId: 1,
    // Forma real del dato: desde que `revalidarFila` rechaza los productos
    // dados de baja, el endpoint selecciona estos dos campos. Un fixture sin
    // ellos probaría una combinación que la base nunca manda.
    activo: true,
    locales: [{ activo: true }],
    precio_costo: 1000,
    precio_venta: 2000,
    margen: 50,
    redondeo_100: false,
    unidad_medida: "UNIDAD",
    factor_pack: null,
    modoCompraProveedor: null,
  };
}

const CONFIG = {
  pisoPrecioCreible: 0,
  unidadesAdmitidas: [],
  resolverCostoMaestro: ({ precioConRecargo }) => ({
    motivo: null,
    costoMaestro: precioConRecargo,
    factorAplicado: 1,
  }),
};

const contexto = (modo) => ({
  operandoEnLocalId: 1,
  depositoLocalId: 1,
  cabecera: {
    aumentoEsperadoMinPct: 10,
    aumentoEsperadoMaxPct: 20,
    ...(modo === undefined ? {} : { modo }),
  },
});

test("EL FIXTURE SE APLICA DE VERDAD: sin esto el candado no afirma nada", () => {
  // CONTRA EL CANDADO INALCANZABLE. Si esta fila no fuera aplicable en modo
  // ACTUALIZAR, la de abajo tampoco lo sería en CONTROLAR y el candado daría
  // verde sin que el corte por modo existiera.
  const r = revalidarFila({
    fila: filaAplicable(),
    base: productoVivo(),
    contexto: contexto(MODO_LISTA.ACTUALIZAR),
    config: CONFIG,
    recargoPct: 0,
  });
  assert.equal(r.aplicable, true, `la fila de prueba no se aplica ni actualizando: ${r.motivo}`);
});

test("CONTROLANDO, LA MISMA FILA NO SE APLICA", () => {
  const r = revalidarFila({
    fila: filaAplicable(),
    base: productoVivo(),
    contexto: contexto(MODO_LISTA.CONTROLAR),
    config: CONFIG,
    recargoPct: 0,
  });
  assert.equal(r.aplicable, false);
  assert.equal(r.motivo, MOTIVO_OMISION.LISTA_DE_CONTROL);
  assert.equal(r.costoNuevo, null, "controlando no se propone un costo para escribir");
});

test("el corte por modo va PRIMERO: no lo tapa ningún otro problema", () => {
  // Una fila de control que además ya estaba aplicada, o cuyo producto no
  // existe, tiene que decir que la lista es de control. El motivo que ve el
  // usuario no puede depender del orden de los `if`.
  const yaAplicada = { ...filaAplicable(), aplicada: true };
  const r1 = revalidarFila({
    fila: yaAplicada,
    base: productoVivo(),
    contexto: contexto(MODO_LISTA.CONTROLAR),
    config: CONFIG,
    recargoPct: 0,
  });
  assert.equal(r1.motivo, MOTIVO_OMISION.LISTA_DE_CONTROL);

  const r2 = revalidarFila({
    fila: filaAplicable(),
    base: null,
    contexto: contexto(MODO_LISTA.CONTROLAR),
    config: CONFIG,
    recargoPct: 0,
  });
  assert.equal(r2.motivo, MOTIVO_OMISION.LISTA_DE_CONTROL);
});

test("una importación vieja, sin la columna, sigue aplicando", () => {
  // El default no puede bloquear el histórico: las 4.748 filas que ya están no
  // tienen `modo` y todas son de actualizar.
  const r = revalidarFila({
    fila: filaAplicable(),
    base: productoVivo(),
    contexto: contexto(undefined),
    config: CONFIG,
    recargoPct: 0,
  });
  assert.equal(r.aplicable, true, `una importación sin modo dejó de aplicar: ${r.motivo}`);
});

test("el motivo dice qué pasó Y qué hacer", () => {
  const texto = textoOmision(MOTIVO_OMISION.LISTA_DE_CONTROL);
  assert.match(texto, /controlar/i, "no nombra lo que pasó");
  assert.match(texto, /Pasar a actualizar precios/, "no dice cuál es el próximo paso");
});

/**
 * TODOS los `findFirst` de la importación en la ruta que aplica.
 *
 * ── POR QUÉ TODOS Y NO EL PRIMERO, Y ES EL ERROR QUE ESTE CANDADO YA COMETIÓ ──
 *
 * Escrito con `match` a secas, esto leía SOLO el primer bloque. La ruta tiene
 * dos handlers —el GET de la previa y el POST que escribe— cada uno con su
 * propia consulta y su propio `select`. El campo se había agregado al del GET,
 * el candado encontró ese y dio verde, y el POST —el único que toca
 * ProductoBase— seguía sin pedirlo: el corte por modo no se disparaba
 * justamente en la mitad que escribe.
 *
 * Es la forma exacta que CLAUDE.md describe: un candado montado sobre algo que
 * no es lo que uno cree que mira, verde para siempre y cubriendo nada.
 */
function selectsDeLaImportacion(fuente) {
  return [...fuente.matchAll(/importacionListaProveedor\.findFirst\(\{[\s\S]*?\n {4}\}\)/g)].map(
    (m) => m[0]
  );
}

test("LOS DOS HANDLERS QUE APLICAN TRAEN `modo` EN SU SELECT", () => {
  // Sin el campo, `modoDeImportacion` contesta ACTUALIZAR y los candados de
  // arriba siguen verdes mientras una lista de control escribe costos. Es la
  // única mitad de esto que no se puede afirmar llamando a una función pura.
  const fuente = sinComentarios(fs.readFileSync(path.join(RAIZ, RUTA_APLICAR), "utf8"));
  const selects = selectsDeLaImportacion(fuente);

  // CONTRA LA ENUMERACIÓN CORTA: la ruta tiene GET y POST, y los dos consultan.
  // Si mañana queda uno solo, esto se pone rojo y hay que mirar por qué.
  assert.equal(
    selects.length,
    2,
    `${RUTA_APLICAR} tiene ${selects.length} consulta(s) de la importación; se esperaban 2 ` +
      "(la previa del GET y la del POST que escribe). Si cambió, revisá que todas pidan `modo`."
  );

  for (const [i, bloque] of selects.entries()) {
    assert.match(
      bloque,
      /\bmodo:\s*true\b/,
      `La consulta #${i + 1} de ${RUTA_APLICAR} no pide \`modo\`, así que el corte por ` +
        "modo no se puede disparar nunca en ese handler."
    );
  }
});

test("CONTRAPRUEBA: el lector encuentra los dos bloques y ve cuál no tiene el campo", () => {
  // Un `assert.match` sobre un texto mal recortado pasa en verde sobre
  // cualquier cosa. Acá se comprueba que el recorte encuentra LOS DOS bloques
  // —que es lo que falló— y que la ausencia del campo se detecta.
  const uno = (campos) =>
    "  const x = await prisma.importacionListaProveedor.findFirst({\n" +
    `      where: { id },\n      select: { ${campos} },\n    })\n`;
  const dos = uno("id: true, modo: true") + "\n// otra cosa\n" + uno("id: true");

  const bloques = selectsDeLaImportacion(dos);
  assert.equal(bloques.length, 2, "el lector tiene que encontrar los dos, no el primero");
  assert.match(bloques[0], /\bmodo:\s*true\b/);
  assert.doesNotMatch(bloques[1], /\bmodo:\s*true\b/);
});
