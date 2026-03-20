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
  const [errorCarga, setErrorCarga] = useState(null);

  const fetchDatos = useCallback(async () => {
    setCargandoResumen(true);
    setCargandoVentas(true);
    setCargandoActividad(true);
    setErrorCarga(null);

    // Fetch en paralelo
    const [resRes, ventasRes, actRes] = await Promise.allSettled([
      fetch("/api/dashboard/resumen", { credentials: "include", cache: "no-store" }),
      fetch("/api/dashboard/ventas-recientes?limite=10", { credentials: "include", cache: "no-store" }),
      fetch("/api/dashboard/actividad?limite=15", { credentials: "include", cache: "no-store" }),
    ]);

    let hayError = false;
    let esContexto = false;

    if (resRes.status === "fulfilled" && resRes.value.ok) {
      const data = await resRes.value.json();
      if (data.ok) setResumen(data.resumen);
    } else {
      hayError = true;
      if (resRes.status === "fulfilled" && resRes.value.status === 409) esContexto = true;
    }
    setCargandoResumen(false);

    if (ventasRes.status === "fulfilled" && ventasRes.value.ok) {
      const data = await ventasRes.value.json();
      if (data.ok) setVentas(data.ventas);
    } else {
      hayError = true;
      if (ventasRes.status === "fulfilled" && ventasRes.value.status === 409) esContexto = true;
    }
    setCargandoVentas(false);

    if (actRes.status === "fulfilled" && actRes.value.ok) {
      const data = await actRes.value.json();
      if (data.ok) setActividad(data.actividad);
    } else {
      hayError = true;
      if (actRes.status === "fulfilled" && actRes.value.status === 409) esContexto = true;
    }
    setCargandoActividad(false);

    if (hayError) {
      setErrorCarga(
        esContexto
          ? "contexto"
          : "error"
      );
    }
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
        errorCarga={errorCarga}
      />
      <DashboardDesktop
        nombre={perfil.nombre}
        resumen={resumen}
        ventas={ventas}
        actividad={actividad}
        cargandoResumen={cargandoResumen}
        cargandoVentas={cargandoVentas}
        cargandoActividad={cargandoActividad}
        errorCarga={errorCarga}
      />
    </div>
  );
}
