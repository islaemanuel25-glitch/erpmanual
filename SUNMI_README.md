# ⭐ ERP AZUL — Estilo Sunmi V2 (Design System Oficial)

Todos los módulos del ERP deben usar estos componentes:

```jsx
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";


Estructura VISUAL obligatoria para cualquier módulo:
<SunmiCard>
  <SunmiHeader title="Nombre del módulo" color="amber" />
  
  <SunmiSeparator label="Bloque" color="amber" />

  <SunmiTable>
    <thead>...</thead>
    <tbody>...</tbody>
  </SunmiTable>
</SunmiCard>

