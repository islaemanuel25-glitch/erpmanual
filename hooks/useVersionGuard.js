"use client";

// hooks/useVersionGuard.js
//
// Conecta el motor de versión (lib/version/motorVersion.js) a React. Acá NO hay
// política: solo el cableado con `visibilitychange`, el estado del aviso y la
// función que los formularios llaman antes de guardar.
//
// Alcance deliberado: este hook se usa SOLO en el editor de productos y en la
// actualización masiva de precios. El POS queda expresamente afuera — una venta
// en curso no se interrumpe nunca por un deploy.

import { useCallback, useEffect, useRef, useState } from "react";
import { crearMotorVersion } from "@/lib/version/motorVersion";
import { DISTINTA } from "@/lib/version/compararBuild";

// `process.env.NEXT_PUBLIC_*` lo reemplaza Next en build time por el literal.
// En desarrollo queda vacío y el guard se desactiva solo.
const BUILD_CLIENTE = process.env.NEXT_PUBLIC_BUILD_ID || "";

async function pedirBuildAlServidor() {
  // `cache: "no-store"` es obligatorio: con la respuesta cacheada el guard
  // compararía contra el build viejo y nunca detectaría el deploy.
  const res = await fetch("/api/version", { cache: "no-store" });
  if (!res.ok) throw new Error(`/api/version respondió ${res.status}`);
  const json = await res.json();
  return json?.buildId ?? "";
}

export default function useVersionGuard({ obtenerBuildServidor = pedirBuildAlServidor } = {}) {
  const [versionNueva, setVersionNueva] = useState(false);
  const [verificando, setVerificando] = useState(false);

  // Una sola instancia por montaje: el motor guarda el piso de 60 s y el
  // candado de doble submit, así que recrearlo en cada render los perdería.
  const motorRef = useRef(null);
  if (motorRef.current === null) {
    motorRef.current = crearMotorVersion({
      buildCliente: BUILD_CLIENTE,
      obtenerBuildServidor,
      onFalloRed: (error) => {
        // Fallo controlado: se deja rastro y se sigue. No se le muestra al
        // usuario un aviso de versión nueva que no se pudo verificar.
        console.warn("[version-guard] no se pudo verificar la versión:", error?.message || error);
      },
    });
  }

  // Chequeo OPORTUNISTA al volver a la pestaña. Nunca recarga solo ni
  // interrumpe: como mucho enciende el aviso.
  useEffect(() => {
    const alVolver = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      motorRef.current
        .chequearPorVisibilidad()
        .then((r) => {
          if (r.resultado === DISTINTA) setVersionNueva(true);
        })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, []);

  /**
   * Barrera previa a guardar. SIEMPRE consulta al servidor: no reutiliza el
   * chequeo por visibilidad ni respeta su piso de 60 s.
   *
   * @returns {Promise<boolean>} `true` = se puede guardar.
   */
  const puedeGuardar = useCallback(async () => {
    setVerificando(true);
    try {
      const r = await motorRef.current.chequearAntesDeGuardar();
      if (r.resultado === DISTINTA) setVersionNueva(true);
      return r.permiteGuardar;
    } finally {
      setVerificando(false);
    }
  }, []);

  return { versionNueva, verificando, puedeGuardar, buildCliente: BUILD_CLIENTE };
}
