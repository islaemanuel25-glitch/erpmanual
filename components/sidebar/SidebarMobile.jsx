"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";

export default function SidebarMobile({ menu, perfil }) {
  const [open, setOpen] = useState(false);
  const { theme } = useSunmiTheme();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="
          md:hidden p-2 rounded-lg
          bg-yellow-400 text-slate-900
          shadow-lg shadow-black/40
          fixed top-3 left-3 z-50
        "
      >
        <Menu size={22} />
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-full w-64 
          ${theme.sidebar.bg}
          ${theme.sidebar.border}
          shadow-xl shadow-black/60
          p-4 transform z-50
          transition-transform duration-300
          ${open ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="flex justify-between items-center mb-4 text-slate-100">
          <h2 className="text-lg font-bold">Menú</h2>
          <button onClick={() => setOpen(false)}>
            <X size={24} className="text-slate-100" />
          </button>
        </div>

        <nav className="flex flex-col gap-6">
          {menu.map((grupo) => (
            <div key={grupo.label}>
              <h3 className="text-xs font-bold uppercase text-slate-300">
                {grupo.label}
              </h3>

              {grupo.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="
                    block py-2 pl-2 
                    text-slate-100 font-medium
                    hover:bg-slate-900/40 
                    rounded-md
                    transition
                  "
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
