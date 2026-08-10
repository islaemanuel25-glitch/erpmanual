"use client";

import { forwardRef } from "react";

import { componerClaseInput } from "@/lib/sunmi/claseAncho";

// `w-full` deja de ir siempre: lo pone `componerClaseInput` solo cuando quien
// usa el componente no declaró un ancho propio. Antes iban los dos y ganaba
// `w-full` por orden de la hoja de estilos, así que el ancho pedido no se
// aplicaba nunca. El porqué completo está en el módulo.
const BASE = "sunmi-input disabled:opacity-60 disabled:cursor-not-allowed";

const SunmiInput = forwardRef(function SunmiInput({ className = "", ...props }, ref) {
  return <input ref={ref} {...props} className={componerClaseInput(className, BASE)} />;
});

export default SunmiInput;
