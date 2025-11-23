// scripts/gen-apis.js
// Uso: node scripts/gen-apis.js configs/usuarios.json
// No toca la UI. Solo crea/actualiza rutas en app/api/<modulo>/...

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function w(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
  console.log("✓", filePath);
}

function tplHeader() {
  return `import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
`;
}

// ---------- TEMPLATES CRUD BASE ----------

function tplCrear({ modulo, createFields, preValidate = "", postValidate = "", extras = "" }) {
  return `${tplHeader()}
export async function POST(req) {
  try {
    const body = await req.json();
${preValidate}
${createFields
  .map((f) => {
    let s = `    const ${f.name} = ${f.parser || "body?."+f.name};\n`;
    if (f.required) {
      s += `    if (${f.requiredCheck || `!${f.name}`} ) {\n`;
      s += `      return NextResponse.json({ ok: false, error: "${f.label || f.name} requerido" }, { status: 400 });\n`;
      s += `    }\n`;
    }
    return s;
  })
  .join("")}
${postValidate}
    const creado = await prisma.${modulo.slice(0,1).toLowerCase()+modulo.slice(1)}.create({
      data: {
${createFields
  .map((f) => {
    return `        ${f.target || f.name}: ${f.toData || f.name},`;
  })
  .join("\n")}
      },
      ${extras.includes("includeRolLocal") ? 'include: { rol: true, local: true },' : ""}
    });

    return NextResponse.json({ ok: true, ${modulo}: creado }, { status: 201 });
  } catch (e) {
    if (e?.code === "P2002") {
      return NextResponse.json({ ok: false, error: "Registro duplicado" }, { status: 409 });
    }
    console.error("${modulo}/crear", e);
    return NextResponse.json({ ok: false, error: "Error al crear" }, { status: 500 });
  }
}
`;
}

function tplEditar({ modulo, updateChecks, extras = "" }) {
  return `${tplHeader()}
export async function PUT(req, context) {
  try {
    const { id } = context.params;
    const rid = Number(id);
    if (!rid || Number.isNaN(rid)) {
      return NextResponse.json({ ok: false, error: "ID inválido" }, { status: 400 });
    }

    const body = await req.json();
    const data = {};
${updateChecks
  .map((c) => {
    let s = `    if (body?.${c.name} !== undefined) {\n`;
    if (c.validate) {
      s += `      ${c.validate}\n`;
    }
    s += `      data.${c.target || c.name} = ${c.toData || `body.${c.name}`};\n`;
    s += `    }\n`;
    return s;
  })
  .join("")}

    const editado = await prisma.${modulo.slice(0,1).toLowerCase()+modulo.slice(1)}.update({
      where: { id: rid },
      data,
      ${extras.includes("includeRolLocal") ? 'include: { rol: true, local: true },' : ""}
    });

    return NextResponse.json({ ok: true, ${modulo}: editado }, { status: 200 });
  } catch (e) {
    if (e?.code === "P2002") {
      return NextResponse.json({ ok: false, error: "Registro duplicado" }, { status: 409 });
    }
    if (e?.code === "P2025") {
      return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    }
    console.error("${modulo}/editar", e);
    return NextResponse.json({ ok: false, error: "Error al editar" }, { status: 500 });
  }
}
`;
}

function tplEliminar({ modulo }) {
  return `${tplHeader()}
export async function DELETE(req, context) {
  try {
    const { id } = context.params;
    const rid = Number(id);
    if (!rid || Number.isNaN(rid)) {
      return NextResponse.json({ ok: false, error: "ID inválido" }, { status: 400 });
    }

    await prisma.${modulo.slice(0,1).toLowerCase()+modulo.slice(1)}.update({
      where: { id: rid },
      data: { activo: false }
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    if (e?.code === "P2025") {
      return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    }
    console.error("${modulo}/eliminar", e);
    return NextResponse.json({ ok: false, error: "Error al eliminar" }, { status: 500 });
  }
}
`;
}

function tplReactivar({ modulo }) {
  return `${tplHeader()}
export async function PUT(req, context) {
  try {
    const { id } = context.params;
    const rid = Number(id);
    if (!rid || Number.isNaN(rid)) {
      return NextResponse.json({ ok: false, error: "ID inválido" }, { status: 400 });
    }

    await prisma.${modulo.slice(0,1).toLowerCase()+modulo.slice(1)}.update({
      where: { id: rid },
      data: { activo: true }
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    if (e?.code === "P2025") {
      return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    }
    console.error("${modulo}/reactivar", e);
    return NextResponse.json({ ok: false, error: "Error al reactivar" }, { status: 500 });
  }
}
`;
}

function tplListar({ modulo, extras = "" }) {
  return `${tplHeader()}
export async function GET() {
  try {
    const items = await prisma.${modulo.slice(0,1).toLowerCase()+modulo.slice(1)}.findMany({
      orderBy: { id: "desc" },
      ${extras.includes("includeRolLocal") ? 'include: { rol: true, local: true },' : ""}
    });
    return NextResponse.json({ ok: true, ${modulo === "usuarios" ? "usuarios" : "items"}: items, total: items.length });
  } catch (e) {
    console.error("${modulo}/listar", e);
    return NextResponse.json({ ok: false, error: "Error al listar" }, { status: 500 });
  }
}
`;
}

function tplObtener({ modulo, extras = "" }) {
  return `${tplHeader()}
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ ok: false, error: "ID inválido o faltante" }, { status: 400 });
    }

    const data = await prisma.${modulo.slice(0,1).toLowerCase()+modulo.slice(1)}.findUnique({
      where: { id },
      ${extras.includes("includeRolLocal") ? 'include: { rol: true, local: true },' : ""}
    });

    if (!data) {
      return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, ${modulo}: data });
  } catch (e) {
    console.error("${modulo}/obtener", e);
    return NextResponse.json({ ok: false, error: "Error al obtener" }, { status: 500 });
  }
}
`;
}

// ---------- AUX LISTS (relations) ----------
function tplAuxList(name, prismaModel) {
  return `${tplHeader()}
export async function GET() {
  try {
    const items = await prisma.${prismaModel}.findMany({
      where: { activo: { not: false } },
      orderBy: { nombre: "asc" }
    });
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("${name}/listar", e);
    return NextResponse.json({ ok: false, error: "Error al listar" }, { status: 500 });
  }
}
`;
}

// ---------- MAIN ----------
function run() {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error("❌ Uso: node scripts/gen-apis.js configs/<modulo>.json");
    process.exit(1);
  }

  const abs = path.resolve(process.cwd(), configPath);
  const cfg = JSON.parse(fs.readFileSync(abs, "utf8"));

  // Ej.: modulo = "usuarios" → prisma model "usuario"
  const modulo = cfg.modulo; // plural en ruta
  const prismaModel = (cfg.prismaModel || modulo.slice(0, -1)); // heurística simple: usuarios -> usuario

  const baseDir = path.resolve(process.cwd(), `app/api/${modulo}`);

  // Crear
  w(path.join(baseDir, "crear/route.js"), tplCrear(cfg.templates.crear));

  // Editar
  w(path.join(baseDir, "editar/[id]/route.js"), tplEditar(cfg.templates.editar));

  // Eliminar
  w(path.join(baseDir, "eliminar/[id]/route.js"), tplEliminar({ modulo: prismaModel }));

  // Reactivar (opcional)
  if (!cfg.skipReactivar) {
    w(path.join(baseDir, "reactivar/[id]/route.js"), tplReactivar({ modulo: prismaModel }));
  }

  // Listar
  w(path.join(baseDir, "listar/route.js"), tplListar(cfg.templates.listar));

  // Obtener
  w(path.join(baseDir, "obtener/route.js"), tplObtener(cfg.templates.obtener));

  // Aux (relations)
  if (cfg.relations && Array.isArray(cfg.relations)) {
    cfg.relations.forEach((r) => {
      w(path.join(baseDir, r.name, "route.js"), tplAuxList(r.name, r.prismaModel));
    });
  }

  console.log("\n✅ Listo. APIs generadas sin tocar la UI.");
}

run();
