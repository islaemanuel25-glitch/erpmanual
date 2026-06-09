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

// Etapa 0: registra SW push-only, pide permiso, suscribe el dispositivo.
// No persiste en DB (la prueba manda la subscription al endpoint /probar).
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

  const activar = useCallback(async () => {
    if (!soportado || busy) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermiso(perm);
      if (perm !== "granted") return;

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const r = await fetch("/api/push/public-key", { credentials: "include" });
        const { publicKey } = await r.json();
        if (!publicKey) {
          alert("Push no configurado en el servidor (faltan claves VAPID).");
          return;
        }
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      setSubscription(sub);
    } catch (e) {
      console.error("push activar:", e);
      alert("No se pudo activar notificaciones: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [soportado, busy]);

  const enviarPrueba = useCallback(async () => {
    if (!subscription || busy) {
      if (!subscription) alert("Primero activá las notificaciones en este dispositivo.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/push/probar", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription }),
      });
      const data = await res.json();
      if (!data.ok) alert("Error al enviar prueba: " + (data.error || ""));
    } catch {
      alert("Error de conexión al enviar prueba.");
    } finally {
      setBusy(false);
    }
  }, [subscription, busy]);

  const estado = !soportado
    ? "no-soportado"
    : permiso === "denied"
    ? "bloqueado"
    : subscription
    ? "activo"
    : permiso === "granted"
    ? "permitido"
    : "inactivo";

  return { soportado, permiso, subscription, busy, estado, activar, enviarPrueba };
}
