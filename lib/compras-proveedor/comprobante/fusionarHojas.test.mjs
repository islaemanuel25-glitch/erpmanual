// LAS HOJAS SE JUNTAN SIN PERDER LO QUE YA SE DECIDIÓ SOBRE ELLAS.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/fusionarHojas.test.mjs
//
// La transacción entra por parámetro, así que esto corre sin Prisma y sin base.
// Lo que se afirma son las cuatro cosas que pueden salir mal al mover filas:
// que las fotos no choquen entre sí, que los renglones queden en orden de
// página, que no se borre lo que una persona decidió, y que el veredicto se
// rehaga por la MISMA puerta y no por una cuenta nueva.

import { test } from "node:test";
import assert from "node:assert/strict";

import { fusionarHojas } from "@/lib/compras-proveedor/comprobante/fusionarHojas";

/**
 * Una transacción de mentira que anota todo lo que se le pidió.
 *
 * Las filas tienen la forma del `select` real, que incluye `recetaUsada`: sin
 * receta, `pasarPorLaPuerta` no puede verificar el pie, y un fixture sin ella
 * probaría un camino que no ocurre.
 */
function txDeMentira(filas) {
  const hecho = { archivos: [], lineas: [], update: null, borrados: null };
  return {
    hecho,
    comprobanteProveedor: {
      findMany: async ({ where }) => filas.filter((f) => where.id.in.includes(f.id)),
      update: async ({ where, data, select }) => {
        hecho.update = { id: where.id, data };
        return { id: where.id, estado: data.estado ?? "CARGADO", diferenciaCentavos: data.diferenciaCentavos ?? 0 };
      },
      deleteMany: async ({ where }) => {
        hecho.borrados = where.id.in;
        return { count: where.id.in.length };
      },
    },
    comprobanteArchivo: {
      update: async ({ where, data }) => hecho.archivos.push({ id: where.id, ...data }),
    },
    comprobanteLinea: {
      update: async ({ where, data }) => hecho.lineas.push({ id: where.id, ...data }),
    },
  };
}

const RECETA = { alicuotaIvaPct: 21, ivaPorLinea: false, internoPorLinea: false };

/** Un renglón con la forma que guarda la base, decisiones incluidas. */
const renglon = (id, orden, { producto = null } = {}) => ({
  id,
  orden,
  textoCrudo: `renglón ${id}`,
  cantidad: 1,
  netoUnitario: 100,
  subtotalImpreso: 100,
  subtotalCorregido: null,
  internoUnitario: 0,
  pesoKg: null,
  bonificacionPct: null,
  productoLocalId: producto,
});

const HOJA_1 = {
  id: 10,
  estado: "SIN_TOTAL",
  tipo: "FACTURA A",
  puntoVenta: "0003",
  numero: "12345",
  fecha: null,
  cuitLeido: null,
  netoLeido: null, ivaLeido: null, internoLeido: null, percepcionesLeido: null,
  conceptosDelPieLeidos: null, totalLeido: null,
  lineasEnElPapel: 2, lineasTranscriptas: 2,
  modeloLectura: "gemini", recetaUsada: RECETA, recetaVersion: 3,
  leidoEn: new Date(), intentosLectura: 1, cerroEnIntento: null,
  lineas: [renglon(101, 1, { producto: 555 }), renglon(102, 2)],
  archivos: [{ id: 1001, orden: 1 }],
};

const HOJA_2 = {
  id: 11,
  estado: "CARGADO",
  tipo: null, puntoVenta: null, numero: null, fecha: null, cuitLeido: null,
  netoLeido: 400, ivaLeido: 84, internoLeido: 0, percepcionesLeido: 0,
  conceptosDelPieLeidos: null, totalLeido: 484,
  lineasEnElPapel: 2, lineasTranscriptas: 2,
  modeloLectura: "gemini", recetaUsada: RECETA, recetaVersion: 3,
  leidoEn: new Date(), intentosLectura: 1, cerroEnIntento: null,
  lineas: [renglon(103, 1), renglon(104, 2)],
  archivos: [{ id: 1002, orden: 1 }],
};

test("LAS DOS HOJAS QUEDAN EN UNA FACTURA, EN ORDEN DE PÁGINA", async () => {
  const tx = txDeMentira([HOJA_1, HOJA_2]);
  const r = await fusionarHojas(tx, [10, 11]);

  assert.equal(r.ok, true);
  assert.equal(r.destinoId, 10, "la factura no quedó en su primera hoja");
  assert.deepEqual(r.absorbidos, [11]);

  // La foto de la hoja 2 pasa a ser la página 2 de la factura. El orden nuevo
  // es mayor que el del destino, así que no puede chocar con el índice único
  // `(comprobanteId, orden)` — que es lo único que puede reventar acá.
  assert.deepEqual(tx.hecho.archivos, [{ id: 1002, comprobanteId: 10, orden: 2 }]);

  // Y los renglones siguen: 1 y 2 son de la hoja 1, 3 y 4 de la hoja 2.
  assert.deepEqual(tx.hecho.lineas, [
    { id: 103, comprobanteId: 10, orden: 3 },
    { id: 104, comprobanteId: 10, orden: 4 },
  ]);

  // La hoja vacía se va: dejarla la contaría como una factura más.
  assert.deepEqual(tx.hecho.borrados, [11]);
});

test("LOS RENGLONES SE MUEVEN, NO SE REHACEN", async () => {
  // Es la diferencia con releer, que los borra y los crea de nuevo. Acá el
  // renglón 101 tiene un producto vinculado a mano: si se recreara, se
  // perdería, que es el defecto que la herencia de renglones tuvo que arreglar.
  const tx = txDeMentira([HOJA_1, HOJA_2]);
  await fusionarHojas(tx, [10, 11]);

  const tocados = tx.hecho.lineas.map((l) => l.id);
  assert.ok(!tocados.includes(101), "se tocó un renglón del destino");
  // Y nadie borró líneas: el único deleteMany es el de las hojas vacías.
  for (const l of tx.hecho.lineas) {
    assert.deepEqual(Object.keys(l).sort(), ["comprobanteId", "id", "orden"]);
  }
});

test("EL VEREDICTO SE REHACE CON LOS CUATRO RENGLONES Y EL PIE DE LA ÚLTIMA", async () => {
  // Cuatro renglones de 100 dan 400 de neto, y el pie de la hoja 2 dice 400 +
  // 84 de IVA = 484. Cierra. Si la unión tomara el pie de la primera hoja —que
  // no tiene— o solo sus dos renglones, esto no cerraría.
  const tx = txDeMentira([HOJA_1, HOJA_2]);
  await fusionarHojas(tx, [10, 11]);

  const d = tx.hecho.update.data;
  assert.equal(tx.hecho.update.id, 10);
  assert.equal(d.totalLeido, 484);
  assert.equal(d.estado, "CARGADO", `quedó en ${d.estado}`);
  assert.equal(d.diferenciaCentavos, 0);
  // El conteo de renglones del papel se suma: es el control contra el que se
  // compara cuántos se transcribieron.
  assert.equal(d.lineasEnElPapel, 4);
  assert.equal(d.lineasTranscriptas, 4);
  // Y el número sale de la hoja que lo trajo.
  assert.equal(d.numero, "12345");
});

test("MENOS DE DOS HOJAS NO ES UNA FUSIÓN", async () => {
  const tx = txDeMentira([HOJA_1]);
  const r = await fusionarHojas(tx, [10]);
  assert.equal(r.ok, false);
  assert.equal(tx.hecho.update, null, "escribió igual");
});

test("SI FALTA UNA HOJA NO SE FUSIONA A MEDIAS", async () => {
  // Media factura escrita como si fuera entera es peor que no fusionar: su
  // total diría una cosa y sus renglones otra.
  const tx = txDeMentira([HOJA_1]);
  const r = await fusionarHojas(tx, [10, 11]);
  assert.equal(r.ok, false);
  assert.equal(tx.hecho.update, null);
  assert.equal(tx.hecho.borrados, null);
});
