"use client";
import {
  useState,
  useRef,
  useEffect,
  Children,
  isValidElement,
} from "react";
import { componerClaseInput } from "@/lib/sunmi/claseAncho";
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

  // Al buscar se sacan los ENCABEZADOS: un título de grupo sobre una lista ya
  // filtrada no agrupa nada, y puede quedar un título con cero opciones abajo,
  // que se lee como si el grupo estuviera vacío.
  const filteredOptions = searchable && search
    ? optionList.filter((c) => {
        if (c.props.encabezado) return false;
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
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
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

            // TÍTULO DE GRUPO: no se elige y no se toca. Sin el `return` de
            // acá, un encabezado con `value` vacío sería seleccionable y
            // borraría el producto ya elegido de un toque.
            if (child.props.encabezado) {
              return (
                <div
                  key={idx}
                  className="px-3 pt-3 pb-1 text-xs2 font-bold uppercase tracking-wide sunmi-text-muted"
                >
                  {child.props.children}
                </div>
              );
            }

            return (
              <div
                key={idx}
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
    // EL ANCHO SE NEGOCIA, NO SE CONCATENA.
    //
    // Antes era `w-full ${className}` y quedaban los dos anchos en el atributo.
    // Dos clases de la misma familia tienen la misma especificidad, así que
    // decide el orden de la hoja de estilos — y decidía a favor de `w-full`.
    //
    // ── MEDIDO: TRES DECLARACIONES PERDÍAN Y TRES GANABAN A LA FUERZA ────────
    //
    // De los 39 consumidores que pasan `className`, solo 6 declaran un ancho.
    // Tres —`w-[85px]` y dos `w-[140px]` en `TablaSugeridos`— daban 600 px, o
    // sea el ancho del contenedor: nunca se aplicaron. Las otras tres usaban
    // `!w-44`, que gana por `!important` — un parche que con esto deja de hacer
    // falta y se saca en el mismo commit.
    //
    // Los 33 restantes declaran otra cosa —una variante que apunta al hijo, o un
    // `min-w-`, que es otra propiedad— y no pelean con nada.
    //
    // Se reusa `componerClaseInput`, que es la misma pieza que usa `SunmiInput`
    // y ya resolvía esto. No se escribe una función parecida al lado.
    <div ref={wrapRef} className={componerClaseInput(className)} {...restProps}>
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
        {/*
          `min-w-0` NO ES DECORACIÓN: sin él, `truncate` NO TRUNCA.

          Un item de flex arranca con `min-width: auto`, así que se niega a
          encogerse por debajo del ancho de su contenido. `truncate` pone
          `overflow: hidden`, `text-overflow: ellipsis` y `white-space: nowrap`,
          pero si el span nunca se encoge no hay nada que recortar: el texto
          EMPUJA y se sale de la caja en vez de cortarse con puntos suspensivos.

          ── HOY NO SE ACTIVA, Y POR ESO HAY QUE ARREGLARLO AHORA ──────────────

          Medido: a 140 px el espacio real para el texto son 101, y la opción más
          larga que existe en la base —"Medicamento"— necesita 84. Entra con 17
          de sobra. A 85 px quedan 46 y lo más largo son 24.

          O sea que el defecto está y no se ve. El día que alguien agregue una
          categoría más larga, el texto se va a desbordar y nadie va a entender
          por qué, porque la clase que debería impedirlo está puesta.
        */}
        <span className="truncate min-w-0">{currentText}</span>
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

/**
 * Una opción del desplegable.
 *
 * `encabezado` la convierte en un TÍTULO DE GRUPO: no se puede elegir y no se
 * puede tocar. Se agregó al kit —y no a la pantalla que lo necesitaba— porque
 * agrupar opciones es una necesidad del desplegable, no de un módulo: el día que
 * otra pantalla quiera separar "sugeridos" de "todos", ya está.
 *
 * Los encabezados desaparecen al escribir en el buscador. Un título de grupo
 * sobre una lista ya filtrada no agrupa nada, y peor: puede quedar un título con
 * cero opciones abajo, que se lee como si el grupo estuviera vacío.
 */
export function SunmiSelectOption({ value, children, encabezado = false }) {
  return <div value={value} data-encabezado={encabezado ? "" : undefined}>{children}</div>;
}
