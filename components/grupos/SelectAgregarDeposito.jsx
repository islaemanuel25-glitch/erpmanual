"use client";

import { useState, useEffect } from "react";

export default function SelectAgregarDeposito({ onAgregar }) {
  const [depositos, setDepositos] = useState([]);
  const [selected, setSelected] = useState("");

  const cargar = async () => {
    try {
      const res = await fetch("/api/locales/listar?soloDepositos=true", {
        credentials: "include",
      });
      const data = await res.json();
      setDepositos(data.items || []);
    } catch (error) {
      console.error("Error cargando depósitos:", error);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const agregar = () => {
    if (!selected) return;
    onAgregar(Number(selected));
    setSelected("");
  };

  return (
    <div className="bg-white border rounded-lg shadow-sm p-4 flex flex-col md:flex-row gap-3 items-center max-w-lg">
      <select
        className="border rounded-md px-3 py-2 flex-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="">Seleccionar depósito...</option>
        {depositos.map((d) => (
          <option key={d.id} value={d.id}>
            {d.nombre}
          </option>
        ))}
      </select>

      <button
        onClick={agregar}
        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm rounded-md shadow-sm transition"
      >
        + Agregar
      </button>
    </div>
  );
}
