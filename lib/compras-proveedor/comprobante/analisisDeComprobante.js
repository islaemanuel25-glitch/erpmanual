// lib/compras-proveedor/comprobante/analisisDeComprobante.js
//
// EL ANÁLISIS DE LAS LÍNEAS DE UN COMPROBANTE, EN UN SOLO LUGAR.
//
// ── POR QUÉ SE EXTRAJO ─────────────────────────────────────────────────────
//
// Estaba escrito adentro de la ruta `lineas/[id]`, que analiza UN comprobante.
// La pantalla nueva es una sola lista con TODOS los comprobantes del pedido, así
// que necesitaba lo mismo para cada uno.
//
// Copiarlo al lado habría dado dos versiones del cruce que decide qué producto
// es cada línea y qué costo se le va a proponer — la regla 1 de CLAUDE.md, y con
// el peor candidato posible para duplicar.
//
// ── EL CONTEXTO SE CARGA UNA VEZ, NO POR COMPROBANTE ───────────────────────
//
// El universo del proveedor y el catálogo son los mismos para todos los
// comprobantes del pedido: se cargan una vez y se pasan. Cargarlos por
// comprobante multiplicaría por N unas consultas que traen miles de filas.

import { cargarDatosDeConciliacion } from "@/lib/proveedores/listas/cargaErp";
import { buscarCandidatos, resolverLineaDelPedido, TEXTO_MOTIVO_PEDIDO } from "./vinculo";
import { analizarPrecioDeLinea, productoBaseDeLaLinea } from "./precioDeLinea";
import { RECETA_POR_DEFECTO } from "./impuestos";
import { productosDeLasFilas } from "./productoDeLaFila";

/**
 * Lo que hace falta para analizar CUALQUIER comprobante de este proveedor.
 *
 * Se pide una sola vez por pantalla.
 */
export async function cargarContexto(prisma, { grupoId, localId, proveedorId }) {
  // El universo sale de la MISMA función que usa la conciliación de listas. No
  // se arma un `where` parecido al lado: `productoDelProveedorWhere` tiene su
  // historia y duplicarlo garantiza que algún día diverjan.
  const datos = await cargarDatosDeConciliacion({ grupoId, proveedorId, localId }, prisma);

  // `factor_pack` y `precio_costo` van porque la deducción de unidad los
  // necesita: sin cuántas trae el bulto y cuánto costaba antes no hay dos
  // hipótesis que comparar.
  const catalogo = await prisma.productoBase.findMany({
    where: { grupoId, activo: true },
    select: { id: true, nombre: true, factor_pack: true, precio_costo: true },
    take: 5000,
  });

  // ── LO QUE YA SE DECIDIÓ SOBRE EL PRECIO DE CADA PRODUCTO ────────────────
  //
  // Va acá y no por línea: una consulta por el proveedor entero en vez de una
  // por renglón, y las decisiones son las mismas para todos los comprobantes
  // del pedido. Es el mismo criterio que el universo y el catálogo.
  const decisiones = await prisma.decisionDePrecioProveedor.findMany({
    where: { grupoId, proveedorId },
    select: {
      productoBaseId: true,
      decision: true,
      precioFacturado: true,
      precioPropio: true,
      decididaEn: true,
    },
  });

  return {
    datos,
    catalogo,
    catalogoNormalizado: catalogo.map((p) => ({ productoBaseId: p.id, nombre: p.nombre })),
    nombrePorBase: new Map(catalogo.map((p) => [p.id, p.nombre])),
    datosPorBase: new Map(catalogo.map((p) => [p.id, p])),
    // Los precios salen como número y no como Decimal: la fila viaja al
    // navegador y del otro lado se compara contra `costoFactura`, que ya es un
    // número. Dos tipos para la misma comparación es cómo una tolerancia
    // empieza a dar distinto de cada lado.
    decisionPorBase: new Map(
      decisiones.map((d) => [
        d.productoBaseId,
        {
          decision: d.decision,
          precioFacturado: Number(d.precioFacturado),
          precioPropio: Number(d.precioPropio),
          decididaEn: d.decididaEn,
        },
      ])
    ),
  };
}

/** Las líneas del pedido, en la forma que espera la cascada. */
export function aplanarDetalles(detalles) {
  return (detalles ?? []).map((d) => ({
    id: d.id,
    cantidad: d.cantidad,
    precioCosto: d.precioCosto,
    cantidadRecibida: d.cantidadRecibida ?? null,
    unidad: d.unidad ?? null,
    productoBaseId: d.producto?.baseId ?? d.producto?.base?.id ?? null,
    nombre: d.producto?.base?.nombre ?? null,
    // Fiambre: entra por pieza en el depósito y se mide en kilos en el local.
    // La fila necesita saberlo para mostrar la columna de kilos.
    esFiambre: d.producto?.base?.modoCompraProveedor === "UNIDAD",
    kgRecibidos: d.kgRecibidos ?? null,
    // Lo que hace falta para contar bultos y sueltas en la hoja de corregir.
    factorPack: Number(d.producto?.base?.factor_pack) || null,
    unidadesSueltas: d.unidadesSueltas ?? null,
    motivoPrincipal: d.motivoPrincipal ?? null,
    motivoDetalle: d.motivoDetalle ?? null,
  }));
}

/**
 * Analiza las líneas de UN comprobante.
 *
 * @param comprobante        con `lineas`, `proveedor` y `recetaUsada`
 * @param contexto           lo que devolvió `cargarContexto`
 * @param detallesPlanos     lo que devolvió `aplanarDetalles`
 * @param porProductoLocal   Map productoLocalId → { baseId } de las ya vinculadas
 */
export function analizarLineas({ comprobante, contexto, detallesPlanos = [], porProductoLocal = new Map() }) {
  const { datos, catalogoNormalizado, nombrePorBase, datosPorBase, decisionPorBase } = contexto;
  const receta = comprobante.recetaUsada ?? { ...RECETA_POR_DEFECTO };
  const baseDelLocal = new Map([...porProductoLocal].map(([id, p]) => [id, p.baseId]));

  return (comprobante.lineas ?? []).map((l) => {
    const yaVinculada = l.productoLocalId != null;
    const busqueda = yaVinculada
      ? null
      : buscarCandidatos({
          linea: { codigoProveedor: l.codigoProveedor, descripcion: l.textoCrudo },
          vinculos: datos.codigosProveedor.map((v) => ({
            ...v,
            nombre: nombrePorBase.get(v.productoBaseId) ?? null,
          })),
          // EL PEDIDO PRIMERO: es el universo chico y el que casi siempre tiene
          // la respuesta, porque se está recibiendo lo que se encargó.
          lineasDelPedido: detallesPlanos,
          universoProveedor: datos.productos.map((p) => ({ productoBaseId: p.id, nombre: p.nombre })),
          catalogo: catalogoNormalizado,
        });

    // El vínculo ya hecho gana sobre la sugerencia: alguien ya decidió.
    const { productoBaseId, desdeVinculo } = productoBaseDeLaLinea({
      linea: l,
      baseDelLocal,
      sugeridoBaseId: busqueda?.vinculoAutomatico?.productoBaseId ?? null,
    });

    // El criterio vive en `resolverLineaDelPedido` y no acá: la ruta que acepta
    // un precio necesita EXACTAMENTE el mismo, y mientras estuvo escrito adentro
    // de esta función aquélla usaba otro.
    const delPedido = resolverLineaDelPedido({
      linea: l,
      productoBaseId,
      detalles: detallesPlanos,
    });

    const analisis = analizarPrecioDeLinea({
      linea: l,
      producto: productoBaseId ? datosPorBase.get(productoBaseId) : null,
      receta,
      proveedor: comprobante.proveedor,
    });

    return {
      ...l,
      // A QUÉ PRODUCTO DEL CATÁLOGO corresponde, ya resuelto. Viaja con la línea
      // porque es la clave con la que se lee lo que se decidió sobre su precio,
      // y deducirlo de nuevo río abajo sería el segundo criterio de siempre.
      productoBaseId,
      // Lo que ya se decidió sobre el precio de ESTE producto de ESTE proveedor,
      // tal como quedó guardado. Si sigue valiendo o no lo decide
      // `decisionVigente` comparando contra los precios de hoy: acá no se
      // interpreta nada, se adjunta.
      decisionPrecio: productoBaseId ? decisionPorBase?.get?.(productoBaseId) ?? null : null,
      vinculoDesdeLaFila: desdeVinculo,
      vinculadaSola: !!busqueda?.vinculoAutomatico,
      requiereDecision: busqueda?.requiereDecision ?? false,
      origen: busqueda?.origen ?? null,
      textoOrigen: busqueda?.texto ?? null,
      problema: busqueda?.problema ?? null,
      candidatos: (busqueda?.candidatos ?? []).map((c) => ({
        ...c,
        nombre: c.nombre ?? nombrePorBase.get(c.productoBaseId) ?? null,
      })),
      sugerido: busqueda?.vinculoAutomatico ?? null,
      unidad: analisis?.unidad ?? null,
      // La decisión de precio viaja con la línea: es lo que dibuja el aviso y lo
      // que habilita el botón. El servidor la recalcula al aceptar, así que esto
      // es para mostrar, no para confiar.
      precio: analisis
        ? {
            precioFinal: analisis.precioFinal,
            costoAnterior: analisis.costoAnterior,
            precioAEscribir: analisis.precioAEscribir,
            decision: analisis.decision,
          }
        : null,
      pedidoDetalle: delPedido.detalle,
      motivoPedido: delPedido.motivo,
      textoMotivoPedido: delPedido.motivo ? TEXTO_MOTIVO_PEDIDO[delPedido.motivo] : null,
    };
  });
}

/** El Map de las líneas ya vinculadas, para todos los comprobantes de una. */
export async function vinculadasDeTodos(prisma, comprobantes) {
  const todas = (comprobantes ?? []).flatMap((c) => c.lineas ?? []);
  return productosDeLasFilas(prisma, todas);
}
