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

// Etapa 0: registra SW push-only, pide permiso, suscribe/des-suscribe el dispositivo.
// No persiste en DB (la prueba manda la subscription viva al endpoint /probar).
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

  // Des-suscribe la suscripción anterior (si hay) y crea una NUEVA con la pública actual.
  const suscribirNueva = useCallback(async (reg) => {
    const prev = await reg.pushManager.getSubscription();
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
      return null;
    }
    return reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }, []);

  const activar = useCallback(async () => {
    if (!soportado || busy) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermiso(perm);
      if (perm !== "granted") return;
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await suscribirNueva(reg);
      if (sub) setSubscription(sub);
    } catch (e) {
      console.error("push activar:", e);
      alert("No se pudo activar notificaciones: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [soportado, busy, suscribirNueva]);

  const renovar = useCallback(async () => {
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
      const sub = await suscribirNueva(reg);
      if (sub) {
        setSubscription(sub);
        alert("Suscripción renovada");
      }
    } catch (e) {
      console.error("push renovar:", e);
      alert("No se pudo renovar la suscripción: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [soportado, busy, suscribirNueva]);

  const desactivar = useCallback(async () => {
    if (!soportado || busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        try {
          await sub.unsubscribe();
        } catch {
          // ignorar
        }
      }
      setSubscription(null);
    } catch (e) {
      console.error("push desactivar:", e);
    } finally {
      setBusy(false);
    }
  }, [soportado, busy]);

  const enviarPrueba = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const live = await reg.pushManager.getSubscription();
      if (!live) {
        setSubscription(null);
        alert("Primero activá (o renová) las notificaciones en este dispositivo.");
        return;
      }
      setSubscription(live);
      const res = await fetch("/api/push/probar", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: live }),
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
