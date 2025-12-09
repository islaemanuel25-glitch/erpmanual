"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SidebarMobile({ menu, perfil }) {
  const { ui } = useUIConfig();
  const [open, setOpen] = useState(false);
  const { theme } = useSunmiTheme();

  return (
    <>
      {/* BOTÓN */}
      <button
        onClick={() => setOpen(true)}
        className={`md:hidden ${theme.sidebar.bg} text-slate-900 shadow-lg shadow-black/40 fixed z-50`}
        style={{
          padding: ui.helpers.spacing("sm"),
          borderRadius: ui.helpers.radius("lg"),
          top: ui.helpers.spacing("md"),
          left: ui.helpers.spacing("md"),
        }}
      >
        <Menu size={parseInt(ui.helpers.icon(1.375))} />
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* PANEL */}
      <aside
        className={`fixed top-0 left-0 h-full ${theme.sidebar.bg} ${theme.sidebar.border} border-r shadow-xl shadow-black/60 transform z-50 transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full"}`}
        style={{
          width: parseInt(ui.helpers.controlHeight()) * 8,
          padding: ui.helpers.spacing("lg"),
        }}
      >
        <div
          className="flex justify-between items-center text-slate-900"
          style={{
            marginBottom: ui.helpers.spacing("lg"),
          }}
        >
          <h2
            className="font-bold"
            style={{
              fontSize: ui.helpers.font("lg"),
            }}
          >
            Menú
          </h2>
          <button onClick={() => setOpen(false)}>
            <X size={parseInt(ui.helpers.icon(1.5))} className="text-slate-900" />
          </button>
        </div>

        <nav
          className="flex flex-col"
          style={{
            gap: parseInt(ui.helpers.spacing("lg")) * 1.5,
          }}
        >
          {menu.map((grupo) => (
            <div key={grupo.label}>
              <h3
                className="font-bold uppercase text-slate-800"
                style={{
                  fontSize: ui.helpers.font("xs"),
                  marginBottom: ui.helpers.spacing("sm"),
                }}
              >
                {grupo.label}
              </h3>

              {grupo.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block font-medium transition text-slate-900 ${theme.sidebar.hover}`}
                  style={{
                    paddingTop: ui.helpers.spacing("sm"),
                    paddingBottom: ui.helpers.spacing("sm"),
                    paddingLeft: ui.helpers.spacing("sm"),
                    borderRadius: ui.helpers.radius("md"),
                  }}
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
