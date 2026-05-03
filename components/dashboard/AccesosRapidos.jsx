"use client";

// ============================================================
// components/dashboard/AccesosRapidos.jsx
//
// Accesos rápidos del dashboard. Consume EXCLUSIVAMENTE el menú
// visible que ya pasó por buildVisibleMenu(MENU_CONFIG, perfil),
// vía `useMenu`. Así nunca aparecen accesos a módulos sin permiso.
//
// Reglas (Etapa 5A):
//   - Sin lista paralela hardcodeada.
//   - Sin colores Tailwind hardcodeados: solo tokens Sunmi
//     (`--module-${color}`, `--card-bg`, `--card-border`,
//     `--app-fg`, `--hover-bg`).
//   - Si un grupo no tiene items visibles, no aparece (lo
//     garantiza buildVisibleMenu).
//   - Se prefiere `group.href` cuando coincide con algún item
//     visible (evita linkear a una ruta sin permiso); si no,
//     se usa el primer item visible del grupo.
//   - Máximo 8 accesos.
//   - Empty state si no hay accesos.
// ============================================================

import Link from "next/link";
import { useMenu } from "@/hooks/useMenu";

const MAX_ACCESOS = 8;

/**
 * Determina la ruta destino para un grupo del menú visible.
 * Devuelve null si no hay ningún item visible al que apuntar.
 *
 * @param {{ href?: string, items?: Array<{ href?: string }> }} group
 * @returns {string|null}
 */
function resolveHref(group) {
  const items = Array.isArray(group?.items) ? group.items : [];
  if (group?.href && items.some((it) => it.href === group.href)) {
    return group.href;
  }
  return items[0]?.href ?? null;
}

export default function AccesosRapidos({ variant = "mobile" }) {
  const { menu } = useMenu();
  const isDesktop = variant === "desktop";

  const accesos = (Array.isArray(menu) ? menu : [])
    .map((group) => {
      const href = resolveHref(group);
      if (!href) return null;
      return {
        key: group.key,
        label: group.label,
        href,
        Icon: group.icon,
        color: group.color || "gray",
      };
    })
    .filter(Boolean)
    .slice(0, MAX_ACCESOS);

  if (accesos.length === 0) {
    return (
      <div
        className="
          rounded-xl p-4 text-center text-[13px]
          bg-[color:var(--card-bg)]
          border border-[color:var(--card-border)]
          text-[color:var(--app-fg)] opacity-70
        "
      >
        Sin accesos rápidos disponibles.
      </div>
    );
  }

  const gridClass = isDesktop
    ? "grid grid-cols-3 gap-2.5 w-full"
    : "grid grid-cols-2 gap-2.5 w-full";

  const tileClass = `
    rounded-xl
    bg-[color:var(--card-bg)]
    border border-[color:var(--card-border)]
    text-[color:var(--app-fg)]
    flex flex-col items-center justify-center
    p-3.5 ${isDesktop ? "min-h-[84px]" : "min-h-[80px]"} gap-2
    transition-colors duration-200
    hover:bg-[color:var(--hover-bg)]
    shadow-sm
  `;

  const circleClass = isDesktop
    ? "w-11 h-11 rounded-full flex items-center justify-center shrink-0"
    : "w-10 h-10 rounded-full flex items-center justify-center shrink-0";

  const iconSize = isDesktop ? 22 : 20;

  return (
    <div className={gridClass}>
      {accesos.map((item) => {
        const Icon = item.Icon;
        const circleStyle = {
          background: `rgb(var(--module-${item.color}) / 0.18)`,
          color: `rgb(var(--module-${item.color}))`,
        };
        return (
          <Link
            key={item.key || item.href}
            href={item.href}
            className={tileClass}
          >
            <div className={circleClass} style={circleStyle}>
              {Icon && <Icon size={iconSize} strokeWidth={1.75} />}
            </div>
            <span className="text-[13px] font-medium text-center leading-tight opacity-95">
              {item.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
