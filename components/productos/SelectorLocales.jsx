"use client";

import { useEffect, useState } from "react";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiPill from "@/components/sunmi/SunmiPill";

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

  // cargar una sola vez
  useEffect(() => {
    cargarLocales();
  }, []);

  // verificar si el localId guardado existe
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
    <div className="flex flex-col gap-2 w-full max-w-xs">
      <label className="text-[12px] text-slate-400">Local</label>

      <SunmiSelectAdv
        value={String(value)}
        onChange={handleSelect}
        placeholder="Seleccionar local…"
        className="w-full"
      >
        <SunmiSelectOption value="0">Administración global</SunmiSelectOption>

        {locales.map((loc) => (
          <SunmiSelectOption key={loc.id} value={String(loc.id)}>
            {loc.nombre} {loc.es_deposito ? " (Depósito)" : ""}
          </SunmiSelectOption>
        ))}
      </SunmiSelectAdv>
    </div>
  );
}
