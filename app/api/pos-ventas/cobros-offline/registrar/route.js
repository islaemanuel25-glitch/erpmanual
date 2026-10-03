// POST /api/pos-ventas/cobros-offline/registrar
//
// REGISTRA EN EL SERVIDOR LOS COBROS QUE EL POS GUARDÓ SIN CONEXIÓN.
//
// Cuando vuelve la red, el POS manda acá su cola ANTES de intentar las ventas:
// así el servidor sabe que esos cobros existen y guarda su contenido aunque
// después se pierda el almacenamiento del navegador. Registrar no es vender:
// escribe solo `CobroOffline`. La venta la crea, o no, `/api/pos-ventas/crear`
// con sus reglas de siempre (DEC-0012).
//
// Cuerpo: { relojDispositivo: ms, cobros: [ítem de la cola, …] }.
// Respuesta: { ok: true, resultados: [{ clientTxnId, resultado, estado?, ventaId?, codigo? }] }.
//
// ── QUÉ NO EXIGE, Y POR QUÉ ────────────────────────────────────────────────
//
// No exige PIN: registrar es visibilidad, no autoriza nada. Si hay un PIN
// activo válido en el local, se anota quién registró. El voucher de cada cobro
// se verifica y se descarta: se guarda solo el operador que lo firmó.
//
// ── EL TOPE DEL CUERPO ─────────────────────────────────────────────────────
//
// Las rutas del App Router no tienen un límite de cuerpo configurable como las
// del Pages Router, así que se aplica acá: primero el Content-Length declarado
// y después el largo real del texto leído, antes de interpretar el JSON.
//
// Ver lib/pos-ventas/cobroOfflineServidor.js y lib/pos-ventas/cobroOffline.js.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { getOperadorActivoDelLocal, verificarVoucherOperador } from "@/lib/operador";
import { LIMITES_REGISTRO } from "@/lib/pos-ventas/cobroOffline";
import { registrarCobroOffline } from "@/lib/pos-ventas/cobroOfflineServidor";

const DEMASIADO_GRANDE = `El pedido supera los ${LIMITES_REGISTRO.bytesPorPedido / 1024} KB.`;

export async function POST(req) {
  try {
    const perm = requirePerm(req, "pos.usar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { localId, grupoId, session } = scope;

    const declarado = Number(req.headers.get("content-length"));
    if (Number.isFinite(declarado) && declarado > LIMITES_REGISTRO.bytesPorPedido) {
      return NextResponse.json({ ok: false, error: DEMASIADO_GRANDE }, { status: 413 });
    }
    const texto = await req.text();
    if (Buffer.byteLength(texto, "utf8") > LIMITES_REGISTRO.bytesPorPedido) {
      return NextResponse.json({ ok: false, error: DEMASIADO_GRANDE }, { status: 413 });
    }

    let body;
    try {
      body = JSON.parse(texto);
    } catch {
      return NextResponse.json({ ok: false, error: "El cuerpo no es JSON." }, { status: 400 });
    }
    const cobros = body?.cobros;
    if (!Array.isArray(cobros) || cobros.length === 0) {
      return NextResponse.json({ ok: false, error: "No hay cobros para registrar." }, { status: 400 });
    }
    if (cobros.length > LIMITES_REGISTRO.cobrosPorPedido) {
      return NextResponse.json(
        { ok: false, error: `Se registran hasta ${LIMITES_REGISTRO.cobrosPorPedido} cobros por pedido.` },
        { status: 400 }
      );
    }

    // Quién registra: la sesión y, si hay, el PIN activo validado en el local.
    const operadorActivo = await getOperadorActivoDelLocal(req, localId);
    const base = {
      localId,
      grupoId,
      usuarioId: session.id,
      operadorActivoId: operadorActivo?.operadorId ?? null,
      relojDispositivo: body.relojDispositivo,
    };

    const resultados = [];
    for (const cobro of cobros) {
      // El voucher se verifica acá y no viaja más allá: se guarda solo a quién
      // pertenece, y solo si es válido en este local.
      const operadorVerificadoId =
        cobro && typeof cobro === "object" ? verificarVoucherOperador(cobro.operadorVoucher, localId) : null;
      resultados.push(await registrarCobroOffline(prisma, { ...base, operadorVerificadoId }, cobro));
    }

    return NextResponse.json({ ok: true, resultados });
  } catch (err) {
    console.error("Error registrando cobros offline:", err);
    return NextResponse.json(
      { ok: false, error: "No se pudieron registrar los cobros offline. Reintentá cuando vuelva la conexión." },
      { status: 500 }
    );
  }
}
