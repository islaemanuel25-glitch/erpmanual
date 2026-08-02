// GET /api/pos-ventas/arqueos/estado
//
// Estado de la alerta de arqueo para la caja abierta del cajero. Lo consulta el
// POS cada 45 s y al volver al foco. Es de SOLO LECTURA y no expone el efectivo
// esperado: el conteo es ciego, así que el número no puede viajar al cliente
// antes de que el cajero cuente.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  contextoArqueo,
  configArqueoDeLocal,
  ultimoArqueoDeTurno,
  postergacionesVigentes,
} from "@/lib/caja/arqueoServer";
import { estadoArqueo } from "@/lib/caja/arqueo";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const ctx = await contextoArqueo(req, {
      turnoId: req.nextUrl.searchParams.get("turnoId"),
      // Se permite consultar un turno cerrado: la respuesta dirá que no hay
      // alerta, que es exactamente lo que el POS necesita saber.
      exigirAbierto: false,
    });
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error, needsContexto: ctx.needsContexto },
        { status: ctx.status }
      );
    }

    const { localId, turno } = ctx;
    const config = await configArqueoDeLocal(localId);

    // Función apagada en este local: se responde temprano y explícito. El POS
    // usa `activo` para decidir si dibuja algo, así que no hace falta leer ni
    // el turno ni los arqueos. También evita el trabajo de contar filas que
    // nadie va a mirar.
    if (!config.arqueoCajaActivo) {
      return NextResponse.json({
        ok: true,
        activo: false,
        motivo: "funcion-desactivada",
        turnoId: turno?.id ?? null,
        estado: estadoArqueo({ ahora: new Date(), turno, config }),
        ultimoArqueoEn: null,
        cantidadArqueos: 0,
      });
    }

    if (!turno) {
      return NextResponse.json({
        ok: true,
        activo: true,
        motivo: "sin-caja-abierta",
        turnoId: null,
        estado: estadoArqueo({ ahora: new Date(), turno: null, config }),
        ultimoArqueoEn: null,
        cantidadArqueos: 0,
      });
    }

    const ultimo = await ultimoArqueoDeTurno(turno.id);
    const [postergaciones, cantidadArqueos] = await Promise.all([
      postergacionesVigentes(turno.id, ultimo?.fechaHora ?? null),
      prisma.arqueoCaja.count({ where: { turnoId: turno.id } }),
    ]);
    const vigente = postergaciones[0] ?? null;

    const estado = estadoArqueo({
      ahora: new Date(),
      turno,
      ultimoArqueoEn: ultimo?.fechaHora ?? null,
      postergadoHasta: vigente?.venceEn ?? null,
      cantidadPostergaciones: postergaciones.length,
      config,
    });

    return NextResponse.json({
      ok: true,
      activo: true,
      motivo: null,
      turnoId: turno.id,
      aperturaEn: turno.apertura,
      ultimoArqueoEn: ultimo?.fechaHora ?? null,
      cantidadArqueos,
      estado,
    });
  } catch (error) {
    console.error("Error consultando estado de arqueo:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
