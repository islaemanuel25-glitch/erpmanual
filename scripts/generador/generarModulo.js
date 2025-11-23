import fs from "fs";
import path from "path";

const root = process.cwd();

function crearCarpeta(ruta) {
  if (!fs.existsSync(ruta)) fs.mkdirSync(ruta, { recursive: true });
}

function escribir(ruta, contenido) {
  fs.writeFileSync(ruta, contenido, "utf8");
}

function plantillaPage(nombreModulo) {
  return `
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import UiTable from "@/components/UiTable";

export default function ${capitalize(nombreModulo)}Page() {
  const router = useRouter();
  const [items, setItems] = useState([]);

  useEffect(() => {
    fetch("/api/${nombreModulo}/listar")
      .then((r) => r.json())
      .then((d) => setItems(d.items || []));
  }, []);

  const columnas = [
    { key: "nombre", titulo: "Nombre" },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between mb-4">
        <h1 className="text-xl font-bold">${capitalize(nombreModulo)}</h1>
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded"
          onClick={() => router.push("/modulos/${nombreModulo}/nuevo")}
        >
          Nuevo
        </button>
      </div>

      <UiTable columnas={columnas} datos={items} />
    </div>
  );
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
`;
}

function plantillaNuevo(nombreModulo) {
  return `
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Nuevo${capitalize(nombreModulo)}Page() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");

  const guardar = async () => {
    if (!nombre.trim()) return alert("Completá el nombre.");

    const res = await fetch("/api/${nombreModulo}/crear", { credentials: "include",
      method: "POST",
      headers: { "Content-Type": "application/json" , headers: { "Content-Type": "application/json" }},
      body: JSON.stringify({ nombre }),
    });

    const json = await res.json();
    if (!json.ok) return alert(json.error || "Error guardando");

    router.push("/modulos/${nombreModulo}");
  };

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Nuevo</h1>

      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        className="border px-3 py-2 w-full rounded"
        placeholder="Nombre..."
      />

      <button
        className="mt-4 bg-blue-600 text-white px-4 py-2 rounded"
        onClick={guardar}
      >
        Guardar
      </button>
    </div>
  );
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
`;
}

function plantillaEditar(nombreModulo) {
  return `
"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

export default function Editar${capitalize(nombreModulo)}Page() {
  const { id } = useParams();
  const router = useRouter();

  const [nombre, setNombre] = useState("");

  useEffect(() => {
    fetch("/api/${nombreModulo}/obtener?id=" + id)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) return alert("No existe");
        setNombre(d.data.nombre || "");
      });
  }, []);

  const guardar = async () => {
    const res = await fetch("/api/${nombreModulo}/editar/" + id, { credentials: "include",
      method: "PUT",
      headers: { "Content-Type": "application/json" , headers: { "Content-Type": "application/json" }},
      body: JSON.stringify({ nombre }),
    });

    const json = await res.json();
    if (!json.ok) return alert(json.error || "Error guardando");

    router.push("/modulos/${nombreModulo}");
  };

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Editar</h1>

      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        className="border px-3 py-2 w-full rounded"
        placeholder="Nombre..."
      />

      <button
        className="mt-4 bg-blue-600 text-white px-4 py-2 rounded"
        onClick={guardar}
      >
        Guardar cambios
      </button>
    </div>
  );
}
`;
}

function plantillaAPI(nombreModulo) {
  return {
listar: `
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const items = await prisma.${nombreModulo}.findMany({
      orderBy: { id: "desc" }
    });

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Error listando" });
  }
}
`,
obtener: `
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));

  const data = await prisma.${nombreModulo}.findUnique({ where: { id } });
  if (!data) return NextResponse.json({ ok: false, error: "No encontrado" });

  return NextResponse.json({ ok: true, data });
}
`,
crear: `
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req) {
  const body = await req.json();
  const item = await prisma.${nombreModulo}.create({
    data: { nombre: body.nombre }
  });

  return NextResponse.json({ ok: true, item });
}
`,
editar: `
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PUT(req, { params }) {
  const id = Number(params.id);
  const body = await req.json();

  const item = await prisma.${nombreModulo}.update({
    where: { id },
    data: { nombre: body.nombre }
  });

  return NextResponse.json({ ok: true, item });
}
`,
eliminar: `
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function DELETE(req, { params }) {
  const id = Number(params.id);

  await prisma.${nombreModulo}.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
`,
};
}

function generar(nombreModulo) {
  const base = path.join(root, "app/modulos", nombreModulo);
  crearCarpeta(base);

  escribir(path.join(base, "page.jsx"), plantillaPage(nombreModulo));

  crearCarpeta(path.join(base, "(acciones)/nuevo"));
  escribir(
    path.join(base, "(acciones)/nuevo/page.jsx"),
    plantillaNuevo(nombreModulo)
  );

  crearCarpeta(path.join(base, "editar/[id]"));
  escribir(
    path.join(base, "editar/[id]/page.jsx"),
    plantillaEditar(nombreModulo)
  );

  // APIs
  const apiBase = path.join(root, "app/api", nombreModulo);
  crearCarpeta(apiBase);
  const api = plantillaAPI(nombreModulo);

  escribir(path.join(apiBase, "listar/route.js"), api.listar);
  escribir(path.join(apiBase, "obtener/route.js"), api.obtener);
  escribir(path.join(apiBase, "crear/route.js"), api.crear);
  escribir(path.join(apiBase, "editar/[id]/route.js"), api.editar);
  escribir(path.join(apiBase, "eliminar/[id]/route.js"), api.eliminar);

  console.log("✅ Módulo generado:", nombreModulo);
}

// Ejecutar
const modulo = process.argv[2];
if (!modulo) {
  console.log("Falta el nombre del módulo: node generarModulo.js categorias");
  process.exit(1);
}

generar(modulo);
