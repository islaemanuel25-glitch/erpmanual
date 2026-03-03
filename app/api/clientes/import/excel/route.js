import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo, getGrupoIdDeLocal } from "@/lib/grupos";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import * as XLSX from "xlsx";

// Helper: normalizar teléfono (solo dígitos)
function normalizarTelefono(val) {
  if (!val) return null;
  const tel = String(val).replace(/\D/g, "");
  return tel.length > 0 ? tel : null;
}

// Helper: normalizar email (trim + lowercase)
function normalizarEmail(val) {
  if (!val) return null;
  const email = String(val).trim().toLowerCase();
  return email.length > 0 ? email : null;
}

// Helper: parsear decimal
function parseDecimal(val) {
  if (val === "" || val === null || val === undefined) return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

// Helper: parsear activo
function parseActivo(val) {
  if (val === "" || val === null || val === undefined) return true;
  const s = String(val).toLowerCase().trim();
  if (s === "no" || s === "false" || s === "0" || s === "inactivo") return false;
  return true;
}

export async function POST(req) {
  try {
    // Validar autenticación
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "clientes.crear");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    // Leer FormData
    const formData = await req.formData();
    const file = formData.get("file");
    const modoParam = formData.get("modo");
    const localIdFromForm = formData.get("localId");

    // Obtener localId: admin puede usar FormData, no-admin forzado a session.localId
    let localId;
    if (session.esAdmin && localIdFromForm) {
      localId = Number(localIdFromForm);
    } else {
      localId = session.localId ? Number(session.localId) : null;
    }

    if (!localId || localId <= 0) {
      return NextResponse.json(
        { ok: false, error: "No hay contexto operativo activo." },
        { status: 400 }
      );
    }

    // Obtener grupoId: primero de session, luego del local
    let grupoId = session.grupoId ? Number(session.grupoId) : null;
    if (!grupoId) {
      grupoId = await getGrupoIdDeLocal(localId);
    }

    if (!grupoId) {
      return NextResponse.json(
        { ok: false, error: "No se pudo determinar el grupo" },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json(
        { ok: false, error: "Archivo requerido" },
        { status: 400 }
      );
    }

    // Validar modo
    const modo = modoParam || "crear_actualizar";
    if (!["crear", "actualizar", "crear_actualizar"].includes(modo)) {
      return NextResponse.json(
        { ok: false, error: "Modo inválido. Debe ser: crear, actualizar o crear_actualizar" },
        { status: 400 }
      );
    }

    // Parsear Excel
    const bytes = await file.arrayBuffer();
    const wb = XLSX.read(bytes, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];

    if (!ws) {
      return NextResponse.json(
        { ok: false, error: "El archivo no tiene hojas" },
        { status: 400 }
      );
    }

    const filas = XLSX.utils.sheet_to_json(ws, { defval: "" });

    if (filas.length === 0) {
      return NextResponse.json(
        { ok: false, error: "El archivo está vacío" },
        { status: 400 }
      );
    }

    // Cargar tags existentes del local
    const tagsExistentes = await prisma.tagCliente.findMany({
      where: { localId },
      select: { id: true, nombre: true },
    });
    const tagMap = new Map();
    tagsExistentes.forEach((t) => {
      tagMap.set(t.nombre.toLowerCase().trim(), t);
    });

    // Procesar filas
    const detalle = [];
    let creados = 0;
    let actualizados = 0;
    let errores = 0;
    let skip = 0;

    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const numFila = i + 2; // +2 porque fila 1 es header
      const erroresFila = [];

      // Validar nombre (obligatorio)
      const nombre = String(fila.nombre || "").trim();
      if (!nombre) {
        erroresFila.push("Nombre es obligatorio");
      }

      // Normalizar teléfono y email
      const telefonoRaw = String(fila.telefono || "").trim();
      const emailRaw = String(fila.email || "").trim();
      const telefonoNormalizado = normalizarTelefono(telefonoRaw);
      const emailNormalizado = normalizarEmail(emailRaw);

      // Validar que al menos uno esté presente
      if (!telefonoNormalizado && !emailNormalizado) {
        erroresFila.push("Teléfono o email es requerido");
      }

      // Si hay errores, agregar al detalle y continuar
      if (erroresFila.length > 0) {
        errores++;
        detalle.push({
          fila: numFila,
          accion: "error",
          nombre: nombre || "",
          errores: erroresFila,
        });
        continue;
      }

      try {
        // Buscar cliente existente (match por teléfono o email dentro del mismo grupoId+localId)
        let clienteExistente = null;

        if (telefonoNormalizado) {
          clienteExistente = await prisma.cliente.findFirst({
            where: {
              grupoId,
              localId,
              telefono: telefonoNormalizado,
            },
            select: { id: true },
          });
        }

        if (!clienteExistente && emailNormalizado) {
          clienteExistente = await prisma.cliente.findFirst({
            where: {
              grupoId,
              localId,
              email: emailNormalizado,
            },
            select: { id: true },
          });
        }

        // Determinar acción según modo y existencia
        let accion = null;
        if (clienteExistente) {
          if (modo === "crear" || modo === "crear_actualizar") {
            accion = "actualizar";
          } else if (modo === "actualizar") {
            accion = "actualizar";
          } else {
            accion = "skip";
          }
        } else {
          if (modo === "actualizar") {
            accion = "skip";
          } else if (modo === "crear" || modo === "crear_actualizar") {
            accion = "crear";
          }
        }

        if (accion === "skip") {
          skip++;
          detalle.push({
            fila: numFila,
            accion: "skip",
            nombre,
            errores: [],
          });
          continue;
        }

        // Preparar datos
        const data = {
          nombre,
          documento: String(fila.documento || "").trim() || null,
          telefono: telefonoNormalizado,
          email: emailNormalizado,
          direccion: String(fila.direccion || "").trim() || null,
          observaciones: String(fila.observaciones || "").trim() || null,
          limiteCredito: parseDecimal(fila.limiteCredito),
          descuentoPorcentaje: parseDecimal(fila.descuentoPorcentaje),
          activo: parseActivo(fila.activo),
        };

        let clienteId;

        // Crear o actualizar cliente
        if (accion === "crear") {
          const nuevo = await prisma.cliente.create({
            data: { ...data, grupoId, localId },
          });
          clienteId = nuevo.id;
          creados++;
        } else if (accion === "actualizar") {
          await prisma.cliente.update({
            where: { id: clienteExistente.id },
            data,
          });
          clienteId = clienteExistente.id;
          actualizados++;
        }

        // Procesar tags (columna "tags" separada por coma)
        const tagsRaw = String(fila.tags || "").trim();
        if (tagsRaw && clienteId) {
          const nombresTags = tagsRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

          const tagIds = [];

          for (const nombreTag of nombresTags) {
            const key = nombreTag.toLowerCase().trim();
            let tag = tagMap.get(key);

            // Si no existe, crear tag
            if (!tag) {
              try {
                const nuevoTag = await prisma.tagCliente.create({
                  data: { localId, nombre: nombreTag },
                });
                tag = nuevoTag;
                tagMap.set(key, tag);
              } catch (tagErr) {
                // Unique constraint = ya existe (race condition)
                if (tagErr.code === "P2002") {
                  const found = await prisma.tagCliente.findFirst({
                    where: { localId, nombre: nombreTag },
                  });
                  if (found) {
                    tag = found;
                    tagMap.set(key, tag);
                  }
                } else {
                  throw tagErr;
                }
              }
            }

            if (tag) {
              tagIds.push(tag.id);
            }
          }

          // Asignar tags al cliente (deleteMany + createMany)
          if (tagIds.length > 0) {
            await prisma.clienteTag.deleteMany({
              where: { clienteId },
            });
            await prisma.clienteTag.createMany({
              data: tagIds.map((tagId) => ({ clienteId, tagId })),
              skipDuplicates: true,
            });
          } else {
            // Si no hay tags, eliminar todos los tags del cliente
            await prisma.clienteTag.deleteMany({
              where: { clienteId },
            });
          }
        }

        // Agregar al detalle
        detalle.push({
          fila: numFila,
          accion,
          clienteId,
          nombre,
          errores: [],
        });
      } catch (rowErr) {
        errores++;
        detalle.push({
          fila: numFila,
          accion: "error",
          nombre: nombre || "",
          errores: [rowErr.message || "Error desconocido"],
        });
      }
    }

    return NextResponse.json({
      ok: true,
      resumen: {
        total: filas.length,
        creados,
        actualizados,
        errores,
        skip,
      },
      detalle,
    });
  } catch (e) {
    console.error("ERROR clientes/import/excel:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno" },
      { status: 500 }
    );
  }
}

