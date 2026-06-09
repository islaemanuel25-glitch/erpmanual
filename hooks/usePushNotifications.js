"use client";

import { useState, useEffect, useCallback } from "react";

// VAPID public key (base64url) → Uint8Array para pushManager.subscribe.
function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function getPublicKey() {
  const r = await fetch("/api/push/public-key", { credentials: "include" });
  const d = await r.json();
  return d?.publicKey || null;
}

// Etapa 1: registra SW push-only, suscribe/des-suscribe el dispositivo y PERSISTE
// la suscripción en el servidor (/api/push/suscribir|desuscribir).
export default function usePushNotifications() {
  const [soportado, setSoportado] = useState(false);
  const [permiso, setPermiso] = useState("default"); // default | granted | denied
  const [subscription, setSubscription] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sup =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSoportado(sup);
    if (!sup) return;
    setPermiso(Notification.permission);
    navigator.serviceWorker
      .getRegistration("/sw.js")
      .then((reg) => (reg ? reg.pushManager.getSubscription() : null))
      .then((sub) => {
        if (sub) setSubscription(sub);
      })
      .catch(() => {});
  }, []);

  // Persiste la suscripción en el servidor (no rompe la UI si falla).
  const persistir = useCallback(async (sub) => {
    try {
      const j = sub.toJSON();
      await fetch("/api/push/suscribir", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: j.endpoint,
          keys: j.keys,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        }),
      });
    } catch {
      // best-effort
    }
  }, []);

  const desuscribirServer = useCallback(async (endpoint) => {
    if (!endpoint) return;
    try {
      await fetch("/api/push/desuscribir", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
    } catch {
      // best-effort
    }
  }, []);

  // Des-suscribe la anterior (devuelve su endpoint) y crea una NUEVA con la pública actual.
  const suscribirNueva = useCallback(async (reg) => {
    const prev = await reg.pushManager.getSubscription();
    const prevEndpoint = prev?.endpoint || null;
    if (prev) {
      try {
        await prev.unsubscribe();
      } catch {
        // seguir igual
      }
    }
    const publicKey = await getPublicKey();
    if (!publicKey) {
      alert("Push no configurado en el servidor (faltan claves VAPID).");
      return { sub: null, prevEndpoint };
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    return { sub, prevEndpoint };
  }, []);

  const activarOrenovar = useCallback(
    async (esRenovar) => {
      if (!soportado || busy) return;
      setBusy(true);
      try {
        if (Notification.permission !== "granted") {
          const perm = await Notification.requestPermission();
          setPermiso(perm);
          if (perm !== "granted") return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const { sub, prevEndpoint } = await suscribirNueva(reg);
        if (!sub) return;
        if (prevEndpoint && prevEndpoint !== sub.endpoint) {
          await desuscribirServer(prevEndpoint);
        }
        await persistir(sub);
        setSubscription(sub);
        if (esRenovar) alert("Suscripción renovada");
      } catch (e) {
        console.error("push activar/renovar:", e);
        alert("No se pudo " + (esRenovar ? "renovar" : "activar") + ": " + (e?.message || e));
      } finally {
        setBusy(false);
      }
    },
    [soportado, busy, suscribirNueva, desuscribirServer, persistir]
  );

  const activar = useCallback(() => activarOrenovar(false), [activarOrenovar]);
  const renovar = useCallback(() => activarOrenovar(true), [activarOrenovar]);

  const desactivar = useCallback(async () => {
    if (!soportado || busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      const endpoint = sub?.endpoint || null;
      if (sub) {
        try {
          await sub.unsubscribe();
        } catch {
          // ignorar
        }
      }
      if (endpoint) await desuscribirServer(endpoint);
      setSubscription(null);
    } catch (e) {
      console.error("push desactivar:", e);
    } finally {
      setBusy(false);
    }
  }, [soportado, busy, desuscribirServer]);

  const enviarPrueba = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      // El servidor usa las suscripciones guardadas; mandamos la viva solo como fallback.
      let live = null;
      try {
        const reg = await navigator.serviceWorker.ready;
        live = await reg.pushManager.getSubscription();
        if (live) setSubscription(live);
      } catch {
        // sin SW listo
      }
      const res = await fetch("/api/push/probar", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(live ? { subscription: live } : {}),
      });
      const data = await res.json();
      if (!data.ok) alert("Error al enviar prueba: " + (data.error || ""));
    } catch {
      alert("Error de conexión al enviar prueba.");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const estado = !soportado
    ? "no-soportado"
    : permiso === "denied"
    ? "bloqueado"
    : subscription
    ? "activo"
    : permiso === "granted"
    ? "permitido"
    : "inactivo";

  return {
    soportado,
    permiso,
    subscription,
    busy,
    estado,
    activar,
    renovar,
    desactivar,
    enviarPrueba,
  };
}
