// POST /api/pos-ventas/arqueos/registrar
//
// Registra un arqueo PARCIAL: la foto contable de un conteo físico.
//
// Lo que este endpoint NO hace, a propósito:
//   · no cierra la caja;
//   · no toca ventas ni movimientos;
//   · no crea ajustes para "emparejar" una diferencia;
//   · no arrastra las diferencias de arqueos anteriores.
// Un faltante es un hallazgo, no un movimiento de dinero. Corregirlo con un
// asiento automático haría desaparecer justamente lo que hay que investigar.
//
// El efectivo esperado se calcula ACÁ, dentro de la transacción, con la hora
// real de confirmación. Nunca se acepta el total que envía el frontend: entre
// que el cajero abre el formulario y confirma puede entrar una venta, y esa
// venta tiene que estar en el esperado.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  contextoArqueo,
  configArqueoDeLocal,
  calcularEsperadoDeTurno,
  ultimoArqueoDeTurno,
  postergacionesVigentes,
  serializarArqueo,
} from "@/lib/caja/arqueoServer";
import { calcularDiferencia, clasificarDiferencia } from "@/lib/caja/efectivoEsperado";
import { estadoArqueo, TIPO_PARCIAL } from "@/lib/caja/arqueo";

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    // `tipo` NO se lee del body a propósito: esta ruta solo produce PARCIAL.
    // El arqueo FINAL lo crea exclusivamente el flujo de cierre
    // (/api/pos-ventas/turnos/cerrar), que es el único que tiene el conteo
    // definitivo y cierra la caja. Si el tipo viniera del cliente, cualquiera
    // podría fabricar un "cierre contable" sin cerrar el turno.
    const { turnoId, efectivoContado, observacion, idempotencyKey } = body;

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
        { ok: false, error: "No hay una caja abierta para arquear" },
        { status: 409 }
      );
    }

    // El conteo es un número obligatorio y no negativo. Cero es válido —una caja
    // puede quedar vacía— así que no se rechaza por falsy.
    const contado = Number(efectivoContado);
    if (!Number.isFinite(contado) || contado < 0) {
      return NextResponse.json(
        { ok: false, error: "Ingresá el efectivo contado" },
        { status: 400 }
      );
    }

    // La configuración se relee del SERVIDOR, no se acepta del cliente.
    // Ocultar el botón en el POS no alcanza: sin esta barrera, un cajero podría
    // registrar arqueos parciales llamando la API a mano en un local que tiene
    // la función apagada.
    const config = await configArqueoDeLocal(localId);
    if (!config.arqueoCajaActivo) {
      return NextResponse.json(
        {
          ok: false,
          error: "Los arqueos parciales están desactivados en este local",
          funcionInactiva: true,
        },
        { status: 409 }
      );
    }

    const arqueo = await prisma.$transaction(async (tx) => {
      // Idempotencia: dos envíos del mismo conteo (doble clic, dos pestañas)
      // devuelven el arqueo ya creado en vez de duplicarlo.
      if (idempotencyKey) {
        const previo = await tx.arqueoCaja.findFirst({
          where: { turnoId: turno.id, idempotencyKey: String(idempotencyKey) },
          include: {
            realizadoPor: { select: { nombre: true } },
            usuario: { select: { nombre: true } },
            operador: { select: { nombre: true } },
          },
        });
        if (previo) return { fila: previo, repetido: true };
      }

      const ahora = new Date();
      const calculo = await calcularEsperadoDeTurno(turno, tx);
      const esperado = calculo.efectivoEsperado;
      const diferencia = calcularDiferencia(contado, esperado);

      const ultimo = await ultimoArqueoDeTurno(turno.id, tx);
      const periodoDesde = ultimo?.fechaHora ?? turno.apertura;

      // Estado de la alerta en el momento del conteo: sirve para dejar asentado
      // si se llegó a tiempo y cuántas veces se postergó.
      const postergaciones = await postergacionesVigentes(turno.id, ultimo?.fechaHora ?? null, tx);
      const estado = estadoArqueo({
        ahora,
        turno,
        ultimoArqueoEn: ultimo?.fechaHora ?? null,
        postergadoHasta: postergaciones[0]?.venceEn ?? null,
        cantidadPostergaciones: postergaciones.length,
        config,
      });

      const fila = await tx.arqueoCaja.create({
        data: {
          turnoId: turno.id,
          localId: turno.localId,
          usuarioId: turno.vendedorId,
          operadorId: turno.operadorId ?? null,
          realizadoPorId: session.id,
          fechaHora: ahora,
          periodoDesde,
          periodoHasta: ahora,
          efectivoEsperado: esperado,
          efectivoContado: contado,
          diferencia,
          observacion: observacion ? String(observacion).slice(0, 500) : null,
          tipo: TIPO_PARCIAL,
          alertaProgramadaPara: estado.alertaProgramadaPara ?? null,
          minutosDemora: estado.minutosDemora ?? 0,
          fuePostergado: postergaciones.length > 0,
          postergadoPorId: postergaciones[0]?.postergadoPorId ?? null,
          motivoPostergacion: postergaciones[0]?.motivo ?? null,
          cantidadPostergaciones: postergaciones.length,
          idempotencyKey: idempotencyKey ? String(idempotencyKey) : null,
        },
        include: {
          realizadoPor: { select: { nombre: true } },
          usuario: { select: { nombre: true } },
          operador: { select: { nombre: true } },
        },
      });

      return { fila, repetido: false, calculo };
    });

    const serializado = serializarArqueo(arqueo.fila);
    return NextResponse.json({
      ok: true,
      repetido: arqueo.repetido,
      arqueo: serializado,
      estadoDiferencia: clasificarDiferencia(serializado.diferencia),
      // Desglose del esperado, para que la pantalla de resultado explique de
      // dónde salió el número en vez de mostrarlo suelto.
      desglose: arqueo.calculo
        ? {
            montoInicial: arqueo.calculo.montoInicial,
            ventasEfectivo: arqueo.calculo.ventasEfectivo,
            ingresos: arqueo.calculo.ingresos,
            retiros: arqueo.calculo.retiros,
          }
        : null,
    });
  } catch (error) {
    // Choque contra el único (turnoId, idempotencyKey): otra pestaña ganó la
    // carrera. No es un error para el usuario.
    if (error?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "El arqueo ya fue registrado", duplicado: true },
        { status: 409 }
      );
    }
    console.error("Error registrando arqueo:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
