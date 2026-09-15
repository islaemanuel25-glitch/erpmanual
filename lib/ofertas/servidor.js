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
import { escalaDeVentaDe, valorEnLaEscalaDeVenta } from "@/lib/precios/escalaDeVenta.js";
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
/**
 * ── LOS CAMPOS QUE HACEN FALTA PARA SABER EN QUÉ ESCALA SE VENDE ─────────
 *
 * Se piden en las DOS consultas de este archivo y son los mismos, así que están
 * acá una vez: si mañana `escalaDeVentaDe` necesita uno más, se agrega en un
 * solo lugar y no se descubre que una de las dos consultas se quedó corta.
 */
const CAMPOS_DE_ESCALA = Object.freeze({
  unidad_medida: true,
  factor_pack: true,
  modo_envio: true,
  modoCompraProveedor: true,
  pesoReferenciaKg: true,
  pesoEsFijo: true,
  modoVentaDeposito: true,
});

/**
 * ¿La ubicación de esta oferta es el depósito?
 *
 * Se lee ACÁ y no se recibe por argumento a propósito. Es el dato del que
 * depende la escala, y un llamador que se olvide de pasarlo no rompería nada
 * visible: devolvería precios de bulto rotulados como unitarios, que es
 * exactamente el defecto que esta tanda vino a cerrar.
 */
async function esUbicacionDeposito(db, localId) {
  const l = await db.local.findUnique({
    where: { id: Number(localId) },
    select: { es_deposito: true },
  });
  return l?.es_deposito === true;
}

/**
 * EL PRECIO Y EL COSTO EN LA ESCALA EN QUE ESA UBICACIÓN VENDE.
 *
 * ── EL DEFECTO QUE CIERRA, CON SU NÚMERO ─────────────────────────────────
 *
 * `precio_venta` está guardado en escala de BULTO cuando el producto es pack o
 * cajón con factor mayor a 1. El POS lo divide por el factor antes de cobrar; el
 * módulo de ofertas NO lo dividía, así que mostraba y congelaba el precio del
 * bulto como si fuera el de la unidad.
 *
 * Medido el 2026-09-15 sobre producción: "9 DE ORO AGRIDULCE", pack x20, vale
 * **$25.000 en la base y $1.250 por unidad**. Son 1330 de 2115 productos activos
 * en mini el 7 — el 63 % del catálogo — y entre el 55 % y el 63 % en los otros
 * locales.
 *
 * Y no era un rótulo mal puesto: el motor compara `precioOferta` contra el
 * `precioNormal` de la línea, que es el unitario. La única oferta que llegó a
 * producción tenía $22.500 contra un normal de $1.250, así que **el motor la
 * habría descartado y no habría cobrado nada distinto**, sin ningún aviso.
 *
 * ── NO SE ESCRIBE UNA SEGUNDA REGLA: SE USA LA QUE YA DECIDE EL PRECIO ───
 *
 * `escalaDeVentaDe` + `valorEnLaEscalaDeVenta` son las mismas funciones que usa
 * la tarjeta del catálogo, y por dentro llaman a `precioUnitarioQueSeCobra`, que
 * es la regla de `esBultoConPack` del POS. Dos copias de una regla de escala es
 * cómo empezó este problema.
 *
 * ── Y NO ES "SIEMPRE UNIDAD": ES LA ESCALA DE ESA UBICACIÓN ──────────────
 *
 * En un LOCAL el POS vende siempre por unidad —`modoSalidaDeVenta` devuelve
 * UNIDAD sin mirar nada más— así que ahí "la escala de la ubicación" y "unidad"
 * son lo mismo, que es el caso de los cuatro locales.
 *
 * En el DEPÓSITO no: 1040 de 1330 productos de pack salen por BULTO. Forzar
 * unidad ahí habría cobrado el precio de UNA unidad por un bulto entero — el
 * mismo error dado vuelta, y en contra. Medido, no supuesto.
 *
 * El redondeo comercial va en el precio y NO en el costo: el precio se cobra, el
 * costo se paga. Es el mismo criterio que ya aplica la tarjeta.
 */
function enEscalaDeVenta(pl, esDeposito) {
  const producto = {
    unidad_medida: pl.base?.unidad_medida,
    modoEnvio: pl.base?.modo_envio ?? null,
    modoCompraProveedor: pl.base?.modoCompraProveedor,
    pesoReferenciaKg: pl.base?.pesoReferenciaKg,
    pesoEsFijo: pl.base?.pesoEsFijo,
    modoVentaDeposito: pl.base?.modoVentaDeposito,
    modalidad: pl.base?.modalidad,
  };
  const escala = escalaDeVentaDe(producto, esDeposito);
  const factor = Number(pl.base?.factor_pack) || 1;
  const unidad = pl.base?.unidad_medida;
  const peso = pl.base?.pesoReferenciaKg;

  const crudoPrecio = precioDeLaUbicacion(pl.base?.precio_venta, pl.precio_venta);
  const crudoCosto = precioDeLaUbicacion(pl.base?.precio_costo, pl.precio_costo);

  return {
    escala,
    precioNormal:
      Number(
        valorEnLaEscalaDeVenta({
          escala,
          valor: crudoPrecio,
          factor,
          unidad,
          redondeo100: pl.base?.redondeo_100 === true,
          pesoReferenciaKg: peso,
        })
      ) || 0,
    costo:
      Number(
        valorEnLaEscalaDeVenta({
          escala,
          valor: crudoCosto,
          factor,
          unidad,
          redondeo100: false,
          pesoReferenciaKg: peso,
        })
      ) || 0,
  };
}

export async function referenciasDeProducto(db, { localId, productoLocalIds }) {
  const ids = [...new Set((productoLocalIds || []).map(Number).filter(Number.isInteger))];
  if (ids.length === 0) return {};

  const esDeposito = await esUbicacionDeposito(db, localId);

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
          redondeo_100: true,
          ...CAMPOS_DE_ESCALA,
        },
      },
    },
  });

  const mapa = {};
  for (const pl of filas) {
    // EN LA ESCALA EN QUE SE VENDE. Estos dos números se CONGELAN en la fila de
    // la oferta —`precioNormalReferencia` y `costoReferencia`— así que si
    // salieran en escala de bulto quedarían guardados así para siempre, y el
    // aviso de cambio de costo compararía contra un número que no significa lo
    // mismo que el de hoy.
    const { precioNormal, costo, escala } = enEscalaDeVenta(pl, esDeposito);
    mapa[pl.id] = {
      productoLocalId: pl.id,
      productoBaseId: pl.baseId,
      nombre: pl.nombre || pl.base?.nombre || "",
      precioNormal,
      costo,
      escala,
      esCombo: pl.base?.es_combo === true,
      esServicio: pl.base?.modalidad === "IMPORTE_VARIABLE",
    };
  }
  return mapa;
}

/**
 * Productos del local que se pueden meter en una oferta, buscados por nombre o
 * código. Devuelve lo mínimo para la pantalla de carga: qué vale hoy y cuánto
 * cuesta hoy.
 *
 * NO se reusa `/api/productos/listar`: pide `productos.ver`, que es otro permiso
 * —quien arma ofertas no tiene por qué poder editar el catálogo— y devuelve un
 * payload mucho más grande del que hace falta acá. Lo que SÍ se reusa es la
 * regla de qué precio vale en una ubicación: sale de `precioDeLaUbicacion`,
 * igual que en el resto del sistema, así que el precio que se ve al armar la
 * oferta es el mismo que muestra el catálogo.
 *
 * Los servicios de importe variable quedan afuera de la consulta: su importe lo
 * teclea el cajero y no admiten oferta. Filtrarlos acá es mejor que dejar que la
 * persona los elija y rechazárselos al guardar.
 */
export async function buscarProductosOfertables(db, { localId, q = "", limite = 30 }) {
  const texto = String(q || "").trim();
  const esDeposito = await esUbicacionDeposito(db, localId);
  const filas = await db.productoLocal.findMany({
    where: {
      localId: Number(localId),
      activo: true,
      base: { activo: true, modalidad: { not: "IMPORTE_VARIABLE" } },
      ...(texto
        ? {
            OR: [
              { nombre: { contains: texto, mode: "insensitive" } },
              { base: { nombre: { contains: texto, mode: "insensitive" } } },
              { codigo_barra_propio: texto },
              { base: { codigo_barra: texto } },
            ],
          }
        : {}),
    },
    take: Math.min(Number(limite) || 30, 100),
    orderBy: { id: "asc" },
    select: {
      id: true,
      baseId: true,
      nombre: true,
      precio_venta: true,
      precio_costo: true,
      codigo_barra_propio: true,
      // EL STOCK DE ESTA UBICACIÓN. Se pide acotado por `localId` porque la
      // relación trae una fila por local: sin el `where` vendrían todas y habría
      // que elegir una acá, que es donde se elige la equivocada.
      stock: { where: { localId: Number(localId) }, select: { cantidad: true } },
      base: {
        select: {
          nombre: true,
          precio_venta: true,
          precio_costo: true,
          es_combo: true,
          codigo_barra: true,
          codigo_barra_secundario: true,
          redondeo_100: true,
          modalidad: true,
          ...CAMPOS_DE_ESCALA,
        },
      },
    },
  });

  // ── LA FORMA ES LA DEL BUSCADOR DEL POS, Y ESO ES DELIBERADO ────────────
  //
  // La pantalla de crear oferta monta `components/pos-ventas/BuscadorProductos`
  // TAL CUAL —el mismo componente que usa el POS y que usa Stock— apuntándolo a
  // este endpoint con su prop `apiPath`. Ese componente lee `precioVenta`,
  // `stock`, `codigoBarra`, `disponibleParaVenta` y compañía, así que si acá se
  // devolviera otra forma habría que copiar el componente y tocarlo, que es
  // exactamente lo que la regla 1 del proyecto prohíbe.
  //
  // Los nombres de campo NO se eligieron: son los que el componente ya lee.
  //
  // `costo` es lo ÚNICO que este endpoint agrega sobre la forma del POS, y es
  // el motivo por el que existe separado: quien arma una oferta necesita ver el
  // costo para no fijar un precio a ciegas, y el cajero no tiene por qué verlo.
  return filas.map((pl) => {
    // EN LA ESCALA EN QUE SE VENDE, igual que el POS. Ver `enEscalaDeVenta`.
    const { precioNormal, costo, escala } = enEscalaDeVenta(pl, esDeposito);
    const cantidad = Number(pl.stock?.[0]?.cantidad ?? 0);

    return {
      productoLocalId: pl.id,
      productoBaseId: pl.baseId,
      nombre: pl.nombre || pl.base?.nombre || "",
      precioNormal,
      costo,
      // En qué escala están esos dos números, en las palabras que la pantalla
      // muestra —"por unidad", "por bulto"—. Viaja para que la pantalla pueda
      // decirlo al lado del importe en vez de que el que mira lo suponga.
      escala,
      esCombo: pl.base?.es_combo === true,

      // Los que lee `BuscadorProductos`.
      precioVenta: precioNormal,
      precioCosto: costo,
      stock: cantidad,
      sinStock: cantidad <= 0,
      codigoBarra: pl.base?.codigo_barra || "",
      codigoBarraSecundario: pl.base?.codigo_barra_secundario || "",
      codigoBarraPropio: pl.codigo_barra_propio || "",
      unidadMedida: pl.base?.unidad_medida || "unidad",
      factorPack: Number(pl.base?.factor_pack) || 1,
      esFiambreFijo: false,
      esServicioImporteVariable: false,

      // ── SIN STOCK IGUAL SE PUEDE ELEGIR, Y ESO ES A PROPÓSITO ───────────
      //
      // En el POS `disponibleParaVenta: false` impide vender, y está bien: no se
      // puede entregar lo que no hay. Acá se está PROGRAMANDO un precio para los
      // próximos días, y que hoy no haya stock no dice nada sobre mañana — puede
      // estar por llegar el pedido.
      //
      // La pantalla avisa que no hay stock hoy y deja seguir. Avisa, no bloquea.
      disponibleParaVenta: true,
    };
  });
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
