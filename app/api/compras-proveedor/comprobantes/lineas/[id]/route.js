// GET /api/compras-proveedor/comprobantes/lineas/[id]
//
// Las líneas leídas de un comprobante, cada una con su vínculo o sus
// candidatos, y con la línea del pedido que le corresponde.
//
// ── POR QUÉ EL CÁLCULO VIVE ACÁ Y NO EN LA PANTALLA ────────────────────────
//
// `buscarCandidatos` es pura y se podría importar en el cliente, pero el dato
// que necesita no: el universo del proveedor y el catálogo salen de consultas, y
// mandarle miles de productos al navegador para que elija uno sería mover mucho
// para traer poco. Es el mismo motivo por el que el panel de listas calcula sus
// candidatos en el servidor.
//
// Calculando acá, cada apertura relee: no hay copia en memoria del cliente y por
// lo tanto no hay nada que invalidar. Un producto creado hace diez segundos
// aparece.
//
// ── EL UNIVERSO ES EL MISMO QUE EL DE LISTAS ───────────────────────────────
//
// Sale de `cargarDatosDeConciliacion`. No se arma un `where` parecido al lado:
// `productoDelProveedorWhere` tiene su propia historia —mira `proveedor_id` y
// `proveedor2_id` y no los vínculos de código, porque un vínculo viejo metía
// productos ajenos— y duplicar ese criterio garantiza que algún día diverjan y
// esta pantalla sugiera productos que el motor no considera del proveedor.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { cargarDatosDeConciliacion } from "@/lib/proveedores/listas/cargaErp";
import {
  buscarCandidatos,
  lineaDelPedido,
  TEXTO_MOTIVO_PEDIDO,
} from "@/lib/compras-proveedor/comprobante/vinculo";
import {
  analizarPrecioDeLinea,
  productoBaseDeLaLinea,
} from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { RECETA_POR_DEFECTO } from "@/lib/compras-proveedor/comprobante/impuestos";
import { productosDeLasFilas } from "@/lib/compras-proveedor/comprobante/productoDeLaFila";

export async function GET(req, { params }) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { grupoId, localId, session } = ctx;

    const perm = checkPerm(session, "compras.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;
    const comprobanteId = Number(id);
    if (!Number.isFinite(comprobanteId) || comprobanteId <= 0) {
      return NextResponse.json({ ok: false, error: "id requerido" }, { status: 400 });
    }

    // El alcance va en el WHERE: un comprobante de otro grupo no existe.
    const comprobante = await prisma.comprobanteProveedor.findFirst({
      where: { id: comprobanteId, grupoId },
      select: {
        id: true, proveedorId: true, pedidoId: true, estado: true,
        lineasEnElPapel: true,
        // La receta con la que se leyó: es la que convierte neto a final, y
        // tiene que ser la MISMA que usó la lectura, no la de hoy.
        recetaUsada: true,
        confirmadoEn: true,
        // Los umbrales son del proveedor: la decisión de precio se toma con los
        // suyos, no con una constante de esta ruta.
        proveedor: {
          select: { id: true, nombre: true, umbralRevisarPct: true, umbralSospechaBajaPct: true },
        },
        lineas: {
          orderBy: { orden: "asc" },
          select: {
            id: true, orden: true, textoCrudo: true, codigoProveedor: true, cantidad: true,
            netoUnitario: true, subtotalImpreso: true, internoUnitario: true,
            // El vínculo ya hecho se lee del ESCALAR. `productoLocal` no es una
            // relación del esquema: pedirla acá rompía la ruta entera contra
            // Postgres. La traducción a su producto va aparte, más abajo.
            productoLocalId: true, pedidoDetalleId: true, precioPedidoPrevio: true,
          },
        },
      },
    });
    if (!comprobante) {
      return NextResponse.json({ ok: false, error: "No existe ese comprobante." }, { status: 404 });
    }

    // Los vínculos y el universo del proveedor, con la MISMA función que usa
    // la conciliación de listas.
    const datos = await cargarDatosDeConciliacion(
      { grupoId, proveedorId: comprobante.proveedorId, localId },
      prisma
    );

    // El catálogo completo es la última red de la cascada. Se trae acotado a lo
    // visible en esta ubicación, que es lo que la persona puede elegir.
    // Se traen `factor_pack` y `precio_costo` porque la deducción de unidad los
    // necesita: sin cuántas trae el bulto y cuánto costaba antes, no hay dos
    // hipótesis que comparar.
    const catalogo = await prisma.productoBase.findMany({
      where: { grupoId, activo: true },
      select: { id: true, nombre: true, factor_pack: true, precio_costo: true },
      take: 5000,
    });
    const catalogoNormalizado = catalogo.map((p) => ({ productoBaseId: p.id, nombre: p.nombre }));

    // Las líneas del pedido, para decir cuál corresponde a cada línea leída.
    const detalles = comprobante.pedidoId
      ? await prisma.pedidoProveedorDetalle.findMany({
          where: { pedidoId: comprobante.pedidoId },
          select: {
            id: true, cantidad: true, precioCosto: true,
            producto: { select: { id: true, baseId: true, base: { select: { id: true, nombre: true } } } },
          },
        })
      : [];
    const detallesPlanos = detalles.map((d) => ({
      id: d.id,
      cantidad: d.cantidad,
      precioCosto: d.precioCosto,
      productoBaseId: d.producto?.baseId ?? d.producto?.base?.id ?? null,
      nombre: d.producto?.base?.nombre ?? null,
    }));

    // El nombre de cada producto, para poder mostrar el candidato sin otra
    // consulta desde la pantalla.
    const nombrePorBase = new Map(catalogo.map((p) => [p.id, p.nombre]));
    const datosPorBase = new Map(catalogo.map((p) => [p.id, p]));

    // La receta con la que se leyó. Si el comprobante no la guardó —lecturas
    // viejas— se usa la genérica, y se dice.
    const receta = comprobante.recetaUsada ?? { ...RECETA_POR_DEFECTO };

    // El producto de las líneas YA VINCULADAS, en una consulta aparte porque
    // `productoLocal` no es una relación del esquema. Se arma un Map de
    // productoLocalId → baseId, que es lo que `productoBaseDeLaLinea` espera.
    const productosVinculados = await productosDeLasFilas(prisma, comprobante.lineas);
    const baseDelLocal = new Map([...productosVinculados].map(([id, p]) => [id, p.baseId]));

    const lineas = comprobante.lineas.map((l) => {
      const yaVinculada = l.productoLocalId != null;
      const busqueda = yaVinculada
        ? null
        : buscarCandidatos({
            linea: { codigoProveedor: l.codigoProveedor, descripcion: l.textoCrudo },
            vinculos: datos.codigosProveedor.map((v) => ({
              ...v,
              nombre: nombrePorBase.get(v.productoBaseId) ?? null,
            })),
            universoProveedor: datos.productos.map((p) => ({ productoBaseId: p.id, nombre: p.nombre })),
            catalogo: catalogoNormalizado,
          });

      // QUÉ PRODUCTO ES. El vínculo ya hecho gana sobre la sugerencia: alguien
      // ya decidió. Antes esto salía SOLO de `busqueda.vinculoAutomatico`, que
      // para una línea vinculada ni se calcula — así que una línea vinculada a
      // mano quedaba sin producto y la pantalla le decía "Todavía no se sabe qué
      // producto es" con el `productoLocalId` escrito en la fila.
      const { productoBaseId, desdeVinculo } = productoBaseDeLaLinea({
        linea: l,
        baseDelLocal: baseDelLocal,
        sugeridoBaseId: busqueda?.vinculoAutomatico?.productoBaseId ?? null,
      });

      // La línea del pedido: si ya está guardada en la fila, esa manda. Volver a
      // deducirla podría dar otra —el caso VARIAS_LINEAS— y pisar en silencio la
      // que alguien eligió.
      const delPedido = l.pedidoDetalleId
        ? {
            detalle: detallesPlanos.find((d) => d.id === l.pedidoDetalleId) ?? null,
            motivo: null,
          }
        : lineaDelPedido({ productoBaseId, detalles: detallesPlanos });

      // ── EL PRECIO, LA UNIDAD Y LA DECISIÓN ────────────────────────────
      //
      // Los cinco pasos salen del módulo compartido, que es el MISMO que usa la
      // ruta de aceptar. Tienen que dar el mismo número: esta muestra lo que
      // aquella va a escribir.
      const prod = productoBaseId ? datosPorBase.get(productoBaseId) : null;
      const analisis = analizarPrecioDeLinea({
        linea: l,
        producto: prod,
        receta,
        proveedor: comprobante.proveedor,
      });

      return {
        ...l,
        vinculoDesdeLaFila: desdeVinculo,
        // Lo que vinculó solo se distingue de lo sugerido POR DATO, no por
        // color: la pantalla no tiene que deducirlo del origen.
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
        // La decisión de precio viaja junto a la línea: es lo que dibuja el
        // aviso y lo que habilita el botón. El servidor la vuelve a calcular
        // al aceptar, así que esto es para mostrar, no para confiar.
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

    return NextResponse.json({
      ok: true,
      comprobante: {
        id: comprobante.id,
        estado: comprobante.estado,
        proveedor: comprobante.proveedor,
        pedidoId: comprobante.pedidoId,
      },
      lineas,
      // ── LOS DOS CONTEOS, ARRIBA Y A LA VISTA ─────────────────────────
      //
      // Contra el PAPEL: si el lector dice ver más renglones de los que trajo,
      // falta uno y hay que decirlo aunque la cuenta cierre.
      //
      // Contra el PEDIDO: no se asume que difieran por error. Puede faltar
      // mercadería o venir algo de más, y las dos cosas son información. Pero el
      // número tiene que estar a la vista.
      conteos: {
        enElPapel: comprobante.lineasEnElPapel ?? null,
        transcriptas: lineas.length,
        faltanDelPapel:
          Number.isFinite(comprobante.lineasEnElPapel) &&
          comprobante.lineasEnElPapel > lineas.length
            ? comprobante.lineasEnElPapel - lineas.length
            : 0,
        enElPedido: detallesPlanos.length,
      },
      resumen: {
        total: lineas.length,
        vinculadasSolas: lineas.filter((l) => l.vinculadaSola).length,
        esperandoDecision: lineas.filter((l) => l.requiereDecision).length,
        sinCandidatos: lineas.filter((l) => l.origen === "SIN_CANDIDATOS").length,
        unidadSinResolver: lineas.filter((l) => l.unidad?.requiereDecision).length,
        // Precios que esperan un sí o un no. Los que solo se informan —las
        // bajas— no entran: no hay nada que decidir ahí.
        precioEsperando: lineas.filter((l) => l.precio?.decision?.ofreceAceptar).length,
      },
    });
  } catch (err) {
    console.error("Error comprobantes/lineas:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
