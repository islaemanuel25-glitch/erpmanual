// Service worker SOLO para Web Push (sin fetch handler, sin caché).
// NO cachear nada acá: evita servir versiones viejas de la app.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { titulo: "ERP Azul", cuerpo: event.data ? event.data.text() : "" };
  }
  const titulo = data.titulo || "ERP Azul";
  const opciones = {
    body: data.cuerpo || "",
    tag: data.tag || undefined,
    data: { href: data.href || "/modulos/notificaciones" },
  };
  event.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/";
  event.waitUntil(
    (async () => {
      const todas = await clients.matchAll({ type: "window", includeUncontrolled: true });
      // Si ya hay una pestaña del ERP abierta, enfocarla y navegar.
      for (const c of todas) {
        if ("focus" in c) {
          await c.focus();
          if ("navigate" in c) {
            try { await c.navigate(href); } catch { /* fallback abajo */ }
          }
          return;
        }
      }
      if (clients.openWindow) await clients.openWindow(href);
    })()
  );
});
