"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { useSidebarConfig } from "@/components/providers/SidebarConfigProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import sidebarGroups from "./sidebarGroups";
import sidebarItems from "./sidebarItems";
import SidebarGroupTop from "./SidebarGroupTop";
import SidebarItemFlat from "./SidebarItemFlat";
import { useUser } from "@/app/context/UserContext";
import { ChevronDown } from "lucide-react";

export default function SidebarTop() {
  const pathname = usePathname();
  const { sidebarGroup, sidebarMode } = useSidebarConfig();
  const { ui } = useUIConfig();
  const { perfil } = useUser();

  const showText = sidebarMode === "icons-text";
  const grouped = sidebarGroup === "grouped";

  // Estado para controlar el dropdown de cada grupo
  const [openGroup, setOpenGroup] = useState(null);

  const esAdmin = Array.isArray(perfil?.permisos) && perfil.permisos.includes("*");
  const puede = (perm) => (esAdmin ? true : perm && perfil.permisos.includes(perm));
  const filtrarVisibles = (items) => esAdmin ? items : items.filter((i) => puede(i.permiso));

  // ---- MODO AGRUPADO ----
  if (grouped) {
    return (
      <nav
        className="flex items-center overflow-x-auto no-scrollbar"
        style={{
          gap: ui.helpers.spacing("lg"),
          height: ui.helpers.controlHeight(),
          paddingLeft: ui.helpers.spacing("md"),
          paddingRight: ui.helpers.spacing("md"),
        }}
      >
        {sidebarGroups.map((group) => {
          const visibles = filtrarVisibles(group.items);
          if (visibles.length === 0) return null;
          return (
            <SidebarGroupTop
              key={group.id}
              id={group.id}
              icon={group.icon}
              iconFilled={group.iconFilled}
              label={group.label}
              items={visibles}
              perfil={perfil}
              openGroup={openGroup}
              setOpenGroup={setOpenGroup}
            />
          );
        })}
      </nav>
    );
  }

  // ---- MODO PLANO ----
  return (
    <nav
      className="flex items-center overflow-x-auto no-scrollbar"
      style={{
        gap: ui.helpers.spacing("md"),
        height: ui.helpers.controlHeight(),
        paddingLeft: ui.helpers.spacing("md"),
        paddingRight: ui.helpers.spacing("md"),
      }}
    >
      {filtrarVisibles(sidebarItems).map((item) => (
        <SidebarItemFlat key={item.href} item={item} isHorizontal={true} />
      ))}
    </nav>
  );
}
