"use client";

import { useState, useEffect } from "react";

export default function useContextoActivo() {
  const [loading, setLoading] = useState(true);
  const [contexto, setContexto] = useState(null); // { localId, nombre, esDeposito }
  const [needsContexto, setNeedsContexto] = useState(false);

  useEffect(() => {
    const cargar = async () => {
      try {
        const res = await fetch("/api/contexto-activo/get", {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json();
        if (data.ok) {
          setContexto({ localId: data.localId, nombre: data.nombre, esDeposito: data.esDeposito });
          setNeedsContexto(false);
        } else {
          setContexto(null);
          setNeedsContexto(data.needsContexto === true);
        }
      } catch {
        setContexto(null);
      } finally {
        setLoading(false);
      }
    };

    cargar();
  }, []);

  return { loading, contexto, needsContexto };
}
