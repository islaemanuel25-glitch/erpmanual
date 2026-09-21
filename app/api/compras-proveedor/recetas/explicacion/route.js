// LA EXPLICACIÓN DEL PAPEL DE UN PROVEEDOR: leerla, probarla y guardarla.
//
//   GET  ?proveedorId=N   la explicación guardada y el papel con el que probar
//   POST { proveedorId, explicacion, probar: true }   lee la foto con esa
//        explicación y devuelve cómo la entendió, SIN ESCRIBIR NADA
//   POST { proveedorId, explicacion }   guarda SOLO la explicación
//
// ── POR QUÉ PROBAR NO ESCRIBE ─────────────────────────────────────────────
//
// Probar es una pregunta, no una decisión. Si escribiera la lectura, una
// explicación a medio escribir dejaría el comprobante peor que antes —con
// líneas nuevas y el estado cambiado— y habría que deshacerlo. Se lee, se
// muestra, y recién cuando la persona dice "está bien" se guarda la
// explicación. La lectura de verdad la hace la recepción, con «Leer».
//
// ── Y POR QUÉ GUARDAR NO RELEE ────────────────────────────────────────────
//
// Releer cuesta una consulta de IA y mueve el estado de un comprobante que
// puede estar a medio conciliar. Guardar guarda la explicación y nada más; la
// relectura la pide la persona desde la recepción, que es donde ve lo que va a
// cambiar.

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { armarCadena, leerConCadena } from "@/lib/compras-proveedor/comprobante/lector/cadena";
import { recetaDelProveedor } from "@/lib/compras-proveedor/comprobante/lector/recetaDelProveedor";
import { queHacerLectura } from "@/lib/compras-proveedor/comprobante/lector";
import {
  estadoDeLaFalla,
  MOTIVO_LECTURA,
} from "@/lib/compras-proveedor/comprobante/lector/contrato";
import { comoLoEntendio } from "@/lib/compras-proveedor/comprobante/pruebaDeExplicacion";
import {
  cargarContexto,
  buscarProductoDeLaLinea,
} from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { esAutomatico } from "@/lib/compras-proveedor/comprobante/vinculo";
import { usadasHoy } from "@/lib/ia/contadorDeIa";
import { hayCuota, limiteDiario, MOTIVO_LIMITE, TEXTO_LIMITE } from "@/lib/ia/limiteDiario";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";

/**
 * El papel con el que se prueba.
 *
 * Por defecto, el último del proveedor que todavía tenga su foto. Cuando la
 * RECEPCIÓN manda acá a alguien porque llegó una factura de un proveedor sin
 * explicación, manda además CUÁL: la que tiene en la mano. Probar con otra
 * sería explicar un papel y guardar la explicación para otro distinto.
 *
 * El id llega por la barra de direcciones, así que el alcance va en el WHERE
 * —grupo y proveedor— y no en un chequeo posterior: un comprobante ajeno no
 * existe, en vez de existir y estar prohibido.
 */
async function papelDePrueba({ grupoId, proveedorId, comprobanteId = null }) {
  const c = await prisma.comprobanteProveedor.findFirst({
    where: {
      grupoId,
      proveedorId,
      estado: { not: "ANULADO" },
      imagenBorradaEn: null,
      archivos: { some: {} },
      ...(Number.isFinite(comprobanteId) && comprobanteId > 0 ? { id: comprobanteId } : {}),
    },
    orderBy: { id: "desc" },
    select: {
      id: true,
      estado: true,
      pedidoId: true,
      _count: { select: { lineas: true } },
      archivos: { orderBy: { orden: "asc" }, select: { ubicacion: true, mime: true, orden: true } },
    },
  });
  return c;
}

export async function GET(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { grupoId, session } = ctx;

    const perm = checkPerm(session, ["compras.ver", "compras.recibir"]);
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const parametros = new URL(req.url).searchParams;
    const proveedorId = Number(parametros.get("proveedorId"));
    const comprobanteId = Number(parametros.get("comprobanteId"));
    if (!Number.isFinite(proveedorId)) {
      return NextResponse.json({ ok: false, error: "Falta el proveedor." }, { status: 400 });
    }

    const proveedor = await prisma.proveedor.findUnique({
      where: { id: proveedorId },
      select: { id: true, nombre: true },
    });
    if (!proveedor) {
      return NextResponse.json({ ok: false, error: "No existe ese proveedor." }, { status: 404 });
    }

    const fila = await prisma.recetaProveedor.findUnique({
      where: { grupoId_proveedorId: { grupoId, proveedorId } },
      select: { explicacion: true, explicacionActualizadaEn: true },
    });
    const papel = await papelDePrueba({ grupoId, proveedorId, comprobanteId });

    return NextResponse.json({
      ok: true,
      proveedor,
      explicacion: fila?.explicacion ?? "",
      actualizadaEn: fila?.explicacionActualizadaEn ?? null,
      papel: papel
        ? {
            comprobanteId: papel.id,
            pedidoId: papel.pedidoId,
            productos: papel._count.lineas,
            fotos: papel.archivos.length,
          }
        : null,
    });
  } catch (err) {
    console.error("Error recetas/explicacion GET:", err);
    return NextResponse.json({ ok: false, error: errorInesperado({
        operacion: "abrir la explicación del papel",
        quedo: "No se tocó nada: esto solo muestra lo que ya estaba guardado.",
      }) }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { grupoId, session } = ctx;

    const perm = checkPerm(session, "compras.recibir");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json().catch(() => ({}));
    const proveedorId = Number(body?.proveedorId);
    const explicacion = String(body?.explicacion ?? "").trim();
    if (!Number.isFinite(proveedorId)) {
      return NextResponse.json({ ok: false, error: "Falta el proveedor." }, { status: 400 });
    }

    // ── PROBAR: SE LEE Y SE MUESTRA, NO SE GUARDA NADA ──────────────────
    if (body?.probar === true) {
      if (!explicacion) {
        return NextResponse.json(
          { ok: false, error: "Escribí primero cómo se lee el papel." },
          { status: 400 }
        );
      }
      const papel = await papelDePrueba({
        grupoId,
        proveedorId,
        comprobanteId: Number(body?.comprobanteId),
      });
      const foto = papel?.archivos?.[0];
      if (!foto?.ubicacion) {
        return NextResponse.json(
          {
            ok: false,
            error: "No hay ninguna foto de este proveedor con la que probar.",
            queHacer: "Subí una factura desde la recepción y volvé.",
          },
          { status: 409 }
        );
      }

      const cuota = hayCuota({ usadasHoy: await usadasHoy(), limite: limiteDiario() });
      if (!cuota.puede) {
        return NextResponse.json(
          { ok: false, motivo: MOTIVO_LIMITE, error: TEXTO_LIMITE, cuota },
          { status: 429 }
        );
      }

      // La receta guardada da el IVA y las percepciones; la explicación es la
      // que está EN PANTALLA, sin guardar, que es justamente lo que se prueba.
      const fila = await prisma.recetaProveedor.findUnique({
        where: { grupoId_proveedorId: { grupoId, proveedorId } },
      });
      const { receta } = recetaDelProveedor(fila);
      const recetaProbada = { ...receta, explicacion };

      const cadena = armarCadena();
      if (!cadena.titular?.ok) {
        return NextResponse.json(
          { ok: false, motivo: cadena.titular?.motivo, error: cadena.titular?.queHacer },
          { status: 503 }
        );
      }

      let archivos;
      try {
        archivos = await Promise.all(
          papel.archivos.map(async (a) => ({
            bytes: await readFile(a.ubicacion),
            mime: a.mime,
            orden: a.orden,
          }))
        );
      } catch {
        return NextResponse.json(
          { ok: false, error: "No se pudo abrir la foto del comprobante." },
          { status: 503 }
        );
      }

      const proveedor = await prisma.proveedor.findUnique({
        where: { id: proveedorId },
        select: { nombre: true },
      });
      const resultado = await leerConCadena({
        cadena,
        archivos,
        receta: recetaProbada,
        proveedorNombre: proveedor?.nombre ?? null,
      });

      // La llamada SÍ se registra: gastó cuota igual que cualquier otra, y el
      // contador existe para que nadie se entere de que no quedan con el camión
      // en la puerta. Lo que no se escribe es el comprobante.
      try {
        const intentos = Array.isArray(resultado.intentos) ? resultado.intentos : [];
        if (intentos.length) {
          await prisma.llamadaLector.createMany({
            data: intentos.map((i) => ({
              modelo: i.lector,
              ok: i.ok === true,
              motivo: i.ok ? null : i.motivo ?? null,
              detalle: i.ok ? null : i.detalle ?? null,
              comprobanteId: papel.id,
            })),
          });
        }
      } catch (e) {
        console.error("No se pudo registrar la llamada de la prueba:", e?.message);
      }

      if (!resultado.ok) {
        return NextResponse.json(
          {
            ok: false,
            motivo: resultado.motivo,
            error: queHacerLectura(resultado.motivo),
            detalle: (resultado.intentos || []).find((i) => !i.ok)?.detalle ?? null,
          },
          { status: estadoDeLaFalla(resultado.motivo) }
        );
      }

      // ── QUÉ PRODUCTO ES CADA RENGLÓN, SI SE PUEDE SABER YA ──────────────
      //
      // Solo por ALIAS: el código del proveedor o un nombre que alguien ya
      // asoció antes. Son los dos orígenes que el ERP ya considera automáticos
      // —`esAutomatico`— porque no requieren que nadie confirme nada.
      //
      // Para qué: para poder decir "el kilo" o "cada una" en vez de deducirlo
      // del peso impreso, que es justamente lo que no se puede hacer. Sin
      // producto, el renglón se muestra con su subtotal y sin unidad, que es la
      // verdad — esta pantalla está probando cómo se LEE el papel, y eso no
      // depende de contra qué producto va.
      //
      // Si esto falla, la prueba sigue: la unidad es un rótulo, no el resultado.
      let productosPorIndice = null;
      try {
        const contexto = await cargarContexto(prisma, { grupoId, localId: ctx.localId, proveedorId });
        productosPorIndice = new Map();
        (resultado.lectura?.lineas ?? []).forEach((l, i) => {
          const busqueda = buscarProductoDeLaLinea({
            linea: { codigoProveedor: l.codigoProveedor, descripcion: l.descripcion },
            contexto,
          });
          const baseId = busqueda?.vinculoAutomatico?.productoBaseId ?? null;
          if (baseId != null && esAutomatico(busqueda?.origen)) {
            const producto = contexto.datosPorBase.get(baseId);
            if (producto) productosPorIndice.set(i, producto);
          }
        });
      } catch (e) {
        console.error("No se pudo asociar los renglones a productos:", e?.message);
        productosPorIndice = null;
      }

      return NextResponse.json({
        ok: true,
        probado: true,
        comprobanteId: papel.id,
        resultado: comoLoEntendio({
          lectura: resultado.lectura,
          receta: recetaProbada,
          productos: productosPorIndice,
        }),
        // ── LA LECTURA CRUDA Y LA RECETA TAMBIÉN VIAJAN ─────────────────
        //
        // Cuando la persona corrige un número, la pantalla rehace los dos
        // controles con `comoLoEntendio`, la MISMA función que corrió acá. Sin
        // estos dos, tendría que reconstruir la lectura desde el resultado ya
        // armado, que es un segundo criterio esperando el día en que uno de
        // los dos cambie.
        lectura: resultado.lectura,
        receta: recetaProbada,
        // ── Y LOS PRODUCTOS, PARA QUE LA PANTALLA REHAGA LA MISMA CUENTA ───
        //
        // Cuando alguien corrige un número, la pantalla vuelve a llamar a
        // `comoLoEntendio` con lo corregido. Sin esto, la unidad que el
        // servidor resolvió se perdería en esa segunda pasada y el rótulo
        // cambiaría solo. Viaja SOLO `unidad_medida`: es lo único que decide la
        // unidad, y el costo del producto no tiene nada que hacer en esta
        // pantalla.
        productos: (resultado.lectura?.lineas ?? []).map((_, i) => {
          const p = productosPorIndice?.get(i);
          return p ? { unidad_medida: p.unidad_medida } : null;
        }),
      });
    }

    // ── GUARDAR: SOLO LA EXPLICACIÓN ────────────────────────────────────
    const guardada = await prisma.recetaProveedor.upsert({
      where: { grupoId_proveedorId: { grupoId, proveedorId } },
      // Sin receta previa se crea con los defaults del modelo —los de la
      // genérica— y la explicación. Los impuestos se siguen cargando en su
      // pantalla: acá no se inventa ninguno.
      create: {
        grupoId,
        proveedorId,
        explicacion,
        explicacionActualizadaEn: new Date(),
        explicacionActualizadaPor: session.id,
        version: 1,
      },
      update: {
        explicacion,
        explicacionActualizadaEn: new Date(),
        explicacionActualizadaPor: session.id,
      },
      select: { id: true, explicacionActualizadaEn: true },
    });

    return NextResponse.json({
      ok: true,
      guardada: true,
      actualizadaEn: guardada.explicacionActualizadaEn,
      queHacer:
        "Guardada. Desde ahora, cada factura de este proveedor se lee con esta explicación.",
    });
  } catch (err) {
    console.error("Error recetas/explicacion POST:", err);
    return NextResponse.json({ ok: false, error: errorInesperado({
        operacion: "probar o guardar la explicación",
        quedo: "Si estabas probando, no se guardó nada: la prueba nunca escribe.",
      }) }, { status: 500 });
  }
}
