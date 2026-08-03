// POST /api/pos-ventas/retiros/registrar
//
// RETIRO DE RECAUDACIÓN: contar el cajón, dejar el fondo y sacar el resto, en
// UNA sola operación atómica.
//
// Reemplaza al par "arqueo + CajaMovimiento manual". Antes el arqueo solo
// fotografiaba y el descuento dependía de que el cajero se acordara de crear el
// movimiento aparte; si lo olvidaba, el sistema le imputaba un faltante igual a
// lo que había retirado. Acá el movimiento lo crea la misma transacción: o pasan
// las dos cosas o no pasa ninguna.
//
// Lo que este endpoint NO hace, a propósito:
//   · no pide destino ni receptor — eso es la ENTREGA, y va aparte (etapa 4);
//   · no crea ajustes para "emparejar" una diferencia. Un faltante es un
//     hallazgo, no un movimiento de dinero: corregirlo con un asiento automático
//     haría desaparecer justo lo que hay que investigar;
//   · no cierra la caja.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  contextoArqueo,
  calcularEsperadoDeTurno,
  ultimoArqueoDeTurno,
  fondoObjetivoDeLocal,
} from "@/lib/caja/arqueoServer";
import { calcularDiferencia, clasificarDiferencia } from "@/lib/caja/efectivoEsperado";
import { TIPO_PARCIAL } from "@/lib/caja/arqueo";
import {
  resolverFondoObjetivo,
  sugerirRepartoRetiro,
  validarRepartoRetiro,
  motivoRetiroRecaudacion,
  validarIdempotencyKey,
} from "@/lib/caja/retiroDinero";

/** Forma común de respuesta, para que la UI lea siempre lo mismo. */
function serializarRetiro(fila, extra = {}) {
  return {
    id: fila.id,
    turnoId: fila.turnoId,
    fechaHora: fila.fechaHora,
    efectivoEsperado: Number(fila.efectivoEsperado),
    efectivoContado: Number(fila.efectivoContado),
    diferencia: Number(fila.diferencia),
    efectivoRetirado: fila.efectivoRetirado != null ? Number(fila.efectivoRetirado) : null,
    fondoObjetivo: fila.fondoObjetivo != null ? Number(fila.fondoObjetivo) : null,
    fondoDejado: fila.fondoDejado != null ? Number(fila.fondoDejado) : null,
    cajaMovimientoRetiroId: fila.cajaMovimientoRetiroId ?? null,
    estadoEntrega: fila.estadoEntrega ?? null,
    observacion: fila.observacion ?? null,
    ...extra,
  };
}

export async function POST(req) {
  // Se guardan FUERA del try para que el manejo de la carrera pueda usarlos.
  // Antes el catch hacía `req.clone().json()`, pero el body ya había sido
  // consumido por el `req.json()` de acá: el clon quedaba disturbed, la búsqueda
  // del registro ganador nunca se ejecutaba y el perdedor devolvía un error por
  // un retiro que SÍ se había registrado.
  let turnoIdRef = null;
  let claveRef = null;

  try {
    const body = await req.json().catch(() => ({}));
    const { turnoId, efectivoContado, fondoDejado, observacion, idempotencyKey } = body;
    turnoIdRef = Number(turnoId);
    claveRef = String(idempotencyKey ?? "").trim();

    // La clave es OBLIGATORIA, a diferencia del arqueo puro. En Postgres los NULL
    // no colisionan en un UNIQUE: una fila sin clave quedaría desprotegida, y
    // duplicar un retiro duplica el descuento. Se valida ANTES de tocar la base.
    const clave = validarIdempotencyKey(idempotencyKey);
    if (!clave.valido) {
      return NextResponse.json({ ok: false, error: clave.error }, { status: 400 });
    }

    // El local sale del contexto autenticado. `contextoArqueo` ya resuelve
    // sesión, permiso `pos.usar` y alcance, y ancla el turno al localId: un turno
    // de otro local simplemente no existe para esta consulta.
    const ctx = await contextoArqueo(req, { turnoId, exigirAbierto: true });
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error, needsContexto: ctx.needsContexto },
        { status: ctx.status }
      );
    }
    const { session, localId, turno } = ctx;

    if (!turno) {
      return NextResponse.json(
        { ok: false, error: "No hay una caja abierta para retirar" },
        { status: 409 }
      );
    }

    // Cero es válido —una caja puede quedar vacía—, así que no se rechaza por falsy.
    const contado = Number(efectivoContado);
    if (!Number.isFinite(contado) || contado < 0) {
      return NextResponse.json(
        { ok: false, error: "Ingresá el efectivo total contado" },
        { status: 400 }
      );
    }

    const resultado = await prisma.$transaction(async (tx) => {
      // ── Idempotencia: un reintento devuelve lo ya hecho ──────────────────
      const previo = await tx.arqueoCaja.findFirst({
        where: { turnoId: turno.id, idempotencyKey: clave.clave },
      });
      if (previo) return { fila: previo, repetido: true, calculo: null };

      // ── El turno se revalida DENTRO de la transacción ────────────────────
      // Entre el chequeo de arriba y este punto el turno pudo cerrarse. Un
      // retiro sobre una caja ya cerrada dejaría un movimiento que el cierre no
      // consideró en su esperado.
      const vigente = await tx.turno.findFirst({
        where: { id: turno.id, localId, cierre: null },
        select: { id: true, montoInicial: true, apertura: true, localId: true, vendedorId: true, operadorId: true },
      });
      if (!vigente) {
        const e = new Error("La caja ya fue cerrada.");
        e.codigo = "turno_cerrado";
        throw e;
      }

      // ── Esperado ANTES del retiro ────────────────────────────────────────
      // Fórmula única: `calcularEfectivoEsperado`. Se calcula antes de crear el
      // movimiento; si se calculara después, el propio retiro se restaría de su
      // esperado y el conteo mostraría un sobrante inventado por ese importe.
      const calculo = await calcularEsperadoDeTurno(vigente, tx);
      const esperado = calculo.efectivoEsperado;
      const diferencia = calcularDiferencia(contado, esperado);

      // ── Fondo objetivo y reparto ─────────────────────────────────────────
      const configurado = await fondoObjetivoDeLocal(localId, tx);
      const { fondoObjetivo, origen } = resolverFondoObjetivo({
        configurado,
        montoInicial: vigente.montoInicial,
      });

      const sugerido = sugerirRepartoRetiro({ efectivoContado: contado, fondoObjetivo });
      // El cajero puede dejar un fondo distinto del objetivo (hay días que hace
      // falta más cambio). Si no lo indica, se usa el sugerido.
      const dejado = fondoDejado === undefined || fondoDejado === null || fondoDejado === ""
        ? sugerido.fondoDejado
        : Number(fondoDejado);
      const retirado = Number.isFinite(Number(dejado))
        ? Number((contado - Number(dejado)).toFixed(2))
        : NaN;

      const reparto = validarRepartoRetiro({
        efectivoContado: contado,
        efectivoRetirado: retirado,
        fondoDejado: dejado,
      });
      if (!reparto.valido) {
        const e = new Error(reparto.error);
        e.codigo = "reparto_invalido";
        e.sugerido = sugerido;
        throw e;
      }

      const ahora = new Date();
      const ultimo = await ultimoArqueoDeTurno(turno.id, tx);

      // ── 1) El registro del retiro ────────────────────────────────────────
      const fila = await tx.arqueoCaja.create({
        data: {
          turnoId: vigente.id,
          localId: vigente.localId,
          usuarioId: vigente.vendedorId,
          operadorId: vigente.operadorId ?? null,
          realizadoPorId: session.id,
          fechaHora: ahora,
          periodoDesde: ultimo?.fechaHora ?? vigente.apertura,
          periodoHasta: ahora,
          efectivoEsperado: esperado,
          efectivoContado: contado,
          diferencia,
          observacion: observacion ? String(observacion).slice(0, 500) : null,
          tipo: TIPO_PARCIAL,
          efectivoRetirado: reparto.efectivoRetirado,
          fondoObjetivo,
          fondoDejado: reparto.fondoDejado,
          // Ya salió del cajón; falta documentar a quién se entregó.
          estadoEntrega: "PENDIENTE_ENTREGA",
          idempotencyKey: clave.clave,
        },
      });

      // ── 2) El movimiento que efectivamente descuenta ─────────────────────
      // Un retiro de $0 (todo queda como fondo) no genera movimiento: mover cero
      // no mueve plata y solo ensucia el historial.
      let movimientoId = null;
      if (reparto.efectivoRetirado > 0) {
        const mov = await tx.cajaMovimiento.create({
          data: {
            turnoId: vigente.id,
            usuarioId: session.id,
            tipo: "RETIRO",
            monto: reparto.efectivoRetirado,
            // Texto para que un humano lea el historial. El vínculo REAL es por
            // id, con UNIQUE en la base: nunca se busca por este texto.
            motivo: motivoRetiroRecaudacion(fila.id),
          },
        });
        movimientoId = mov.id;
      }

      // ── 3) El vínculo 1:1 ────────────────────────────────────────────────
      const conVinculo = await tx.arqueoCaja.update({
        where: { id: fila.id },
        data: { cajaMovimientoRetiroId: movimientoId },
      });

      return { fila: conVinculo, repetido: false, calculo, fondoObjetivo, origenFondo: origen };
    });

    const serializado = serializarRetiro(resultado.fila, {
      repetido: resultado.repetido,
      origenFondo: resultado.origenFondo ?? null,
    });

    return NextResponse.json({
      ok: true,
      repetido: resultado.repetido,
      retiro: serializado,
      estadoDiferencia: clasificarDiferencia(serializado.diferencia),
      // Desglose del esperado, para que la pantalla explique de dónde salió el
      // número en vez de mostrarlo suelto.
      desglose: resultado.calculo
        ? {
            montoInicial: resultado.calculo.montoInicial,
            ventasEfectivo: resultado.calculo.ventasEfectivo,
            ingresos: resultado.calculo.ingresos,
            retiros: resultado.calculo.retiros,
          }
        : null,
    });
  } catch (error) {
    if (error?.codigo === "turno_cerrado") {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    if (error?.codigo === "reparto_invalido") {
      return NextResponse.json(
        { ok: false, error: error.message, repartoInvalido: true, sugerido: error.sugerido },
        { status: 400 }
      );
    }
    // Carrera contra el único (turnoId, idempotencyKey): otra pestaña ganó y ya
    // creó este mismo retiro. NO es un error: se devuelve el que quedó, para que
    // el cliente vea el resultado real en vez de un fallo.
    if (error?.code === "P2002") {
      try {
        const donde = { turnoId: turnoIdRef, idempotencyKey: claveRef };
        // Reintento ACOTADO. El choque ocurre en el instante del INSERT, pero la
        // transacción ganadora todavía puede no haber commiteado: buscar una sola
        // vez devuelve `null` y el perdedor respondería un error por algo que sí
        // se registró. Con 4 intentos cortos alcanza y sigue estando acotado, así
        // que un fallo real nunca queda colgado.
        let existente = null;
        for (let intento = 0; intento < 4 && !existente; intento++) {
          if (intento > 0) await new Promise((r) => setTimeout(r, 120));
          existente = await prisma.arqueoCaja.findFirst({ where: donde });
        }
        if (existente) {
          return NextResponse.json({
            ok: true,
            repetido: true,
            retiro: serializarRetiro(existente, { repetido: true }),
            estadoDiferencia: clasificarDiferencia(Number(existente.diferencia)),
            desglose: null,
          });
        }
      } catch {
        // Si no se puede recuperar, cae al 409 genérico de abajo.
      }
      return NextResponse.json(
        { ok: false, error: "El retiro ya fue registrado", duplicado: true },
        { status: 409 }
      );
    }
    console.error("Error registrando retiro:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
