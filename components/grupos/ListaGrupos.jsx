"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ListaGrupos() {
  const [items, setItems] = useState([]);
  const [nombre, setNombre] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [creando, setCreando] = useState(false);

  // -------------------------------------------------------------------------
  // CARGAR LISTA
  // -------------------------------------------------------------------------
  const cargar = async () => {
    try {
      setCargando(true);
      const res = await fetch("/api/grupos/listar", { credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Error al listar grupos");

      const data = await res.json();
      setItems(data.items || []);
      setError(false);
    } catch (e) {
      console.error("ERROR AL CARGAR GRUPOS:", e);
      setError(true);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  // -------------------------------------------------------------------------
  // CREAR GRUPO (FUNCIONANDO)
  // -------------------------------------------------------------------------
  const crearGrupo = async (e) => {
    e.preventDefault();

    if (!nombre.trim()) {
      alert("Escribí un nombre para el grupo.");
      return;
    }

    setCreando(true);
    try {
      const res = await fetch("/api/grupos/crear", { credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" , headers: { "Content-Type": "application/json" }}, // ✅ NECESARIO
        body: JSON.stringify({ nombre }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        alert(data.error || "Error al crear el grupo");
        return;
      }

      setNombre("");      // limpiar input
      await cargar();     // refrescar tabla
    } catch (error) {
      console.error("ERROR AL CREAR GRUPO:", error);
      alert("No se pudo crear el grupo");
    } finally {
      setCreando(false);
    }
  };

  // -------------------------------------------------------------------------
  // ELIMINAR MEDIANTE API
  // -------------------------------------------------------------------------
  const eliminarGrupo = async (id) => {
    if (!confirm("¿Seguro que querés eliminar este grupo?")) return;

    try {
      const res = await fetch(`/api/grupos/${id}`, { credentials: "include",
        method: "DELETE",
      });

      if (!res.ok) {
        alert("No se pudo eliminar el grupo");
        return;
      }

      cargar();
    } catch (error) {
      console.error("ERROR ELIMINANDO:", error);
    }
  };

  // -------------------------------------------------------------------------
  // UI
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* FORMULARIO CREAR */}
      <form onSubmit={crearGrupo} className="flex gap-2 max-w-md">
        <input
          className="flex-1 border px-3 py-2 rounded"
          placeholder="Nombre del grupo"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />

        <button
          type="submit"
          disabled={creando}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          {creando ? "Creando..." : "Crear"}
        </button>
      </form>

      {/* LISTA */}
      {cargando ? (
        <div>Cargando grupos...</div>
      ) : error ? (
        <div className="text-red-600">No se pudo cargar grupos.</div>
      ) : items.length === 0 ? (
        <div className="text-gray-500">No hay grupos todavía.</div>
      ) : (
        <table className="w-full border rounded">
          <thead className="bg-gray-100">
            <tr>
              <th className="py-2 px-3 text-left">ID</th>
              <th className="py-2 px-3 text-left">Nombre</th>
              <th className="py-2 px-3 text-left">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {items.map((g) => (
              <tr key={g.id} className="border-t">
                <td className="py-2 px-3">{g.id}</td>
                <td className="py-2 px-3">{g.nombre}</td>
                <td className="py-2 px-3 flex gap-2">
                  <Link
                    href={`/modulos/grupos/${g.id}`}
                    className="px-3 py-1 rounded bg-blue-500 text-white"
                  >
                    Administrar
                  </Link>

                  <button
                    onClick={() => eliminarGrupo(g.id)}
                    className="px-3 py-1 rounded bg-red-500 text-white"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
