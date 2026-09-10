// app/api/transferencias/adoptar-presentacion/route.js
//
// RECIBIR UNA LÍNEA HISTÓRICA EN LA PRESENTACIÓN QUE EL DEPÓSITO USA HOY.
//
// ── QUÉ DECIDE EL OPERADOR Y QUÉ DECIDE EL SERVIDOR ──────────────────────
//
// El operador decide UNA cosa: que quiere contar esta línea en la presentación
// actual. Es una decisión suya y nunca automática — el sistema no sabe cómo
// salió la mercadería y no lo va a adivinar.
//
// Todo lo demás lo decide el servidor, y por eso el cuerpo de este POST tiene
// solo dos ids. La presentación, el factor y el peso salen del catálogo del
// producto releído acá adentro; la cantidad, de la física persistida. **Un
// cliente manipulado que mandara "PACK x6" sobre un producto que el catálogo
// dice x8 no tendría dónde meter ese dato**: no se lee.
//
// Es la misma regla que ya gobierna el producto no declarado —ver
// `linea-recepcion` y `UNIDAD_CONTRADICE_CATALOGO`—: el cliente no elige escalas.
//
// ── Y NO SE PISA UNA HISTORIA REGISTRADA ─────────────────────────────────
//
// Solo se adopta sobre una línea sin snapshot de despacho y que no sea agregada.
// Si la línea YA registró cómo salió, adoptar sería reemplazar un hecho
// observado por una preferencia de hoy. Se comprueba acá, sobre la relectura de
// adentro del lock, y no sobre lo que el cliente crea.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { presentacionDeSalida } from "@/lib/productos/presentacionDeProducto";
import {
  ErrorRecepcion,
  escalaDeRecepcion,
  estadoAdmiteRecepcion,
  puedeRecibir,
  reclamarOFallar,
} from "@/lib/transferencias/recepcionServidor";
import { milesimasFisicas } from "@/lib/transferencias/recepcion";
import {
  MOTIVOS_ADOPCION,
  admiteAdopcion,
  conversionParaAdoptar,
  hayPresentacionDistinta,
} from "@/lib/transferencias/adopcionDePresentacion";

/** Qué contestarle a cada motivo. Textos accionables, no códigos pelados. */
const MENSAJES = {
  [MOTIVOS_ADOPCION.YA_TIENE_SNAPSHOT]:
    "Esta línea ya registró en qué presentación salió del origen. No se reemplaza por la del catálogo de hoy.",
  [MOTIVOS_ADOPCION.ES_AGREGADA]:
    "Esta línea se agregó durante la recepción: su presentación ya salió del catálogo del origen al informarla.",
  [MOTIVOS_ADOPCION.SIN_CAMBIO]:
    "El catálogo del origen dice la misma presentación que ya se está mostrando. No hay nada que adoptar.",
  [MOTIVOS_ADOPCION.FACTOR_INVALIDO]:
    "El producto agrupa pero su factor actual no sirve para convertir. Revisá el factor de pack antes de adoptarlo.",
  [MOTIVOS_ADOPCION.PESO_INVALIDO]:
    "El producto se cuenta por pieza y no tiene un peso de referencia válido. Sin ese peso no se puede acreditar el stock del destino.",
  [MOTIVOS_ADOPCION.NO_REPRESENTABLE]:
    "La cantidad histórica no se puede representar exactamente en la presentación actual. Se mantiene como está: convertirla obligaría a redondear.",
};

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const perm = checkPerm(session, "transferencias.recibir");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const body = await req.json();
    const transferenciaId = Number(body?.transferenciaId || 0);
    const detalleId = Number(body?.detalleId || 0);
    if (!transferenciaId || !detalleId) {
      return NextResponse.json(
        { ok: false, error: "transferenciaId y detalleId son obligatorios" },
        { status: 400 }
      );
    }

    const transferencia = await prisma.transferencia.findUnique({
      where: { id: transferenciaId },
      select: { id: true, origenId: true, destinoId: true, estado: true },
    });
    if (!transferencia) {
      return NextResponse.json(
        { ok: false, error: "Transferencia no encontrada" },
        { status: 404 }
      );
    }

    const alcance = puedeRecibir(session, transferencia);
    if (!alcance.ok) {
      return NextResponse.json({ ok: false, error: alcance.error }, { status: alcance.status });
    }

    const estado = estadoAdmiteRecepcion(transferencia.estado, {
      accion: "adoptar la presentación actual",
    });
    if (!estado.ok) {
      return NextResponse.json({ ok: false, error: estado.error }, { status: estado.status });
    }

    const usuarioId = Number(session.id);

    const resultado = await prisma.$transaction(async (tx) => {
      // El mismo mutex que las otras cuatro escrituras de recepción. Adoptar
      // mientras otro confirma es la misma carrera que cualquier otra.
      await reclamarOFallar(tx, transferencia.id, "Recibiendo");

      // ── LA RELECTURA ES LA QUE MANDA ────────────────────────────────
      const d = await tx.transferenciaDetalle.findFirst({
        where: { id: detalleId, transferenciaId: transferencia.id },
        include: { producto: { include: { base: true } } },
      });
      if (!d) {
        throw new ErrorRecepcion(
          "DETALLE_INEXISTENTE",
          "Detalle inexistente o de otra transferencia",
          400
        );
      }

      const admite = admiteAdopcion(d);
      if (!admite.ok) {
        throw new ErrorRecepcion(admite.motivo, MENSAJES[admite.motivo], 409);
      }

      // ── LA PRESENTACIÓN SALE DEL CATÁLOGO, NO DEL PEDIDO ────────────
      //
      // Y es la de SALIDA DEL DEPÓSITO AL LOCAL, que es la única pregunta que
      // la recepción tiene derecho a hacer. Por eso entra `modo_envio`: un
      // producto que agrupa pero que el depósito solo despacha suelto no puede
      // proponerse como "PACK x6". Lo que NO entra es `modoCompraProveedor`:
      // cómo el depósito le compra al proveedor no decide nada acá.
      const base = d.producto?.base;
      const actual = presentacionDeSalida({
        unidadMedida: base?.unidad_medida,
        factorPack: base?.factor_pack,
        modoEnvio: base?.modo_envio,
        modoVentaDeposito: base?.modoVentaDeposito,
        pesoReferenciaKg: base?.pesoReferenciaKg,
        pesoEsFijo: base?.pesoEsFijo,
        // SIN `contadoEn`: lo que se adopta es cómo sale hoy del depósito.
      });

      // Contra la lectura histórica: si dicen lo mismo, no hay nada que adoptar.
      const escala = escalaDeRecepcion(d);
      if (!hayPresentacionDistinta(actual, escala.envio)) {
        throw new ErrorRecepcion(
          MOTIVOS_ADOPCION.SIN_CAMBIO,
          MENSAJES[MOTIVOS_ADOPCION.SIN_CAMBIO],
          409
        );
      }

      // ── LA CANTIDAD FÍSICA ES LA AUTORIDAD Y NO SE TOCA ─────────────
      //
      // Sale de la escala canónica —la misma que usan revisar, guardar,
      // confirmar y el detalle— así que una histórica en BULTO con su factor
      // viejo se lee igual que siempre antes de convertirse.
      const fisicasM = milesimasFisicas({
        cantidad: escala.cantidad,
        sueltas: escala.sueltas,
        unidad: escala.unidad,
        factorPack: escala.factorPack,
      });
      if (fisicasM === null) {
        throw new ErrorRecepcion(
          MOTIVOS_ADOPCION.NO_REPRESENTABLE,
          MENSAJES[MOTIVOS_ADOPCION.NO_REPRESENTABLE],
          409
        );
      }

      const conv = conversionParaAdoptar({
        fisicasM,
        presentacion: actual.presentacion,
        factor: actual.factor,
        pesoPiezaKg: actual.pesoPiezaKg,
      });
      if (!conv.ok) {
        throw new ErrorRecepcion(conv.motivo, MENSAJES[conv.motivo], 409);
      }

      // ── SE CONGELA, CON SU PROCEDENCIA ──────────────────────────────
      //
      // Los cinco campos del snapshot MÁS la marca de adopción. Sin esa marca la
      // línea afirmaría que se despachó así, que es falso. `cantidad` no se
      // toca: la física histórica sigue siendo la que movió stock.
      const actualizado = await tx.transferenciaDetalle.update({
        where: { id: d.id },
        data: {
          presentacionEnvio: actual.presentacion,
          cantidadPresentada: conv.cantidadPresentada,
          sueltasEnviadas: conv.sueltasEnviadas,
          factorPresentacion: conv.factorPresentacion,
          pesoPiezaKg: conv.pesoPiezaKg,
          presentacionAdoptadaAt: new Date(),
          presentacionAdoptadaPorId: usuarioId,
        },
        select: {
          id: true,
          cantidad: true,
          unidadEnviada: true,
          presentacionEnvio: true,
          cantidadPresentada: true,
          sueltasEnviadas: true,
          factorPresentacion: true,
          pesoPiezaKg: true,
          presentacionAdoptadaAt: true,
          presentacionAdoptadaPorId: true,
        },
      });

      return { ok: true, detalle: actualizado };
    });

    return NextResponse.json(resultado);
  } catch (err) {
    if (err.name === "ErrorRecepcion") {
      return NextResponse.json(
        { ok: false, codigo: err.code, error: err.message },
        { status: err.status || 409 }
      );
    }
    console.error("ERROR adoptar presentacion:", err);
    return NextResponse.json(
      { ok: false, error: "No se pudo adoptar la presentación actual." },
      { status: 500 }
    );
  }
}
