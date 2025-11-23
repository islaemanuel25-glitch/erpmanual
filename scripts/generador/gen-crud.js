import fs from "fs";
import path from "path";

const loadConfig = (file) =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), "generador", file)));

const OUT = (modulo) => path.join(process.cwd(), "app", "api", modulo);

const fieldToPrisma = (campo, value) => {
  if (value === "" || value === null || value === undefined) return null;

  if (campo.tipo === "number") return Number(value);
  if (campo.tipo === "boolean") return Boolean(value);
  if (campo.tipo === "string") return String(value);

  return value;
};

const genCrear = (cfg) => `import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req) {
  try {
    const body = await req.json();
    const data = {};

    ${Object.entries(cfg.campos)
      .map(([k, v]) => {
        return `
    if (body.${k} !== undefined) {
      const val = body.${k};
      ${
        v.required
          ? `
      if (val === undefined || val === null || val === "") {
        return NextResponse.json({ ok: false, error: "${k} requerido" }, { status: 400 });
      }`
          : ""
      }
      data.${k} = ${v.tipo === "number" ? "Number(val)" : v.tipo === "boolean" ? "Boolean(val)" : "String(val)"};
    }
        `;
      })
      .join("")}

    const creado = await prisma.${cfg.tabla}.create({ data });

    return NextResponse.json({ ok: true, item: creado }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Error creando ${cfg.modulo}" }, { status: 500 });
  }
}
`;

const genListar = (cfg) => `import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const items = await prisma.${cfg.tabla}.findMany({
      orderBy: { id: "desc" }
    });
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Error listando ${cfg.modulo}" });
  }
}
`;

const genObtener = (cfg) => `import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));

  if (!id) return NextResponse.json({ ok: false, error: "ID requerido" }, { status: 400 });

  try {
    const item = await prisma.${cfg.tabla}.findUnique({ where: { id } });
    if (!item) return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });

    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Error obteniendo ${cfg.modulo}" });
  }
}
`;

const genEditar = (cfg) => `import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PUT(req, ctx) {
  const id = Number(ctx.params.id);
  if (!id) return NextResponse.json({ ok: false, error: "ID inválido" });

  const body = await req.json();
  const data = {};

  ${Object.keys(cfg.campos)
    .map((k) => `if (body.${k} !== undefined) data.${k} = body.${k};`)
    .join("\n  ")}

  try {
    const editado = await prisma.${cfg.tabla}.update({
      where: { id },
      data,
    });
    return NextResponse.json({ ok: true, item: editado });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Error editando ${cfg.modulo}" });
  }
}
`;

const genEliminar = (cfg) => `import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function DELETE(req, ctx) {
  const id = Number(ctx.params.id);

  if (!id) return NextResponse.json({ ok: false, error: "ID inválido" });

  try {
    await prisma.${cfg.tabla}.update({
      where: { id },
      data: { activo: false }
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Error eliminando ${cfg.modulo}" });
  }
}
`;

const genReactivar = (cfg) => `import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PUT(req, ctx) {
  const id = Number(ctx.params.id);
  if (!id) return NextResponse.json({ ok: false, error: "ID inválido" });

  try {
    const item = await prisma.${cfg.tabla}.update({
      where: { id },
      data: { activo: true }
    });

    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Error reactivando ${cfg.modulo}" });
  }
}
`;

export const generarAPIs = (file) => {
  const cfg = loadConfig(file);

  const base = OUT(cfg.modulo);
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });

  const crearDir = path.join(base, "crear");
  const listarDir = path.join(base, "listar");
  const obtenerDir = path.join(base, "obtener");
  const editarDir = path.join(base, "editar");
  const eliminarDir = path.join(base, "eliminar");
  const reactivarDir = path.join(base, "reactivar");

  fs.mkdirSync(crearDir, { recursive: true });
  fs.mkdirSync(listarDir, { recursive: true });
  fs.mkdirSync(obtenerDir, { recursive: true });
  fs.mkdirSync(editarDir, { recursive: true });
  fs.mkdirSync(eliminarDir, { recursive: true });
  fs.mkdirSync(reactivarDir, { recursive: true });

  fs.writeFileSync(path.join(crearDir, "route.js"), genCrear(cfg));
  fs.writeFileSync(path.join(listarDir, "route.js"), genListar(cfg));
  fs.writeFileSync(path.join(obtenerDir, "route.js"), genObtener(cfg));
  fs.writeFileSync(path.join(editarDir, "[id]/route.js"), genEditar(cfg));
  fs.writeFileSync(path.join(eliminarDir, "[id]/route.js"), genEliminar(cfg));
  fs.writeFileSync(path.join(reactivarDir, "[id]/route.js"), genReactivar(cfg));

  console.log("✅ APIs generadas para módulo:", cfg.modulo);
};
