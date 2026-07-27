"use client";

import { useEffect } from "react";

// Guarda de despliegue. Tras un deploy, un cliente que tenía el bundle ANTERIOR
// abierto puede pedir un chunk JS/CSS cuyo hash ya no existe en el server (el deploy
// borró los artefactos viejos) → ChunkLoadError. En el POS esto se ve como "error al
// vender" (p.ej. al disparar un import() dinámico de impresión de ticket).
//
// Este guard escucha ese error y recarga la página UNA vez para tomar el bundle nuevo.
// Tope: máximo 2 recargas dentro de una ventana de 60s (si pasan 60s sin nuevo error,
// el contador se resetea). Así una recarga que "prende" no genera loop, y un deploy
// futuro puede volver a recuperarse.
const TS_KEY = "__erp_chunk_reload_ts";
const CNT_KEY = "__erp_chunk_reload_count";

function esChunkError(txt) {
  return /ChunkLoadError|Loading chunk\s+[\w-]+\s+failed|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
    String(txt || "")
  );
}

export default function ChunkReloadGuard() {
  useEffect(() => {
    const recargarUnaVez = () => {
      const now = Date.now();
      let last = 0;
      let count = 0;
      try {
        last = Number(sessionStorage.getItem(TS_KEY) || "0");
        count = Number(sessionStorage.getItem(CNT_KEY) || "0");
      } catch {
        // sessionStorage no disponible → seguimos con valores por defecto
      }
      if (now - last > 60000) count = 0; // la ventana expiró: reset
      if (count >= 2) return; // ya recargamos 2 veces: probablemente no es stale-chunk
      try {
        sessionStorage.setItem(TS_KEY, String(now));
        sessionStorage.setItem(CNT_KEY, String(count + 1));
      } catch {
        // ignorar
      }
      window.location.reload();
    };

    const onError = (e) => {
      if (esChunkError(e?.message) || esChunkError(e?.error?.message) || esChunkError(e?.error?.name)) {
        recargarUnaVez();
      }
    };
    const onRejection = (e) => {
      const r = e?.reason;
      if (esChunkError(r?.message) || esChunkError(r?.name) || esChunkError(r)) {
        recargarUnaVez();
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
