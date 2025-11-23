"use client";

import { useState, useEffect } from "react";

export default function SelectAgregarLocal({ onAgregar }) {
  const [locales, setLocales] = useState([]);
  const [selected, setSelected] = useState("");

  const cargar = async () => {
    try {
      const res = await fetch("/api/locales/listar?soloLocales=true", {
        credentials: "include",
      });
      const data = await res.json();
      setLocales(data.items || []);
    } catch (e) {
      console.error("Error cargando locales:", e);
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
        className="border rounded-md px-3 py-2 flex-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="">Seleccionar local...</option>

        {locales.map((l) => (
          <option key={l.id} value={l.id}>
            {l.nombre}
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
