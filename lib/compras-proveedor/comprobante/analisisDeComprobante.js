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
import { repartoDelPie } from "./repartoDelPie";
import { productosDeLasFilas } from "./productoDeLaFila";
import { costoDelCatalogoEnLaUnidadDelDeposito } from "@/lib/conversiones/stock";

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
  //
  // ── Y `unidad_medida`, QUE ES QUIEN DECIDE LA UNIDAD DEL COSTO ──────────
  //
  // Por kilo o por pieza lo dice el PRODUCTO, no el papel. Sin este campo, el
  // neto salía de los kilos impresos siempre que el renglón los trajera, y eso
  // le pone un costo por kilo a los 2.611 productos del catálogo que NO se
  // miden en kilos —medido contra producción: 100 en kg, 1.281 por unidad,
  // 1.312 en pack y 18 en cajón—.
  //
  // Va acá, sobre `ProductoBase`, y no en el select de `ComprobanteLinea`:
  // `productoLocalId` es un escalar pelado y NO tiene relación de Prisma, así
  // que pedir `productoLocal: { select: ... }` compila y se cae en producción.
  // Ya pasó el 2026-08-12 con tres rutas.
  const catalogo = await prisma.productoBase.findMany({
    where: { grupoId, activo: true },
    select: {
      id: true,
      nombre: true,
      factor_pack: true,
      precio_costo: true,
      unidad_medida: true,
      // ── LOS TRES QUE NECESITA `elDepositoCuentaPorKilo` ─────────────────
      //
      // `unidad_medida` solo no alcanza: dice cómo se VENDE. Para saber cómo lo
      // guarda el DEPÓSITO hace falta `modoVentaDeposito` —PIEZA o PESO—, más
      // `modoCompraProveedor` y `pesoReferenciaKg`, que son las otras dos
      // condiciones de `esProductoFiambre`.
      //
      // Sin ellos el predicado no falla: contesta que NO es de pieza, porque
      // los campos llegan en `undefined`. Papas Congeladas salió a producción
      // costeada por kilo con el criterio nuevo ya puesto, y se vio midiendo la
      // conciliación del #242 contra el servidor — no en ningún candado, que
      // los tenía todos en el fixture.
      modoVentaDeposito: true,
      modoCompraProveedor: true,
      pesoReferenciaKg: true,
      pesoEsFijo: true,
    },
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
      costoMaestroObservado: true,
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
          // NULL se queda NULL: `Number(null)` daría 0, que es un catálogo
          // inventado y no la ausencia del dato.
          costoMaestroObservado:
            d.costoMaestroObservado == null ? null : Number(d.costoMaestroObservado),
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
    // ── EL COSTO DEL ERP, EN LA UNIDAD EN QUE EL DEPÓSITO CUENTA ─────────
    //
    // Es el número contra el que se compara lo que factura el papel, y los dos
    // tienen que estar en la misma unidad o la comparación no significa nada.
    // `costoDelCatalogoEnLaUnidadDelDeposito` solo toca el caso que hace falta:
    // costo por kilo y depósito que cuenta piezas.
    precioCosto: costoDelCatalogoEnLaUnidadDelDeposito({
      base: d.producto?.base,
      costo: d.precioCosto,
    }),
    // El crudo viaja igual, porque la hoja de corregir edita el costo del
    // PEDIDO y ése está en la escala del pedido: mostrarle el convertido sería
    // ofrecerle guardar otro número del que escribió.
    precioCostoDelPedido: d.precioCosto,
    // ── Y EL COSTO MAESTRO DE HOY, CON LA MISMA CONVERSIÓN ───────────────
    //
    // El de arriba es el que copió la línea al armar el pedido; éste es el que
    // el catálogo tiene AHORA, que es contra el que compara el cierre. Pasan por
    // la misma función para quedar en la misma unidad. Solo lo trae quien pide
    // `precio_costo` de la base —la conciliación—; sin él queda en null.
    costoMaestroHoy: costoDelCatalogoEnLaUnidadDelDeposito({
      base: d.producto?.base,
      costo: d.producto?.base?.precio_costo,
    }),
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
/**
 * LA CASCADA DE VÍNCULO, ARMADA UNA SOLA VEZ.
 *
 * Los cinco argumentos de `buscarCandidatos` —los alias del proveedor, el
 * pedido, el universo del proveedor y el catálogo— se arman siempre igual, y
 * ahora los necesitan DOS lugares: la conciliación y la prueba de una
 * explicación, que quiere saber si un renglón se puede asociar a un producto
 * para decir "el kilo" o "cada una".
 *
 * Se extrajo en vez de copiarse. Una segunda lista de argumentos parecida es
 * cómo dos pantallas terminan sugiriendo productos distintos para el mismo
 * renglón — la regla 1, con su caso ya pagado en este mismo módulo.
 *
 * @param linea           `{ codigoProveedor, descripcion }`
 * @param contexto        lo que devolvió `cargarContexto`
 * @param detallesPlanos  las líneas del pedido, si se está conciliando uno
 */
export function buscarProductoDeLaLinea({ linea, contexto, detallesPlanos = [] }) {
  const { datos, catalogoNormalizado, nombrePorBase } = contexto;
  return buscarCandidatos({
    linea,
    vinculos: datos.codigosProveedor.map((v) => ({
      ...v,
      nombre: nombrePorBase.get(v.productoBaseId) ?? null,
    })),
    // EL PEDIDO PRIMERO: es el universo chico y el que casi siempre tiene
    // la respuesta, porque se está recibiendo lo que se encargó.
    lineasDelPedido: detallesPlanos,
    universoProveedor: datos.productos.map((p) => ({ productoBaseId: p.id, nombre: p.nombre })),
    catalogo: catalogoNormalizado,
    // ── LA ESCALERA POR TERMINACIÓN, ENCENDIDA EN LA RECEPCIÓN ──────────
    //
    // Decisión de Emanuel del 2026-09-22, tomada sobre una medición: Arcor
    // guarda sus códigos con un prefijo "10" que la factura NO imprime —la
    // lista dice 1001999 y el papel dice 1999, y pasa en 232 de sus 359
    // códigos—. Sobre el pedido 245, con macheo exacto vinculaban 5 de 20; con
    // la terminación, 15.
    //
    // La escalera ya existía y estaba apagada acá a propósito: la usaba solo el
    // importador de borradores. Lo que la hace aceptable en la recepción son
    // los límites que YA tiene `macheePorSufijo` y que son los que se pidieron:
    // solo códigos numéricos, **mínimo 4 dígitos**, corta en la primera
    // longitud que encuentra algo, y si encuentra más de uno NO vincula —
    // devuelve ambigua y la hoja pregunta—. Y el índice se arma solo con los
    // vínculos de ESTE proveedor, así que nunca puede cruzar de proveedor.
    permitirCodigoAproximado: true,
  });
}

export function analizarLineas({
  comprobante,
  contexto,
  detallesPlanos = [],
  porProductoLocal = new Map(),
  /**
   * ── TODAS LAS LÍNEAS DE LA FACTURA, AUNQUE SE ANALICE UNA SOLA ──────────
   *
   * El reparto de los conceptos del pie es proporcional al neto de cada
   * renglón SOBRE EL NETO DE SU FACTURA, así que necesita el neto de todos.
   *
   * Hace falta declararlo aparte porque hay un llamador que analiza UNA línea:
   * `aceptar-precio` arma `{ ...comprobante, lineas: [linea] }` a propósito,
   * para no recalcular veinte. Con eso solo, el pie entero le caería a ese
   * único renglón — la percepción del 3 % se volvería del 60 %.
   *
   * Por omisión son las del comprobante, que es el caso de la pantalla.
   */
  todasLasLineas = null,
}) {
  const { datosPorBase, decisionPorBase, nombrePorBase } = contexto;
  const receta = comprobante.recetaUsada ?? { ...RECETA_POR_DEFECTO };
  const baseDelLocal = new Map([...porProductoLocal].map(([id, p]) => [id, p.baseId]));

  // ── EL REPARTO SE HACE POR FACTURA, UNA VEZ ───────────────────────────
  //
  // Acá, y no río abajo: la pantalla de un pedido concatena los renglones de
  // varias facturas, y para entonces ya no se sabe cuál venía con qué pie. Cada
  // factura reparte el suyo entre SUS renglones, y recién después se juntan.
  const reparto = repartoDelPie({
    ...comprobante,
    lineas: todasLasLineas ?? comprobante.lineas ?? [],
  });

  return (comprobante.lineas ?? []).map((l) => {
    const yaVinculada = l.productoLocalId != null;
    const busqueda = yaVinculada
      ? null
      : buscarProductoDeLaLinea({
          linea: { codigoProveedor: l.codigoProveedor, descripcion: l.textoCrudo },
          contexto,
          detallesPlanos,
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
      // Lo que le toca a ESTE renglón de los conceptos del pie de SU factura.
      percepcionDeLaLinea: reparto.get(l.orden) ?? null,
      proveedor: comprobante.proveedor,
      // ── POR UNIDAD O POR BULTO, SI ALGUIEN YA LO ELIGIÓ ──────────────
      //
      // La elección vivía solo en la memoria del navegador que la hizo:
      // refrescar la pantalla la borraba y el renglón volvía a preguntar lo
      // mismo. Ahora está en el renglón y se lee de ahí, así que sobrevive al
      // refresco y la ve cualquiera que abra el pedido.
      unidadElegida: l.unidadElegida ?? undefined,
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
      // El costo maestro CRUDO de hoy del producto al que se refiere esa
      // decisión, del mismo catálogo: `decisionVigente` lo compara contra el
      // que se observó al decidir.
      costoMaestroCatalogo:
        productoBaseId && datosPorBase.get(productoBaseId)?.precio_costo != null
          ? Number(datosPorBase.get(productoBaseId).precio_costo)
          : null,
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
            // POR KILO O POR PIEZA, y si los kilos todavía no están. Los dos
            // salen del producto: la pantalla no vuelve a mirar el papel.
            porKilo: analisis.porKilo ?? null,
            faltanKilos: analisis.faltanKilos === true,
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
