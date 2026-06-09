"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";

const MAX_DROPDOWN = 5;
const DIAS_CAMPANITA = 7;

// ISO de hace N días (hora local del navegador, AR).
function desdeHaceDias(dias) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString();
}

function fmtFecha(f) {
  if (!f) return "";
  return new Date(f).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Campanita = acceso rápido (NO historial completo).
// Badge = total no leídas. Dropdown = hasta 5 no leídas + "Ver todas".
// Polling cada 60s + refetch al volver el foco.
export default function CampanaNotificaciones({ iconClassName = "" }) {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/notificaciones/listar?filtro=noleidas&pageSize=${MAX_DROPDOWN}&desde=${encodeURIComponent(desdeHaceDias(DIAS_CAMPANITA))}`,
        { credentials: "include", cache: "no-store" }
      );
      const data = await res.json();
      if (data.ok) setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      // silenciar
    }
  }, []);

  // Polling 60s + refetch al foco. Fetch inline (no setState sincrónico en el effect).
  useEffect(() => {
    let activo = true;
    const cargar = async () => {
      try {
        const res = await fetch(
          `/api/notificaciones/contar?desde=${encodeURIComponent(desdeHaceDias(DIAS_CAMPANITA))}`,
          { credentials: "include", cache: "no-store" }
        );
        const data = await res.json();
        if (activo && data.ok) setCount(Number(data.count) || 0);
      } catch {
        // silenciar: la campanita no debe romper el header
      }
    };
    cargar();
    const id = setInterval(cargar, 60000);
    const onFocus = () => cargar();
    window.addEventListener("focus", onFocus);
    return () => {
      activo = false;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Cerrar al click afuera.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) fetchItems();
  };

  const abrirNotif = async (n) => {
    setOpen(false);
    try {
      await fetch(`/api/notificaciones/marcar-leida/${n.id}`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // navegar igual aunque falle el marcado
    }
    setItems((prev) => prev.filter((x) => x.id !== n.id));
    setCount((c) => Math.max(0, c - 1));
    if (n.href) router.push(n.href);
  };

  const marcarTodas = async () => {
    try {
      await fetch("/api/notificaciones/marcar-todas", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // silenciar
    }
    setItems([]);
    setCount(0);
  };

  const verTodas = () => {
    setOpen(false);
    router.push("/modulos/notificaciones");
  };

  const restantes = count - items.length;

  // Lista de ítems reutilizada por el dropdown (desktop) y el sheet (mobile).
  const listaItems =
    items.length === 0 ? (
      <p className="px-3 py-6 text-xs sunmi-text-muted text-center">
        Sin notificaciones nuevas
      </p>
    ) : (
      items.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => abrirNotif(n)}
          className="w-full text-left px-3 py-3 sm:py-2 hover:bg-[var(--table-row-hover)] transition"
        >
          <div className="flex items-start gap-2">
            <span className="mt-1.5 w-2 h-2 rounded-full bg-[color:var(--pos-accent)] shrink-0" />
            <div className="min-w-0">
              <div className="text-[13px] font-medium sunmi-text-strong truncate">{n.titulo}</div>
              {n.cuerpo && <div className="text-[11px] sunmi-text-muted">{n.cuerpo}</div>}
              <div className="text-[10px] sunmi-text-muted mt-0.5">{fmtFecha(n.createdAt)}</div>
            </div>
          </div>
        </button>
      ))
    );

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={toggle}
        aria-label="Notificaciones"
        className={`relative ${iconClassName} hover:opacity-80 transition cursor-pointer p-1.5 -m-1.5`}
      >
        <Bell size={20} />
        {count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[color:var(--pos-danger)] text-white text-[10px] font-bold leading-[16px] text-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {/* DESKTOP: dropdown flotante */}
      {open && (
        <div className="hidden sm:block absolute right-0 mt-2 w-80 rounded-xl border sunmi-border sunmi-surface shadow-xl z-[9999] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b sunmi-divider">
            <span className="text-sm font-semibold sunmi-text-strong">Notificaciones</span>
            {count > 0 && (
              <button
                type="button"
                onClick={marcarTodas}
                className="text-[11px] sunmi-text-accent hover:underline"
              >
                Marcar todas leídas
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto divide-y sunmi-divide">{listaItems}</div>

          {restantes > 0 && (
            <div className="px-3 py-1.5 text-[11px] sunmi-text-muted text-center border-t sunmi-divider">
              + {restantes} más
            </div>
          )}

          <div className="border-t sunmi-divider p-2">
            <button
              type="button"
              onClick={verTodas}
              className="w-full text-center text-xs font-medium sunmi-text-accent hover:underline py-1"
            >
              Ver todas
            </button>
          </div>
        </div>
      )}

      {/* MOBILE: sheet/drawer inferior con backdrop */}
      {open && (
        <div className="sm:hidden">
          <div
            className="fixed inset-0 bg-black/50 z-[9998]"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-[9999] flex flex-col max-h-[80vh] rounded-t-2xl border-t sunmi-border sunmi-surface shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b sunmi-divider">
              <span className="text-sm font-semibold sunmi-text-strong">Notificaciones</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="p-1 -m-1 sunmi-text-muted hover:opacity-80"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y sunmi-divide">{listaItems}</div>

            {restantes > 0 && (
              <div className="px-4 py-1.5 text-[11px] sunmi-text-muted text-center border-t sunmi-divider">
                + {restantes} más
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 p-3 border-t sunmi-divider">
              <button
                type="button"
                onClick={marcarTodas}
                disabled={count === 0}
                className="rounded-lg border sunmi-border py-2.5 text-xs font-medium sunmi-text-strong disabled:opacity-40"
              >
                Marcar todas leídas
              </button>
              <button
                type="button"
                onClick={verTodas}
                className="rounded-lg py-2.5 text-xs font-semibold text-white bg-[color:var(--pos-accent)]"
              >
                Ver todas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
