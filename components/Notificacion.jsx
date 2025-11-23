"use client";

import { useEffect, useState } from "react";

export default function Notificacion({ tipo = "ok", mensaje = "", duracion = 2500 }) {
  const [visible, setVisible] = useState(Boolean(mensaje));

  useEffect(() => {
    if (!mensaje) return;
    setVisible(true);
    const id = setTimeout(() => setVisible(false), duracion);
    return () => clearTimeout(id);
  }, [mensaje, duracion]);

  if (!visible) return null;

  const estilos =
    tipo === "error"
      ? "bg-red-600 text-white"
      : "bg-green-600 text-white";

  return (
    <div className={`fixed top-3 left-1/2 -translate-x-1/2 z-50 rounded-xl px-4 py-2 text-sm shadow ${estilos}`}>
      {mensaje}
    </div>
  );
}
