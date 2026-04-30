"use client";

import { Bell, ChevronDown, LogOut, ArrowLeftRight, Store, Warehouse, Menu, UserCheck, Home } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { useUser } from "@/app/context/UserContext";
import { useLayoutSettings } from "@/app/context/LayoutSettingsContext";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { useOperadorActivo } from "@/hooks/useOperadorActivo";
import OperadorSelector from "@/components/operador/OperadorSelector";
import { getDefaultRoute } from "@/lib/getDefaultRoute";

export default function Header({ onOpenMobileMenu }) {
  const pathname = usePathname();
  const router = useRouter();
  const menuRef = useRef(null);
  const { perfil, logout } = useUser();
  const { menuMode } = useLayoutSettings();
  const { theme } = useSunmiTheme();
  const homeRoute = getDefaultRoute(menuMode);
  const showHomeBtn = pathname !== homeRoute;
  const { operador, login: loginOperador, logout: logoutOperador } = useOperadorActivo();
  const [showOperadorSelector, setShowOperadorSelector] = useState(false);
  const operadorRef = useRef(null);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const esAdmin = permisos.includes("*");

  // Cuenta exenta = admin O tiene permiso explícito → opera sin operador
  const esCuentaPropia = esAdmin || permisos.includes("modulos.acceso_sin_operador");

  const [open, setOpen] = useState(false);
  const [contexto, setContexto] = useState(null);
  const [contextoSinSeleccionar, setContextoSinSeleccionar] = useState(false);

  const nombre = perfil?.nombre || "Usuario";
  const rol = perfil?.rol || "-";

  const titulo =
    pathname.includes("auditoria-pos-ventas")
      ? "Auditoría POS Ventas"
      : pathname.includes("usuarios")
      ? "Usuarios"
      : pathname.includes("roles")
      ? "Roles"
      : pathname.includes("locales")
      ? "Locales"
      : pathname.includes("productos")
      ? "Productos"
      : pathname.includes("stock")
      ? "Stock"
      : pathname.includes("transferencias")
      ? "Transferencias"
      : pathname.includes("pos")
      ? "POS"
      : "Panel";

  const cargarContexto = useCallback(async () => {
    if (!esAdmin) return;
    try {
      const res = await fetch("/api/contexto-activo/get", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (data.ok) {
        setContexto({ nombre: data.nombre, esDeposito: data.esDeposito });
        setContextoSinSeleccionar(false);
      } else {
        setContexto(null);
        setContextoSinSeleccionar(data.needsContexto === true);
      }
    } catch {
      setContexto(null);
    }
  }, [esAdmin]);

  useEffect(() => {
    cargarContexto();
  }, [cargarContexto, pathname]);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
      if (operadorRef.current && !operadorRef.current.contains(e.target)) {
        setShowOperadorSelector(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <header
      className={`
        w-full h-16 px-4 sm:px-6 flex justify-between items-center
        border-b
        shadow-[0_3px_8px_rgba(0,0,0,0.35)]
        bg-gradient-to-r
        ${theme.header.bg}
        ${theme.header.border}
        transition-colors duration-200
      `}
    >
      {/* IZQUIERDA: HAMBURGUESA mobile + TITULO desktop */}
      <div className="flex items-center gap-2">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className={`md:hidden p-2 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center ${theme.header.text} hover:opacity-80 transition cursor-pointer`}
            aria-label="Abrir menú"
          >
            <Menu size={24} />
          </button>
        )}
        <h1 className={`text-xl font-semibold hidden md:block ${theme.header.text}`}>
          {titulo}
        </h1>
        {showHomeBtn && (
          <Link
            href={homeRoute}
            className={`
              flex items-center gap-1.5
              px-3 py-1.5 rounded-lg
              hover:bg-[color:var(--hover-bg)]
              text-sm font-medium
              transition cursor-pointer
              ${theme.header.text}
            `}
            aria-label="Ir al inicio"
          >
            <Home size={16} />
            <span className="hidden sm:inline">Inicio</span>
          </Link>
        )}
      </div>

      {/* DERECHA */}
      <div className="flex items-center gap-3 sm:gap-4">

        {/* NOTIFICACIONES */}
        <Bell
          className={`
            hidden sm:block
            ${theme.header.text}
            hover:opacity-80
            transition cursor-pointer
          `}
        />

        {/* CONTEXTO ACTIVO (solo admin) */}
        {esAdmin && contexto && (
          <button
            onClick={() => router.push("/inicio")}
            className={`
              hidden sm:flex items-center gap-1.5
              text-[11px] px-2.5 py-1 rounded-lg
              border transition cursor-pointer
              ${theme.header.border}
              hover:opacity-80
            `}
          >
            {contexto.esDeposito ? (
              <Warehouse size={13} className="text-amber-400" />
            ) : (
              <Store size={13} className="text-cyan-400" />
            )}
            <span className={theme.header.text}>
              {contexto.esDeposito ? "Depósito: " : "Local: "}{contexto.nombre}
            </span>
          </button>
        )}
        {esAdmin && contextoSinSeleccionar && (
          <button
            onClick={() => router.push("/inicio")}
            className={`
              hidden sm:flex items-center gap-1.5
              text-[11px] px-2.5 py-1 rounded-lg
              border border-amber-500/40 transition cursor-pointer
              hover:border-amber-400/60
            `}
          >
            <Store size={13} className="text-amber-400" />
            <span className="text-amber-400">(sin seleccionar)</span>
          </button>
        )}

        {/* OPERADOR — siempre visible */}
        <div className="relative" ref={operadorRef}>
          {esCuentaPropia ? (
            /* Cuenta propia: pill verde fijo con nombre del usuario, sin selector */
            <div
              className={`
                flex items-center gap-1.5
                text-xs px-2.5 py-1 rounded-lg
                border
                ${theme.header.border}
              `}
              title={`Operando como ${nombre}`}
            >
              <UserCheck size={14} className="text-emerald-400" />
              <span className="text-emerald-400 font-medium">{nombre}</span>
            </div>
          ) : operador ? (
            /* Cuenta compartida + operador elegido: pill verde, click para cambiar */
            <button
              onClick={() => setShowOperadorSelector(!showOperadorSelector)}
              className={`
                flex items-center gap-1.5
                text-xs px-2.5 py-1 rounded-lg
                border transition cursor-pointer
                ${theme.header.border}
                hover:opacity-80
              `}
              title={`Operador: ${operador.nombre} — click para cambiar`}
            >
              <UserCheck size={14} className="text-emerald-400" />
              <span className="text-emerald-400 font-medium">{operador.nombre}</span>
            </button>
          ) : (
            /* Cuenta compartida + SIN operador: prominente, ámbar fuerte */
            <button
              onClick={() => setShowOperadorSelector(!showOperadorSelector)}
              className="
                flex items-center gap-1.5
                text-xs font-semibold px-3 py-1.5 rounded-lg
                border-2 border-amber-500 transition cursor-pointer
                hover:border-amber-400
                animate-pulse hover:animate-none
              "
              title="Identificate para operar"
            >
              <UserCheck size={15} className="text-amber-400" />
              <span className="text-amber-400">Sin operador</span>
            </button>
          )}

          {/* Dropdown selector — solo para cuentas compartidas */}
          {showOperadorSelector && !esCuentaPropia && (
            <div className="absolute right-0 mt-2 z-50">
              <OperadorSelector
                operador={operador}
                onLogin={async (id, pin) => {
                  const r = await loginOperador(id, pin);
                  if (r.ok) setShowOperadorSelector(false);
                  return r;
                }}
                onLogout={async () => {
                  await logoutOperador();
                  setShowOperadorSelector(false);
                }}
              />
            </div>
          )}
        </div>

        {/* USUARIO */}
        <div className="relative" ref={menuRef}>
          <div
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 cursor-pointer select-none"
          >
            <div
              className={`
                w-9 h-9 rounded-full flex items-center justify-center
                text-[13px] font-bold
                transition shadow-md
                ${theme.card}
              `}
            >
              {nombre[0]?.toUpperCase() || "?"}
            </div>

            <div className="hidden sm:flex flex-col leading-tight">
              <span className={`text-[13px] font-medium ${theme.header.text}`}>
                {nombre}
              </span>
              <span
                className={`
                  text-[11px] px-2 py-[1px]
                  rounded-md w-fit border
                  ${theme.header.border}
                  ${theme.header.text}
                `}
              >
                {rol}
              </span>
            </div>

            <ChevronDown
              size={18}
              className={`
                hidden sm:block
                ${theme.header.text} transition-transform
                ${open ? "rotate-180" : ""}
              `}
            />
          </div>

          {open && (
            <div
              className={`
                absolute right-0 mt-2 w-52
                rounded-md py-2 z-50
                shadow-xl border
                ${theme.card}
                ${theme.header.border}
              `}
            >
              <div className="px-4 py-1">
                <p className={`text-sm font-semibold ${theme.header.text}`}>
                  {nombre}
                </p>
                <p className="text-xs opacity-70">{rol}</p>
              </div>

              <div className={`border-t my-1 ${theme.header.border}`} />

              {esAdmin && (
                <button
                  onClick={() => { setOpen(false); router.push("/inicio"); }}
                  className={`
                    flex items-center gap-2 w-full text-left
                    px-4 py-2 text-[13px]
                    text-cyan-400 hover:bg-cyan-500/10
                    transition
                  `}
                >
                  <ArrowLeftRight size={16} />
                  Cambiar local
                </button>
              )}

              <button
                onClick={logout}
                className={`
                  flex items-center gap-2 w-full text-left
                  px-4 py-2 text-[13px]
                  text-red-400 hover:bg-red-500/10
                  transition
                `}
              >
                <LogOut size={16} />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
