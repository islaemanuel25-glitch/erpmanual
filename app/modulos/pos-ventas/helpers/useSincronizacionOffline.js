"use client";

// LA SINCRONIZACIÓN AUTOMÁTICA DE LA COLA OFFLINE DEL POS.
//
// Conecta el motor (lib/pos-ventas/sincronizacionOffline.js) con el navegador:
// la cola en localStorage, las rutas por fetch, y CUÁNDO correr. Corre sola al
// volver la red, al montar la pantalla con conexión, cuando se valida el PIN
// que la sincronización estaba esperando y al volver la pestaña al frente. El
// botón "Procesar cola" y el cierre de caja llaman al MISMO `sincronizar`.
//
// No decide nada: qué se manda, qué se saca y qué se marca lo decide el motor
// con la respuesta del servidor.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  sincronizarCola,
  candadoEntrePestanas,
  verificarCierreConCola,
  necesitaReplay,
  ESTADO_LOCAL,
  RESULTADO_SINCRONIZACION,
  MOTIVO_CIERRE_BLOQUEADO,
} from "@/lib/pos-ventas/sincronizacionOffline";
import {
  leerCola,
  leerColasIlegibles,
  marcarSincronizacion,
  quitarDeCola,
  conCandadoDeCola,
} from "./offlineQueue";

/** Cuánto se espera una respuesta antes de tratarla como sin red. */
const ESPERA_MAXIMA_MS = 30_000;

async function pedir(url, cuerpo) {
  const controlador = new AbortController();
  const reloj = setTimeout(() => controlador.abort(), ESPERA_MAXIMA_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: controlador.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { red: true, status: res.status, data };
  } catch {
    return { red: false };
  } finally {
    clearTimeout(reloj);
  }
}

const API = Object.freeze({
  registrar: (item) =>
    pedir("/api/pos-ventas/cobros-offline/registrar", { relojDispositivo: Date.now(), cobros: [item] }),
  crear: (cuerpo) => pedir("/api/pos-ventas/crear", cuerpo),
});

const COLA = Object.freeze({
  leer: leerCola,
  marcar: (id, sync) => conCandadoDeCola(() => marcarSincronizacion(id, sync)),
  quitar: (id) => conCandadoDeCola(() => quitarDeCola(id)),
});

const candado = candadoEntrePestanas();

/** ¿Hay algo de este local que la sincronización tenga que mirar? */
function hayQueMirar(leida, localId) {
  return (
    leida.ok &&
    leida.items.some(
      (item) => Number(item?.localId) === Number(localId) && (necesitaReplay(item) || item.sync?.estado === ESTADO_LOCAL.REVISION)
    )
  );
}

/**
 * @param {{ localId: number|null, operadorActivoId: number|null, offlineMode: boolean,
 *           requerirOperador: () => void, alTerminar?: (resumen: object) => void }} opciones
 */
export default function useSincronizacionOffline({ localId, operadorActivoId, cargandoOperador = false, offlineMode, requerirOperador, alTerminar }) {
  const [cola, setCola] = useState({ ok: true, items: [] });
  const [ilegibles, setIlegibles] = useState([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimo, setUltimo] = useState(null);
  const esperaPinRef = useRef(false);

  // Los valores vivos, para que `sincronizar` sea estable y los disparadores no
  // se vuelvan a suscribir en cada render.
  const vivo = useRef({});
  vivo.current = { localId, operadorActivoId, offlineMode, requerirOperador, alTerminar };

  const refrescar = useCallback(() => {
    const leida = leerCola();
    setCola(leida);
    setIlegibles(leerColasIlegibles() ?? []);
    return leida;
  }, []);

  const sincronizar = useCallback(async () => {
    const { localId: local, operadorActivoId: operador, offlineMode: sinRed } = vivo.current;
    if (!local) return { resultado: RESULTADO_SINCRONIZACION.OCUPADA };
    if (sinRed) return { resultado: RESULTADO_SINCRONIZACION.SIN_RED };
    setSincronizando(true);
    let resumen;
    try {
      resumen = await sincronizarCola({ cola: COLA, api: API, localId: local, operadorActivoId: operador, candado });
    } finally {
      setSincronizando(false);
      refrescar();
    }
    if (resumen.resultado !== RESULTADO_SINCRONIZACION.OCUPADA) setUltimo(resumen);
    esperaPinRef.current = resumen.resultado === RESULTADO_SINCRONIZACION.ESPERA_PIN;
    if (esperaPinRef.current) vivo.current.requerirOperador?.();
    vivo.current.alTerminar?.(resumen);
    return resumen;
  }, [refrescar]);

  // Al montar, al cambiar de local y al volver la red: si hay algo, se sincroniza.
  // Recién con el operador cargado: antes, el motor creería que no hay PIN.
  useEffect(() => {
    const leida = refrescar();
    if (cargandoOperador) return;
    if (!offlineMode && localId && hayQueMirar(leida, localId)) sincronizar();
  }, [offlineMode, localId, cargandoOperador, refrescar, sincronizar]);

  // El PIN que se estaba esperando: se sigue sola.
  useEffect(() => {
    if (operadorActivoId != null && esperaPinRef.current && !vivo.current.offlineMode) sincronizar();
  }, [operadorActivoId, sincronizar]);

  // La pestaña vuelve al frente, y la cola cambiada desde otra pestaña.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      const leida = refrescar();
      const { localId: local, offlineMode: sinRed } = vivo.current;
      if (!sinRed && local && hayQueMirar(leida, local)) sincronizar();
    };
    const alCambiarAlmacenamiento = (e) => {
      if (e.key === null || String(e.key).startsWith("posVentasOfflineQueue_v1")) refrescar();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("storage", alCambiarAlmacenamiento);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("storage", alCambiarAlmacenamiento);
    };
  }, [refrescar, sincronizar]);

  /**
   * Antes de cerrar la caja `turnoId`: si la cola de este equipo tiene ventas
   * de esa caja sin resolver, intenta sincronizarlas; si no puede, no deja.
   */
  const verificarCierre = useCallback(
    async (turnoId) => {
      const { localId: local, offlineMode: sinRed } = vivo.current;
      const primera = verificarCierreConCola(refrescar(), { localId: local, turnoId, sinConexion: sinRed });
      if (primera.permitido || sinRed || primera.motivo === MOTIVO_CIERRE_BLOQUEADO.COLA_ILEGIBLE) return primera;
      await sincronizar();
      return verificarCierreConCola(refrescar(), { localId: local, turnoId, sinConexion: vivo.current.offlineMode });
    },
    [refrescar, sincronizar]
  );

  return { cola, ilegibles, sincronizando, ultimo, sincronizar, refrescar, verificarCierre };
}
