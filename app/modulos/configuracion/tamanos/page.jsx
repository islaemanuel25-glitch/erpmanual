"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiSelect from "@/components/sunmi/SunmiSelect";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";
import SunmiToggle from "@/components/sunmi/SunmiToggle";
import SunmiToggleEstado from "@/components/sunmi/SunmiToggleEstado";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiUserCell from "@/components/sunmi/SunmiUserCell";

export default function PaginaTamanos() {
  const { ui, updateUIConfig, resetUIConfig } = useUIConfig();

  const cambio = (prop, val) => updateUIConfig({ [prop]: val });

  // =====================================================================
  // PRESETS
  // =====================================================================
  const presetCompacto = () =>
    updateUIConfig({
      fontSize: "sm",
      density: "compact",
      spacing: "xs",
      scale: 0.9,
    });

  const presetMedio = () =>
    updateUIConfig({
      fontSize: "md",
      density: "comfortable",
      spacing: "md",
      scale: 1,
    });

  const presetGrande = () =>
    updateUIConfig({
      fontSize: "lg",
      density: "spacious",
      spacing: "lg",
      scale: 1.1,
    });

  // =====================================================================
  // PREVIEW TABLE DATA
  // =====================================================================
  const previewRows = [
    { id: 1, nombre: "Juan Perez", email: "juan@mail.com", activo: true },
    { id: 2, nombre: "Maria Lopez", email: "maria@mail.com", activo: false },
  ];

  return (
    <SunmiCard>
      <SunmiCardHeader title="Tamaños y Densidad" color="amber" />

      <div className="p-4 flex flex-col gap-10">

        {/* ================================================================= */}
        {/* PRESSETS */}
        {/* ================================================================= */}
        <div>
          <SunmiSeparator label="Presets rápidos" />

          <div className="flex flex-wrap gap-2">
            <SunmiButton onClick={presetCompacto}>Compacto</SunmiButton>
            <SunmiButton onClick={presetMedio}>Estándar</SunmiButton>
            <SunmiButton onClick={presetGrande}>Grande</SunmiButton>

            <SunmiButton variant="danger" onClick={resetUIConfig}>
              Reset Default
            </SunmiButton>
          </div>
        </div>

        {/* ================================================================= */}
        {/* FONT SIZE */}
        {/* ================================================================= */}
        <div>
          <SunmiSeparator label="Tamaño de letra" />

          <SunmiSelect
            value={ui.fontSize}
            onChange={(e) => cambio("fontSize", e.target.value)}
          >
            <option value="xs">XS</option>
            <option value="sm">SM</option>
            <option value="md">MD</option>
            <option value="lg">LG</option>
          </SunmiSelect>
        </div>

        {/* ================================================================= */}
        {/* DENSIDAD */}
        {/* ================================================================= */}
        <div>
          <SunmiSeparator label="Densidad" />

          <SunmiSelect
            value={ui.density}
            onChange={(e) => cambio("density", e.target.value)}
          >
            <option value="compact">Compacta</option>
            <option value="comfortable">Cómoda</option>
            <option value="spacious">Espaciosa</option>
          </SunmiSelect>
        </div>

        {/* ================================================================= */}
        {/* ESPACIADO */}
        {/* ================================================================= */}
        <div>
          <SunmiSeparator label="Espaciado global" />

          <SunmiSelect
            value={ui.spacing}
            onChange={(e) => cambio("spacing", e.target.value)}
          >
            <option value="xs">XS</option>
            <option value="sm">SM</option>
            <option value="md">MD</option>
            <option value="lg">LG</option>
          </SunmiSelect>
        </div>

        {/* ================================================================= */}
        {/* ESCALA */}
        {/* ================================================================= */}
        <div>
          <SunmiSeparator label="Escala global" />

          <input
            type="range"
            min="0.8"
            max="1.2"
            step="0.05"
            value={ui.scale}
            onChange={(e) => cambio("scale", Number(e.target.value))}
            className="w-full"
          />

          <p className="text-xs mt-1 opacity-70">
            Escala actual: <strong>{(ui.scale * 100).toFixed(0)}%</strong>
          </p>
        </div>

        {/* ================================================================= */}
        {/* SUPER VISTA PREVIA COMPLETA */}
        {/* ================================================================= */}

        <div>
          <SunmiSeparator label="Vista previa completa" />

          <SunmiCard className="p-4 flex flex-col gap-6">

            {/* HEADER PREVIEW */}
            <SunmiCardHeader title="Ejemplo de Header" color="cyan" />

            {/* INPUTS */}
            <div className="flex flex-col gap-3">
              <SunmiInput placeholder="Nombre" />
              <SunmiInput placeholder="Email" />
            </div>

            {/* SELECT */}
            <div className="flex gap-2">
              <SunmiSelect>
                <option>Opción A</option>
                <option>Opción B</option>
              </SunmiSelect>

              <SunmiButton>Botón</SunmiButton>
            </div>

            {/* BADGES + TOGGLES */}
            <div className="flex items-center gap-4">
              <SunmiBadgeEstado value={true} />
              <SunmiBadgeEstado value={false} />
              <SunmiToggleEstado value={true} />
              <SunmiToggle value={true} />
            </div>

            {/* USER CELL */}
            <SunmiUserCell nombre="Juan Perez" email="juan@mail.com" />

            {/* TABLE */}
            <SunmiTable headers={["Usuario", "Email", "Estado"]}>
              {previewRows.map((u) => (
                <SunmiTableRow key={u.id}>
                  <td><SunmiUserCell nombre={u.nombre} email={u.email} /></td>
                  <td>{u.email}</td>
                  <td><SunmiBadgeEstado value={u.activo} /></td>
                </SunmiTableRow>
              ))}
            </SunmiTable>

          </SunmiCard>
        </div>
      </div>
    </SunmiCard>
  );
}
