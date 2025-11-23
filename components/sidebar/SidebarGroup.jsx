"use client";

import Link from "next/link";
import SidebarIcon from "./SidebarIcon";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export default function SidebarGroup({
  id,
  icon,
  iconFilled,
  label,
  items,
  perfil,
  openGroup,
  setOpenGroup,
}) {
  const pathname = usePathname();
  const panelRef = useRef(null);

  const permisos = perfil?.permisos || [];

  // ✅ ADMIN VE TODO
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  // ✅ Manejo real de permisos
  const puede = (perm) => {
    if (esAdmin) return true;       // ✅ AGREGADO
    if (!Array.isArray(permisos)) return false;
    if (!perm) return false;        // ✅ si item no tiene permiso, no mostrar
    return permisos.includes(perm);
  };

  // ✅ Filtrar items visibles
  const visibles = esAdmin
    ? items // ✅ Admin ve todos
    : items.filter((i) => puede(i.permiso));

  if (visibles.length === 0) return null;

  const activo = visibles.some((i) => pathname.startsWith(i.href));
  const abierto = openGroup === id;

  // ✅ cierre automático si clic fuera
  useEffect(() => {
    if (!abierto) return;

    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpenGroup(null);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [abierto, setOpenGroup]);

  return (
    <div className="relative flex flex-col items-center">
      {/* Botón principal */}
      <button
        onClick={() => setOpenGroup(abierto ? null : id)}
        className="sidebar-button flex items-center justify-center"
      >
        <SidebarIcon
          Icon={icon}
          IconFilled={iconFilled}
          active={abierto || activo}
        />
      </button>

      {/* Panel */}
      {abierto && (
        <div ref={panelRef} className="sidebar-panel absolute left-14 top-0 z-50">
          <h3 className="sidebar-panel-title">{label}</h3>

          {visibles.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="sidebar-item block"
              onClick={() => setOpenGroup(null)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
