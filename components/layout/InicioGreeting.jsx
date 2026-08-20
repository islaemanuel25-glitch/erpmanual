"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/app/context/UserContext";
import { fechaAR, horaAR, diaSemanaAR } from "@/lib/fechas/formatearFechaHora";

function getGreeting(hour) {
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

export default function InicioGreeting() {
  const { perfil } = useUser();
  // Server y primer client render arrancan con `now = null` para
  // evitar hydration mismatch. La fecha se resuelve en el useEffect
  // post-mount y se actualiza cada minuto.
  const [now, setNow] = useState(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const nombre = perfil?.nombre || "";
  const greeting = now ? getGreeting(now.getHours()) : "";
  // El saludo de inicio: el DÍA de la semana también se corrige con la zona —una
  // visita de las 22:30 es del día siguiente en UTC— y la hora va en 24 horas.
  const fecha = now ? `${diaSemanaAR(now)} ${fechaAR(now)}` : "";
  const hora = now ? horaAR(now, { vacio: "" }) : "";

  return (
    <div className="flex items-baseline justify-between gap-3 mb-6 px-1">
      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] font-medium text-[color:var(--app-fg)] m-0 truncate">
          {greeting}
          {greeting && nombre ? `, ${nombre}` : ""}
        </h1>
        <p className="text-[13px] sunmi-text-muted mt-1 capitalize truncate">
          {fecha || " "}
        </p>
      </div>
      <div
        className="text-[28px] font-normal text-[color:var(--app-fg)] shrink-0"
        style={{ fontVariantNumeric: "tabular-nums" }}
        suppressHydrationWarning
      >
        {hora || " "}
      </div>
    </div>
  );
}
