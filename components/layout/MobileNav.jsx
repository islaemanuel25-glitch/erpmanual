"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, X } from "lucide-react";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";

// Cantidad máxima de accesos en la BottomNav antes del botón "Más"
const MAX_BOTTOM = 4;

export default function MobileNav({ menu, drawerOpen, setDrawerOpen }) {
  const pathname = usePathname();
  const { theme } = useSunmiTheme();

  // Destino principal RBAC-safe: group.href solo si coincide con un ítem visible;
  // sino, primer ítem visible. Si no hay ítem visible, no renderiza el acceso.
  const items = (menu || [])
    .map((grupo) => {
      const visibles = grupo.items || [];
      const primer = visibles[0];
      if (!primer) return null;
      const principal = grupo.href && visibles.some((i) => i.href === grupo.href)
        ? grupo.href
        : primer.href;
      return {
        key: grupo.key,
        label: grupo.label,
        icon: grupo.icon,
        href: principal,
      };
    })
    .filter(Boolean);

  // Reservamos un slot para "Más" si hay más grupos que MAX_BOTTOM
  const hayMas = items.length > MAX_BOTTOM;
  const visibles = hayMas ? items.slice(0, MAX_BOTTOM - 1) : items.slice(0, MAX_BOTTOM);

  const navBtn = (activo) => `
    flex flex-col items-center justify-center min-h-[44px] min-w-[44px] flex-1
    text-[11px] font-medium rounded-lg transition
    ${activo ? theme.sidebar.iconActive + " " + theme.sidebar.hover : theme.sidebar.icon}
  `;

  return (
    <>
      {/* BottomNav: solo mobile */}
      <nav
        className={`
          md:hidden fixed bottom-0 left-0 right-0 z-40
          flex items-stretch justify-around
          min-h-[56px] pb-2
          border-t
          ${theme.sidebar.bg}
          ${theme.sidebar.border}
        `}
      >
        {visibles.map((item) => {
          const activo = pathname.startsWith(item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              className={navBtn(activo)}
              aria-current={activo ? "page" : undefined}
            >
              <item.icon size={22} aria-hidden />
              <span className="mt-0.5">{item.label}</span>
            </Link>
          );
        })}

        {hayMas && (
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className={navBtn(false)}
            aria-label="Más opciones"
          >
            <MoreHorizontal size={22} aria-hidden />
            <span className="mt-0.5">Más</span>
          </button>
        )}
      </nav>

      {/* Drawer overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 md:hidden"
          aria-hidden
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Drawer panel: abre desde la izquierda, se cierra al navegar */}
      <aside
        className={`
          md:hidden fixed top-0 left-0 bottom-0 w-[min(100vw-3rem,280px)] z-50
          flex flex-col
          border-r shadow-xl
          transform transition-transform duration-200 ease-out
          ${theme.sidebar.bg}
          ${theme.sidebar.border}
          ${drawerOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"}
        `}
        role="dialog"
        aria-label="Menú de módulos"
        aria-hidden={!drawerOpen}
      >
        <div className={`flex items-center justify-between min-h-[44px] px-4 border-b ${theme.sidebar.border}`}>
          <h2 className={`text-base font-semibold ${theme.sidebar.icon}`}>Más</h2>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className={`p-2 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center ${theme.sidebar.icon} ${theme.sidebar.hover}`}
            aria-label="Cerrar menú"
          >
            <X size={24} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {menu && menu.length > 0 ? (
            <ul className="flex flex-col gap-4 px-3">
              {menu.map((grupo) => (
                <li key={grupo.key}>
                  <h3 className={`text-xs font-bold uppercase px-2 py-1 ${theme.sidebar.icon}`}>
                    {grupo.label}
                  </h3>
                  <ul className="flex flex-col gap-0.5">
                    {grupo.items.map((item) => {
                      const activo = pathname === item.href || pathname.startsWith(item.href + "/");
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setDrawerOpen(false)}
                            className={`
                              flex items-center min-h-[44px] px-3 py-2 rounded-lg
                              text-[14px] font-medium transition
                              ${activo ? theme.sidebar.iconActive + " " + theme.sidebar.hover : theme.sidebar.icon + " " + theme.sidebar.hover}
                            `}
                            aria-current={activo ? "page" : undefined}
                          >
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </aside>
    </>
  );
}
