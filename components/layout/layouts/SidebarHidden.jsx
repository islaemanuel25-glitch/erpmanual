"use client";

import Header from "@/components/Header";

export default function SidebarHidden({ children }) {
  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <Header />

      <main className="flex-1 p-4 overflow-auto">
        {children}
      </main>
    </div>
  );
}
