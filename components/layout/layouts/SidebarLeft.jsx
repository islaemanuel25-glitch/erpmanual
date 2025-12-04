"use client";

import SidebarPro from "@/components/sidebar/SidebarPro";
import Header from "@/components/Header";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SidebarLeft({ children }) {
  const { ui } = useUIConfig();

  return (
    <div
      className="flex"
      style={{
        minHeight: "100vh",
      }}
    >
      <SidebarPro />

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <Header />

        <main
          className="flex-1 min-h-0 overflow-auto"
          style={{
            padding: ui.spacingScale[ui.spacing],
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
