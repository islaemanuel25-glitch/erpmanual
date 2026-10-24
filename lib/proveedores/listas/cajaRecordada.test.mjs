// «¿CUÁNTAS TRAE LA CAJA?» Y «¿ES ESTE?»: LO QUE LA TARJETA PREGUNTA, Y DÓNDE
// QUEDA LA RESPUESTA (Emanuel, 2026-10-24).
//
//   node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/cajaRecordada.test.mjs
//
// El caso de la caja es ALICANTE PIMENTÓN 25G de Dab: renglón "4233 · $ 800,45",
// hoy $ 19.680, y ni el catálogo ni el papel dicen cuántas trae. La respuesta
// se guarda como LECTURA RECORDADA de ese producto con ese proveedor, nunca en
// la ficha: el `factor_pack` es de ventas y de stock.
//
// Los datos tienen la forma de la base: la fila con los campos que la ruta del
// resultado y la de aplicar le piden, el producto con `CAMPOS_PRODUCTO` del
// motor, y la recordada con las tres columnas de `LecturaProductoProveedor`.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PREFIJO_CAJA,
  cantidadDeCajaValida,
  cantidadDeLaCaja,
  claveDeLaCaja,
  conLoRecordado,
  lecturaDeLaCaja,
} from "@/lib/proveedores/listas/cajaRecordada";
import { CONFIG_GENERICA } from "@/lib/proveedores/listas/configuraciones/generico";
import { revalidarFila } from "@/lib/proveedores/listas/aplicacion";
import { lecturasDeLaFila } from "@/lib/proveedores/listas/lecturasDeLaFila";
import {
  MIN_PARECIDO_SUGERENCIA,
  sugerenciaDeRenglon,
  sugerenciasDeRenglones,
} from "@/lib/proveedores/listas/vincularConUnaFila";
import { ESTADO_LINEA } from "@/lib/proveedores/listas/estados";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** ALICANTE PIMENTÓN 25G, del depósito, sin factor en el catálogo. */
function pimenton(extra = {}) {
  return {
    id: 9,
    nombre: "ALICANTE PIMENTÓN 25G",
    precio_costo: 19680,
    precio_venta: 25000,
    margen: 27,
    redondeo_100: false,
    es_combo: false,
    creadoEnLocalId: 1,
    activo: true,
    locales: [{ activo: true }],
    unidad_medida: "unidad",
    factor_pack: null,
    modoCompraProveedor: null,
    pesoReferenciaKg: null,
    ...extra,
  };
}

/** La recordada que guarda la ruta `caja` cuando contestan "24". */
const CAJA_DE_24 = { clave: "CAJA_DE_24", multiplicador: 24, cantidad: 24 };

/** El renglón 4233 de Dab. */
function renglon4233(extra = {}) {
  return {
    id: 4233, estado: ESTADO_LINEA.FACTOR_DUDOSO, motivo: null, costoAnterior: 19680, productoBaseId: 9,
    excluidaManual: false, aplicada: false, seleccionada: false, diferenciaPct: null,
    aumentoEsperadoMinPct: 0, aumentoEsperadoMaxPct: 12, confirmadoEn: null, vinculadoEn: null,
    multiplicadorConfirmado: null, fueraDeRangoAceptadaEn: null, costoMaestroPropuesto: null,
    codigoCrudo: "4233", codigoNormalizado: "4233", descripcionProveedor: "ALICANTE PIMENTON 25G",
    // Vacío y no "UN": el lector genérico no trae unidad comercial
    // (`importacionGenerica.js` la deja en null y `persistencia.js` la guarda
    // como ""). Con "UN" se ejercería la rama de Arcor, no la de Dab.
    precioConIva: 800.45, unidadesPorBulto: null, unidadProveedor: "",
    ...extra,
  };
}

const CAB = { estado: "CONCILIADA", recargoPct: 0, impuestoAdicionalPct: null, proveedor: { id: 1, nombre: "Dab", parserListaId: null } };
const RANGO = { minPct: 0, maxPct: 12 };

test("LA CAJA RECORDADA: clave CAJA_DE_n, de 2 a CANTIDAD_MAX, y solo una clave de caja cuenta como caja", () => {
  assert.equal(claveDeLaCaja(24), "CAJA_DE_24");
  assert.ok(claveDeLaCaja(24).startsWith(PREFIJO_CAJA));
  assert.equal(cantidadDeCajaValida(24), true);
  for (const malo of [1, 0, -3, 2.5, "x", null]) assert.equal(cantidadDeCajaValida(malo), false, String(malo));
  assert.equal(cantidadDeLaCaja(CAJA_DE_24), 24);
  // Una recordada de otra lectura (la caja entera que eligió alguien, "PACK_12")
  // NO es una respuesta a "¿cuántas trae?".
  assert.equal(cantidadDeLaCaja({ clave: "PACK_12", multiplicador: 12, cantidad: 12 }), null);
  assert.equal(cantidadDeLaCaja(null), null);
  assert.equal(conLoRecordado(pimenton(), CAJA_DE_24).cantidadDeLaCaja, 24);
  assert.equal(conLoRecordado(pimenton(), null).cantidadDeLaCaja, undefined);
  // La cuenta del pedido: $ 800,45 × 24 = $ 19.210,80.
  assert.equal(lecturaDeLaCaja({ precio: 800.45, n: 24 }).costoNuevo, 19210.8);
});

test("EL LECTOR GENÉRICO OFRECE CAJA_DE_24 SOLO CUANDO NADIE MÁS DICE CUÁNTAS", () => {
  const sin = lecturasDeLaFila({ fila: renglon4233(), producto: pimenton(), cab: CAB, rango: RANGO });
  assert.ok(!sin.lecturas.some((l) => l.clave.startsWith(PREFIJO_CAJA)), "ofrece una caja que nadie dijo");
  assert.equal(sin.admiteCaja, true);
  const con = lecturasDeLaFila({ fila: renglon4233(), producto: conLoRecordado(pimenton(), CAJA_DE_24), cab: CAB, rango: RANGO });
  const caja = con.lecturas.find((l) => l.clave === "CAJA_DE_24");
  assert.ok(caja, "no ofrece la caja recordada");
  assert.equal(caja.costoNuevo, 19210.8);
  // Si el archivo trae cuántas, manda el archivo: la recordada no se agrega.
  const conBulto = lecturasDeLaFila({
    fila: renglon4233({ unidadesPorBulto: 12 }),
    producto: conLoRecordado(pimenton(), CAJA_DE_24),
    cab: CAB,
    rango: RANGO,
  });
  assert.ok(!conBulto.lecturas.some((l) => l.clave === "CAJA_DE_24"), "la recordada pisó la cantidad del archivo");
});

/** La fila como queda después de «✓ Usar» sobre CAJA_DE_24 (`confirmar`). */
function confirmadaConCaja(extra = {}) {
  return renglon4233({
    estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
    seleccionada: true,
    multiplicadorConfirmado: 24,
    confirmadoEn: new Date("2026-10-24T10:00:00.000Z"),
    costoMaestroPropuesto: 19210.8,
    diferenciaPct: -2.38,
    fueraDeRangoAceptadaEn: new Date("2026-10-24T10:00:00.000Z"),
    ...extra,
  });
}
const CONTEXTO = { operandoEnLocalId: 1, depositoLocalId: 1, cabecera: { aumentoEsperadoMinPct: -100, aumentoEsperadoMaxPct: 100 } };

test("APLICAR ACEPTA × 24 SOLO CON LA CAJA RECORDADA Y SIN FACTOR EN EL CATÁLOGO", () => {
  const conCaja = conLoRecordado(pimenton(), CAJA_DE_24);
  const r = revalidarFila({ fila: confirmadaConCaja(), base: conCaja, contexto: CONTEXTO, config: CONFIG_GENERICA, recargoPct: 0 });
  assert.equal(r.aplicable, true, `motivo: ${r.motivo}`);
  assert.equal(r.costoNuevo, 19210.8);
  // Contrapruebas: sin la recordada, con un factor en el catálogo, con otra
  // cantidad, o con un lector que no la admite, el × 24 no pasa.
  const sinCaja = revalidarFila({ fila: confirmadaConCaja(), base: pimenton(), contexto: CONTEXTO, config: CONFIG_GENERICA, recargoPct: 0 });
  assert.notEqual(sinCaja.costoNuevo, 19210.8, "sin la recordada se aplicó el × 24");
  const conFactor = revalidarFila({
    fila: confirmadaConCaja(),
    base: conLoRecordado(pimenton({ factor_pack: 12, unidad_medida: "pack" }), CAJA_DE_24),
    contexto: CONTEXTO,
    config: CONFIG_GENERICA,
    recargoPct: 0,
  });
  assert.notEqual(conFactor.costoNuevo, 19210.8, "una caja recordada le ganó al factor del catálogo");
  const otra = revalidarFila({
    fila: confirmadaConCaja(),
    base: conLoRecordado(pimenton(), { clave: "CAJA_DE_12", multiplicador: 12, cantidad: 12 }),
    contexto: CONTEXTO,
    config: CONFIG_GENERICA,
    recargoPct: 0,
  });
  assert.notEqual(otra.costoNuevo, 19210.8);
  const sinAdmitir = revalidarFila({
    fila: confirmadaConCaja(),
    base: conCaja,
    contexto: CONTEXTO,
    config: { ...CONFIG_GENERICA, admiteCajaRecordada: false },
    recargoPct: 0,
  });
  assert.notEqual(sinAdmitir.costoNuevo, 19210.8);
});

test("LA RESPUESTA SE GUARDA EN LA LECTURA RECORDADA, NUNCA EN LA FICHA DEL PRODUCTO", () => {
  // La ruta se llamaba `caja`; con los kilos de la pieza (GRANIX) pasó a
  // `lectura-recordada`, que guarda las dos respuestas.
  const r = codigoDe("app/api/proveedores/listas/[id]/productos/[productoBaseId]/lectura-recordada/route.js");
  assert.match(r, /prisma\.lecturaProductoProveedor\.upsert\(/);
  assert.match(r, /clave: claveDeLaCaja\(cantidad\),\s*multiplicador: cantidad,\s*cantidad,/);
  assert.match(r, /lectura_unica_por_producto_y_proveedor: \{ grupoId, proveedorId: cab\.proveedorId, productoBaseId \}/);
  // Nada que escriba en el producto: ni update, ni factor_pack.
  assert.ok(!/productoBase\.(update|updateMany|upsert)\(/.test(r), "la ruta escribe en el producto");
  assert.ok(!r.includes("factor_pack"), "la ruta toca el factor del catálogo");
  // Y no confirma la fila: «✓ Usar» sigue decidiendo.
  assert.ok(!/importacionListaFila\.update/.test(r), "la ruta confirma la fila");
  // Con las guardas de las demás: permiso, lista propia y abierta, dueño del costo.
  assert.match(r, /requirePerm\(req, "proveedores\.listas"\)/);
  assert.match(r, /importacionDeProveedorPropioWhere\(/);
  assert.match(r, /esImportacionAbierta\(cab\.estado\)/);
  assert.match(r, /puedeEditarCosto\(/);
  // El deshacer: con null borra, con una lectura la vuelve a poner.
  assert.match(r, /if \(body\.restaurar === null\) \{\s*await prisma\.lecturaProductoProveedor\.deleteMany\(/);
  // La pantalla manda la cantidad a esta ruta.
  const p = codigoDe("app/modulos/proveedores/listas/[id]/page.jsx");
  assert.match(p, /\/productos\/\$\{item\.productoBaseId\}\/lectura-recordada`/);
  assert.match(p, /guardarLoQueFalta\(item, \{ cantidad \}/);
  assert.match(p, /onCaja=\{caja\}/);
  // La ruta vieja no quedó al lado.
  assert.ok(!fs.existsSync(path.join(RAIZ, "app/api/proveedores/listas/[id]/productos/[productoBaseId]/caja")), "volvió la ruta `caja`");
});

test("CADA LUGAR QUE ARMA EL PRODUCTO PARA EL MOTOR LE PONE LA CAJA RECORDADA", () => {
  // Si uno no la pusiera, ese camino vería la fila sin lectura: la tarjeta
  // mostraría la cuenta y aplicar la omitiría, o al revés.
  for (const ruta of [
    "app/api/proveedores/listas/[id]/aplicar/route.js",
    "app/api/proveedores/listas/[id]/resultado/route.js",
    "app/api/proveedores/listas/[id]/revisar/route.js",
    "app/api/proveedores/listas/[id]/releer-propuestas/route.js",
    "app/api/proveedores/listas/[id]/filas/[filaId]/confirmar/route.js",
  ]) {
    const c = codigoDe(ruta);
    assert.match(c, /cargarLecturasRecordadas\(/, `${ruta} no carga las recordadas`);
    assert.match(c, /conLoRecordado\(/, `${ruta} no le pone la caja al producto`);
  }
  assert.match(codigoDe("lib/proveedores/listas/eleccionDeLectura.js"), /conLoRecordado\(base, lecturaRecordada\)/);
});

// ── «¿ES ESTE?» ──────────────────────────────────────────────────────────

/** Un renglón con los campos que `sugerenciasParaLosSinVincular` le pide a la base. */
let proximo = 1;
function renglon(descripcionProveedor, extra = {}) {
  return {
    id: proximo++,
    codigoCrudo: String(100 + proximo),
    descripcionProveedor,
    unidadProveedor: "",
    unidadesPorBulto: null,
    precioConIva: 1000,
    productoBaseId: null,
    ...extra,
  };
}

test("LA SUGERENCIA ES EL QUE LA HOJA PONE PRIMERO, CON PARECIDO SUFICIENTE Y SIN EMPATE", () => {
  const biz = renglon("BIZCOCHITOS CAMPEON 300G", { codigoCrudo: "101" });
  const filas = [renglon("YERBA AGUANTADORA 1KG"), biz, renglon("GALLETITAS EXPRESS 3X100")];
  const s = sugerenciaDeRenglon({ filas, nombreDelProducto: "Bizcochitos Campeón 300 g", productoBaseId: 7 });
  assert.equal(s?.id, biz.id);
  assert.equal(s.codigo, "101");
  assert.ok(s.puntaje >= MIN_PARECIDO_SUGERENCIA);
  // Sin ninguno parecido, nada.
  assert.equal(sugerenciaDeRenglon({ filas: [renglon("YERBA AGUANTADORA 1KG")], nombreDelProducto: "Bizcochitos Campeón 300 g", productoBaseId: 7 }), null);
  // Dos igual de parecidos: no hay a cuál sugerir.
  const empate = [renglon("BIZCOCHITOS CAMPEON 300G"), renglon("BIZCOCHITOS CAMPEON 300G")];
  assert.equal(sugerenciaDeRenglon({ filas: empate, nombreDelProducto: "Bizcochitos Campeón 300 g", productoBaseId: 7 }), null);
  // Uno que ya es de otro producto no se sugiere.
  assert.equal(
    sugerenciaDeRenglon({ filas: [renglon("BIZCOCHITOS CAMPEON 300G", { productoBaseId: 99 })], nombreDelProducto: "Bizcochitos Campeón 300 g", productoBaseId: 7 }),
    null
  );
});

test("DE UNA VEZ PARA TODOS DA LO MISMO QUE DE A UNO: el atajo por palabra compartida no cambia ninguna sugerencia", () => {
  const filas = [
    renglon("BIZCOCHITOS CAMPEON 300G"),
    renglon("SOLITAS ANIMACION 400G"),
    renglon("ALICANTE PEREJIL 25G"),
    renglon("ALICANTE PIMENTON 25G", { productoBaseId: 9 }),
    renglon("YERBA AGUANTADORA 1KG"),
    renglon("GALL SOLITAS ANIM 400G"),
  ];
  const productos = [
    { id: 1, nombre: "Bizcochitos Campeón 300 g" },
    { id: 2, nombre: "Solitas Animación 400 g" },
    { id: 3, nombre: "ALICANTE PEREJIL 25G" },
    { id: 4, nombre: "Chocolate Águila 150 g" },
    { id: 5, nombre: "" },
  ];
  const deUnaVez = sugerenciasDeRenglones({ filas, productos });
  for (const p of productos) {
    const deAUno = sugerenciaDeRenglon({ filas, nombreDelProducto: p.nombre, productoBaseId: p.id });
    assert.equal(deUnaVez.get(p.id)?.id ?? null, deAUno?.id ?? null, p.nombre || "(sin nombre)");
  }
  // Y el caso ejerce las dos ramas: hay con sugerencia y sin.
  assert.ok(deUnaVez.size > 0 && deUnaVez.size < productos.length);
});

test("LA RUTA DEL RESULTADO SUGIERE SOLO CON LA LISTA ABIERTA, SOBRE RENGLONES LIBRES, Y NO VINCULA", () => {
  const r = codigoDe("app/api/proveedores/listas/[id]/resultado/route.js");
  const f = r.slice(r.indexOf("async function sugerenciasParaLosSinVincular"), r.indexOf("LAS FILAS QUE APLICAR VA A OMITIR HOY"));
  assert.ok(f.length > 0, "no está la función que sugiere");
  assert.match(f, /if \(!abierta\) return sugerencias;/);
  assert.match(f, /where: \{ importacionId, productoBaseId: null \}/);
  assert.match(f, /sugerenciasDeRenglones\(\{ filas: libres, productos: sinRenglon \}\)/);
  assert.ok(!/\.(update|updateMany|upsert|create)\(/.test(f), "sugerir escribe algo");
  assert.match(r, /sugerencias: await sugerenciasParaLosSinVincular\(/);
});
