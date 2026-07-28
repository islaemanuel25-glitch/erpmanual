// app/api/pos-ventas/corregir-simple/route.js
//
// CORRECCIÓN SIMPLE de una venta (Fase A). Modifica ÚNICAMENTE datos
// descriptivos: cliente / observaciones / referencia interna. NO toca stock,
// pagos, total ni cuenta corriente. Deja rastro inmutable en VentaCorreccion
// (fuente principal del historial) + una fila compacta en AuditoriaBitacora
// (visibilidad en la bitácora central, sin duplicar el snapshot completo).
//
// Concurrencia: bloqueo optimista por Venta.version (el UI envía la versión que
// cargó; si otra corrección la incrementó en el medio → 409 conflicto).

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import {
  esVentaFiada,
  estadoVentanaCorreccion,
  prepararCambiosSimple,
  validarMotivo,
  snapshotSimple,
} from "@/lib/pos-ventas/correccion";

const j = (body, status = 200) => NextResponse.json(body, { status });

export async function POST(req, { params }) {
  try {
    const session = getUsuarioSession(req);
    if (!session) return j({ ok: false, error: "No autenticado" }, 401);

    const perm = checkPerm(session, "ventas.corregir_simple");
    if (!perm.ok) return j({ ok: false, error: perm.error }, perm.status);

    const { id } = await params;
    const ventaId = Number(id);
    if (!ventaId || Number.isNaN(ventaId)) {
      return j({ ok: false, error: "ID de venta inválido" }, 400);
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      return j({ ok: false, error: "Cuerpo inválido" }, 400);
    }

    // Motivo obligatorio.
    const vm = validarMotivo(body.motivo);
    if (!vm.ok) return j({ ok: false, error: vm.error, code: vm.code }, 400);

    // Versión esperada obligatoria (bloqueo optimista).
    const expectedVersion = Number(body.version);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      return j({ ok: false, error: "Falta la versión de la venta.", code: "version_requerida" }, 400);
    }

    // Cargar venta con pagos (para determinar fiado) y datos correctibles.
    const venta = await prisma.venta.findUnique({
      where: { id: ventaId },
      select: {
        id: true, numero: true, localId: true, turnoId: true, fecha: true,
        total: true, esFiado: true, clienteId: true, observaciones: true,
        referenciaInterna: true, version: true, operadorId: true,
        pagos: { select: { medio: true } },
        cliente: { select: { id: true, nombre: true } },
      },
    });
    if (!venta) return j({ ok: false, error: "Venta no encontrada" }, 404);

    // Scope de local: un no-admin solo corrige ventas de SU local. Ajeno → 404
    // (no revela existencia), consistente con reportes-ventas/detalle.
    if (!session.esAdmin && venta.localId !== Number(session.localId)) {
      return j({ ok: false, error: "Venta no encontrada" }, 404);
    }

    // Ventana de 30 días.
    const ventana = estadoVentanaCorreccion(venta);
    if (ventana.fueraDeVentana) {
      return j(
        { ok: false, error: `Fuera de la ventana de corrección (${ventana.diasTranscurridos} días).`, code: "fuera_de_ventana" },
        409
      );
    }

    // Normalizar cambios (rechaza campos fuera del contrato SIMPLE).
    const prep = prepararCambiosSimple(body, venta);
    if (!prep.ok) return j({ ok: false, error: prep.error, code: prep.code }, 400);

    // Cambiar cliente en venta FIADA NO se permite desde SIMPLE (movería la deuda
    // de CC a otro cliente → requiere corrección COMPLETA).
    if (prep.cambiaCliente && esVentaFiada(venta)) {
      return j(
        { ok: false, error: "No se puede cambiar el cliente de una venta fiada desde la corrección simple. Requiere corrección completa.", code: "requiere_correccion_completa" },
        409
      );
    }

    if (Object.keys(prep.cambios).length === 0) {
      return j({ ok: false, error: "No hay cambios para aplicar.", code: "sin_cambios" }, 400);
    }

    // Validar cliente nuevo (existe y pertenece al grupo del local de la venta).
    const grupoId = await getGrupoIdDeLocal(venta.localId);
    let clienteNuevo = null;
    if (prep.cambiaCliente && prep.cambios.clienteId != null) {
      clienteNuevo = await prisma.cliente.findFirst({
        where: { id: prep.cambios.clienteId, grupoId: grupoId ?? undefined },
        select: { id: true, nombre: true },
      });
      if (!clienteNuevo) {
        return j({ ok: false, error: "El cliente seleccionado no existe en este grupo.", code: "cliente_invalido" }, 400);
      }
    }

    // ¿El turno original está cerrado? (informativo para la corrección simple: no
    // hay impacto de caja, pero se registra el estado por trazabilidad).
    let turnoCerrado = false;
    if (venta.turnoId) {
      const turno = await prisma.turno.findUnique({ where: { id: venta.turnoId }, select: { cierre: true } });
      turnoCerrado = !!(turno && turno.cierre); // Turno cerrado = tiene fecha de cierre.
    }

    const snapAntes = snapshotSimple(venta, { clienteNombre: venta.cliente?.nombre ?? null });

    // ---- Transacción: corrección + versionado optimista + libro + bitácora ----
    const resultado = await prisma.$transaction(async (tx) => {
      // Snapshot DESPUÉS (proyección de los cambios sobre el estado actual).
      const nuevoClienteNombre = prep.cambiaCliente
        ? (prep.cambios.clienteId == null ? null : clienteNuevo?.nombre ?? null)
        : (venta.cliente?.nombre ?? null);
      const snapDespues = {
        ...snapAntes,
        clienteId: "clienteId" in prep.cambios ? prep.cambios.clienteId : snapAntes.clienteId,
        clienteNombre: nuevoClienteNombre,
        observaciones: "observaciones" in prep.cambios ? prep.cambios.observaciones : snapAntes.observaciones,
        referenciaInterna: "referenciaInterna" in prep.cambios ? prep.cambios.referenciaInterna : snapAntes.referenciaInterna,
        version: expectedVersion + 1,
      };

      // Libro de correcciones (fuente principal). Simple: diferencia económica 0.
      const correccion = await tx.ventaCorreccion.create({
        data: {
          ventaId: venta.id,
          tipo: "SIMPLE",
          motivo: vm.motivo,
          usuarioId: session.id ?? null,
          operadorId: venta.operadorId ?? null,
          localId: venta.localId,
          grupoId: grupoId ?? null,
          turnoIdOriginal: venta.turnoId ?? null,
          turnoIdCorreccion: null, // simple: sin impacto de caja
          turnoCerrado,
          versionAntes: expectedVersion,
          versionDespues: expectedVersion + 1,
          totalAnterior: venta.total,
          totalNuevo: venta.total, // invariante en simple
          diferencia: 0,
          snapshotAntes: snapAntes,
          snapshotDespues: snapDespues,
          diffProductos: null, // simple no toca productos
          diffPagos: null, // simple no toca pagos
          impactoStock: null, // simple no toca stock
          impactoCaja: null, // simple no toca caja
        },
      });

      // Aplicar con guardia de versión (bloqueo optimista). Si otra corrección
      // avanzó la versión en el medio → count 0 → rollback → 409.
      const upd = await tx.venta.updateMany({
        where: { id: venta.id, version: expectedVersion },
        data: {
          ...prep.cambios,
          version: { increment: 1 },
          corregida: true,
          ultimaCorreccionId: correccion.id,
        },
      });
      if (upd.count === 0) {
        // Fuerza rollback de la correccion recién creada.
        throw new Error("CONFLICT_VERSION");
      }

      // Bitácora central COMPACTA (una fila; sin snapshot gigante ni duplicar el
      // libro). Cambios legibles campo→campo.
      const campos = [];
      if (prep.cambiaCliente) {
        campos.push({
          campo: "clienteId", label: "Cliente",
          antes: snapAntes.clienteNombre || "Consumidor final",
          despues: nuevoClienteNombre || "Consumidor final",
        });
      }
      if ("observaciones" in prep.cambios) {
        campos.push({ campo: "observaciones", label: "Observaciones", antes: snapAntes.observaciones, despues: prep.cambios.observaciones });
      }
      if ("referenciaInterna" in prep.cambios) {
        campos.push({ campo: "referenciaInterna", label: "Referencia interna", antes: snapAntes.referenciaInterna, despues: prep.cambios.referenciaInterna });
      }
      await tx.auditoriaBitacora.create({
        data: {
          usuarioId: session.id ?? null,
          operadorId: venta.operadorId ?? null,
          localId: venta.localId,
          grupoId: grupoId ?? null,
          accion: "venta.corregir_simple",
          entidad: "Venta",
          entidadId: String(venta.id),
          entidadNombre: `Ticket #${venta.numero}`,
          cambios: [{ entidad: "Venta", nombre: `Ticket #${venta.numero}`, id: String(venta.id), campos, motivo: vm.motivo }],
        },
      });

      return { correccionId: correccion.id, versionNueva: expectedVersion + 1 };
    });

    return j({
      ok: true,
      correccionId: resultado.correccionId,
      version: resultado.versionNueva,
      corregida: true,
    });
  } catch (error) {
    if (error?.message === "CONFLICT_VERSION") {
      return j(
        { ok: false, error: "La venta fue modificada por otra corrección. Recargá y volvé a intentar.", code: "conflicto_version" },
        409
      );
    }
    console.error("Error en corregir-simple:", error);
    return j({ ok: false, error: "Error interno" }, 500);
  }
}
