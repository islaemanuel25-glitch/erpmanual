// Candados de «vincular desde No vinieron y después poder contestar la lectura».
//
// ── EL DEFECTO, CON SUS NÚMEROS ────────────────────────────────────────────
//
// Emanuel, a 360, en producción: «No cambian» → «No vinieron» → "ALA POLVO LV
// ROPA DUAL 400 CON BICA" → «Buscarlo en la lista» → eligió el renglón 5514.
// Llegó a «Para revisar» con las dos lecturas calculadas y la de unidad marcada
// como la más probable, +7,2 %, $31.636,08. Tocó «Usar $31.636,08 y seguir» y no
// pasó nada: la pantalla se quedó donde estaba y arriba, fuera de la vista,
// decía "Solo se puede confirmar una fila que quedó por revisar".
//
// La causa: al vincular, el motor vuelve a conciliar la fila. Si el costo cae
// DENTRO del rango del proveedor, la fila queda LISTO_PARA_ACTUALIZAR y no
// FACTOR_DUDOSO — y la puerta de confirmar solo aceptaba FACTOR_DUDOSO o una
// fila con confirmación de persona vigente. Una fila recién vinculada no tiene
// ninguna de las dos: `filaParaElMotor` le limpia la confirmación a propósito.
//
// NO ERA UN PROBLEMA DE «No vinieron». Reproducido también en la fila 16649 de
// la importación 22, que nadie vinculó nunca: mismo 409. Es cualquier fila que
// el motor haya resuelto solo, incluidas las que abre «Ver cómo se leyó y
// cambiarlo» desde la lista de los que se actualizan.
//
// ── DE DÓNDE SALEN LOS FIXTURES ────────────────────────────────────────────
//
// La fila NO se escribe a mano. Se produce con la MISMA cadena que corre el
// endpoint `en-la-lista`: `filaParaElMotor` → `conciliarFila` → `filaAPersistir`,
// más el `vinculadoEn` que la ruta agrega. Si mañana esa cadena deja de producir
// una fila LISTO_PARA_ACTUALIZAR sin confirmar, el candado de abajo lo dice en
// vez de quedarse verde probando una combinación que ya no ocurre.
//
// Verificado además contra Postgres —erpazul_al, importación 22 de M Y F— y
// recorriendo la pantalla a 360. Lo medido está en el cuerpo del commit.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/confirmarTrasVincular.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { conciliarFila, indexarCodigosProveedor, indexarCodigosBarra } from "./conciliarLista.js";
import { filaAPersistir } from "./persistencia.js";
import { resolverParserPorId } from "./registro.js";
import { ESTADO_LINEA } from "./estados.js";
import {
  filaParaElMotor,
  productoParaElMotor,
  motorParaEstaLista,
} from "./vincularConUnaFila.js";
import {
  puedeConfirmarse,
  resultadoConfirmacion,
  MOTIVO_NO_CONFIRMABLE,
} from "./confirmarPresentacion.js";
import { confirmacionDeInterpretacionVigente } from "./vigenciaConfirmacion.js";

// Tres niveles: este archivo vive en lib/proveedores/listas/.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** La cabecera de la importación 22, con los valores que tiene en la base. */
const CABECERA = Object.freeze({
  id: 22,
  estado: "PARCIALMENTE_APLICADA",
  proveedorId: 2,
  parser: "GENERICO",
  recargoPct: 5,
  impuestoAdicionalPct: 0,
  modo: null,
  aumentoEsperadoMinPct: 2,
  aumentoEsperadoMaxPct: 15,
});

/** El renglón 4167 del archivo de M Y F, como lo trae `findFirst`. */
const RENGLON = Object.freeze({
  id: 17124,
  filaExcel: 458,
  hojaNombre: "Página 3",
  codigoCrudo: "4167",
  codigoNormalizado: "4167",
  codigoComparableSinCeros: null,
  codigoBarraProveedor: null,
  descripcionProveedor: "WIPES KIMBIES 30X48",
  unidadProveedor: "",
  unidadesPorBulto: null,
  precioConIva: 2053.53,
  precioSinIva: null,
  categoriaCruda: null,
});

/** El producto del catálogo, con el `select` que usan las dos rutas. */
const PRODUCTO = Object.freeze({
  id: 1358,
  nombre: "PRODUCTO SIN LISTA 2 M Y F",
  precio_costo: 2000,
  factor_pack: 1,
  unidad_medida: "UN",
  modoCompraProveedor: null,
  pesoReferenciaKg: null,
  creadoEnLocalId: 1,
  es_combo: false,
});

/**
 * LO QUE `en-la-lista` LE DEJA A LA BASE, producido por la misma cadena.
 *
 * `lecturasPosibles` es lo que hace que un proveedor GENÉRICO —sin columna de
 * unidad comercial— tenga lecturas. Sin él, `hipotesisDeCosto` devuelve una lista
 * vacía y el candado probaría otra cosa. Sale del parser, no de la cabeza.
 */
function filaReciénVinculada({ ahora = new Date("2026-09-18T12:46:49Z") } = {}) {
  const reg = resolverParserPorId(CABECERA.parser);
  assert.ok(reg.ok, "el parser GENERICO tiene que existir");

  const { config, contexto } = motorParaEstaLista({
    cab: CABECERA,
    reg,
    grupoId: 1,
    operandoEnLocalId: 1,
    // Es lo que devuelve `getDepositoIdDeGrupo` en este grupo: no hay depósito
    // asignado. Inventar uno cambiaría quién es el dueño del costo.
    depositoLocalId: null,
  });

  const recalculada = conciliarFila({
    fila: filaParaElMotor(RENGLON, { vinculadoEn: ahora }),
    indice: indexarCodigosProveedor([
      { id: 0, productoBaseId: PRODUCTO.id, codigoInterno: RENGLON.codigoNormalizado, activo: true },
    ]),
    indiceBarra: indexarCodigosBarra([]),
    productosPorId: new Map([[PRODUCTO.id, productoParaElMotor(PRODUCTO)]]),
    contexto,
    config,
  });

  return {
    id: RENGLON.id,
    ...filaAPersistir(recalculada),
    vinculadoEn: ahora,
    aplicada: false,
    excluidaManual: false,
    productoBaseId: PRODUCTO.id,
  };
}

/** La config del motor para esta lista, para pasarle a `resultadoConfirmacion`. */
function lecturasDelParser() {
  const reg = resolverParserPorId(CABECERA.parser);
  return reg.config?.lecturasPosibles ?? null;
}

// ===========================================================================
// 1. La forma que el defecto necesitaba: ¿sigue ocurriendo?
// ===========================================================================

test("vincular deja la fila LISTO_PARA_ACTUALIZAR y SIN confirmación de persona", () => {
  // ── ESTE CANDADO NO AFIRMA EL ARREGLO: AFIRMA QUE EL CASO EXISTE ─────────
  //
  // Es la pregunta que el CLAUDE.md manda hacerse de cada fixture —"¿la
  // condición que afirma puede ser verdadera?"— puesta como candado. Si la
  // cadena de vinculación dejara de producir esta combinación, los dos candados
  // de abajo seguirían verdes sin cubrir nada, y nadie se enteraría.
  const fila = filaReciénVinculada();

  assert.equal(fila.estado, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
  // `?? null` porque `filaAPersistir` directamente no manda la clave y Prisma
  // guarda la columna en null. Lo que importa es que no hay fecha, y la pregunta
  // que de verdad decidía la puerta vieja es la de abajo.
  assert.equal(fila.confirmadoEn ?? null, null);
  assert.equal(confirmacionDeInterpretacionVigente(fila), false);
  // Y el costo cae DENTRO del rango del proveedor, que es lo que la deja
  // "resuelta" en vez de dudosa: 2053,53 con 5 % de recargo sobre un costo de
  // 2000 da +7,8 %, y el rango es 2 a 15.
  assert.ok(Number(fila.diferenciaPct) > 2 && Number(fila.diferenciaPct) < 15);
});

test("con la regla vieja, esa misma fila se rechazaba", () => {
  // CONTRAPRUEBA DEL ARREGLO, escrita como la condición que se sacó. Si alguien
  // la vuelve a poner, este candado deja de tener sentido y el de abajo se pone
  // rojo; mientras tanto documenta, ejecutándola, que el rechazo era real.
  const fila = filaReciénVinculada();
  const reglaVieja =
    fila.estado === ESTADO_LINEA.FACTOR_DUDOSO || confirmacionDeInterpretacionVigente(fila);
  assert.equal(reglaVieja, false, "la regla vieja tiene que rechazar esta fila");
});

// ===========================================================================
// 2. El arreglo: se puede confirmar, y lo confirmado es el costo elegido
// ===========================================================================

test("una fila recién vinculada desde «No vinieron» se puede confirmar", () => {
  const fila = filaReciénVinculada();
  const r = puedeConfirmarse(fila, CABECERA, { lecturasPropias: Boolean(lecturasDelParser()) });
  assert.equal(r.ok, true, `rechazada con ${r.motivo}`);
});

test("confirmar esa lectura devuelve el costo elegido y la deja lista", () => {
  const fila = filaReciénVinculada();
  const r = resultadoConfirmacion({
    fila,
    base: PRODUCTO,
    clave: "MISMA_PRESENTACION",
    cantidadPresentacion: null,
    recargoPct: CABECERA.recargoPct,
    rango: { minPct: CABECERA.aumentoEsperadoMinPct, maxPct: CABECERA.aumentoEsperadoMaxPct },
    impuestoAdicionalPct: CABECERA.impuestoAdicionalPct,
    lecturasPosibles: lecturasDelParser(),
  });

  assert.equal(r.ok, true, `rechazada con ${r.motivo}`);
  assert.equal(r.estado, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
  assert.equal(r.multiplicador, 1);
  assert.equal(r.costoAnterior, 2000);
  // 2053,53 + 5 % = 2156,21. Es el número que la pantalla ofrece en el botón, y
  // el que la base guardó al recorrerlo de verdad.
  assert.equal(r.costoNuevo, 2156.21);
  assert.equal(r.fueraDeRango, false);
});

// ===========================================================================
// 3. La cola normal sigue andando
// ===========================================================================

test("una fila de la cola de siempre —FACTOR_DUDOSO— se sigue pudiendo confirmar", () => {
  // Que la puerta se haya abierto para un caso más no puede haber cerrado el que
  // ya funcionaba. Se arma con la MISMA cadena y se le pone el estado que el
  // motor le da cuando el costo NO cae en el rango.
  const fila = { ...filaReciénVinculada(), estado: ESTADO_LINEA.FACTOR_DUDOSO, motivo: "FUERA_DE_RANGO" };
  const r = puedeConfirmarse(fila, CABECERA, { lecturasPropias: Boolean(lecturasDelParser()) });
  assert.equal(r.ok, true, `rechazada con ${r.motivo}`);
});

test("y una aplicada sigue siendo intocable, venga de donde venga", () => {
  // El límite que el arreglo NO movió: ahí el costo ya está escrito en el
  // producto, y deshacerlo es otra herramienta.
  const fila = { ...filaReciénVinculada(), aplicada: true };
  const r = puedeConfirmarse(fila, CABECERA, { lecturasPropias: Boolean(lecturasDelParser()) });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_NO_CONFIRMABLE.FILA_APLICADA);
});

// ===========================================================================
// 4. LA PANTALLA NO SE QUEDA MUDA
// ===========================================================================
//
// Estos tres miran el fuente de `revisar/page.jsx`, SACANDO LOS COMENTARIOS
// antes de mirar. No es una precaución teórica: este archivo cuenta el defecto
// en prosa —nombra el cartel, el botón y el texto— y sin sacarlos un candado que
// busca "rechazo" encontraría la explicación y daría verde por ella.

const PANTALLA = path.join(
  RAIZ, "app", "modulos", "proveedores", "listas", "[id]", "revisar", "page.jsx"
);

const sinComentarios = (p) =>
  fs
    .readFileSync(p, "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

test("ninguna respuesta con error del servidor se descarta en silencio", () => {
  // Cada `if (!r.ok || !j?.ok)` tiene que terminar mostrando algo. Un `return`
  // pelado ahí es exactamente "el botón no hizo nada": la forma que ya dejó a
  // Emanuel mirando una pantalla intacta.
  const src = sinComentarios(PANTALLA);
  const ramas = src.match(/if \(!r\.ok \|\| !j\?\.ok\) \{[\s\S]{0,400}?\n {6}\}/g) ?? [];
  assert.ok(ramas.length >= 2, `esperaba las ramas de error y encontré ${ramas.length}`);
  for (const rama of ramas) {
    assert.match(
      rama,
      /setRechazo\(/,
      `una rama de error no muestra nada:\n${rama}`
    );
  }
});

test("el aviso del rechazo se dibuja PEGADO a los botones, no arriba de todo", () => {
  // Es la diferencia entre el cartel que ya existía y el que se ve. A 360, con
  // el nombre del producto, la tarjeta del costo y las lecturas en el medio,
  // arriba de todo queda fuera de la pantalla justo cuando el pulgar está abajo.
  //
  // Se afirma por POSICIÓN en el archivo: después de las tarjetas de lectura y
  // antes del botón principal. Medido en la pantalla de verdad quedaron 7 px
  // entre el aviso y el botón, los dos visibles sin scrollear.
  const src = sinComentarios(PANTALLA);
  const lecturas = src.indexOf("fila.lecturas.map");
  const avisoRechazo = src.indexOf("{rechazo && (");
  const botonPrincipal = src.indexOf("recomendada.textoBoton");

  assert.ok(lecturas > 0 && avisoRechazo > 0 && botonPrincipal > 0, "faltan las tres piezas");
  assert.ok(
    lecturas < avisoRechazo,
    "el aviso del rechazo quedó ANTES de las lecturas: vuelve a estar lejos del botón"
  );
  assert.ok(
    avisoRechazo < botonPrincipal,
    "el aviso del rechazo quedó DESPUÉS del botón principal"
  );
});

test("el botón que se tocó cambia cuando lo rechazaron", () => {
  // Un botón que vuelve a decir exactamente lo mismo es indistinguible de uno
  // que no registró el toque. Los dos botones que mandan algo al servidor tienen
  // que mirar el rechazo, y la tarjeta de la lectura también.
  const src = sinComentarios(PANTALLA);
  assert.match(src, /rechazo\?\.accion === recomendada\.clave/, "el botón principal no mira el rechazo");
  assert.match(src, /rechazo\?\.accion === ACCION_NO_LO_CAMBIO/, "«No lo cambio» no mira el rechazo");
  assert.match(src, /rechazada=\{rechazo\?\.accion === l\.clave\}/, "la tarjeta de la lectura no mira el rechazo");
});

test("el rechazo no sobrevive al producto sobre el que ocurrió", () => {
  // Si quedara, marcaría como rechazado un botón que nadie tocó todavía. Es el
  // mismo defecto que ya se arregló con el aviso de «no lo cambio».
  const src = sinComentarios(PANTALLA);
  assert.match(
    src,
    /useEffect\(\(\) => \{\s*setRechazo\(null\);\s*\}, \[fila\?\.id\]\)/,
    "nada limpia el rechazo al cambiar de fila"
  );
});
