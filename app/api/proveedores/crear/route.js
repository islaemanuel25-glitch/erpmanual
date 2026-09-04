// app/api/proveedores/crear/route.js
//
// DAR DE ALTA UN PROVEEDOR PARA LA UBICACIÓN ACTIVA.
//
// ── QUÉ CAMBIÓ, Y POR QUÉ NO ES "AFLOJAR UN PERMISO" ──────────────────────
//
// Esta ruta pedía `requireAdmin`. No era que el permiso estuviera mal asignado:
// `proveedores.crear` NO EXISTÍA en el catálogo, así que una ubicación que
// necesitaba un proveedor propio dependía de que un administrador lo diera de
// alta. Ahora el permiso existe y es lo único que se pregunta — nunca el nombre
// del rol. Admin sigue pasando por el comodín `*`, que `tieneAlguno` resuelve.
//
// EDITAR Y ELIMINAR SIGUEN SIENDO DE ADMIN, y esta tanda no los toca: los datos
// de `Proveedor` son globales —no hay `grupoId` y el `cuit` es único en toda la
// base— así que editarlos desde un local le cambiaría el proveedor a todas las
// demás ubicaciones que lo usan.
//
// ── LAS TRES SITUACIONES, Y NINGUNA PISA DATOS AJENOS ─────────────────────
//
// · El CUIT no existe → se crea el `Proveedor` y su `ProveedorLocal`.
// · El CUIT ya existe → **NO se crea otro y NO se le toca un solo campo**. Se
//   asocia el que está. La fila encontrada puede ser la que otro grupo usa todos
//   los días; escribirle el nombre que vino en el cuerpo se lo cambiaría a todos.
// · La asociación ya existe → es idempotente y contesta 200, no 409 ni 500.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import {
  ACCION,
  cuitParaBuscar,
  decidirAltaDeProveedor,
  claveAsociacion,
  correspondeAsociar,
} from "@/lib/proveedores/altaEnUbicacion";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    // EL PERMISO, Y SOLO EL PERMISO. Sin nombres de rol acá adentro.
    const perm = checkPerm(session, "proveedores.crear");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    // Regla B: marcar el local que da de alta el proveedor (fallback de
    // visibilidad hasta que tenga productos). Admin sin contexto activo → null.
    const scope = await resolveLocalAndGrupo(req);
    const grupoId = scope.error ? null : scope.grupoId ?? null;
    const localId = scope.error ? null : scope.localId ?? null;
    const creadoEnLocalId = localId;

    const body = await req.json();
    const {
      nombre,
      cuit,
      telefono,
      email,
      direccion,
      dias_pedido = [],
      activo = true,
    } = body;

    if (!nombre || nombre.trim() === "") {
      return NextResponse.json(
        { ok: false, error: "El nombre es requerido" },
        { status: 400 }
      );
    }

    // Normalizar dias_pedido contra el enum DiaPedido (sin acentos).
    // Acepta inputs viejos con acento ("Miércoles", "Sábado") y filtra falsy/inválidos.
    const DIAS_VALIDOS = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];
    const ACENTOS_LEGACY = { "Miércoles": "Miercoles", "Sábado": "Sabado" };

    const diasEnum = (Array.isArray(dias_pedido) ? dias_pedido : [])
      .map((d) => ACENTOS_LEGACY[d] || d)
      .filter((d) => DIAS_VALIDOS.includes(d));

    const cuitPedido = cuitParaBuscar(cuit);
    const hayUbicacion = correspondeAsociar({ grupoId, localId });

    // ── O ENTRA TODO O NO ENTRA NADA ───────────────────────────────────────
    //
    // El proveedor y su asociación van en LA MISMA transacción. Sin eso, un
    // fallo al asociar dejaría un `Proveedor` global creado que la ubicación no
    // ve, y la respuesta diría "error interno": quien lo intentara de nuevo
    // chocaría contra el único del CUIT sin entender por qué.
    const resultado = await prisma.$transaction(async (tx) => {
      const existente = cuitPedido
        ? await tx.proveedor.findUnique({ where: { cuit: cuitPedido }, select: { id: true } })
        : null;

      const decision = decidirAltaDeProveedor({ cuitPedido, existente });

      let proveedorId = decision.proveedorId;
      if (decision.accion === ACCION.CREAR) {
        const creado = await tx.proveedor.create({
          data: {
            nombre: nombre.trim(),
            cuit: cuitPedido,
            telefono: telefono || null,
            email: email || null,
            direccion: direccion || null,
            dias_pedido: diasEnum,
            activo: Boolean(activo),
            creadoEnLocalId,
          },
          select: { id: true },
        });
        proveedorId = creado.id;
      }
      // En la rama REUSAR no hay ningún `update`: es la regla entera de este
      // endpoint y por eso está escrita como una ausencia de código y no como
      // una condición. Ver `CAMPOS_GLOBALES` en el helper.

      let asociacion = null;
      if (hayUbicacion) {
        // IDEMPOTENTE POR DISEÑO, con la base como garantía dura.
        //
        // `upsert` sobre el único compuesto: si la fila no está, la crea; si
        // está, la deja activa. Reactivar una asociación dada de baja es lo que
        // "asociar" significa —y es lo honesto: no hacer nada dejaría al
        // proveedor invisible mientras la respuesta dice que salió bien—.
        asociacion = await tx.proveedorLocal.upsert({
          where: claveAsociacion({ grupoId, localId, proveedorId }),
          create: { grupoId, localId, proveedorId, activo: true },
          update: { activo: true },
          select: { id: true, grupoId: true, localId: true, proveedorId: true, activo: true },
        });
      }

      const item = await tx.proveedor.findUnique({ where: { id: proveedorId } });
      return { item, asociacion, accion: decision.accion, motivo: decision.motivo };
    });

    return NextResponse.json({
      ok: true,
      item: resultado.item,
      // Quien llama tiene derecho a saber si se creó un proveedor o se reusó uno
      // que ya existía. Sin esto, reusar y crear se ven idénticos desde afuera y
      // nadie se entera de que su alta se enganchó a la ficha de otro.
      proveedorCreado: resultado.accion === ACCION.CREAR,
      motivo: resultado.motivo,
      asociacion: resultado.asociacion,
      // Sin contexto de ubicación no se asocia nada, que es el camino que ya
      // existía para un administrador sin local activo.
      asociadoAUbicacion: Boolean(resultado.asociacion),
    });
  } catch (e) {
    // ── LA CARRERA QUE LA BASE ATAJA Y LA APLICACIÓN NO PUEDE ──────────────
    //
    // Dos altas simultáneas con el mismo CUIT: las dos leen "no existe" y las
    // dos intentan crear. La segunda choca contra el único de `cuit`. No es un
    // error del que la manda —el proveedor existe, que es lo que quería— así
    // que se le dice qué pasó en vez de contestar 500. El reintento resuelve
    // por la rama REUSAR, que es la correcta.
    //
    // Lo mismo vale para el único de la asociación: si dos pedidos crean la
    // misma, una gana y la otra reintenta idempotente.
    if (e?.code === "P2002") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Otro pedido dio de alta este proveedor al mismo tiempo. Volvé a intentar: " +
            "la segunda vez se asocia el que quedó, sin duplicarlo.",
          carrera: true,
        },
        { status: 409 }
      );
    }
    console.error("Error CREAR PROVEEDOR:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
