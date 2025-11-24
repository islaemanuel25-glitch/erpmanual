"use client";

import { useEffect, useState } from "react";

import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelect from "@/components/sunmi/SunmiSelect";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function FiltrosRoles({ onChange, initial }) {
  const [search, setSearch] = useState(initial.search || "");
  const [activo, setActivo] = useState(initial.activo ?? "");

  useEffect(() => {
    const timeout = setTimeout(() => {
      onChange({ search, activo });
    }, 250);
    return () => clearTimeout(timeout);
  }, [search, activo]);

  const limpiar = () => {
    setSearch("");
    setActivo("");
  };

  return (
    <div className="flex flex-col gap-3 mb-3">
      <div className="flex gap-3">
        <SunmiInput
          label="Buscar"
          placeholder="Buscar rol..."
          value={search}
          onChange={setSearch}
        />

        <SunmiSelect
          label="Estado"
          value={activo}
          onChange={setActivo}
          options={[
            { value: "", label: "Todos" },
            { value: "true", label: "Activo" },
            { value: "false", label: "Inactivo" },
          ]}
        />

        <SunmiButton label="Limpiar" color="slate" onClick={limpiar} />
      </div>
    </div>
  );
}
