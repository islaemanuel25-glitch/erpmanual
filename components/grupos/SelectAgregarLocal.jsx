"use client";

import { useState, useEffect } from "react";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function SelectAgregarLocal({ onAgregar, excluidos = [] }) {
  const [locales, setLocales] = useState([]);
  const [selected, setSelected] = useState("");

  const cargar = async () => {
    try {
      const res = await fetch("/api/locales/listar?soloLocales=true", {
        credentials: "include",
      });
      const data = await res.json();
      setLocales(data.items || []);
    } catch {
      setLocales([]);
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

  const disponibles = locales.filter((l) => !excluidos.includes(l.id));

  return (
    <div className="flex gap-2">
      <SunmiSelectAdv value={selected} onChange={setSelected}>
        <SunmiSelectOption value="">Seleccionar local…</SunmiSelectOption>
        {disponibles.map((l) => (
          <SunmiSelectOption key={l.id} value={l.id}>
            {l.nombre}
          </SunmiSelectOption>
        ))}
      </SunmiSelectAdv>

      <SunmiButton color="amber" onClick={agregar}>
        Agregar
      </SunmiButton>
    </div>
  );
}
