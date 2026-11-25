"use client";

// UN RENGLÓN QUE NO SE PUEDE DIBUJAR NO SE LLEVA LA PANTALLA ENTERA.
//
// ── EL CASO (Emanuel, 2026-11-25, producción en c70d8813) ─────────────────
//
// Listas → Arcor, lista del 25/11 15:31 (177 listos para aplicar). Al tocar
// uno de los botones de la tarjeta la página entera cayó con "Application
// error: a client-side exception has occurred": un renglón que la tarjeta no
// supo dibujar tiró el árbol completo, y con él las otras 296 tarjetas que se
// podían usar.
//
// React no tiene otra forma de atajar un error de render que un componente de
// clase con `getDerivedStateFromError`. Envuelve UNA tarjeta: si esa falla,
// en su lugar queda un aviso que dice cuál era y qué pasó, y el resto de la
// lista sigue andando. El mensaje del error va escrito, porque es lo único
// que permite saber qué dato lo rompió sin ir al servidor a buscarlo.
//
// No arregla el renglón: lo deja a la vista. Lo que corresponde después es
// encontrar el dato y hacer que la tarjeta lo sepa dibujar.

import { Component } from "react";

import SunmiAviso from "@/components/sunmi/SunmiAviso";

/** Lo que dice el aviso en lugar de la tarjeta. */
export function textoDelRenglonQueNoSeDibuja(nombre) {
  const cual = nombre ? `«${nombre}»` : "Este renglón";
  return `${cual} no se pudo mostrar. El resto de la lista sigue andando: avisá con el texto de abajo.`;
}

export default class LimiteDelRenglon extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    // A la consola también: en el celular no se ve, pero en la computadora sí.
    console.error(`No se pudo dibujar ${this.props.nombre ?? "un renglón"}:`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <SunmiAviso tono="warning" titulo={textoDelRenglonQueNoSeDibuja(this.props.nombre)}>
        <span className="break-words">{String(this.state.error?.message ?? this.state.error)}</span>
      </SunmiAviso>
    );
  }
}
