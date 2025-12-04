"use client";

import Header from "@/components/Header";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SidebarHidden({ children }) {
  const { ui } = useUIConfig();

  return (
    <div
      className="flex flex-col"
      style={{
        minHeight: "100vh",
      }}
    >
      <Header />

      <main
        className="flex-1 overflow-auto"
        style={{
          padding: ui.spacingScale[ui.spacing],
        }}
      >
        {children}
      </main>
    </div>
  );
}
