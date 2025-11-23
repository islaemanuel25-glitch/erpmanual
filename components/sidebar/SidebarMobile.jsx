"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import Link from "next/link";

export default function SidebarMobile({ menu, perfil }) {
  const [open, setOpen] = useState(false);

  const esAdmin =
    Array.isArray(perfil?.permisos) && perfil.permisos.includes("*");

  return (
    <>
      {/* BOTÓN HAMBURGUESA */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden p-2 bg-blue-700 text-white fixed top-3 left-3 rounded-lg z-50"
      >
        <Menu size={22} />
      </button>

      {/* OVERLAY */}
      {open && (
        <div
          className="sidebar-mobile-overlay open"
          onClick={() => setOpen(false)}
        />
      )}

      {/* PANEL MOBILE */}
      <aside className={`sidebar-mobile-panel ${open ? "open" : ""}`}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Menú</h2>
          <button onClick={() => setOpen(false)}>
            <X size={24} className="text-white" />
          </button>
        </div>

        {/* LISTA */}
        <nav className="flex flex-col gap-4">
          {menu.map((grupo) => (
            <div key={grupo.label}>
              <h3 className="text-xs font-bold uppercase text-blue-200 mb-1">
                {grupo.label}
              </h3>

              {grupo.items.map((item) => (
                <Link
                  href={item.href}
                  key={item.href}
                  className="block py-2 pl-2 text-white hover:bg-blue-600 rounded"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
