"use client";

import SidebarPro from "@/components/sidebar/SidebarPro";
import Header from "@/components/Header";

export default function SidebarLeft({ children }) {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <SidebarPro />

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <Header />
        <main className="flex-1 min-h-0 p-4 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
