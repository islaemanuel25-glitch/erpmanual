import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt"; // ✅ unificado con seed
import { getUsuarioSession } from "@/lib/auth";
import {
  autorizarGestionUsuarios,
  validarRolAsignable,
  validarLocalObligatorio,
  dentroDeAlcance,
} from "@/lib/usuarios/gestion";

export async function PUT(req, context) {
  try {
    const session = getUsuarioSession(req);
    const auth = autorizarGestionUsuarios(session);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    // ⚠️ En Next 15 params es un Promise: hay que hacer await
    const { id } = await context.params;
    const userId = Number(id);

    if (!userId || Number.isNaN(userId)) {
      return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
    }

    // Usuario objetivo (para scope + validaciones de rol/local efectivos).
    const objetivo = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { id: true, localId: true, rolId: true, rol: { select: { nombre: true } } },
    });
    if (!objetivo) {
      return NextResponse.json({ ok: false, error: "Usuario no encontrado." }, { status: 404 });
    }

    // Scope: un gestor por-local solo edita usuarios de SU local (ajeno → 403).
    if (auth.viaLocal && !dentroDeAlcance(auth, objetivo.localId)) {
      return NextResponse.json({ ok: false, error: "Usuario fuera de tu alcance." }, { status: 403 });
    }

    const body = await req.json();
    const data = {};

    if (body?.nombre !== undefined) {
      const nombre = String(body.nombre).trim();
      if (!nombre) return NextResponse.json({ ok: false, error: "Nombre requerido." }, { status: 400 });
      data.nombre = nombre;
    }

    if (body?.email !== undefined) {
      const email = String(body.email).trim().toLowerCase();
      if (!email) return NextResponse.json({ ok: false, error: "Email requerido." }, { status: 400 });
      data.email = email;
    }

    if (body?.password !== undefined && String(body.password).trim() !== "") {
      data.passwordHash = await bcrypt.hash(String(body.password), 10);
    }

    // ROL: validar que sea asignable por el actor (no-admin no asigna Admin/"*").
    let rolNombreEfectivo = objetivo.rol?.nombre ?? null;
    if (body?.rolId !== undefined) {
      const rolId = Number(body.rolId);
      if (!rolId || Number.isNaN(rolId)) {
        return NextResponse.json({ ok: false, error: "Rol inválido." }, { status: 400 });
      }
      const vRol = await validarRolAsignable(rolId, { esAdmin: auth.esAdmin });
      if (vRol.error) return NextResponse.json({ ok: false, error: vRol.error }, { status: vRol.status });
      data.rolId = rolId;
      rolNombreEfectivo = vRol.rol.nombre;
    }

    // LOCAL: un no-admin no puede mover usuarios a/desde otro local.
    let localIdEfectivo = objetivo.localId;
    if (body?.localId !== undefined) {
      let localId = body.localId;
      if (localId === "" || localId === null || localId === undefined) {
        localId = null;
      } else {
        localId = Number(localId);
        if (Number.isNaN(localId)) localId = null;
      }
      if (auth.viaLocal && localId !== auth.localId) {
        return NextResponse.json({ ok: false, error: "Local fuera de tu alcance." }, { status: 403 });
      }
      data.localId = localId;
      localIdEfectivo = localId;
    }

    // Los roles de sistema por-local exigen localId (rol y local EFECTIVOS).
    const vLocal = validarLocalObligatorio(rolNombreEfectivo, localIdEfectivo);
    if (vLocal.error) return NextResponse.json({ ok: false, error: vLocal.error }, { status: vLocal.status });

    if (body?.activo !== undefined) {
      data.activo = Boolean(body.activo);
    }

    const editado = await prisma.usuario.update({
      where: { id: userId },
      data,
      include: { rol: true, local: true },
    });

    return NextResponse.json({ ok: true, usuario: editado }, { status: 200 });
  } catch (e) {
    if (e?.code === "P2002") {
      return NextResponse.json({ ok: false, error: "Ya existe un usuario con ese email." }, { status: 409 });
    }
    if (e?.code === "P2025") {
      return NextResponse.json({ ok: false, error: "Usuario no encontrado." }, { status: 404 });
    }

    console.error("❌ usuarios/editar", e);
    return NextResponse.json({ ok: false, error: "Error al editar usuario." }, { status: 500 });
  }
}
