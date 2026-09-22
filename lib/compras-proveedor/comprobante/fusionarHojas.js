// JUNTAR LAS HOJAS DE UNA FACTURA EN UN SOLO COMPROBANTE.
//
// ── POR QUÉ EL RESULTADO ES UN COMPROBANTE Y NO UN GRUPO DE COMPROBANTES ───
//
// Porque "una factura = un comprobante con varias fotos" es lo que este sistema
// ya sabe hacer, en todos lados: la verificación del total, la conciliación
// contra el pedido, la cobertura, la ganancia y las dos pantallas están
// escritas sobre esa forma y funcionan.
//
// La alternativa —dejar cada hoja como su propio comprobante y enseñarle a todo
// lo demás a sumarlas— habría tocado nueve módulos para conseguir lo mismo. Lo
// único que cambia en esta tanda es QUIÉN decide que dos fotos son la misma
// factura: antes lo contestaba una persona al subir, ahora lo dice el papel.
//
// ── LOS RENGLONES SE MUEVEN, NO SE REHACEN ────────────────────────────────
//
// `ComprobanteLinea` se actualiza de comprobante y de orden. Borrarlos y
// crearlos de nuevo perdería todo lo que una persona ya decidió sobre ellos —a
// qué producto se vinculó, la unidad elegida, el subtotal corregido, que estaba
// revisado—, que es exactamente el defecto que la herencia de renglones tuvo
// que arreglar cuando releer los borraba.
//
// ── Y NO SE VUELVE A LLAMAR A LA IA ───────────────────────────────────────
//
// La verificación se rehace con `pasarPorLaPuerta` sobre la lectura unida, que
// se arma con lo que ya está guardado. Es la MISMA puerta que usó cada hoja: un
// segundo criterio para "cierra" es lo que este módulo no puede tener.
//
// Recibe `tx` por parámetro, como `vincularConUnaFila` en listas: así corre
// dentro de la transacción de quien llama y no abre la suya.

import { pasarPorLaPuerta } from "@/lib/compras-proveedor/comprobante/lector/puerta";
import { lecturaDesdeLoGuardado } from "@/lib/compras-proveedor/comprobante/lecturaGuardada";
import { lecturaUnida, fusionesPendientes } from "@/lib/compras-proveedor/comprobante/agruparHojas";

/** Estados de pedido donde NO se toca nada: ya se aplicaron costos y stock. */
const PEDIDOS_INTOCABLES = new Set(["RECIBIDO", "ANULADO"]);

/**
 * CÓMO SE LE PREGUNTA A UNA FILA SI ES UNA HOJA INTERMEDIA.
 *
 * Dos traducciones, y las dos tienen su motivo:
 *
 * · `leido` exige además que NO esté MAL_LEIDO. Una lectura fallada no sabe si
 *   el papel traía total: pegarla a la siguiente sería decidir sobre un dato
 *   que no se tiene. Queda como un agujero, la agrupación se corta ahí, y en
 *   cuanto alguien la relee y sale bien, la corrida se completa sola.
 *
 * · `tieneTotal` mira el total guardado. El booleano del lector
 *   —`hayTotalImpreso`— no tiene columna propia, y acá alcanza: un papel que
 *   dice tener total y no lo trajo termina en MAL_LEIDO, que ya quedó afuera
 *   por la regla de arriba.
 */
export function hojaDesdeLaFila(c) {
  return {
    id: c.id,
    leido: c.leidoEn != null && c.estado !== "MAL_LEIDO",
    tieneTotal: c.totalLeido != null,
    anulado: c.estado === "ANULADO",
  };
}

/**
 * AGRUPAR LAS HOJAS DE UN PEDIDO —O DE UN PROVEEDOR SIN PEDIDO— Y FUSIONARLAS.
 *
 * Se mira el CONJUNTO y no solo la foto recién leída: si las hojas se leyeron
 * en desorden, cada lectura vuelve a preguntar por todas y la agrupación se
 * completa sola en cuanto no queda ningún agujero en el medio.
 *
 * @returns `{ fusiones: [...], facturas: n }` o `{ fusiones: [], porque }`
 */
export async function agruparLasHojasDelPapel(db, { grupoId, pedidoId = null, proveedorId } = {}) {
  // Un pedido ya recibido no se toca: recibir movió stock y escribió costos, y
  // reacomodar sus comprobantes cambiaría los papeles de abajo de números que
  // ya se aplicaron.
  if (pedidoId) {
    const pedido = await db.pedidoProveedor.findFirst({
      where: { id: pedidoId, grupoId },
      select: { estado: true },
    });
    if (pedido && PEDIDOS_INTOCABLES.has(pedido.estado)) {
      return { fusiones: [], porque: "El pedido ya está cerrado." };
    }
  }

  const hermanos = await db.comprobanteProveedor.findMany({
    where: pedidoId
      ? { grupoId, pedidoId }
      : { grupoId, proveedorId, pedidoId: null },
    // El orden de subida es el orden de las hojas. Es lo único que se le pide a
    // quien saca las fotos, y es por `createdAt` y no por `id` porque el id es
    // un detalle de la base; con empate, el id desempata.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, estado: true, leidoEn: true, totalLeido: true },
  });

  const fusiones = [];
  for (const f of fusionesPendientes(hermanos.map(hojaDesdeLaFila))) {
    const r = await db.$transaction((tx) => fusionarHojas(tx, f.hojaIds));
    fusiones.push(r);
  }
  return { fusiones, facturas: hermanos.length - fusiones.reduce((s, f) => s + (f.absorbidos?.length || 0), 0) };
}

/** Lo que hace falta traer de cada hoja para poder unirla. */
export const QUE_TRAER_DE_CADA_HOJA = Object.freeze({
  id: true,
  estado: true,
  tipo: true,
  puntoVenta: true,
  numero: true,
  fecha: true,
  cuitLeido: true,
  netoLeido: true,
  ivaLeido: true,
  internoLeido: true,
  percepcionesLeido: true,
  conceptosDelPieLeidos: true,
  totalLeido: true,
  lineasEnElPapel: true,
  lineasTranscriptas: true,
  modeloLectura: true,
  recetaUsada: true,
  recetaVersion: true,
  leidoEn: true,
  intentosLectura: true,
  cerroEnIntento: true,
});

const aFecha = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * FUSIONAR UNA CORRIDA DE HOJAS EN LA PRIMERA.
 *
 * @param tx       el cliente de Prisma de la transacción de quien llama
 * @param hojaIds  los ids EN ORDEN DE PÁGINA. El primero es el que sobrevive.
 * @returns `{ ok, destinoId, estado, fotos, renglones }` o `{ ok: false, porque }`
 */
export async function fusionarHojas(tx, hojaIds) {
  const ids = (Array.isArray(hojaIds) ? hojaIds : []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length < 2) return { ok: false, porque: "Hacen falta al menos dos hojas." };

  const filas = await tx.comprobanteProveedor.findMany({
    where: { id: { in: ids } },
    select: {
      ...QUE_TRAER_DE_CADA_HOJA,
      lineas: { orderBy: { orden: "asc" } },
      archivos: { orderBy: { orden: "asc" }, select: { id: true, orden: true } },
    },
  });
  if (filas.length !== ids.length) return { ok: false, porque: "Falta alguna de las hojas." };

  // El orden de `findMany` no es el de `ids`, y acá el orden ES el dato: es el
  // orden de las páginas. Se reordena por la lista pedida, no por la base.
  const porId = new Map(filas.map((f) => [f.id, f]));
  const hojas = ids.map((id) => porId.get(id));
  const destino = hojas[0];
  const restantes = hojas.slice(1);

  // ── 1. La lectura unida, y su veredicto por la misma puerta ───────────
  const unida = lecturaUnida(hojas.map((h) => lecturaDesdeLoGuardado(h)));
  // La receta de la hoja que trae el total: es con la que se leyó el pie que se
  // va a verificar. Guardar una y verificar con otra explicaría mal el
  // resultado dentro de seis meses.
  const conTotal = [...hojas].reverse().find((h) => h.totalLeido != null) || hojas[hojas.length - 1];
  const puerta = pasarPorLaPuerta({
    lectura: unida,
    receta: conTotal.recetaUsada,
    recetaVersion: conTotal.recetaVersion ?? null,
  });

  // ── 2. Las fotos se mudan, después de las que el destino ya tiene ─────
  //
  // El orden nuevo es estrictamente mayor que el mayor del destino, así que no
  // puede chocar con el índice único `(comprobanteId, orden)`.
  let siguienteFoto = Math.max(0, ...destino.archivos.map((a) => a.orden)) + 1;
  for (const h of restantes) {
    for (const a of h.archivos) {
      await tx.comprobanteArchivo.update({
        where: { id: a.id },
        data: { comprobanteId: destino.id, orden: siguienteFoto++ },
      });
    }
  }

  // ── 3. Los renglones también se mudan, con lo que se decidió sobre ellos ──
  let siguienteRenglon = Math.max(0, ...destino.lineas.map((l) => l.orden)) + 1;
  for (const h of restantes) {
    for (const l of h.lineas) {
      await tx.comprobanteLinea.update({
        where: { id: l.id },
        data: { comprobanteId: destino.id, orden: siguienteRenglon++ },
      });
    }
  }

  // ── 4. El destino pasa a ser la factura entera ────────────────────────
  const transcriptas = hojas
    .map((h) => Number(h.lineasTranscriptas))
    .filter((n) => Number.isFinite(n));

  const actualizado = await tx.comprobanteProveedor.update({
    where: { id: destino.id },
    data: {
      ...puerta.aGuardar,
      fecha: aFecha(puerta.aGuardar?.fecha ?? destino.fecha),
      lineasTranscriptas: transcriptas.length ? transcriptas.reduce((a, b) => a + b, 0) : null,
      // Cuándo terminó de leerse la factura: cuando se leyó su última hoja.
      leidoEn: new Date(),
      // ── EL INTENTO EN QUE CERRÓ, QUE MIDE AL LECTOR ────────────────────
      //
      // Solo se escribe si no estaba escrito, igual que al releer: una factura
      // que cerró recién al juntarse cerró en el intento de su hoja, no en uno
      // nuevo. Sin esta guarda, el número de "cerró a la primera" contaría la
      // fusión como un intento más y bajaría solo.
      ...(puerta.cierra && destino.cerroEnIntento == null
        ? { cerroEnIntento: Math.max(1, destino.intentosLectura || 1) }
        : {}),
    },
    select: { id: true, estado: true, diferenciaCentavos: true },
  });

  // ── 5. Y las hojas vacías se van ──────────────────────────────────────
  //
  // Ya no tienen ni fotos ni renglones: dejarlas sería mostrar comprobantes
  // fantasma en la lista y contarlos como facturas. El borrado es de filas
  // vacías, no de datos: todo lo que tenían está en el destino.
  await tx.comprobanteProveedor.deleteMany({ where: { id: { in: restantes.map((h) => h.id) } } });

  return {
    ok: true,
    destinoId: destino.id,
    estado: actualizado.estado,
    fotos: siguienteFoto - 1,
    renglones: siguienteRenglon - 1,
    absorbidos: restantes.map((h) => h.id),
  };
}
