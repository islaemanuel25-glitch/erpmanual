"use client";

import { useEffect, useState } from "react";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";

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

  useEffect(() => {
    cargarLocales();
  }, []);

  // validar local actual
  useEffect(() => {
    if (!value) return;

    const verificar = async () => {
      try {
        const res = await fetch(`/api/locales/${value}`, {
          credentials: "include",
        });
        const data = await res.json();

        if (!data.ok) {
          console.warn("⚠️ localId inválido → limpiando storage");
          localStorage.removeItem("productos_localId");
          onChange(0);
        }
      } catch (e) {
        console.error("Error verificando local:", e);
      }
    };

    verificar();
  }, [value, onChange]);

  const handleSelect = (v) => {
    const nuevo = Number(v);
    onChange(nuevo);
    localStorage.setItem("productos_localId", String(nuevo));
  };

  return (
    <div className="w-full md:w-64">
      <SunmiSelectAdv
        value={String(value)}
        onChange={handleSelect}
        placeholder="Seleccionar local…"
      >
        <SunmiSelectOption value="0">Administración global</SunmiSelectOption>

        {locales.map((loc) => (
          <SunmiSelectOption key={loc.id} value={String(loc.id)}>
            {loc.nombre} {loc.es_deposito ? "(Depósito)" : ""}
          </SunmiSelectOption>
        ))}
      </SunmiSelectAdv>
    </div>
  );
}
