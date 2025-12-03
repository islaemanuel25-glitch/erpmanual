"use client";

import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiToggle from "@/components/sunmi/SunmiToggle";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiUserCell from "@/components/sunmi/SunmiUserCell";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";

export default function PreviewPanel({ tab }) {
  const { theme } = useSunmiTheme();

  return (
    <div className="flex flex-col gap-10">

      {/* =====================================================
          TÍTULO
      ===================================================== */}
      <h2 className="text-lg font-semibold opacity-80">
        Vista previa — {tab.toUpperCase()}
      </h2>


      {/* =====================================================
          PREVIEWS INDIVIDUALES
      ===================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Input */}
        <SunmiCard>
          <h3 className="text-sm mb-2 opacity-70">Input</h3>
          <SunmiInput placeholder="Escribe algo..." />
        </SunmiCard>

        {/* Button */}
        <SunmiCard>
          <h3 className="text-sm mb-2 opacity-70">Botón</h3>
          <SunmiButton>Guardar cambios</SunmiButton>
        </SunmiCard>

        {/* Toggle */}
        <SunmiCard>
          <h3 className="text-sm mb-2 opacity-70">Toggle</h3>
          <SunmiToggle value={true} />
        </SunmiCard>

        {/* Pills & badges */}
        <SunmiCard>
          <h3 className="text-sm mb-2 opacity-70">Pills & Badges</h3>
          <div className="flex items-center gap-3 flex-wrap">
            <SunmiPill>Etiqueta</SunmiPill>
            <SunmiBadgeEstado value={true} />
            <SunmiBadgeEstado value={false} />
          </div>
        </SunmiCard>

        {/* UserCell */}
        <SunmiCard>
          <h3 className="text-sm mb-2 opacity-70">User Cell</h3>
          <SunmiUserCell nombre="Juan Pérez" email="juan@example.com" />
        </SunmiCard>

        {/* Tabla */}
        <SunmiCard>
          <h3 className="text-sm mb-2 opacity-70">Tabla</h3>
          <SunmiTable headers={["Usuario", "Estado"]}>
            <SunmiTableRow>
              <td className="px-2 py-1.5">
                <SunmiUserCell nombre="María" email="maria@mail.com" />
              </td>
              <td className="px-2 py-1.5">
                <SunmiBadgeEstado value={true} />
              </td>
            </SunmiTableRow>

            <SunmiTableRow>
              <td className="px-2 py-1.5">
                <SunmiUserCell nombre="Carlos" email="carlos@mail.com" />
              </td>
              <td className="px-2 py-1.5">
                <SunmiBadgeEstado value={false} />
              </td>
            </SunmiTableRow>
          </SunmiTable>
        </SunmiCard>
      </div>



      {/* =====================================================
          PREVIEW COMPLETO DEL ERP
      ===================================================== */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold mb-4 opacity-80">
          Vista completa del ERP
        </h2>

        <SunmiCard className="p-4 flex flex-col gap-4">

          {/* Header simulado */}
          <div
            className={`
              w-full rounded-md border px-3 py-2
              ${theme.header.bg} ${theme.header.text}
            `}
          >
            <h3 className="text-sm font-semibold tracking-wide">
              Módulo: Usuarios
            </h3>
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <SunmiInput placeholder="Buscar usuario..." />
            <SunmiInput placeholder="Correo..." />
            <SunmiButton variant="primary">Buscar</SunmiButton>
          </div>

          {/* Tabla general */}
          <SunmiTable headers={["Usuario", "Email", "Estado"]}>
            <SunmiTableRow>
              <td className="px-2 py-1.5">
                <SunmiUserCell nombre="Leonardo" email="leo@mail.com" />
              </td>
              <td className="px-2 py-1.5">leo@mail.com</td>
              <td className="px-2 py-1.5">
                <SunmiBadgeEstado value={true} />
              </td>
            </SunmiTableRow>

            <SunmiTableRow>
              <td className="px-2 py-1.5">
                <SunmiUserCell nombre="Micaela" email="mica@mail.com" />
              </td>
              <td className="px-2 py-1.5">mica@mail.com</td>
              <td className="px-2 py-1.5">
                <SunmiBadgeEstado value={false} />
              </td>
            </SunmiTableRow>
          </SunmiTable>

          {/* Botones finales */}
          <div className="flex justify-end gap-2 mt-2">
            <SunmiButton variant="ghost">Cancelar</SunmiButton>
            <SunmiButton variant="primary">Guardar</SunmiButton>
          </div>
        </SunmiCard>
      </div>

    </div>
  );
}
