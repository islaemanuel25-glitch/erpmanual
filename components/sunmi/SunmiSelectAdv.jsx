"use client";

import {
  useState,
  useRef,
  useEffect,
  Children,
  isValidElement,
} from "react";
import { ChevronDown, Check } from "lucide-react";
import { useSunmiTheme } from "./SunmiThemeProvider";
import { cn } from "@/lib/utils";

export default function SunmiSelectAdv({
  value,
  onChange,
  children,
  placeholder = "Seleccionar...",
  className = "",
  multiple = false,
}) {
  const { theme } = useSunmiTheme();
  const t = theme.select;

  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Cerrar al hacer click afuera
  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Opciones válidas
  const optionList = Children.toArray(children).filter((c) =>
    isValidElement(c)
  );

  // Selección
  const isSelected = (v) => {
    if (!multiple) return v == value;
    return Array.isArray(value) && value.includes(v);
  };

  // Texto actual
  const currentText = (() => {
    if (multiple) {
      if (!Array.isArray(value) || value.length === 0) return placeholder;
      if (value.length <= 2) return value.join(", ");
      return `${value.length} seleccionados`;
    }
    const f = optionList.find((c) => c.props.value == value);
    return f ? f.props.children : placeholder;
  })();

  // Click en una opción
  const handleClick = (val) => {
    if (!multiple) {
      onChange(val);
      setOpen(false);
      return;
    }

    let newArr = Array.isArray(value) ? [...value] : [];
    if (newArr.includes(val)) newArr = newArr.filter((v) => v !== val);
    else newArr.push(val);

    onChange(newArr);
  };

  return (
    <div ref={ref} className={cn("relative w-full", className)}>
      {/* BOTÓN / SELECT */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          `
          w-full px-3 py-1.5
          rounded-md text-[13px]
          flex items-center justify-between
          shadow-inner transition-all
          ${t.bg} ${t.border} ${t.text}
        `
        )}
      >
        <span className="truncate">{currentText}</span>
        <ChevronDown
          size={16}
          className={cn(
            `
            transition-transform
            ${t.icon}
          `,
            open && "rotate-180"
          )}
        />
      </button>

      {/* LISTA DROPDOWN */}
      {open && (
        <div
          className={cn(
            `
            absolute left-0 right-0 mt-1 z-50
            rounded-md border shadow-lg
            max-h-52 overflow-y-auto
            text-[13px]
            ${t.dropdownBg} ${t.border}
          `
          )}
        >
          {optionList.map((child, idx) => {
            const val = child.props.value;
            const selected = isSelected(val);

            return (
              <div
                key={idx}
                onClick={() => handleClick(val)}
                className={cn(
                  `
                  px-3 py-2 cursor-pointer flex items-center gap-2 transition-all
                `,
                  selected
                    ? t.selected
                    : t.text,
                  t.dropdownItemHover
                )}
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
