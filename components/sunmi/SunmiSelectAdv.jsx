"use client";
import { useState, useRef, useEffect, Children, isValidElement } from "react";
import { ChevronDown } from "lucide-react";

export default function SunmiSelectAdv({
  value,
  onChange,
  children,
  placeholder = "Seleccionar...",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // cerrar cuando clickea afuera
  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // -------------------------------------------
  // FILTRAR SOLO CHILDREN VÁLIDOS <option>
  // -------------------------------------------
  const optionList = Children.toArray(children).filter((c) =>
    isValidElement(c)
  );

  // obtener texto actual
  const currentText = (() => {
    const found = optionList.find((c) => c.props?.value == value);
    return found ? found.props.children : placeholder;
  })();

  return (
    <div ref={ref} className={`relative w-full ${className}`}>
      {/* CONTENEDOR VISUAL */}
      <button
        onClick={() => setOpen(!open)}
        className="
          w-full px-4 py-2 rounded-xl
          bg-slate-950/60
          border border-slate-700
          text-slate-100 text-sm
          shadow-inner flex items-center justify-between
          focus:ring-2 focus:ring-amber-400
          transition-all
        "
      >
        <span>{currentText}</span>
        <ChevronDown
          size={16}
          className={`transition-transform ${
            open ? "rotate-180 text-amber-400" : "text-amber-300"
          }`}
        />
      </button>

      {/* LISTA FLOTANTE */}
      {open && (
        <div
          className="
            absolute left-0 right-0 mt-2 z-50
            bg-slate-900 border border-slate-700 rounded-xl
            shadow-[0_0_12px_rgba(0,0,0,0.45)]
            animate-fadeIn
            max-h-52 overflow-y-auto
          "
        >
          {optionList.map((child, idx) => (
            <div
              key={idx}
              onClick={() => {
                onChange({ target: { value: child.props.value } });
                setOpen(false);
              }}
              className="
                px-4 py-2 text-sm cursor-pointer
                text-slate-200
                hover:bg-amber-500 hover:text-slate-900
                transition-all
              "
            >
              {child.props.children}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
