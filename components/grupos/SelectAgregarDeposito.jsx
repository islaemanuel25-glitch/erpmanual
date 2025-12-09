"use client";

import { useState, useEffect } from "react";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SelectAgregarDeposito({ onAgregar, excluidos = [] }) {
  const { ui } = useUIConfig();
  const [depositos, setDepositos] = useState([]);
  const [selected, setSelected] = useState("");

  const cargar = async () => {
    try {
      const res = await fetch("/api/locales/listar?soloDepositos=true", {
        credentials: "include",
      });
      const data = await res.json();
      setDepositos(data.items || []);
    } catch {
      setDepositos([]);
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

  const disponibles = depositos.filter((d) => !excluidos.includes(d.id));

  return (
    <div
      className="flex"
      style={{
        gap: ui.helpers.spacing("sm"),
      }}
    >
      <SunmiSelectAdv value={selected} onChange={setSelected}>
        <SunmiSelectOption value="">Seleccionar depósito…</SunmiSelectOption>
        {disponibles.map((d) => (
          <SunmiSelectOption key={d.id} value={d.id}>
            {d.nombre}
          </SunmiSelectOption>
        ))}
      </SunmiSelectAdv>

      <SunmiButton color="amber" onClick={agregar}>
        Agregar
      </SunmiButton>
    </div>
  );
}
