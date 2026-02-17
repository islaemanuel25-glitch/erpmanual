import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";

function normTel(val) {
  if (!val) return null;
  const t = String(val).replace(/\D/g, "");
  return t.length > 0 ? t : null;
}

function normEmail(val) {
  if (!val) return null;
  const e = String(val).trim().toLowerCase();
  return e.length > 0 ? e : null;
}

function normDoc(val) {
  if (!val) return null;
  const d = String(val).trim();
  return d.length > 0 ? d : null;
}

function parseDecimal(val) {
  if (val === "" || val === null || val === undefined) return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

function parseActivo(val) {
  if (val === "" || val === null || val === undefined) return true;
  if (val === false) return false;
  const s = String(val).toLowerCase().trim();
  if (s === "no" || s === "false" || s === "0" || s === "inactivo") return false;
  return true;
}

export async function POST(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const { grupoId, localId } = scope;
    const body = await req.json();
    const { decisions, filasData } = body;

    if (!Array.isArray(decisions) || !Array.isArray(filasData)) {
      return NextResponse.json(
        { ok: false, error: "decisions y filasData requeridos" },
        { status: 400 }
      );
    }

    // Index filasData by row
    const dataByRow = {};
    for (const fd of filasData) {
      dataByRow[fd.row] = fd.data;
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

    const detalle = [];
    let creados = 0;
    let actualizados = 0;
    let skipped = 0;
    let errores = 0;

    for (const dec of decisions) {
      const { row, action, targetClienteId } = dec;
      const data = dataByRow[row];

      if (!data) {
        errores++;
        detalle.push({ row, action: "error", error: "Datos de fila no encontrados" });
        continue;
      }

      if (action === "skip") {
        skipped++;
        detalle.push({ row, action: "skip", nombre: data.nombre });
        continue;
      }

      try {
        // Re-normalizar desde datos crudos (no confiar en filasData)
        const nombre = String(data.nombre || "").trim();
        const telefono = normTel(data.telefono);
        const email = normEmail(data.email);
        const documento = normDoc(data.documento);

        if (!nombre) {
          errores++;
          detalle.push({ row, action: "error", error: "Nombre vacío" });
          continue;
        }

        if (!telefono && !email && !documento) {
          errores++;
          detalle.push({ row, action: "error", nombre, error: "Falta identificador (teléfono, email o documento)" });
          continue;
        }

        const clienteData = {
          nombre,
          documento,
          telefono,
          email,
          direccion: String(data.direccion || "").trim() || null,
          observaciones: String(data.observaciones || "").trim() || null,
          limiteCredito: parseDecimal(data.limiteCredito),
          descuentoPorcentaje: parseDecimal(data.descuentoPorcentaje),
          activo: parseActivo(data.activo),
        };

        let clienteId;

        if (action === "create") {
          const nuevo = await prisma.cliente.create({
            data: { ...clienteData, grupoId, localId },
          });
          clienteId = nuevo.id;
          creados++;
          detalle.push({ row, action: "create", clienteId, nombre: data.nombre });
        } else if (action === "update") {
          if (!targetClienteId) {
            errores++;
            detalle.push({ row, action: "error", error: "targetClienteId requerido para update" });
            continue;
          }

          // Validar que el cliente pertenece al scope
          const existe = await prisma.cliente.findFirst({
            where: { id: targetClienteId, grupoId, localId },
            select: { id: true },
          });

          if (!existe) {
            errores++;
            detalle.push({ row, action: "error", error: "Cliente no encontrado en este local" });
            continue;
          }

          await prisma.cliente.update({
            where: { id: targetClienteId },
            data: clienteData,
          });
          clienteId = targetClienteId;
          actualizados++;
          detalle.push({ row, action: "update", clienteId, nombre: data.nombre });
        } else {
          skipped++;
          detalle.push({ row, action: "skip", nombre: data.nombre });
          continue;
        }

        // Procesar tags
        const tagsRaw = data.tags || "";
        if (tagsRaw && clienteId) {
          const nombres = tagsRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

          const tagIds = [];
          for (const tn of nombres) {
            const key = tn.toLowerCase().trim();
            let tag = tagMap.get(key);

            if (!tag) {
              try {
                const nuevoTag = await prisma.tagCliente.create({
                  data: { localId, nombre: tn },
                });
                tag = nuevoTag;
                tagMap.set(key, tag);
              } catch (tagErr) {
                if (tagErr.code === "P2002") {
                  const found = await prisma.tagCliente.findFirst({
                    where: { localId, nombre: tn },
                  });
                  if (found) {
                    tag = found;
                    tagMap.set(key, tag);
                  }
                }
              }
            }

            if (tag) tagIds.push(tag.id);
          }

          if (tagIds.length > 0) {
            await prisma.clienteTag.deleteMany({ where: { clienteId } });
            await prisma.clienteTag.createMany({
              data: tagIds.map((tagId) => ({ clienteId, tagId })),
              skipDuplicates: true,
            });
          }
        }
      } catch (rowErr) {
        errores++;
        detalle.push({
          row,
          action: "error",
          nombre: data.nombre,
          error: rowErr.message || "Error desconocido",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      resumen: { creados, actualizados, skipped, errores, total: decisions.length },
      detalle,
    });
  } catch (e) {
    console.error("ERROR clientes/import/apply:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno" },
      { status: 500 }
    );
  }
}
