"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@/app/context/UserContext";

export default function useLocalSelector({ onLocalChange } = {}) {
  const { perfil } = useUser();

  const [locales, setLocales] = useState([]);
  const [localSeleccionado, setLocalSeleccionado] = useState(null);
  const [cargandoLocales, setCargandoLocales] = useState(true);

  const esAdminSinLocal = !!perfil?.esAdmin && !perfil?.localId;

  // Fetch locales
  useEffect(() => {
    if (!perfil) return;

    if (perfil.localId) {
      setLocalSeleccionado(perfil.localId);
      setCargandoLocales(false);
      return;
    }

    const cargar = async () => {
      try {
        const res = await fetch("/api/locales/opciones", {
          credentials: "include",
        });
        const data = await res.json();
        if (data.ok) {
          setLocales(data.items || []);
          if (data.items?.length === 1) {
            setLocalSeleccionado(data.items[0].id);
          }
        }
      } catch (err) {
        console.error("Error cargando locales:", err);
      } finally {
        setCargandoLocales(false);
      }
    };

    cargar();
  }, [perfil]);

  const handleCambiarLocal = useCallback(
    (val) => {
      const id = Number(val);
      if (id && id !== localSeleccionado) {
        setLocalSeleccionado(id);
        onLocalChange?.(id);
      }
    },
    [localSeleccionado, onLocalChange]
  );

  const refrescarLocales = useCallback(async () => {
    setCargandoLocales(true);
    setLocalSeleccionado(null);
    try {
      const res = await fetch("/api/locales/opciones", {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        setLocales(data.items || []);
        if (data.items?.length === 1) {
          setLocalSeleccionado(data.items[0].id);
        }
      }
    } catch (err) {
      console.error("Error refrescando locales:", err);
    } finally {
      setCargandoLocales(false);
    }
  }, []);

  const localNombre =
    locales.find((l) => l.id === localSeleccionado)?.nombre || "";

  return {
    perfil,
    locales,
    localSeleccionado,
    setLocalSeleccionado,
    localNombre,
    esAdminSinLocal,
    cargandoLocales,
    handleCambiarLocal,
    refrescarLocales,
  };
}
