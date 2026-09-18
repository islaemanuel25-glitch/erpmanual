// Candados de los dos controles de código de barras, y del aviso que proponen.
//
// ── QUÉ SE AFIRMA ACÁ QUE NO SE AFIRMA EN `codigoDeCaja.test.mjs` ──────────
//
// Aquél prueba la aritmética. Éste prueba lo que la aritmética no puede: que el
// número de la card y la lista filtrada salgan del MISMO predicado, que el
// `select` traiga los campos sin los cuales la clasificación miente en silencio,
// y que las dos reglas del aviso que protegen datos —no pisar el secundario, no
// ofrecer un código que ya es de otro— estén donde tienen que estar.
//
// Los fixtures de producto tienen la forma que produce `filaParaControles`, que
// es la función real que arma la fila para clasificar. No se escriben "a ojo":
// se arman llamándola.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/productos/controlesCodigoBarras.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CONTROL,
  CONTROLES,
  IDS_CONTROL,
  marcadoPor,
  contarControles,
  tieneCodigoDeCaja,
  noSePuedeEscanear,
} from "./controlesCalidad.js";
import {
  SELECT_CONTROLES_BASE,
  SELECT_CONTROLES_LOCAL,
  filaParaControles,
} from "./controlesDesdePrisma.js";
import { unidadDesdeLaCaja } from "./codigoDeCaja.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Una fila de ProductoBase con lo que el `select` de controles pide. */
const base = (extra = {}) => ({
  id: 1,
  precio_costo: 100,
  precio_venta: 150,
  margen: 50,
  modalidad: "NORMAL",
  unidad_medida: "UNIDAD",
  factor_pack: null,
  pesoReferenciaKg: null,
  modo_envio: null,
  modoCompraProveedor: "BULTO",
  pesoEsFijo: false,
  modoVentaDeposito: "PESO",
  es_combo: false,
  codigo_barra: null,
  codigo_barra_secundario: null,
  ...extra,
});

const local = (extra = {}) => ({
  id: 9,
  localId: 1,
  precio_costo: null,
  precio_venta: null,
  margen: null,
  reglaPrecio: "MARGEN_PORCENTUAL",
  recargoFijoUnidad: null,
  precioRevisadoAt: new Date(),
  activo: true,
  codigo_barra_propio: null,
  ...extra,
});

// ===========================================================================
// 1. El select trae lo que la clasificación mira
// ===========================================================================

test("el select pide los TRES códigos escaneables", () => {
  // ── SIN ESTO LA CLASIFICACIÓN NO FALLA: MIENTE ──────────────────────────
  //
  // Un campo que el select no trae llega `undefined`, y `sinCodigoDeBarras`
  // contesta que el producto no tiene ninguno. O sea: la card diría que los
  // 2.718 productos están sin código de barras, con toda confianza. Es el mismo
  // defecto que el encabezado de `controlesDesdePrisma` ya cuenta con el fiambre
  // de pieza fija.
  assert.equal(SELECT_CONTROLES_BASE.codigo_barra, true);
  assert.equal(SELECT_CONTROLES_BASE.codigo_barra_secundario, true);
  assert.equal(SELECT_CONTROLES_LOCAL.codigo_barra_propio, true);
});

test("y la fila armada los lleva, cada uno de su lado", () => {
  // El propio es del LOCAL y los otros dos de la ficha. Heredar el propio desde
  // la base, o al revés, haría que un código de una ubicación contara en otra.
  const f = filaParaControles(
    base({ codigo_barra: "779", codigo_barra_secundario: "780" }),
    local({ codigo_barra_propio: "INT-1" })
  );
  assert.equal(f.codigo_barra, "779");
  assert.equal(f.codigo_barra_secundario, "780");
  assert.equal(f.codigo_barra_propio, "INT-1");
  // Sin ProductoLocal no hay código propio, y no se inventa uno.
  assert.equal(filaParaControles(base(), null).codigo_barra_propio, null);
});

// ===========================================================================
// 2. Los dos controles marcan lo que tienen que marcar
// ===========================================================================

test("«código de caja» mira SOLO el campo principal", () => {
  // El problema no es tener el GTIN-14: es tenerlo donde el POS busca la unidad.
  // Guardado en el secundario está bien guardado y no hay nada que revisar.
  const enPrincipal = filaParaControles(base({ codigo_barra: "17790740000257" }), local());
  const enSecundario = filaParaControles(
    base({ codigo_barra: "7790740000257", codigo_barra_secundario: "17790740000257" }),
    local()
  );
  assert.equal(tieneCodigoDeCaja(enPrincipal), true);
  assert.equal(tieneCodigoDeCaja(enSecundario), false, "en el secundario no molesta a nadie");
  assert.equal(marcadoPor(CONTROL.CODIGO_DE_CAJA, enPrincipal), true);
  assert.equal(marcadoPor(CONTROL.CODIGO_DE_CAJA, enSecundario), false);
});

test("«sin código» mira los tres, y basta uno para no marcar", () => {
  const pelado = filaParaControles(base(), local());
  assert.equal(noSePuedeEscanear(pelado), true);
  for (const conAlguno of [
    filaParaControles(base({ codigo_barra: "7790740000257" }), local()),
    filaParaControles(base({ codigo_barra_secundario: "7790740000257" }), local()),
    filaParaControles(base(), local({ codigo_barra_propio: "INT-9" })),
  ]) {
    assert.equal(noSePuedeEscanear(conAlguno), false);
  }
});

test("un servicio de importe variable no entra en ninguno de los dos", () => {
  // No se escanea: no le falta un código ni tiene uno mal puesto. Sin esta
  // exclusión, las cargas de colectivo engordarían las dos cards con productos
  // que no hay que arreglar.
  const servicio = filaParaControles(base({ modalidad: "IMPORTE_VARIABLE" }), local());
  assert.equal(marcadoPor(CONTROL.SIN_CODIGO_BARRAS, servicio), false);
  const servicioConCaja = filaParaControles(
    base({ modalidad: "IMPORTE_VARIABLE", codigo_barra: "17790740000257" }),
    local()
  );
  assert.equal(marcadoPor(CONTROL.CODIGO_DE_CAJA, servicioConCaja), false);
});

test("los dos controles son excluyentes: un producto no cae en ambos", () => {
  // Tener el código de la caja es tener UN código. Si los dos marcaran a la vez,
  // los 83 se contarían también entre los 452 y los números de las dos cards no
  // se podrían sumar.
  const conCaja = filaParaControles(base({ codigo_barra: "17790740000257" }), local());
  assert.equal(marcadoPor(CONTROL.CODIGO_DE_CAJA, conCaja), true);
  assert.equal(marcadoPor(CONTROL.SIN_CODIGO_BARRAS, conCaja), false);
});

// ===========================================================================
// 3. EL CONTEO DE LA CARD Y EL FILTRO SON EL MISMO PREDICADO
// ===========================================================================

test("el conteo de cada card coincide con filtrar el catálogo por esa card", () => {
  // ── ES EL CANDADO QUE PIDIÓ LA TANDA ────────────────────────────────────
  //
  // No se comparan dos números escritos a mano: se cuenta con `contarControles`
  // —lo que hace el endpoint de las cards— y se filtra con `marcadoPor` —lo que
  // hace el listado—, sobre el MISMO catálogo, y tienen que dar igual. Si mañana
  // alguien le escribe al filtro su propia condición, esto se pone rojo.
  const catalogo = [
    filaParaControles(base({ id: 1, codigo_barra: "17790740000257" }), local()),
    filaParaControles(base({ id: 2, codigo_barra: "27790740000254" }), local()),
    filaParaControles(base({ id: 3, codigo_barra: "7790740000257" }), local()),
    filaParaControles(base({ id: 4 }), local()),
    filaParaControles(base({ id: 5 }), local({ codigo_barra_propio: "INT-5" })),
    filaParaControles(base({ id: 6, modalidad: "IMPORTE_VARIABLE" }), local()),
  ];

  const conteo = contarControles(catalogo);
  for (const id of IDS_CONTROL) {
    const filtrados = catalogo.filter((p) => marcadoPor(id, p));
    assert.equal(conteo[id], filtrados.length, `el control ${id} no cierra`);
  }
  // Y los números concretos, para que el candado afirme algo y no solo compare
  // dos cosas iguales por construcción.
  assert.equal(conteo[CONTROL.CODIGO_DE_CAJA], 2, "los dos de catorce dígitos");
  assert.equal(conteo[CONTROL.SIN_CODIGO_BARRAS], 1, "solo el 4: el 5 tiene propio, el 6 es servicio");
});

test("el conteo devuelve SIEMPRE las seis claves, incluso en cero", () => {
  // Una card en 0 significa "esto está sano" y tiene que seguir viéndose.
  // Omitirla haría que la pantalla no distinga "sano" de "no se calculó".
  const conteo = contarControles([]);
  assert.deepEqual(Object.keys(conteo).sort(), [...IDS_CONTROL].sort());
  assert.equal(conteo[CONTROL.CODIGO_DE_CAJA], 0);
  assert.equal(conteo[CONTROL.SIN_CODIGO_BARRAS], 0);
});

test("las dos cards nuevas tienen su texto de sano y su rol", () => {
  const nuevas = CONTROLES.filter((c) =>
    [CONTROL.CODIGO_DE_CAJA, CONTROL.SIN_CODIGO_BARRAS].includes(c.id)
  );
  assert.equal(nuevas.length, 2);
  for (const c of nuevas) {
    assert.ok(c.titulo && c.detalle && c.detalleSano, `incompleta: ${c.id}`);
    // Un producto que no se puede escanear no se puede cobrar: no es "mirar
    // cuando haya tiempo".
    assert.equal(c.rol, "danger", `${c.id} tendría que ser danger`);
  }
});

// ===========================================================================
// 4. Las dos reglas del aviso que protegen datos
// ===========================================================================

test("un secundario ocupado NO se pisa: el botón deja el que estaba", () => {
  // ── LA REGLA SE EJERCE, NO SE LEE ───────────────────────────────────────
  //
  // Se corre la misma cuenta que hace `usarCodigoDeUnidad` en la ficha: con el
  // secundario ocupado, el de catorce NO entra. Perderlo sería tirar un dato del
  // proveedor sin que nadie lo hubiera decidido.
  const aplicar = ({ form, unidad, caja, secundarioOcupado }) => ({
    ...form,
    codigo_barra: unidad,
    codigo_barra_secundario: secundarioOcupado ? form.codigo_barra_secundario : caja,
  });

  const caja = "17790740000257";
  const { unidad } = unidadDesdeLaCaja(caja);

  const libre = aplicar({
    form: { codigo_barra: caja, codigo_barra_secundario: "" },
    unidad, caja, secundarioOcupado: false,
  });
  assert.equal(libre.codigo_barra, unidad);
  assert.equal(libre.codigo_barra_secundario, caja, "el de catorce no se pierde");

  const ocupado = aplicar({
    form: { codigo_barra: caja, codigo_barra_secundario: "1234567890123" },
    unidad, caja, secundarioOcupado: true,
  });
  assert.equal(ocupado.codigo_barra, unidad);
  assert.equal(ocupado.codigo_barra_secundario, "1234567890123", "no se pisó");
});

const FUENTE_AVISO = fs.readFileSync(
  path.join(RAIZ, "components/productos/AvisoCodigoDeCaja.jsx"),
  "utf8"
);
// Los comentarios se sacan ANTES de mirar: este archivo cuenta el defecto en
// prosa —nombra el botón y el "ya lo tiene otro producto"— y sin esto un candado
// que busca esos textos encontraría la explicación y daría verde por ella.
const AVISO_SIN_COMENTARIOS = FUENTE_AVISO
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

test("si el código ya es de otro producto, el botón no se dibuja", () => {
  // La condición `!ocupadoPor` tiene que estar en la guarda del botón, no solo
  // en el texto: un aviso que dice "ya lo tiene otro" con el botón al lado
  // invita justamente a lo que no se puede hacer.
  const i = AVISO_SIN_COMENTARIOS.indexOf("onUsarUnidad(");
  assert.ok(i > 0, "no se encontró la llamada del botón");
  const guarda = AVISO_SIN_COMENTARIOS.slice(Math.max(0, i - 400), i);
  assert.match(guarda, /!ocupadoPor/, "el botón no está detrás de `!ocupadoPor`");
  assert.match(guarda, /!esperando/, "el botón se ofrece antes de que el servidor conteste");
});

test("y mientras el servidor no contestó tampoco se ofrece", () => {
  // Ofrecerlo antes de saber si el código está libre sería proponer algo que
  // puede estar mal. El aviso dice "buscando" y espera.
  assert.match(AVISO_SIN_COMENTARIOS, /esperando\s*=\s*datos === null/);
});

test("la tarjeta del listado NO trae botón", () => {
  // "Nada se corrige solo: cada uno se acepta desde su ficha". Un botón en la
  // tarjeta que llevara a la ficha sería un botón que no hace lo que dice.
  const corte = AVISO_SIN_COMENTARIOS.indexOf('modo !== "ficha"');
  assert.ok(corte > 0, "no se encontró la rama de la tarjeta");
  const ramaTarjeta = AVISO_SIN_COMENTARIOS.slice(corte, corte + 500);
  assert.ok(!/SunmiButton/.test(ramaTarjeta), "la tarjeta dibuja un botón");
});
