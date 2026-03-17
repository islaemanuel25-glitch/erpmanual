"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@/app/context/UserContext";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import DashboardMobile from "@/components/dashboard/DashboardMobile";
import DashboardDesktop from "@/components/dashboard/DashboardDesktop";

export default function DashboardPage() {
  const { perfil, cargando } = useUser();

  const [resumen, setResumen] = useState(null);
  const [ventas, setVentas] = useState([]);
  const [actividad, setActividad] = useState([]);
  const [cargandoResumen, setCargandoResumen] = useState(true);
  const [cargandoVentas, setCargandoVentas] = useState(true);
  const [cargandoActividad, setCargandoActividad] = useState(true);

  const fetchDatos = useCallback(async () => {
    setCargandoResumen(true);
    setCargandoVentas(true);
    setCargandoActividad(true);

    // Fetch en paralelo
    const [resRes, ventasRes, actRes] = await Promise.allSettled([
      fetch("/api/dashboard/resumen", { credentials: "include", cache: "no-store" }),
      fetch("/api/dashboard/ventas-recientes?limite=10", { credentials: "include", cache: "no-store" }),
      fetch("/api/dashboard/actividad?limite=15", { credentials: "include", cache: "no-store" }),
    ]);

    if (resRes.status === "fulfilled" && resRes.value.ok) {
      const data = await resRes.value.json();
      if (data.ok) setResumen(data.resumen);
    }
    setCargandoResumen(false);

    if (ventasRes.status === "fulfilled" && ventasRes.value.ok) {
      const data = await ventasRes.value.json();
      if (data.ok) setVentas(data.ventas);
    }
    setCargandoVentas(false);

    if (actRes.status === "fulfilled" && actRes.value.ok) {
      const data = await actRes.value.json();
      if (data.ok) setActividad(data.actividad);
    }
    setCargandoActividad(false);
  }, []);

  useEffect(() => {
    if (perfil) fetchDatos();
  }, [perfil, fetchDatos]);

  if (cargando) return <div className="p-4"><SunmiLoader /></div>;

  if (!perfil) {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  return (
    <div className="p-4 md:p-6">
      <DashboardMobile
        nombre={perfil.nombre}
        resumen={resumen}
        ventas={ventas}
        actividad={actividad}
        cargandoResumen={cargandoResumen}
        cargandoVentas={cargandoVentas}
        cargandoActividad={cargandoActividad}
      />
      <DashboardDesktop
        nombre={perfil.nombre}
        resumen={resumen}
        ventas={ventas}
        actividad={actividad}
        cargandoResumen={cargandoResumen}
        cargandoVentas={cargandoVentas}
        cargandoActividad={cargandoActividad}
      />
    </div>
  );
}
