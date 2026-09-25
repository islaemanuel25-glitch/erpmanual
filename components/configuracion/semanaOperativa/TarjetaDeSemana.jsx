"use client";

// components/configuracion/semanaOperativa/TarjetaDeSemana.jsx
//
// UNA TARJETA DE LA PANTALLA DE SEMANA OPERATIVA: un rótulo chico, la semana en
// grande y una línea de detalle. Es la forma de "Semana actual" y de "Cambio
// programado" en el diseño (Figma `fYqIEZxHRb6yx6pIUrUG2h`, página 48:11).
//
// Sale del kit tal cual: `SunmiCard` pone la superficie y el borde del tema, y
// esta pieza solo ordena tres textos con los tokens de letra del config.

import SunmiCard from "@/components/sunmi/SunmiCard";

export default function TarjetaDeSemana({ rotulo, titulo, detalle, children }) {
  return (
    <SunmiCard className="p-4 space-y-1">
      <p className="text-sm3 font-medium sunmi-text-muted">{rotulo}</p>
      <p className="text-lg3 font-bold sunmi-text-strong">{titulo}</p>
      {detalle && <p className="text-sm2 sunmi-text-muted">{detalle}</p>}
      {children}
    </SunmiCard>
  );
}
