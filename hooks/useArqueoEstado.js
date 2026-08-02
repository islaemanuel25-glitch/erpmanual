"use client";

// hooks/useArqueoEstado.js
//
// Estado de la alerta de arqueo para la caja abierta del POS.
//
// TIEMPO REAL, versión simple: consulta periódica liviana. No se agregan
// sockets porque el proyecto no los usa hoy y una alerta que puede llegar 45 s
// tarde no cambia nada operativamente. Se refresca:
//   · cada REFRESCO_MS mientras la pestaña está visible;
//   · al volver el foco a la ventana (una pestaña dormida 3 horas se pone al día);
//   · cuando el POS lo pide a mano — después de una venta o de un arqueo.
//
// Mientras la pestaña está oculta NO se consulta: un POS abierto en segundo
// plano no tiene por qué golpear la API.

import { useCallback, useEffect, useRef, useState } from "react";

/** Intervalo de refresco. Suficiente para una alerta de caja y muy por debajo de una consulta por segundo. */
export const REFRESCO_MS = 45_000;

const ESTADO_INICIAL = {
  activo: false,
  cajaAbierta: false,
  vencido: false,
  minutosRestantes: null,
  minutosDemora: 0,
  cantidadPostergaciones: 0,
  puedePostergar: false,
  requiereAutorizacion: false,
};

export default function useArqueoEstado({ turnoId, localId, habilitado = true } = {}) {
  const [estado, setEstado] = useState(ESTADO_INICIAL);
  const [ultimoArqueoEn, setUltimoArqueoEn] = useState(null);
  const [cantidadArqueos, setCantidadArqueos] = useState(0);
  const [cargando, setCargando] = useState(false);
  // `null` = todavía no se sabe. Distinto de `false` = el servidor dijo que la
  // función está apagada. La UI no dibuja nada mientras sea null, así que el
  // botón nunca aparece y desaparece: solo aparece cuando hay un `true`
  // confirmado por el backend.
  const [resuelto, setResuelto] = useState(false);

  // Evita que una respuesta lenta pise a una más nueva.
  const peticionRef = useRef(0);

  const refrescar = useCallback(async () => {
    if (!habilitado || !turnoId) return;
    const marca = ++peticionRef.current;
    setCargando(true);
    try {
      const params = new URLSearchParams({ turnoId: String(turnoId) });
      if (localId) params.set("localId", String(localId));
      const res = await fetch(`/api/pos-ventas/arqueos/estado?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (marca !== peticionRef.current) return; // llegó tarde
      if (json?.ok) {
        setEstado({ ...ESTADO_INICIAL, ...(json.estado || {}) });
        setUltimoArqueoEn(json.ultimoArqueoEn ?? null);
        setCantidadArqueos(json.cantidadArqueos ?? 0);
        setResuelto(true);
      }
    } catch {
      // Silencioso a propósito: un fallo de red del chequeo de arqueo no puede
      // interrumpir una venta en curso. Se reintenta en el próximo ciclo.
    } finally {
      if (marca === peticionRef.current) setCargando(false);
    }
  }, [habilitado, turnoId, localId]);

  useEffect(() => {
    if (!habilitado || !turnoId) return undefined;
    refrescar();

    // Con la función APAGADA no se instala el intervalo: un local que no usa
    // arqueos no tiene por qué consultar cada 45 s para que le repitan que no
    // los usa. Los listeners sí quedan, así que si alguien la activa desde
    // Configuración, la próxima vuelta al foco —o la próxima venta, que llama
    // a `refrescar()`— la detecta sin necesidad de recargar ni redesplegar.
    const id = estado.activo
      ? setInterval(() => {
          if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
          refrescar();
        }, REFRESCO_MS)
      : null;

    const alVolver = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") refrescar();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);

    return () => {
      if (id) clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [habilitado, turnoId, refrescar, estado.activo]);

  // `visible` es la única señal que la UI debe mirar para dibujar el botón o la
  // franja: exige que el backend haya respondido Y que la función esté activa.
  const visible = resuelto && estado.activo === true;

  return { estado, visible, resuelto, ultimoArqueoEn, cantidadArqueos, cargando, refrescar };
}
