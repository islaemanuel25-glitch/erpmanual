// LO QUE SE DECIDE UNA VEZ NO SE VUELVE A PREGUNTAR.
//
// ── LA REGLA, EN LAS PALABRAS DE EMANUEL ───────────────────────────────────
//
// "Si ya le expliqué en una pasada, las 100 listas que vengan son iguales."
//
// Son TRES decisiones y hasta esta tanda solo una se recordaba:
//
//   qué producto de la lista corresponde  → `ProductoCodigoProveedor` (punto C)
//   cómo se lee el precio                 → `LecturaProductoProveedor` (ya estaba)
//   si lo deja igual                      → `ProductoQueNoSeCambia` (esta tanda)
//
// La tercera valía para UNA lista: excluía la fila y nada más, así que el mismo
// producto volvía a la cola todos los meses.
//
// ── LO QUE ESTE ARCHIVO AFIRMA, Y LO QUE NO ────────────────────────────────
//
// Afirma el camino de la MEMORIA a través del motor: que una decisión guardada
// llegue a la lista siguiente y saque ese producto de la cola sin preguntar. Eso
// se puede probar con funciones puras, pasándole al motor el mismo `Set` que la
// base le va a pasar.
//
// NO afirma que la escritura ocurra: eso es una consulta de Prisma y se ejerce
// contra Postgres, que es lo que hace el arnés de esta tanda.
//
//   node --experimental-loader ./scripts/alias-loader.mjs --test lib/proveedores/listas/loQueSeRecuerda.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { conciliarFila, indexarCodigosProveedor, indexarCodigosBarra } from "./conciliarLista.js";
import { filaAPersistir } from "./persistencia.js";
import { ESTADO_LINEA } from "./estados.js";

const PRODUCTO_ID = 77;

/**
 * Una fila como la deja el lector, con el precio ya en la columna elegida.
 *
 * Los valores salen de la forma que persiste la conciliación: código
 * normalizado, unidad comercial, y `precioConIva` como el campo del que sale el
 * costo. No es un fixture "razonable" escrito a mano — es el shape que
 * `filasDelArchivo` produce y que `conciliarFila` consume.
 */
const fila = () => ({
  filaExcel: 1,
  hojaNombre: "1",
  codigoCrudo: "1003",
  codigoNormalizado: "1003",
  codigoComparableSinCeros: "1003",
  codigoBarraProveedor: null,
  descripcionProveedor: "ALA LV VAJ CREMOSO FLORES BLANC 15X750ML",
  unidadProveedor: "UN",
  unidadesPorBulto: null,
  precioConIva: 2400,
  precioSinIva: null,
  categoriaCruda: null,
  confirmadoEn: null,
  vinculadoEn: null,
  aumentoEsperadoMinPct: null,
  aumentoEsperadoMaxPct: null,
});

const producto = () => ({
  productoBaseId: PRODUCTO_ID,
  nombre: "ALA LV VAJ CREMOSO",
  // Con costo 2.000 y precio 2.400, la variación es +20 %: adentro del rango de
  // abajo, así que la fila queda LISTA. Es lo que hace que el candado afirme
  // algo — sobre una fila que de todos modos no se aplicaría, la memoria no se
  // notaría.
  precioCostoActual: 2000,
  factorPack: null,
  unidadMedida: "unidad",
  modoCompraProveedor: null,
  pesoReferenciaKg: null,
  creadoEnLocalId: 1,
  esCombo: false,
  codigosBarra: [],
});

const CONFIG = {
  precioBase: "precioConIva",
  recargoPct: 0,
  impuestoAdicionalPct: null,
  umbralVariacionPct: 25,
  unidadesAdmitidas: [],
  pisoPrecioCreible: 0,
  resolverCostoMaestro: ({ precioConRecargo }) => ({
    motivo: null,
    costoMaestro: precioConRecargo,
    factorAplicado: 1,
  }),
};

function conciliar({ productosQueNoSeCambian = null } = {}) {
  return conciliarFila({
    fila: fila(),
    indice: indexarCodigosProveedor([
      { id: 1, productoBaseId: PRODUCTO_ID, codigoInterno: "1003", activo: true },
    ]),
    indiceBarra: indexarCodigosBarra([]),
    productosPorId: new Map([[PRODUCTO_ID, producto()]]),
    contexto: {
      grupoId: 1,
      proveedorId: 2,
      operandoEnLocalId: 1,
      depositoLocalId: 1,
      cabecera: { aumentoEsperadoMinPct: 10, aumentoEsperadoMaxPct: 25 },
      productosQueNoSeCambian,
    },
    config: CONFIG,
  });
}

test("SIN MEMORIA, LA FILA QUEDA LISTA Y MARCADA: es lo que hace que esto afirme algo", () => {
  // CONTRA EL CANDADO INALCANZABLE. Si esta fila no quedara lista y seleccionada
  // sin memoria, el candado de abajo pasaría igual y no estaría probando que la
  // memoria hace algo.
  const r = conciliar();
  assert.equal(r.estado, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, `quedó en ${r.estado}`);
  assert.equal(r.seleccionadaPorDefecto, true);
  assert.notEqual(r.excluidaManual, true);
});

test("LA DECISIÓN DE LA LISTA 1 SE APLICA EN LA LISTA 2, SIN PREGUNTAR", () => {
  // Es la regla entera: el producto se marcó "no lo cambio" en una pasada, y en
  // la lista siguiente ya no pide una decisión que está tomada.
  const r = conciliar({ productosQueNoSeCambian: new Set([PRODUCTO_ID]) });

  assert.equal(r.excluidaManual, true, "la memoria no llegó al motor");
  assert.equal(r.seleccionadaPorDefecto, false, "quedó marcada para aplicar igual");
});

test("LA MEMORIA NO PISA EL ESTADO, Y ESA ES LA REGLA 3 DEL PROYECTO", () => {
  // El veredicto del motor —"este costo se podría escribir"— sigue siendo cierto
  // y tiene que quedar escrito. Lo que la decisión de la persona cambia es que
  // NO se va a escribir.
  //
  // Pisar el estado perdería el motivo por el que la fila estaba así, y
  // desmarcar —que es reversible— no podría restaurarlo. Es exactamente lo que
  // le pasó a `ESTADO_LINEA.EXCLUIDO`, que está en el enum y nada lo escribe.
  const r = conciliar({ productosQueNoSeCambian: new Set([PRODUCTO_ID]) });
  assert.equal(
    r.estado,
    ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
    "la exclusión recordada pisó el estado en vez de convivir con él"
  );
  assert.ok(r.costoMaestroPropuesto > 0, "se perdió el costo que el motor había calculado");
});

test("OTRO PRODUCTO NO SE LLEVA LA DECISIÓN PUESTA", () => {
  // Con la memoria de OTRO producto, esta fila tiene que quedar como si no
  // hubiera memoria. Sin esto, un `Set` mal armado —o un `has` que contestara
  // que sí a todo— dejaría la lista entera excluida y el candado de arriba
  // seguiría verde.
  const r = conciliar({ productosQueNoSeCambian: new Set([PRODUCTO_ID + 1]) });
  assert.notEqual(r.excluidaManual, true);
  assert.equal(r.seleccionadaPorDefecto, true);
});

test("LA PERSISTENCIA SE LLEVA LA EXCLUSIÓN, Y ES EL PASO QUE SE PERDÍA", () => {
  // `conciliarFila` puede resolverlo perfecto y no servir de nada si el que
  // guarda no lo escribe. Es el hueco exacto que este proyecto ya pagó con el
  // código del proveedor que se leía y se tiraba al guardar: la lectura andaba,
  // la escritura no, y entre las dos no había nada en rojo.
  const conMemoria = filaAPersistir(conciliar({ productosQueNoSeCambian: new Set([PRODUCTO_ID]) }));
  assert.equal(conMemoria.excluidaManual, true, "la persistencia tiró la exclusión recordada");
  assert.equal(conMemoria.seleccionada, false);

  const sinMemoria = filaAPersistir(conciliar());
  assert.equal(sinMemoria.excluidaManual, false);
  assert.equal(sinMemoria.seleccionada, true);
});

test("un contexto sin la memoria no rompe: las importaciones viejas siguen andando", () => {
  // `productosQueNoSeCambian` es `undefined` en cualquier llamador que todavía
  // no lo pase —`vincular`, por ejemplo— y eso no puede tirar la conciliación de
  // una fila entera.
  for (const memoria of [undefined, null, new Set()]) {
    const r = conciliarFila({
      fila: fila(),
      indice: indexarCodigosProveedor([
        { id: 1, productoBaseId: PRODUCTO_ID, codigoInterno: "1003", activo: true },
      ]),
      indiceBarra: indexarCodigosBarra([]),
      productosPorId: new Map([[PRODUCTO_ID, producto()]]),
      contexto: {
        grupoId: 1, proveedorId: 2, operandoEnLocalId: 1, depositoLocalId: 1,
        cabecera: { aumentoEsperadoMinPct: 10, aumentoEsperadoMaxPct: 25 },
        ...(memoria === undefined ? {} : { productosQueNoSeCambian: memoria }),
      },
      config: CONFIG,
    });
    assert.equal(r.estado, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
    assert.notEqual(r.excluidaManual, true);
  }
});
