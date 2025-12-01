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

export default function SunmiSelectAdv({
  value,
  onChange,
  children,
  placeholder = "Seleccionar...",
  className = "",
  multiple = false,
}) {
  const { theme } = useSunmiTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const optionList = Children.toArray(children).filter((c) =>
    isValidElement(c)
  );

  const isSelected = (v) => {
    if (!multiple) return v == value;
    return Array.isArray(value) && value.includes(v);
  };

  const currentText = (() => {
    if (multiple) {
      if (!Array.isArray(value) || value.length === 0) return placeholder;
      if (value.length <= 2) return value.join(", ");
      return `${value.length} seleccionados`;
    }

    const f = optionList.find((c) => c.props.value == value);
    return f ? f.props.children : placeholder;
  })();

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

  // Extraer colores del theme
  const bgColor = theme.card.split(' ').find(c => c.startsWith('bg-')) || 'bg-slate-950/60';
  const borderColor = theme.card.split(' ').find(c => c.startsWith('border-')) || 'border-slate-700';
  const textColor = theme.layout.split(' ').find(c => c.startsWith('text-')) || 'text-slate-100';
  const dropdownBg = theme.card.split(' ').find(c => c.startsWith('bg-'))?.replace('/70', '').replace('/60', '') || 'bg-slate-900';

  return (
    <div ref={ref} className={`relative w-full ${className}`}>
      {/* BOTON */}
      <button
        onClick={() => setOpen(!open)}
        className={`
          w-full px-3 py-1.5     /* reducido */
          rounded-md
          ${bgColor}
          border ${borderColor}
          ${textColor} text-[13px]
          shadow-inner
          flex items-center justify-between
        `}
      >
        <span className="truncate">{currentText}</span>
        <ChevronDown
          size={16}
          className={`transition-transform ${
            open ? "rotate-180 text-amber-400" : "text-amber-300"
          }`}
        />
      </button>

      {/* LISTA */}
      {open && (
        <div
          className={`
            absolute left-0 right-0 mt-1 z-50
            ${dropdownBg}
            border ${borderColor}
            rounded-md
            shadow-lg
            max-h-52 overflow-y-auto
            text-[13px]
          `}
        >
          {optionList.map((child, idx) => {
            const val = child.props.value;
            const selected = isSelected(val);

            return (
              <div
                key={idx}
                onClick={() => handleClick(val)}
                className={`
                  px-3 py-2 cursor-pointer flex items-center gap-2
                  ${selected ? "bg-amber-500 text-slate-900" : textColor}
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
