// GET /api/compras-proveedor/comprobantes/listar
//
// Los comprobantes de un pedido o de un proveedor, con lo que la pantalla
// necesita para dibujarlos: estado, fotos, y lo que se guarda para medir.
//
// No devuelve la ubicación de los archivos en disco: la pantalla no tiene nada
// que hacer con una ruta del volumen, y publicarla sería contar la estructura
// interna del servidor sin ninguna ganancia.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { resumenDeLista } from "@/lib/compras-proveedor/comprobante/pantalla";
import { coberturaDelPedido, textoDeCobertura } from "@/lib/compras-proveedor/comprobante/cobertura";
import { productosDeLasFilas, baseIdDeLaFila } from "@/lib/compras-proveedor/comprobante/productoDeLaFila";
import { armarCadena } from "@/lib/compras-proveedor/comprobante/lector/cadena";
import { cuotaDelDia, horaLocalDeReposicion } from "@/lib/compras-proveedor/comprobante/lector/cuota";
// El índice registra los lectores al importarse. Sin esto la cadena diría que no
// hay ninguno y el contador no sabría contra qué modelos contar.
import "@/lib/compras-proveedor/comprobante/lector/index.js";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";

export async function GET(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    }
    const { grupoId, session } = ctx;

    const perm = checkPerm(session, "compras.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const { searchParams } = new URL(req.url);
    const pedidoId = Number(searchParams.get("pedidoId")) || null;
    const proveedorId = Number(searchParams.get("proveedorId")) || null;

    if (!pedidoId && !proveedorId) {
      return NextResponse.json(
        { ok: false, error: "Hace falta pedidoId o proveedorId." },
        { status: 400 }
      );
    }

    const items = await prisma.comprobanteProveedor.findMany({
      // El alcance va en el WHERE: un comprobante de otro grupo no existe.
      where: {
        grupoId,
        ...(pedidoId ? { pedidoId } : {}),
        ...(proveedorId ? { proveedorId } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        proveedorId: true,
        pedidoId: true,
        estado: true,
        tipo: true,
        puntoVenta: true,
        numero: true,
        fecha: true,
        totalLeido: true,
        diferenciaCentavos: true,
        createdAt: true,
        venceEn: true,
        imagenBorradaEn: true,
        confirmadoEn: true,
        // Lo que se guarda para que el número de acierto salga solo.
        leidoEn: true,
        modeloLectura: true,
        intentosLectura: true,
        cerroEnIntento: true,
        usoRespaldo: true,
        motivoPaseRespaldo: true,
        proveedor: { select: { id: true, nombre: true } },
        _count: { select: { lineas: true } },
        archivos: {
          orderBy: { orden: "asc" },
          // Sin `ubicacion`: la pantalla no tiene nada que hacer con una ruta
          // del volumen del servidor.
          select: { id: true, orden: true, nombre: true, tamano: true, mime: true },
        },
      },
    });

    // `archivos` viene sin ubicación, así que para el resumen hay que decirle
    // cuáles siguen teniendo foto: eso lo dice `imagenBorradaEn`, que es del
    // comprobante entero porque la ventana es del PAPEL y no de cada foto.
    // Cuántas líneas de cada comprobante ya están vinculadas a una del pedido.
    // Es lo que hay que decir ANTES de borrar: es el único trabajo que volver a
    // leer no recupera, porque lo hizo una persona a mano.
    const vinculadasPorComprobante = items.length
      ? await prisma.comprobanteLinea.groupBy({
          by: ["comprobanteId"],
          where: { comprobanteId: { in: items.map((c) => c.id) }, pedidoDetalleId: { not: null } },
          _count: { _all: true },
        })
      : [];
    const vinculadasDe = new Map(vinculadasPorComprobante.map((v) => [v.comprobanteId, v._count._all]));

    const conFotos = items.map((c) => ({
      ...c,
      fotos: c.imagenBorradaEn ? 0 : c.archivos.length,
      archivos: c.imagenBorradaEn ? [] : c.archivos,
      lineasVinculadas: vinculadasDe.get(c.id) ?? 0,
    }));

    // ── LA COBERTURA DEL PEDIDO, CONTRA TODOS LOS COMPROBANTES ───────────
    //
    // Un pedido se cubre con VARIAS facturas: el de Mauro tiene 34 líneas y el
    // comprobante que llegó trajo 21. Contarlo por comprobante haría que toda
    // entrega parcial pareciera incompleta, y un aviso que siempre dice que
    // falta algo deja de significar que falta algo.
    let cobertura = null;
    if (pedidoId) {
      const detalles = await prisma.pedidoProveedorDetalle.findMany({
        where: { pedidoId },
        select: { id: true, producto: { select: { baseId: true, base: { select: { nombre: true } } } } },
      });
      // `productoLocal` NO es una relación del esquema: solo existe el escalar.
      // Pedirla acá es lo que tumbaba esta ruta —y con ella la pantalla entera—
      // con `Unknown field productoLocal`. La traducción va en una consulta
      // aparte, en un solo lugar para las tres rutas que la necesitan.
      const vinculadas = await prisma.comprobanteLinea.findMany({
        where: { comprobante: { pedidoId, grupoId, estado: { not: "ANULADO" } }, productoLocalId: { not: null } },
        select: { comprobanteId: true, productoLocalId: true },
      });
      const porProductoLocal = await productosDeLasFilas(prisma, vinculadas);
      const c = coberturaDelPedido({
        detalles: detalles.map((d) => ({
          id: d.id,
          productoBaseId: d.producto?.baseId ?? null,
          nombre: d.producto?.base?.nombre ?? null,
        })),
        lineasDeComprobantes: vinculadas.map((v) => ({
          productoBaseId: baseIdDeLaFila(v, porProductoLocal),
          comprobanteId: v.comprobanteId,
        })),
      });
      const sinLeer = items.filter((x) => !x.leidoEn && x.estado !== "ANULADO").length;
      cobertura = { ...c, ...textoDeCobertura(c, { comprobantesSinLeer: sinLeer }) };
    }

    // ── CUÁNTAS LECTURAS QUEDAN HOY ──────────────────────────────────────
    //
    // Se calcula sin llamar a nadie: sale de contar las llamadas registradas.
    // Enterarse de que no quedan con el camión del proveedor en la puerta es el
    // peor momento posible.
    //
    // La ventana se pide un poco más ancha que el día —48 horas— y el recorte
    // fino lo hace `cuotaDelDia` con el huso del proveedor. Traer justo desde el
    // corte obligaría a calcular el corte dos veces, acá y allá, y esas dos
    // cuentas divergen el día que alguien toque una sola.
    let cuota = null;
    try {
      const cadena = armarCadena();
      const modelos = [cadena.titular?.lector?.nombre, cadena.respaldo?.lector?.nombre].filter(Boolean);
      if (modelos.length) {
        const llamadas = await prisma.llamadaLector.findMany({
          where: { creadoEn: { gte: new Date(Date.now() - 48 * 3600 * 1000) } },
          select: { modelo: true, creadoEn: true, ok: true, motivo: true },
        });
        const c = cuotaDelDia({ llamadas, modelos, huso: process.env.COMPROBANTE_CUOTA_HUSO || undefined });
        cuota = {
          ...c,
          // La hora local del corte va SIEMPRE que se muestre el número: un
          // "quedan 3" sin decir hasta cuándo obliga a adivinar.
          reponeALas: horaLocalDeReposicion(new Date(), c.huso),
        };
      }
    } catch (e) {
      // Sin contador la pantalla funciona igual: es información, no operación.
      console.error("No se pudo calcular la cuota:", e?.message);
    }

    return NextResponse.json({
      ok: true,
      items: conFotos,
      resumen: resumenDeLista(items),
      cobertura,
      cuota,
    });
  } catch (err) {
    console.error("Error compras-proveedor/comprobantes/listar:", err);
    return NextResponse.json({ ok: false, error: errorInesperado({
        operacion: "cargar la lista de comprobantes",
        quedo: "Los comprobantes que subiste están guardados: esto es solo la pantalla.",
      }) }, { status: 500 });
  }
}
