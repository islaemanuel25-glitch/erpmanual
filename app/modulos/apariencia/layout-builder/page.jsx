"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import LayoutBuilder from "@/components/apariencia/LayoutBuilder";

export default function LayoutBuilderPage() {
  return (
    <div className="w-full min-h-full">
      <SunmiCard>
        <SunmiCardHeader
          title="Layout Builder"
          subtitle="Definí la estructura visual del ERP: posición del sidebar, navbar y ancho del contenido. Ahora los cambios del builder se aplican directamente al layout real del ERP."
          color="amber"
        />
        <LayoutBuilder />
      </SunmiCard>
    </div>
  );
}
