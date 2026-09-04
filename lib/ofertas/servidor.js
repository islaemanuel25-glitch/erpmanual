// lib/ofertas/servidor.js
//
// LA PARTE DE OFERTAS QUE HABLA CON LA BASE. Todo lo que decide algo vive en los
// módulos puros de al lado (`motorVenta`, `vigencia`, `precio`, `revision`);
// acá solo se buscan filas y se les da la forma que esos módulos esperan.
//
// La separación no es estética: los módulos puros se pueden ejercer sin
// Postgres, y este archivo no. Todo lo que se meta acá deja de estar cubierto
// por los candados, así que conviene que sea poco y que sea aburrido.

import { normalizarRecargos } from "@/lib/recargos-pago/recargoPago.js";
import { precioDeLaUbicacion } from "@/lib/precios/precioDeLaUbicacion.js";
import { conflictoDeCarga } from "./vigencia.js";

/**
 * Ofertas VIGENTES AHORA para un conjunto de productos de un local, en la forma
 * que come `calcularVentaComercial`: { [productoLocalId]: {...} }.
 *
 * Las tres condiciones de vigencia van EN EL WHERE y no en un filtro posterior,
 * a propósito: una de ellas olvidada en una rama de JavaScript es un precio mal
 * cobrado, y en el WHERE no se puede olvidar en una rama.
 *
 * El `localId` también va en el WHERE aunque el productoLocalId ya sea de ese
 * local: es la misma defensa barata que usa el resto del POS contra un id de
 * otra ubicación colado en el payload.
 *
 * @param {*} db cliente Prisma o tx
 * @param {{localId:number, productoLocalIds:number[], ahora?:Date}} args
 * @returns {Promise<Record<number, {ofertaId:number, ofertaNombre:string, precioOferta:number, condicionPago:string}>>}
 */
export async function ofertasVigentesPorProductoLocal(db, { localId, productoLocalIds, ahora = new Date() }) {
  const ids = [...new Set((productoLocalIds || []).map(Number).filter(Number.isInteger))];
  if (ids.length === 0 || !localId) return {};

  const filas = await db.ofertaLinea.findMany({
    where: {
      productoLocalId: { in: ids },
      oferta: {
        localId: Number(localId),
        publicadaEn: { not: null },
        finalizadaEn: null,
        inicioEn: { lte: ahora },
        finEn: { gt: ahora },
      },
    },
    select: {
      productoLocalId: true,
      precioOferta: true,
      oferta: { select: { id: true, nombre: true, condicionPago: true } },
    },
  });

  const mapa = {};
  for (const f of filas) {
    // La validación de carga impide dos ofertas vigentes para el mismo producto.
    // Si igual apareciera una segunda —una fila cargada antes de esta tanda, o
    // una carrera que se coló—, gana la MÁS BARATA para el cliente. Es la única
    // desambiguación que no puede terminar en un reclamo en el mostrador.
    const previa = mapa[f.productoLocalId];
    const precio = Number(f.precioOferta);
    if (previa && previa.precioOferta <= precio) continue;
    mapa[f.productoLocalId] = {
      ofertaId: f.oferta.id,
      ofertaNombre: f.oferta.nombre,
      precioOferta: precio,
      condicionPago: f.oferta.condicionPago,
    };
  }
  return mapa;
}

/**
 * Recargos comerciales configurados en un local, normalizados a { medio: pct }.
 * Un local sin filas devuelve todos en 0: la ausencia de configuración significa
 * "no se le cobra nada de más al cliente", nunca un valor por defecto inventado.
 */
export async function recargosDelLocal(db, localId) {
  if (!localId) return normalizarRecargos([]);
  const filas = await db.recargoPagoLocal.findMany({
    where: { localId: Number(localId) },
    select: { medio: true, porcentaje: true },
  });
  return normalizarRecargos(filas);
}

/**
 * Precio normal y costo VIGENTES de un conjunto de productos del local, con la
 * misma regla de override que usa el resto del sistema: gana el valor del local
 * si es un valor de verdad, y si no el de la ficha del depósito.
 *
 * Se usa al CARGAR o REVISAR una oferta para congelar las referencias, y en el
 * barrido que detecta cambios de costo. NO se usa para cobrar: lo que se cobra
 * lo arma `pos-ventas/buscar-producto` con la lista, la escala y el redondeo.
 * Son dos preguntas distintas y mezclarlas sería empezar a cobrar por acá.
 *
 * @returns {Promise<Record<number, {productoLocalId, productoBaseId, nombre, precioNormal:number, costo:number, esCombo:boolean, esServicio:boolean}>>}
 */
export async function referenciasDeProducto(db, { localId, productoLocalIds }) {
  const ids = [...new Set((productoLocalIds || []).map(Number).filter(Number.isInteger))];
  if (ids.length === 0) return {};

  const filas = await db.productoLocal.findMany({
    where: { id: { in: ids }, localId: Number(localId) },
    select: {
      id: true,
      baseId: true,
      nombre: true,
      precio_venta: true,
      precio_costo: true,
      base: {
        select: {
          nombre: true,
          precio_venta: true,
          precio_costo: true,
          es_combo: true,
          modalidad: true,
        },
      },
    },
  });

  const mapa = {};
  for (const pl of filas) {
    const precio = Number(precioDeLaUbicacion(pl.base?.precio_venta, pl.precio_venta)) || 0;
    const costo = Number(precioDeLaUbicacion(pl.base?.precio_costo, pl.precio_costo)) || 0;
    mapa[pl.id] = {
      productoLocalId: pl.id,
      productoBaseId: pl.baseId,
      nombre: pl.nombre || pl.base?.nombre || "",
      precioNormal: precio,
      costo,
      esCombo: pl.base?.es_combo === true,
      esServicio: pl.base?.modalidad === "IMPORTE_VARIABLE",
    };
  }
  return mapa;
}

/**
 * Ofertas del local que están vigentes ahora y que incluyen alguno de estos
 * productos, en la forma que necesita la PANTALLA DE PRODUCTOS para el sello
 * "OFERTA". Devuelve lo mínimo para pintar el sello y ofrecer "Ver oferta":
 * no arrastra las líneas ni los precios de las demás.
 */
export async function sellosDeOfertaVigente(db, { localId, productoLocalIds, ahora = new Date() }) {
  const mapa = await ofertasVigentesPorProductoLocal(db, { localId, productoLocalIds, ahora });
  const sellos = {};
  for (const [productoLocalId, oferta] of Object.entries(mapa)) {
    sellos[productoLocalId] = {
      ofertaId: oferta.ofertaId,
      ofertaNombre: oferta.ofertaNombre,
      precioOferta: oferta.precioOferta,
      condicionPago: oferta.condicionPago,
    };
  }
  return sellos;
}

/**
 * OFERTAS QUE CHOCAN CON UNA VENTANA Y UN CONJUNTO DE PRODUCTOS.
 *
 * El SQL solo ACOTA —mismo local, no finalizada, publicada, ventanas que se
 * cruzan, y que comparta al menos un producto— para no traer el archivo entero.
 * Quién choca de verdad lo decide `conflictoDeCarga`, que es pura y está
 * cubierta por candados. Si la regla de solapamiento cambia, se cambia allá y
 * este SQL sigue sirviendo: acá no hay ninguna regla escrita dos veces.
 *
 * Vive en el kit y no en la ruta porque la usan crear Y editar. Un `route.js` de
 * Next tampoco puede exportar otra cosa que sus handlers.
 */
export async function buscarConflictos(db, { localId, inicioEn, finEn, productoLocalIds, excluirOfertaId = null }) {
  const ids = [...new Set((productoLocalIds || []).map(Number).filter(Number.isInteger))];
  if (ids.length === 0) return [];

  const candidatas = await db.oferta.findMany({
    where: {
      localId: Number(localId),
      finalizadaEn: null,
      publicadaEn: { not: null },
      inicioEn: { lt: finEn },
      finEn: { gt: inicioEn },
      ...(excluirOfertaId ? { id: { not: Number(excluirOfertaId) } } : {}),
      lineas: { some: { productoLocalId: { in: ids } } },
    },
    select: {
      id: true,
      nombre: true,
      inicioEn: true,
      finEn: true,
      publicadaEn: true,
      finalizadaEn: true,
      lineas: { select: { productoLocalId: true } },
    },
  });

  return conflictoDeCarga(
    { id: excluirOfertaId, inicioEn, finEn, productoLocalIds: ids },
    candidatas.map((o) => ({ ...o, productoLocalIds: o.lineas.map((l) => l.productoLocalId) }))
  );
}

/**
 * Mensaje del conflicto. Nombra la oferta que choca y los productos concretos,
 * en vez de un "hay un conflicto" que obliga a salir a buscar cuál.
 */
export function textoConflicto(choques, referencias = {}) {
  const partes = choques.map((c) => {
    const nombres = c.productoLocalIds.map((id) => referencias[id]?.nombre || `#${id}`).join(", ");
    return `"${c.ofertaNombre}" (${nombres})`;
  });
  return (
    `Ya hay una oferta vigente para ese período con los mismos productos: ${partes.join("; ")}. ` +
    `Cambiá las fechas, sacá esos productos, o finalizá la otra oferta.`
  );
}

/**
 * Registra un evento en el libro de cambios de la oferta. No lanza: un fallo
 * escribiendo la auditoría no puede voltear la operación que la produjo, igual
 * que `crearNotificacion`. Se loguea y sigue.
 */
export async function registrarEventoOferta(db, datos) {
  try {
    const { ofertaId, tipo } = datos || {};
    if (!ofertaId || !tipo) return null;
    return await db.ofertaEvento.create({
      data: {
        ofertaId: Number(ofertaId),
        ofertaLineaId: datos.ofertaLineaId != null ? Number(datos.ofertaLineaId) : null,
        tipo: String(tipo),
        usuarioId: datos.usuarioId != null ? Number(datos.usuarioId) : null,
        valorAnterior: datos.valorAnterior ?? null,
        valorNuevo: datos.valorNuevo ?? null,
        nota: datos.nota != null ? String(datos.nota) : null,
      },
    });
  } catch (err) {
    console.error("registrarEventoOferta error:", err?.message);
    return null;
  }
}
