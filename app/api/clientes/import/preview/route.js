import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import * as XLSX from "xlsx";

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

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json(
        { ok: false, error: "Archivo requerido" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const wb = XLSX.read(bytes, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) {
      return NextResponse.json(
        { ok: false, error: "El archivo no tiene hojas" },
        { status: 400 }
      );
    }

    const rawFilas = XLSX.utils.sheet_to_json(ws, { defval: "" });
    if (rawFilas.length === 0) {
      return NextResponse.json(
        { ok: false, error: "El archivo está vacío" },
        { status: 400 }
      );
    }

    const filas = [];
    let countCreate = 0;
    let countUpdate = 0;
    let countAmbiguous = 0;
    let countSkip = 0;
    let countErrores = 0;

    for (let i = 0; i < rawFilas.length; i++) {
      const raw = rawFilas[i];
      const row = i + 2;

      const nombre = String(raw.nombre || "").trim();
      const tel = normTel(raw.telefono);
      const email = normEmail(raw.email);
      const doc = normDoc(raw.documento);

      const data = {
        nombre,
        documento: doc,
        telefono: tel,
        email: email,
        direccion: String(raw.direccion || "").trim() || null,
        observaciones: String(raw.observaciones || "").trim() || null,
        limiteCredito: parseDecimal(raw.limiteCredito),
        descuentoPorcentaje: parseDecimal(raw.descuentoPorcentaje),
        activo: parseActivo(raw.activo),
        tags: String(raw.tags || raw.etiquetas || "").trim() || null,
      };

      const errors = [];
      if (!nombre) errors.push("Nombre vacío");
      if (!tel && !email && !doc) errors.push("Falta identificador único (teléfono, email o documento)");

      if (errors.length > 0) {
        countSkip++;
        filas.push({ row, data, action: "skip", match: null, errors });
        continue;
      }

      // Buscar matches por tel, email, doc (independientes, combinar unique)
      const matchIds = new Set();
      const matches = [];

      const selectFields = {
        id: true,
        nombre: true,
        telefono: true,
        email: true,
        documento: true,
      };

      if (tel) {
        const found = await prisma.cliente.findMany({
          where: { grupoId, localId, telefono: tel },
          select: selectFields,
        });
        for (const c of found) {
          if (!matchIds.has(c.id)) {
            matchIds.add(c.id);
            matches.push(c);
          }
        }
      }

      if (email) {
        const found = await prisma.cliente.findMany({
          where: { grupoId, localId, email },
          select: selectFields,
        });
        for (const c of found) {
          if (!matchIds.has(c.id)) {
            matchIds.add(c.id);
            matches.push(c);
          }
        }
      }

      if (doc) {
        const found = await prisma.cliente.findMany({
          where: { grupoId, localId, documento: doc },
          select: selectFields,
        });
        for (const c of found) {
          if (!matchIds.has(c.id)) {
            matchIds.add(c.id);
            matches.push(c);
          }
        }
      }

      if (matches.length === 0) {
        countCreate++;
        filas.push({ row, data, action: "create", match: null, errors: [] });
      } else if (matches.length === 1) {
        countUpdate++;
        filas.push({
          row,
          data,
          action: "update",
          match: { clienteId: matches[0].id, matches },
          errors: [],
        });
      } else {
        countAmbiguous++;
        filas.push({
          row,
          data,
          action: "ambiguous",
          match: { matches },
          errors: [],
        });
      }
    }

    return NextResponse.json({
      ok: true,
      resumen: {
        total: rawFilas.length,
        create: countCreate,
        update: countUpdate,
        ambiguous: countAmbiguous,
        skip: countSkip,
        errores: countErrores,
      },
      filas,
    });
  } catch (e) {
    console.error("ERROR clientes/import/preview:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno" },
      { status: 500 }
    );
  }
}
