"use client";

import AppLauncher from "@/components/layout/AppLauncher";
import InicioGreeting from "@/components/layout/InicioGreeting";
import ProveedoresDeHoyAlert from "@/components/inicio/ProveedoresDeHoyAlert";

export default function InicioPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] px-4 py-7 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <InicioGreeting />
        <ProveedoresDeHoyAlert />
        <div className="bg-[color:var(--card-bg)] border border-[color:var(--card-border)] rounded-2xl p-7 sm:p-9">
          <AppLauncher hideTitle />
        </div>
      </div>
    </div>
  );
}
