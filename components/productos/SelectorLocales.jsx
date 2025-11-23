"use client";

import { useEffect, useState } from "react";

export default function SelectorLocales({ value, onChange }) {
  const [locales, setLocales] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargarLocales = async () => {
    try {
      const res = await fetch("/api/locales/listar", {
        credentials: "include",
      });
      const data = await res.json();

      if (data.ok) {
        setLocales(data.items || []);
      }
    } catch (e) {
      console.error("Error cargando locales:", e);
    }
    setLoading(false);
  };

  // cargar locales una vez
  useEffect(() => {
    cargarLocales();
  }, []);

  // verificar si el localId guardado existe realmente
  useEffect(() => {
    if (!value) return;

    const verificar = async () => {
      try {
        const res = await fetch(`/api/locales/${value}`, {
          credentials: "include",
        });
        const data = await res.json();

        if (!data.ok) {
          console.warn("⚠️ localId inválido encontrado → limpiando storage");
          localStorage.removeItem("productos_localId");
          onChange(0);
        }
      } catch (e) {
        console.error("Error verificando local:", e);
      }
    };

    verificar();
  }, [value, onChange]);

  const handleSelect = (e) => {
    const nuevo = Number(e.target.value);
    onChange(nuevo);
    localStorage.setItem("productos_localId", String(nuevo));
  };

  return (
    <div className="flex flex-col gap-1 w-full max-w-sm">
      <label className="text-gray-700 text-sm font-medium">Local</label>

      <select
        disabled={loading}
        className="border rounded px-3 py-2 bg-white"
        value={value}
        onChange={handleSelect}
      >
        <option value={0}>Administración global</option>

        {locales.map((loc) => (
          <option key={loc.id} value={loc.id}>
            {loc.nombre} {loc.es_deposito ? "(Depósito)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
