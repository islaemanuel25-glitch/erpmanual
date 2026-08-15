import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { requireAdmin, requirePerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";

// LEER LA FICHA DE UN LOCAL. Medido con una sesión de CAJERO del local 1: pedía
// `/api/locales/2` y le contestaba 200 con la ficha entera de "mini el 7". El
// `authorize` de abajo compara GRUPO, no local, así que cualquier local del
// mismo grupo pasaba — y a eso no le faltaba tenancy, le faltaba permiso.
//
// No va `requireAdmin` aunque el PUT y el DELETE lo usen: la ficha la leen dos
// pantallas que no son de administración —el POS pide su propio local, y
// `pos-transferencias/nueva` pide el origen y el destino—. Se pide el permiso de
// esas pantallas, y el admin pasa igual porque `requirePerm` lo deja pasar solo.
const PERMISO_VER_LOCAL = [
  "pos.usar",
  "pos_transferencias.ver",
  "pos_transferencias.enviar",
];

// ── Helper: auth + tenancy sin depender de ?localId ─────

async function authorize(req, numId) {
  // 1. Session
  const session = getUsuarioSession(req);
  if (!session) {
    return { error: "No autenticado", status: 401 };
  }

  // 2. Grupo del local que se quiere operar
  const grupoIdDelLocal = await getGrupoIdDeLocal(numId);
  if (!grupoIdDelLocal) {
    return { error: "Local no encontrado.", status: 404 };
  }

  // 3. Si es admin, permitir acceso sin exigir grupo/local en session
  if (session.esAdmin === true) {
    return { session, grupoId: grupoIdDelLocal };
  }

  // 4. Grupo del usuario (solo para NO admin)
  let grupoIdDelUsuario = session.grupoId || null;
  if (!grupoIdDelUsuario && session.localId) {
    grupoIdDelUsuario = await getGrupoIdDeLocal(session.localId);
  }
  if (!grupoIdDelUsuario) {
    return { error: "Seleccioná un grupo/local válido.", status: 403 };
  }

  // 5. Comparar
  if (grupoIdDelUsuario !== grupoIdDelLocal) {
    return { error: "Sin permiso para ese local.", status: 403 };
  }

  return { session, grupoId: grupoIdDelLocal };
}

// ========================================================
// GET /api/locales/:id
// ========================================================
export async function GET(req, context) {
  try {
    // EL PERMISO VA PRIMERO, antes de mirar el id: hasta saber quién pregunta, la
    // forma del pedido tampoco se contesta. Es la regla que el censo dejó escrita
    // a partir de `pos-ventas/arqueos/listar`.
    const permiso = requirePerm(req, PERMISO_VER_LOCAL);
    if (!permiso.ok) {
      return NextResponse.json(
        { ok: false, error: permiso.error },
        { status: permiso.status }
      );
    }

    const { id } = await context.params;
    const numId = Number(id);

    if (!numId || Number.isNaN(numId)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const auth = await authorize(req, numId);
    if (auth.error) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }

    const local = await prisma.local.findUnique({
      where: { id: numId },
      include: {
        grupoLocales: { include: { grupo: true } },
        grupoDepositos: { include: { grupo: true } },
      },
    });

    if (!local) {
      return NextResponse.json(
        { ok: false, error: "Local no encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, item: local });

  } catch (e) {
    console.error("GET LOCAL ERROR:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

// ========================================================
// PUT /api/locales/:id
// ========================================================
export async function PUT(req, context) {
  try {
    const admin = requireAdmin(req);
    if (!admin.ok) return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });

    const { id } = await context.params;
    const numId = Number(id);

    if (!numId || Number.isNaN(numId)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const auth = await authorize(req, numId);
    if (auth.error) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }

    const body = await req.json();

    const esDeposito =
      body?.tipo === "deposito" || body?.es_deposito === true;

    const actualizado = await prisma.local.update({
      where: { id: numId },
      data: {
        nombre: body.nombre,
        tipo: body.tipo ?? "local",
        direccion: body.direccion ?? null,
        telefono: body.telefono ?? null,
        email: body.email ?? null,
        cuil: body.cuil ?? null,
        ciudad: body.ciudad ?? null,
        provincia: body.provincia ?? null,
        codigoPostal: body.codigoPostal ?? null,
        activo: body.activo ?? true,
        es_deposito: esDeposito,
      },
    });

    return NextResponse.json({ ok: true, item: actualizado });

  } catch (e) {
    console.error("EDITAR LOCAL ERROR:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

// ========================================================
// DELETE /api/locales/:id
// ========================================================
export async function DELETE(req, context) {
  try {
    const admin = requireAdmin(req);
    if (!admin.ok) return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });

    const { id } = await context.params;
    const numId = Number(id);

    if (!numId || Number.isNaN(numId)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const auth = await authorize(req, numId);
    if (auth.error) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }

    await prisma.local.delete({ where: { id: numId } });

    return NextResponse.json({ ok: true });

  } catch (e) {
    console.error("ELIMINAR LOCAL ERROR:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

