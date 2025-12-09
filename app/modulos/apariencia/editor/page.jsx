"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import ThemeEditor from "@/components/apariencia/ThemeEditor";

export default function ThemeEditorPage() {
  return (
    <div className="w-full min-h-full">
      <SunmiCard>
        <SunmiCardHeader
          title="Theme Editor avanzado"
          subtitle="Editá los colores del ERP en vivo, guardá overrides, exportá/importá JSON y prepará themes por cliente."
          color="amber"
        />

        <ThemeEditor />
      </SunmiCard>
    </div>
  );
}
