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
import { ofrecerRelectura } from "@/lib/compras-proveedor/comprobante/relecturaTrasReceta";
import { cuotaDelDia } from "@/lib/compras-proveedor/comprobante/lector/cuota";
import { queHacerLectura } from "@/lib/compras-proveedor/comprobante/lector";
import {
  achicarTodas,
  resumenDelAchicado,
} from "@/lib/compras-proveedor/comprobante/lector/achicarFoto";
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
import {
  arrancarTurno,
  mirarTurno,
  olvidarTurno,
  ESTADO_TURNO,
} from "@/lib/compras-proveedor/comprobante/lector/lecturasEnCurso";
import { randomUUID } from "node:crypto";
import { usadasHoy } from "@/lib/ia/contadorDeIa";
import { hayCuota, limiteDiario, MOTIVO_LIMITE, TEXTO_LIMITE } from "@/lib/ia/limiteDiario";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";
import { ORIGEN_DE_LECTURA } from "@/lib/compras-proveedor/comprobante/origenDeLectura";
import { VARIACION_POR_DEFECTO } from "@/lib/compras-proveedor/decisionDeCostoSugerida";

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

    // ── ¿CÓMO VA MI LECTURA? ────────────────────────────────────────────
    //
    // Es lo que pregunta la pantalla cada dos segundos mientras dice "Leyendo
    // el papel…". Contesta en lo que tarda mirar un Map, así que este pedido no
    // puede vencer por tiempo ni aunque la lectura tarde un minuto.
    //
    // Devuelve 200 SIEMPRE que la pregunta se haya podido contestar, incluso
    // cuando la lectura falló: que una lectura salga mal no es un error de
    // ESTE pedido, y un estado HTTP de error acá haría que la pantalla lo
    // muestre como "el servidor contestó tal número" en vez del motivo.
    const turno = parametros.get("turno");
    if (turno) {
      const estado = mirarTurno(turno, { dueño: session.id });
      if (estado.estado === ESTADO_TURNO.LISTO || estado.estado === ESTADO_TURNO.FALLO) {
        // Ya lo leyó la pantalla: no hace falta que siga ocupando memoria.
        olvidarTurno(turno);
      }
      return NextResponse.json({ ok: true, turno: estado });
    }

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
      select: { explicacion: true, explicacionActualizadaEn: true, variacionNormalPct: true },
    });
    const papel = await papelDePrueba({ grupoId, proveedorId, comprobanteId });

    return NextResponse.json({
      ok: true,
      proveedor,
      explicacion: fila?.explicacion ?? "",
      actualizadaEn: fila?.explicacionActualizadaEn ?? null,
      // Cuánto se le mueve el precio a este proveedor sin que sea raro. Sin
      // receta cargada, el 10 % que decide el default del modelo.
      variacionNormalPct:
        fila?.variacionNormalPct != null ? Number(fila.variacionNormalPct) : VARIACION_POR_DEFECTO,
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

      // ── ACÁ ARRANCA LA LECTURA Y ACÁ MISMO SE CONTESTA ──────────────────
      //
      // Lo que sigue NO se espera. Se devuelve un número de turno en lo que
      // tarda una consulta a la base, y la pantalla pregunta por él cada dos
      // segundos. Así ningún proxy puede cortar por tiempo: no hay ningún
      // pedido HTTP largo que cortar.
      //
      // El porqué largo, con los 60 segundos de nginx medidos, está en
      // `lecturasEnCurso.js`.
      const turno = randomUUID();
      arrancarTurno({
        id: turno,
        dueño: session.id,
        trabajo: () => leerElPapel({ papel, receta: recetaProbada, proveedorId, grupoId, localId: ctx.localId }),
      });

      return NextResponse.json({
        ok: true,
        leyendo: true,
        turno,
        comprobanteId: papel.id,
      });
    }

    // ── GUARDAR: SOLO LA EXPLICACIÓN ────────────────────────────────────
    // ── LA VARIACIÓN NORMAL DEL PROVEEDOR ───────────────────────────────
    //
    // Se guarda con el mismo botón que la explicación, porque es lo mismo:
    // cómo se lee el papel de este proveedor. Un valor ausente NO la borra —el
    // formulario puede mandar la explicación sola— y uno fuera de rango se
    // rechaza en castellano en vez de guardarse y sorprender después.
    const variacionCruda = body?.variacionNormalPct;
    let variacion;
    if (variacionCruda !== undefined && variacionCruda !== null && variacionCruda !== "") {
      const v = Number(variacionCruda);
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        return NextResponse.json(
          {
            ok: false,
            error: "La variación normal de precios va de 0 a 100 por ciento.",
            queHacer: "La variación normal de precios va de 0 a 100 por ciento.",
          },
          { status: 400 }
        );
      }
      variacion = v;
    }

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
        ...(variacion !== undefined ? { variacionNormalPct: variacion } : {}),
      },
      update: {
        explicacion,
        explicacionActualizadaEn: new Date(),
        explicacionActualizadaPor: session.id,
        ...(variacion !== undefined ? { variacionNormalPct: variacion } : {}),
      },
      select: { id: true, explicacionActualizadaEn: true, variacionNormalPct: true },
    });

    // ── LOS PAPELES SIN RECIBIR SE PUEDEN RELEER CON LA RECETA NUEVA ────
    //
    // Cambiar la explicación cambia cómo se entiende el papel, así que un
    // comprobante subido ANTES quedó leído con la vieja. Le pasó al #247: la
    // receta se guardó a las 15:10 y el comprobante seguía con la lectura de
    // antes, con cero renglones.
    //
    // ESTO NO ES UN MECANISMO NUEVO. `recetas/guardar` —la otra pantalla de
    // receta, la de las respuestas estructuradas— ya ofrecía exactamente esto
    // con `ofrecerRelectura`, que además calcula cuántas entran en la cuota del
    // día. Lo que faltaba era conectarlo a ESTE camino, que es por el que
    // Emanuel guarda la explicación en castellano. Escribir acá una búsqueda
    // parecida al lado habría sido la regla 1 otra vez.
    const comprobantes = await prisma.comprobanteProveedor.findMany({
      where: { grupoId, proveedorId },
      select: { id: true, estado: true, confirmadoEn: true, imagenBorradaEn: true },
    });

    let cuota = null;
    try {
      const cadena = armarCadena();
      const modelos = [cadena.titular?.lector?.nombre, cadena.respaldo?.lector?.nombre].filter(Boolean);
      if (modelos.length) {
        const llamadas = await prisma.llamadaLector.findMany({
          where: { creadoEn: { gte: new Date(Date.now() - 48 * 3600 * 1000) } },
          select: { modelo: true, creadoEn: true, ok: true, motivo: true },
        });
        cuota = cuotaDelDia({ llamadas, modelos, huso: process.env.COMPROBANTE_CUOTA_HUSO || undefined });
      }
    } catch (e) {
      console.error("No se pudo calcular la cuota al guardar la explicación:", e?.message);
    }

    return NextResponse.json({
      ok: true,
      guardada: true,
      actualizadaEn: guardada.explicacionActualizadaEn,
      variacionNormalPct: Number(guardada.variacionNormalPct),
      // El costo en lecturas viaja con la respuesta para que el aviso aparezca
      // ANTES de que apriete, no después. Misma forma que `recetas/guardar`.
      relectura: ofrecerRelectura({ comprobantes, cuota }),
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


/**
 * LA LECTURA DE VERDAD. Corre APARTE del pedido que la pidió.
 *
 * Todo lo que antes vivía adentro del `POST` está acá igual, con una sola
 * diferencia: lo que antes se devolvía, ahora se devuelve al turno. Quien lo
 * espera es la pantalla, preguntando; nadie tiene un socket abierto mientras
 * tanto.
 *
 * NO ESCRIBE NADA del comprobante ni de la receta, igual que antes. Lo único
 * que escribe es la bitácora de llamadas, que gastó cuota igual que cualquier
 * otra y tiene que quedar registrada.
 */
async function leerElPapel({ papel, receta, proveedorId, grupoId, localId }) {
  const cadena = armarCadena();
  if (!cadena.titular?.ok) {
    return { ok: false, motivo: cadena.titular?.motivo, error: cadena.titular?.queHacer };
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
    return {
      ok: false,
      error: "No se pudo abrir la foto del comprobante.",
      queHacer: "Puede que la foto ya se haya borrado: viven siete días.",
    };
  }

  // ── LA PRUEBA MANDA LO MISMO QUE MANDA LA RECEPCIÓN ─────────────────
  //
  // Achicado incluido. Si la prueba mandara la foto entera y la recepción una
  // achicada, probar la explicación no estaría probando lo que después va a
  // pasar: sería una medición de otra cosa, que es peor que no medir.
  let paraLeer = archivos;
  try {
    const { default: sharp } = await import("sharp");
    paraLeer = await achicarTodas(archivos, sharp);
  } catch {
    paraLeer = archivos;
  }
  const ahorro = resumenDelAchicado(paraLeer);
  if (ahorro) {
    console.log(
      `[prueba de receta ${proveedorId}] achicado: ${ahorro.achicadas}/${ahorro.archivos} fotos, ` +
        `${Math.round(ahorro.antes / 1024)} KB → ${Math.round(ahorro.despues / 1024)} KB`
    );
  }

  const proveedor = await prisma.proveedor.findUnique({
    where: { id: proveedorId },
    select: { nombre: true },
  });
  const resultado = await leerConCadena({
    cadena,
    archivos: paraLeer,
    receta,
    proveedorNombre: proveedor?.nombre ?? null,
  });

  // La llamada SÍ se registra: gastó cuota igual que cualquier otra, y el
  // contador existe para que nadie se entere de que no quedan con el camión en
  // la puerta. Lo que no se escribe es el comprobante.
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
          // Fijo y no declarado: probar la receta es lo único que esta ruta
          // hace con el lector. Es el origen que explica las seis llamadas del
          // comprobante 13 que no reescribieron ningún renglón.
          origen: ORIGEN_DE_LECTURA.PRUEBA_DE_RECETA,
        })),
      });
    }
  } catch (e) {
    console.error("No se pudo registrar la llamada de la prueba:", e?.message);
  }

  if (!resultado.ok) {
    return {
      ok: false,
      motivo: resultado.motivo,
      error: queHacerLectura(resultado.motivo),
      detalle: (resultado.intentos || []).find((i) => !i.ok)?.detalle ?? null,
    };
  }

  // ── QUÉ PRODUCTO ES CADA RENGLÓN, SI SE PUEDE SABER YA ────────────────
  //
  // Solo por ALIAS: el código del proveedor o un nombre que alguien ya asoció
  // antes. Son los dos orígenes que el ERP ya considera automáticos
  // —`esAutomatico`— porque no requieren que nadie confirme nada.
  //
  // Para qué: para poder decir "el kilo" o "cada una" en vez de deducirlo del
  // peso impreso, que es justamente lo que no se puede hacer. Sin producto, el
  // renglón se muestra con su subtotal y sin unidad, que es la verdad.
  //
  // Si esto falla, la prueba sigue: la unidad es un rótulo, no el resultado.
  let productosPorIndice = null;
  try {
    const contexto = await cargarContexto(prisma, { grupoId, localId, proveedorId });
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

  return {
    ok: true,
    probado: true,
    comprobanteId: papel.id,
    resultado: comoLoEntendio({
      lectura: resultado.lectura,
      receta,
      productos: productosPorIndice,
    }),
    // La lectura cruda y la receta viajan para que la pantalla pueda rehacer
    // los dos controles con `comoLoEntendio` —la MISMA función— cuando alguien
    // corrige un número. Reconstruirlos del resultado ya armado sería un
    // segundo criterio esperando el día en que uno de los dos cambie.
    lectura: resultado.lectura,
    receta,
    // Y la unidad de cada renglón, para que esa segunda pasada no la pierda.
    // Viaja SOLO `unidad_medida`: el costo del producto no tiene nada que hacer
    // en la pantalla donde se prueba cómo se lee un papel.
    productos: (resultado.lectura?.lineas ?? []).map((_, i) => {
      const p = productosPorIndice?.get(i);
      return p ? { unidad_medida: p.unidad_medida } : null;
    }),
  };
}
