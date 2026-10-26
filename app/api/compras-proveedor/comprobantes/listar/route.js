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
import { productosDelPapel } from "@/lib/compras-proveedor/comprobante/cobertura";
import { armarCadena } from "@/lib/compras-proveedor/comprobante/lector/cadena";
import { cuotaDelDia, horaLocalDeReposicion } from "@/lib/compras-proveedor/comprobante/lector/cuota";
// El índice registra los lectores al importarse. Sin esto la cadena diría que no
// hay ninguno y el contador no sabría contra qué modelos contar.
import "@/lib/compras-proveedor/comprobante/lector/index.js";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";
import { comoVaLaLectura } from "@/lib/compras-proveedor/comprobante/lecturaEnSegundoPlano";

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
        // Si se está leyendo ahora: la pantalla se engancha a esa lectura en
        // vez de lanzar otra. Viaja como booleano, no la fecha.
        lecturaEnCursoDesde: true,
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

    // Cuántos PRODUCTOS trae cada papel —sin envases ni cargos— y cuántos ya
    // tienen producto del catálogo (`productosDelPapel`). `_count.lineas` sigue
    // contando todos los renglones: es lo que se lleva un borrado.
    const lineasDeLosPapeles = items.length
      ? await prisma.comprobanteLinea.findMany({
          where: { comprobanteId: { in: items.map((c) => c.id) } },
          select: { comprobanteId: true, tipoRenglon: true, productoLocalId: true },
        })
      : [];
    const delPapel = productosDelPapel(lineasDeLosPapeles);

    const conFotos = items.map(({ lecturaEnCursoDesde, ...c }) => ({
      ...c,
      // Una vencida NO cuenta como leyendo: el GET de la lectura la da por
      // cortada al mirarla, y engancharse a ella es justamente lo que lo hace.
      leyendo: comoVaLaLectura({ lecturaEnCursoDesde }).estado === "LEYENDO",
      fotos: c.imagenBorradaEn ? 0 : c.archivos.length,
      archivos: c.imagenBorradaEn ? [] : c.archivos,
      lineasVinculadas: vinculadasDe.get(c.id) ?? 0,
      productosDelPapel: delPapel.get(c.id)?.productos ?? 0,
      conProducto: delPapel.get(c.id)?.conProducto ?? 0,
    }));

    // ── CUÁNTO LLEGÓ DEL PEDIDO YA NO SE CUENTA ACÁ ──────────────────────
    //
    // Se contaba con los vínculos GUARDADOS —los que alguien hizo a mano—, y la
    // lista de la recepción ata sola por código y por alias sin guardar nada.
    // Con la factura de Mauro leída, 15 renglones atados, esto decía «0 de 24
    // llegaron» encima de la lista que los mostraba (#298). La cuenta la da la
    // conciliación, que es la que arma esa lista, y el panel la recibe de la
    // pantalla. Acá queda el tamaño del pedido, para el encabezado.
    let cobertura = null;
    if (pedidoId) {
      const totalPedido = await prisma.pedidoProveedorDetalle.count({ where: { pedidoId } });
      // ── EL PEDIDO NACIDO DE UNA FACTURA SE CUENTA CONTRA EL PAPEL ───────
      //
      // Sus líneas salen de los renglones que se pudieron atar, así que
      // "N de N llegaron" es verdad siempre. Lo que se dice es cuántos
      // productos del papel ya tienen producto (`productosDelPapel`).
      const pedido = await prisma.pedidoProveedor.findFirst({
        where: { id: pedidoId, grupoId },
        select: { nacidoDeFactura: true },
      });
      const vivos = conFotos.filter((x) => x.estado !== "ANULADO");
      cobertura = {
        totalPedido,
        nacidoDeFactura: pedido?.nacidoDeFactura === true,
        productosDelPapel: vivos.reduce((a, x) => a + x.productosDelPapel, 0),
        conProducto: vivos.reduce((a, x) => a + x.conProducto, 0),
      };
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
