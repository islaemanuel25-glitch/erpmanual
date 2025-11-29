"use client";
import {
  useState,
  useRef,
  useEffect,
  Children,
  isValidElement,
} from "react";
import { ChevronDown, Check } from "lucide-react";

export default function SunmiSelectAdv({
  value,
  onChange,
  children,
  placeholder = "Seleccionar...",
  className = "",
  multiple = false, // 🔥 ahora soporta multiple
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
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // FILTRAR SOLO CHILDREN VÁLIDOS
  const optionList = Children.toArray(children).filter((c) =>
    isValidElement(c)
  );

  const isSelected = (v) => {
    if (!multiple) return v == value;
    return Array.isArray(value) && value.includes(v);
  };

  // TEXTO DEL BOTÓN
  const currentText = (() => {
    if (multiple) {
      if (!Array.isArray(value) || value.length === 0)
        return placeholder;

      if (value.length <= 2) {
        return value.join(", ");
      }

      return `${value.length} seleccionados`;
    }

    const f = optionList.find((c) => c.props.value == value);
    return f ? f.props.children : placeholder;
  })();

  // HANDLER CLICK
  const handleClick = (val) => {
    if (!multiple) {
      onChange(val);
      setOpen(false);
      return;
    }

    // MULTIPLE: gestionar arrays
    let newArr = Array.isArray(value) ? [...value] : [];

    if (newArr.includes(val)) {
      newArr = newArr.filter((v) => v !== val);
    } else {
      newArr.push(val);
    }

    onChange(newArr);
  };

  return (
    <div ref={ref} className={`relative w-full ${className}`}>
      {/* BOTÓN PRINCIPAL */}
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
          {optionList.map((child, idx) => {
            const val = child.props.value;
            const selected = isSelected(val);

            return (
              <div
                key={idx}
                onClick={() => handleClick(val)}
                className={`
                  px-4 py-2 text-sm cursor-pointer flex items-center gap-2
                  ${selected ? "bg-amber-500 text-slate-900" : "text-slate-200"}
                  hover:bg-amber-400 hover:text-slate-900
                  transition-all
                `}
              >
                {multiple && (
                  <Check
                    size={16}
                    className={selected ? "opacity-100" : "opacity-0"}
                  />
                )}
                {child.props.children}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SunmiSelectOption({ value, children }) {
  return <div value={value}>{children}</div>;
}
