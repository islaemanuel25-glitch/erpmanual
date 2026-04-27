"use client";
import {
  useState,
  useRef,
  useEffect,
  Children,
  isValidElement,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, Search } from "lucide-react";

export default function SunmiSelectAdv({
  value,
  onChange,
  children,
  placeholder = "Seleccionar...",
  className = "",
  multiple = false,
  searchable = false,
  onClose,
  ...restProps
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const dropdownRef = useRef(null);
  const searchRef = useRef(null);

  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const optionList = Children.toArray(children).filter((c) => isValidElement(c));

  const filteredOptions = searchable && search
    ? optionList.filter((c) => {
        const text = typeof c.props.children === "string" ? c.props.children : "";
        return text.toLowerCase().includes(search.toLowerCase());
      })
    : optionList;

  const isSelected = (v) => {
    if (!multiple) return v == value;
    return Array.isArray(value) && value.includes(v);
  };

  const currentText = (() => {
    if (multiple) {
      if (!Array.isArray(value) || value.length === 0) return placeholder;
      const labels = value.map((v) => {
        const opt = optionList.find((c) => c.props.value == v);
        return opt ? opt.props.children : v;
      });
      if (labels.length <= 2) return labels.join(", ");
      return `${labels.length} seleccionados`;
    }
    const f = optionList.find((c) => c.props.value == value);
    return f ? f.props.children : placeholder;
  })();

  const handlePick = (val) => {
    if (!multiple) {
      onChange(val);
      setOpen(false);
      setSearch("");
      onClose?.();
      return;
    }

    let newArr = Array.isArray(value) ? [...value] : [];
    if (newArr.includes(val)) newArr = newArr.filter((v) => v !== val);
    else newArr.push(val);

    onChange(newArr);
  };

  const updatePos = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left, width: r.width });
  };

  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }
    updatePos();

    const onScroll = () => updatePos();
    const onResize = () => updatePos();

    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    // Autofocus search input
    if (searchable) {
      setTimeout(() => searchRef.current?.focus(), 0);
    }

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  // Click afuera (incluye el dropdown que está en body)
  useEffect(() => {
    if (!open) return;

    const onDown = (e) => {
      const w = wrapRef.current;
      const d = dropdownRef.current;

      if (w && w.contains(e.target)) return;
      if (d && d.contains(e.target)) return;

      setOpen(false);
    };

    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [open]);

  const dropdown = open ? (
    <div
      ref={dropdownRef}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        zIndex: 99999,
      }}
      className="sunmi-select-dropdown rounded-md shadow-lg text-[13px] flex flex-col"
    >
      {searchable && (
        <div className="p-1.5 border-b sunmi-divider">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded sunmi-select-trigger">
            <Search size={13} className="sunmi-text-muted shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full bg-transparent outline-none text-[12px]"
              style={{ color: "inherit" }}
            />
          </div>
        </div>
      )}

      <div className="max-h-52 overflow-y-auto">
        {filteredOptions.length === 0 ? (
          <div className="px-3 py-2 sunmi-text-muted text-[12px]">
            Sin resultados
          </div>
        ) : (
          filteredOptions.map((child, idx) => {
            const val = child.props.value;
            const selected = isSelected(val);

            return (
              <div
                key={idx}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handlePick(val);
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handlePick(val);
                }}
                className={`
                  px-3 py-2 cursor-pointer flex items-center gap-2 transition-all
                  ${selected ? "sunmi-select-item-active" : "sunmi-select-item"}
                `}
              >
                {multiple && (
                  <Check size={16} className={selected ? "opacity-100" : "opacity-0"} />
                )}
                {child.props.children}
              </div>
            );
          })
        )}
      </div>
    </div>
  ) : null;

  return (
    <div ref={wrapRef} className={`w-full ${className}`} {...restProps}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="
          w-full px-3 py-1.5
          rounded-md
          sunmi-select-trigger
          text-[13px]
          flex items-center justify-between
        "
      >
        <span className="truncate">{currentText}</span>
        <ChevronDown
          size={16}
          className={`transition-transform sunmi-text-accent ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {typeof document !== "undefined" ? createPortal(dropdown, document.body) : null}
    </div>
  );
}

export function SunmiSelectOption({ value, children }) {
  return <div value={value}>{children}</div>;
}
