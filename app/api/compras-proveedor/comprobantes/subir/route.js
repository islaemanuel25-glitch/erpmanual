// POST /api/compras-proveedor/comprobantes/subir
//
// Sube fotos, PDF o Excel. Por defecto cada archivo crea SU comprobante, en
// PENDIENTE_LECTURA; con `agruparEnUno` o `comprobanteId` varias fotos se
// cuelgan de un mismo comprobante, porque una factura larga viene en varias.
// Esta ruta NO lee el papel y no propone ningún costo.
//
// ── EL ORDEN, QUE NO ES CASUAL ─────────────────────────────────────────────
//
// alcance y permiso → EL VOLUMEN → leer bytes → hashear → validar → duplicados
// → por cada archivo: fila sin ubicación → escribir → completar la ubicación.
//
// EL CHEQUEO DEL VOLUMEN VA ANTES DE TODO LO CARO. Si el almacén no está, no
// tiene sentido leer 15 MB de cada archivo para descubrirlo al final.
//
// ── LA UBICACIÓN SE ESCRIBE ÚLTIMA, Y ESA ES LA CLAVE ──────────────────────
//
// La fila de la foto se crea antes que el archivo por un motivo concreto: el
// nombre del archivo lleva el id del comprobante y el orden de la página, y ese
// id lo da la base. Pero se crea SIN `ubicacion`, y ese campo se completa recién
// cuando el archivo ya está escrito en el volumen.
//
// Así, si la escritura falla, lo que queda es una foto sin ubicación —que todo
// el resto del sistema trata como "sin imagen", que es la verdad— y nunca una
// que promete un archivo inexistente. Es la asimetría correcta: mejor una fila
// que admite no tener foto que una que miente.
//
// El otro extremo posible es un archivo escrito cuya fila no llegó a
// actualizarse: un huérfano en el volumen. Molesta menos, porque no le miente a
// nadie, y el paquete de descarga se arma desde las filas y no desde el
// directorio.

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import {
  exigirAlmacen,
  inspeccionarAlmacen,
  traducirErrorDeEscritura,
  AlmacenNoDisponible,
} from "@/lib/compras-proveedor/comprobante/almacenDisco";
import { calcularVencimiento } from "@/lib/compras-proveedor/comprobante/retencionImagen";
import {
  LIMITES_COMPROBANTE,
  evaluarTanda,
  queHacer,
} from "@/lib/compras-proveedor/comprobante/subida";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";

export async function POST(req) {
  try {
    // ── 1. Alcance y permiso ─────────────────────────────────────────────
    //
    // Mismo par que usa `recibir`: el contexto sale de la sesión —nunca del
    // cuerpo— y el permiso se pregunta por CÓDIGO, no por nombre de rol, como
    // las otras 123 rutas. Subir es parte de recibir: quien recibe la mercadería
    // es quien tiene el papel en la mano.
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    }
    const { grupoId, localId, session } = ctx;

    const perm = checkPerm(session, "compras.recibir");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    // ── 2. EL VOLUMEN, ANTES DE LEER UN SOLO BYTE ────────────────────────
    //
    // Si no está montado se corta acá, con el motivo adentro. Sin esto, la
    // escritura funcionaría igual sobre el disco del contenedor y las fotos se
    // perderían al recrearlo — silenciosamente, que es lo peor.
    const almacen = await inspeccionarAlmacen();
    if (!almacen.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: almacen.motivo,
          queHacer:
            "No se pueden guardar comprobantes hasta que se arregle el almacén. " +
            "Avisá: el procedimiento está en docs/RUNBOOK-VOLUMEN-COMPROBANTES.md.",
        },
        { status: 503 }
      );
    }

    // ── 3. Los archivos ──────────────────────────────────────────────────
    const form = await req.formData();
    const proveedorId = Number(form.get("proveedorId"));
    if (!Number.isFinite(proveedorId) || proveedorId <= 0) {
      return NextResponse.json(
        { ok: false, error: "Falta el proveedor.", queHacer: "Elegí el proveedor antes de subir." },
        { status: 400 }
      );
    }
    const pedidoIdCrudo = form.get("pedidoId");
    const pedidoId = Number(pedidoIdCrudo) > 0 ? Number(pedidoIdCrudo) : null;

    // ── QUÉ FOTOS SON EL MISMO PAPEL ─────────────────────────────────────
    //
    // Una factura larga viene en varias fotos: la de DAS son dos, encabezado y
    // pie. Leyendo una sola, el total a verificar queda en una imagen y las
    // líneas que tiene que sumar en la otra, así que NUNCA cerraría.
    //
    // Quién lo decide es quien sube, no el sistema: no hay forma de saber si
    // tres fotos son tres facturas o tres páginas de una sin mirarlas.
    //
    //   · `comprobanteId` — estas fotos son páginas MÁS de ese comprobante. Es
    //     el caso de sacar el pie después de haber subido el encabezado.
    //   · `agruparEnUno` — todas las de ESTA tanda son un solo comprobante.
    //   · sin ninguno de los dos — una foto, un comprobante, que es el caso
    //     común y el comportamiento de siempre.
    const comprobanteExistenteId = Number(form.get("comprobanteId")) > 0
      ? Number(form.get("comprobanteId"))
      : null;
    const agruparEnUno = form.get("agruparEnUno") === "true";

    const archivos = form.getAll("archivos").filter((f) => f && typeof f.arrayBuffer === "function");

    // Se leen los bytes y se hashea ANTES de evaluar la tanda, porque el
    // duplicado dentro de la tanda se decide por contenido y no por nombre: dos
    // toques en el celular adjuntan el mismo archivo con el mismo nombre, pero
    // también con el mismo contenido, y el nombre se puede repetir sin que sean
    // el mismo archivo.
    const leidos = [];
    for (const f of archivos) {
      const bytes = Buffer.from(await f.arrayBuffer());
      leidos.push({
        nombre: f.name,
        tamano: bytes.length,
        mime: f.type,
        hash: createHash("sha256").update(bytes).digest("hex"),
        bytes,
      });
    }

    const tanda = evaluarTanda(leidos);
    if (!tanda.ok && tanda.codigo) {
      // Falla del CONJUNTO —ninguno, o demasiados—: no hay nada por archivo que
      // informar.
      return NextResponse.json(
        { ok: false, error: tanda.error, codigo: tanda.codigo, queHacer: queHacer(tanda.codigo) },
        { status: 400 }
      );
    }

    // ── 4. Duplicados contra lo YA subido ────────────────────────────────
    //
    // El hash es la segunda red de la identidad: la de negocio —proveedor,
    // punto de venta, número— atrapa el mismo comprobante recargado, y el hash
    // atrapa el mismo ARCHIVO. Acá solo puede funcionar la segunda, porque
    // todavía no se leyó el número.
    const hashes = leidos.filter((_, i) => tanda.resultados[i]?.ok).map((a) => a.hash);
    const yaEstaban = hashes.length
      ? await prisma.comprobanteArchivo.findMany({
          where: {
            hash: { in: hashes },
            comprobante: { grupoId, proveedorId, estado: { not: "ANULADO" } },
          },
          select: { hash: true, comprobanteId: true },
        })
      : [];
    const hashRepetido = new Map(yaEstaban.map((c) => [c.hash, c.comprobanteId]));

    // ── 5. Un comprobante para todas, o uno por foto ─────────────────────
    //
    // Si se agrupan, el comprobante se crea UNA vez y las fotos se le cuelgan
    // en orden. El orden importa: el lector las manda como páginas de un mismo
    // papel, y el pie después del encabezado se entiende distinto que al revés.
    let comprobanteAgrupado = null;
    if (comprobanteExistenteId) {
      const existente = await prisma.comprobanteProveedor.findFirst({
        where: { id: comprobanteExistenteId, grupoId },
        select: { id: true, estado: true, _count: { select: { archivos: true } } },
      });
      if (!existente) {
        return NextResponse.json({ ok: false, error: "No existe ese comprobante." }, { status: 404 });
      }
      if (existente.estado === "ANULADO") {
        return NextResponse.json(
          { ok: false, error: "El comprobante está anulado.", queHacer: "Subí las fotos como uno nuevo." },
          { status: 409 }
        );
      }
      comprobanteAgrupado = existente;
    }

    let ordenSiguiente = (comprobanteAgrupado?._count?.archivos ?? 0) + 1;
    const resultados = [];
    for (let i = 0; i < leidos.length; i++) {
      const a = leidos[i];
      const veredicto = tanda.resultados[i];

      if (!veredicto.ok) {
        resultados.push({ ...veredicto, comprobanteId: null });
        continue;
      }

      if (hashRepetido.has(a.hash)) {
        resultados.push({
          indice: i,
          nombre: a.nombre,
          ok: false,
          codigo: "YA_SUBIDO",
          error: "Este archivo ya se había subido para este proveedor.",
          queHacer: "No hace falta subirlo de nuevo: ya está en la lista.",
          comprobanteId: hashRepetido.get(a.hash),
        });
        continue;
      }

      // El comprobante se crea una sola vez si se agrupan; si no, uno por foto.
      if (!comprobanteAgrupado || (!agruparEnUno && !comprobanteExistenteId)) {
        comprobanteAgrupado = await prisma.comprobanteProveedor.create({
          data: {
            grupoId,
            proveedorId,
            pedidoId,
            localOperativoId: localId,
            usuarioId: session?.id ?? session?.usuarioId ?? null,
            estado: "PENDIENTE_LECTURA",
            // Los siete días corren desde la SUBIDA, no desde la lectura ni
            // desde la confirmación: es lo que se le prometió a quien sube.
            venceEn: calcularVencimiento(new Date()),
          },
          select: { id: true },
        });
        if (!agruparEnUno && !comprobanteExistenteId) ordenSiguiente = 1;
      }
      const creado = comprobanteAgrupado;
      const ordenDeEsta = ordenSiguiente;
      ordenSiguiente += 1;

      // La foto se crea SIN ubicación, y se completa recién cuando el archivo
      // está escrito. Si la escritura falla queda una foto que admite no tener
      // archivo, nunca una que promete uno inexistente.
      const foto = await prisma.comprobanteArchivo.create({
        data: {
          comprobanteId: creado.id,
          orden: ordenDeEsta,
          nombre: a.nombre,
          tamano: a.tamano,
          mime: a.mime || null,
          hash: a.hash,
        },
        select: { id: true },
      });

      try {
        const proveedor = await prisma.proveedor.findUnique({
          where: { id: proveedorId },
          select: { nombre: true },
        });
        // `exigirAlmacen` vuelve a preguntar por el volumen, ahora sí antes de
        // ESTA escritura. No es redundante con el chequeo del paso 2: entre uno
        // y otro pudo caerse el montaje, y este es el que protege de verdad.
        const destino = await exigirAlmacen({
          comprobanteId: creado.id,
          proveedorNombre: proveedor?.nombre,
          orden: ordenDeEsta,
          extension: (a.nombre.split(".").pop() || "jpg"),
        });
        await writeFile(destino.rutaAbsoluta, a.bytes);
        await prisma.comprobanteArchivo.update({
          where: { id: foto.id },
          data: { ubicacion: destino.rutaAbsoluta },
        });
        resultados.push({
          indice: i,
          nombre: a.nombre,
          ok: true,
          comprobanteId: creado.id,
          orden: ordenDeEsta,
          tamano: a.tamano,
        });
      } catch (e) {
        const traducido = traducirErrorDeEscritura(e, almacen.ruta);
        const esDeAlmacen = traducido instanceof AlmacenNoDisponible;
        resultados.push({
          indice: i,
          nombre: a.nombre,
          ok: false,
          codigo: "NO_SE_PUDO_GUARDAR",
          error: esDeAlmacen ? traducido.motivo : "No se pudo guardar el archivo.",
          queHacer: esDeAlmacen
            ? "Avisá: es un problema del almacén, no del archivo."
            : "Probá de nuevo. Si sigue fallando, avisá.",
          comprobanteId: creado.id,
        });
      }
    }

    const subidos = resultados.filter((r) => r.ok).length;
    return NextResponse.json({
      ok: subidos > 0,
      subidos,
      fallados: resultados.length - subidos,
      resultados,
      limites: {
        tamanoMaxBytes: LIMITES_COMPROBANTE.tamanoMaxBytes,
        archivosMax: LIMITES_COMPROBANTE.archivosMax,
        extensiones: LIMITES_COMPROBANTE.extensiones,
      },
    });
  } catch (err) {
    console.error("Error compras-proveedor/comprobantes/subir:", err);
    return NextResponse.json({ ok: false, error: errorInesperado({
        operacion: "subir los comprobantes",
        quedo: "Puede que alguno haya entrado igual: mirá la lista antes de volver a subirlos, para no cargarlos dos veces.",
      }) }, { status: 500 });
  }
}
