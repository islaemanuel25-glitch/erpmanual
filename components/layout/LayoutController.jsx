"use client";

import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import SidebarLeft from "./layouts/SidebarLeft";
import SidebarTop from "./layouts/SidebarTop";
import SidebarHidden from "./layouts/SidebarHidden";

export default function LayoutController({ children }) {
  const { layoutMode } = useSunmiTheme();

  if (layoutMode === "sidebar-top") return <SidebarTop>{children}</SidebarTop>;
  if (layoutMode === "sidebar-hidden") return <SidebarHidden>{children}</SidebarHidden>;

  return <SidebarLeft>{children}</SidebarLeft>;
}
