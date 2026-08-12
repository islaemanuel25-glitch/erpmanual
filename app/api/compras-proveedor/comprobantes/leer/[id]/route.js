// POST /api/compras-proveedor/comprobantes/leer/[id]
//
// Lee un comprobante ya subido y guarda lo que se leyó. Es lo que cierra el
// circuito subida → lectura, y el único lugar donde una lectura se convierte en
// filas de la base.
//
// ── LO QUE ESTA RUTA GARANTIZA ─────────────────────────────────────────────
//
// 1. TODA lectura pasa por la puerta antes de guardarse. No hay camino que
//    escriba lo que devolvió el modelo sin verificarlo.
// 2. Si no cierra, el comprobante queda MAL_LEIDO, sin identidad y sin líneas
//    aplicables. De ahí no sale ninguna propuesta de costo.
// 3. NO REINTENTA SOLA. Decidido el 2026-08-11: con cuota diaria, reintentar
//    solo puede quemarla en un comprobante que igual no se va a poder leer. El
//    intento se cuenta y se puede reintentar a mano.
// 4. El consumo y el modelo se guardan pase lo que pase, incluso cuando la
//    lectura sale mal. Una lectura fallida consumió igual.
//
// ── EL ARCHIVO PUEDE NO ESTAR, Y ES NORMAL ─────────────────────────────────
//
// La imagen vive siete días. Pedir la lectura de un comprobante viejo cuya foto
// ya se borró NO es un error del sistema: es la ventana funcionando. Se contesta
// con eso dicho, y no con un 500.

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { pasarPorLaPuerta, queHacerLectura } from "@/lib/compras-proveedor/comprobante/lector";
import { armarCadena, leerConCadena } from "@/lib/compras-proveedor/comprobante/lector/cadena";
import {
  recetaDelProveedor,
  fechaLeidaONull,
} from "@/lib/compras-proveedor/comprobante/lector/recetaDelProveedor";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";

export async function POST(req, { params }) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    }
    const { grupoId, session } = ctx;

    const perm = checkPerm(session, "compras.recibir");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const { id } = await params;
    const comprobanteId = Number(id);
    if (!Number.isFinite(comprobanteId) || comprobanteId <= 0) {
      return NextResponse.json({ ok: false, error: "id requerido" }, { status: 400 });
    }

    // El alcance va en el WHERE, no en un chequeo después: así un comprobante de
    // otro grupo no existe, en vez de existir y estar prohibido.
    const comprobante = await prisma.comprobanteProveedor.findFirst({
      where: { id: comprobanteId, grupoId },
      select: {
        id: true,
        proveedorId: true,
        estado: true,
        imagenBorradaEn: true,
        estado: true,
        cerroEnIntento: true,
        // TODAS las fotos, en orden: se leen juntas como el papel que son.
        archivos: {
          orderBy: { orden: "asc" },
          select: { orden: true, ubicacion: true, mime: true, nombre: true },
        },
        intentosLectura: true,
        proveedor: { select: { nombre: true } },
      },
    });
    if (!comprobante) {
      return NextResponse.json({ ok: false, error: "No existe ese comprobante." }, { status: 404 });
    }

    // Releer uno ya leído se permite —una lectura puede haber salido mal y
    // haberse arreglado la receta— pero uno ANULADO no: liberó su número y
    // volver a escribirle identidad lo resucitaría a medias.
    if (comprobante.estado === "ANULADO") {
      return NextResponse.json(
        { ok: false, error: "El comprobante está anulado.", queHacer: "Subilo de nuevo si hace falta." },
        { status: 409 }
      );
    }

    const fotos = (comprobante.archivos || []).filter((a) => a.ubicacion);
    if (comprobante.imagenBorradaEn || !fotos.length) {
      // No es un error del sistema: es la ventana de siete días funcionando.
      return NextResponse.json(
        {
          ok: false,
          error: "La imagen de este comprobante ya no está.",
          queHacer:
            "Las fotos viven siete días desde que se suben. Este comprobante se puede " +
            "completar a mano, o volver a subir la foto si todavía la tenés.",
        },
        { status: 410 }
      );
    }

    // ── La cadena: titular y respaldo ────────────────────────────────────
    //
    // El respaldo se usa SOLO si el titular falla por cuota o por servicio
    // caído. Ver cadena.js: pasar por una respuesta ilegible convertiría "el
    // modelo se equivocó" en "probemos hasta que alguno diga algo".
    const cadena = armarCadena();
    const eleccion = cadena.titular;
    if (!eleccion.ok) {
      // El intento NO se cuenta: no hubo lectura. Contar un intento que nunca
      // salió haría que el contador midiera problemas de configuración en vez de
      // dificultad de lectura, que es lo que interesa mirar.
      return NextResponse.json(
        { ok: false, error: eleccion.queHacer, motivo: eleccion.motivo },
        { status: 503 }
      );
    }

    // ── La receta del proveedor: es lo que guía qué buscar ───────────────
    const recetaFila = await prisma.recetaProveedor.findUnique({
      where: { grupoId_proveedorId: { grupoId, proveedorId: comprobante.proveedorId } },
    });
    const { receta, version: recetaVersion, esGenerica } = recetaDelProveedor(recetaFila);

    // Se leen TODAS antes de mandar: si falta una, no se manda media factura.
    // Media factura leída daría una cuenta que no cierra por el motivo
    // equivocado, y la puerta la marcaría como mal leída culpando al modelo.
    let archivosLeidos;
    try {
      archivosLeidos = await Promise.all(
        fotos.map(async (f) => ({ bytes: await readFile(f.ubicacion), mime: f.mime, orden: f.orden }))
      );
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo abrir el archivo del comprobante.",
          queHacer: "Puede que el almacén no esté montado. Avisá.",
        },
        { status: 503 }
      );
    }

    // ── La lectura ───────────────────────────────────────────────────────
    const resultado = await leerConCadena({
      cadena,
      archivos: archivosLeidos,
      receta,
      proveedorNombre: comprobante.proveedor?.nombre ?? null,
    });

    // ── CADA LLAMADA QUEDA REGISTRADA, HAYA SALIDO BIEN O MAL ────────────
    //
    // La cadena informa cuántas hubo: pasar al respaldo son DOS, y la del
    // titular gastó cuota aunque haya devuelto 429. De acá sale el número de
    // lecturas que quedan en el día, y contar solo las que salieron bien lo
    // mostraría más alto de lo que es.
    //
    // Best-effort: si esto falla, la lectura NO se pierde. Es un contador, no
    // un dato del comprobante, y hacerlo bloqueante convertiría un problema de
    // estadística en un problema de operación.
    try {
      const intentos = Array.isArray(resultado.intentos) ? resultado.intentos : [];
      if (intentos.length) {
        await prisma.llamadaLector.createMany({
          data: intentos.map((i) => ({
            modelo: i.lector,
            ok: i.ok === true,
            motivo: i.ok ? null : i.motivo ?? null,
            comprobanteId: comprobante.id,
          })),
        });
      }
    } catch (e) {
      console.error("No se pudo registrar la llamada al lector:", e?.message);
    }

    if (!resultado.ok) {
      // Acá SÍ se cuenta el intento: hubo una lectura y salió mal. Se suma, no se
      // pisa, para que se vea que hubo que insistir.
      await prisma.comprobanteProveedor.update({
        where: { id: comprobante.id },
        // Se guarda QUIÉN intentó último: si se pasó al respaldo, es el
        // respaldo el que falló, y anotar el titular contaría otra historia.
        data: {
          intentosLectura: { increment: 1 },
          modeloLectura: resultado.lector ?? eleccion.lector.nombre,
          usoRespaldo: resultado.usoRespaldo === true,
          motivoPaseRespaldo: resultado.porQuePaso ?? null,
        },
      });
      return NextResponse.json(
        {
          ok: false,
          motivo: resultado.motivo,
          error: queHacerLectura(resultado.motivo),
          // Se dice explícitamente que no reintenta sola, para que nadie se quede
          // esperando que se resuelva.
          reintentaSola: false,
          usoRespaldo: resultado.usoRespaldo === true,
          porQuePaso: resultado.porQuePaso ?? null,
          intentos: comprobante.intentosLectura + 1,
        },
        { status: 502 }
      );
    }

    // ── LA PUERTA. Toda lectura pasa por acá antes de guardarse ──────────
    const puerta = pasarPorLaPuerta({ lectura: resultado.lectura, receta, recetaVersion });

    const guardado = await prisma.$transaction(async (tx) => {
      // Releer reemplaza las líneas anteriores: si quedaran, una lectura vieja y
      // una nueva convivirían y la suma daría cualquier cosa.
      await tx.comprobanteLinea.deleteMany({ where: { comprobanteId: comprobante.id } });

      const actualizado = await tx.comprobanteProveedor.update({
        where: { id: comprobante.id },
        data: {
          ...puerta.aGuardar,
          leidoEn: new Date(),
          intentosLectura: { increment: 1 },
          usoRespaldo: resultado.usoRespaldo === true,
          motivoPaseRespaldo: resultado.porQuePaso ?? null,
          // EN QUÉ INTENTO CERRÓ POR PRIMERA VEZ. Solo se escribe la primera
          // vez que cierra: releer uno que ya había cerrado no puede reescribir
          // su historia, o el número de "cerró a la primera" se iría inflando
          // solo. Sin esto, después de veinte facturas reales no habría número.
          ...(puerta.cierra && comprobante.cerroEnIntento == null
            ? { cerroEnIntento: comprobante.intentosLectura + 1 }
            : {}),
          // La fecha viene del papel como texto: se convierte acá, y si no se
          // entiende queda en null en vez de en una fecha inventada.
          fecha: fechaLeidaONull(puerta.aGuardar.fecha),
        },
        select: { id: true, estado: true, diferenciaCentavos: true, intentosLectura: true },
      });

      // Las líneas se guardan SIEMPRE, cierre o no. Son lo que alguien va a
      // mirar para entender por qué no cerró: sin ellas, un MAL_LEIDO sería un
      // cartel sin nada detrás.
      const lineas = resultado.lectura.lineas.filter((l) => l.cantidad !== null && l.netoUnitario !== null);
      if (lineas.length) {
        await tx.comprobanteLinea.createMany({
          data: lineas.map((l, i) => ({
            comprobanteId: comprobante.id,
            orden: i + 1,
            textoCrudo: l.descripcion ?? "(sin descripción)",
            // El código del proveedor es el primer escalón de la cascada de
            // vínculo, y el único que no interpreta nada. Se guardaba nada:
            // el lector lo leía y esta ruta lo tiraba.
            codigoProveedor: l.codigoProveedor ?? null,
            cantidad: l.cantidad,
            netoUnitario: l.netoUnitario,
            subtotalImpreso: l.subtotalImpreso ?? l.netoUnitario * l.cantidad,
            internoUnitario: l.internoUnitario ?? null,
          })),
        });
      }
      return { actualizado, cuantasLineas: lineas.length };
    });

    return NextResponse.json({
      ok: true,
      comprobanteId: comprobante.id,
      estado: guardado.actualizado.estado,
      cierra: puerta.cierra,
      // La única puerta hacia una propuesta de costo.
      proponeCostos: puerta.proponeCostos,
      porque: puerta.porque,
      diferenciaCentavos: puerta.diferenciaCentavos,
      lineasIncoherentes: puerta.lineasIncoherentes ?? [],
      lineas: guardado.cuantasLineas,
      fotos: fotos.length,
      modelo: resultado.lectura.modelo,
      recetaGenerica: esGenerica,
      // Cuál leyó y si hubo que ir al respaldo. El nombre del modelo ya los
      // distingue, pero contar cuántas veces el titular se quedó sin cuota no
      // tiene que depender de deducirlo.
      usoRespaldo: resultado.usoRespaldo === true,
      porQuePaso: resultado.porQuePaso ?? null,
      intentos: guardado.actualizado.intentosLectura,
      consumo: resultado.lectura.consumo,
    });
  } catch (err) {
    console.error("Error compras-proveedor/comprobantes/leer:", err);
    return NextResponse.json({ ok: false, error: errorInesperado({
        operacion: "leer el comprobante",
        quedo: "El comprobante y su foto quedaron guardados, así que no hay que volver a subirlo.",
      }) }, { status: 500 });
  }
}

