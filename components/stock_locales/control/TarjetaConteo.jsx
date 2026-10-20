"use client";

// components/stock_locales/control/TarjetaConteo.jsx
//
// LA TARJETA DEL CONTROL DE STOCK: la de Stock Locales, con el campo "Contado"
// donde Stock tiene Ajustar y Límites.
//
// No es una tarjeta nueva. Es `TarjetaStockMovil`, la MISMA que dibuja Stock
// —nombre, proveedor, código y "STOCK · <unidad>" con `presentacionCantidadStock`—,
// con su ranura de abajo ocupada por la fila del conteo.
//
// ── EL CAMPO ES EL TOTAL, Y SE GUARDA SOLO ──────────────────────────────────
//
// Lo que se escribe es el TOTAL contado de ese producto en el control y se
// guarda al salir del campo, al apretar Enter o al escanear el próximo producto.
// No hay botón. Si el guardado falla, el campo queda en peligro con "No se
// guardó" y lo escrito se queda: vuelve a intentar apenas se lo toca.
//
// ── EL LECTOR PUEDE ESCRIBIR ACÁ ADENTRO ────────────────────────────────────
//
// El foco queda en "Contado" después de escanear, así que el próximo escaneo lo
// teclea el lector EN este campo. Se reconoce con la misma regla que la caja
// (`esLecturaDeEscaner`: teclas muy seguidas y un Enter): lo tecleado en esa
// ráfaga se saca, se guarda lo que había antes, y el código va al buscador.

import { useEffect, useRef, useState } from "react";

import SunmiInput from "@/components/sunmi/SunmiInput";
import TarjetaStockMovil from "@/components/stock_locales/TarjetaStockMovil";
import { MS_MAX_ENTRE_TECLAS_ESCANER, esLecturaDeEscaner } from "@/lib/pos-ventas/lecturaEscaner";
import {
  MODO_CASILLEROS,
  casillerosDe,
  casillerosDesdeTotal,
  horaDelConteo,
  textoCantidad,
  totalDeCasilleros,
} from "@/lib/stock/control/controlStock";

/** Lo que dice la fila, según cómo está. */
export const ESTADO_FILA = Object.freeze({
  SIN_CONTAR: "sin_contar",
  ESCRIBIENDO: "escribiendo",
  CONTADO: "contado",
  ERROR: "error",
});

const CLASE_CAMPO = Object.freeze({
  [ESTADO_FILA.SIN_CONTAR]: "",
  [ESTADO_FILA.ESCRIBIENDO]: "sunmi-border-accent",
  [ESTADO_FILA.CONTADO]: "sunmi-state-success",
  [ESTADO_FILA.ERROR]: "sunmi-border-danger",
});

const igualesValores = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function TarjetaConteo({ item, esDeposito, onGuardar, onEscanear, onListo, autoFoco = 0 }) {
  const casilleros = casillerosDe(item, esDeposito);
  const total = item?.conteo?.total ?? null;
  const guardados = casillerosDesdeTotal(total, casilleros);

  const [valores, setValores] = useState(guardados);
  const [enFoco, setEnFoco] = useState(false);
  const [fallo, setFallo] = useState(false);
  const contenedor = useRef(null);
  const primero = useRef(null);
  const rafaga = useRef({ ultima: 0, texto: "", antes: guardados });

  // Lo que dice el servidor manda mientras no se está escribiendo: otro celular
  // pudo haber fijado otro total.
  useEffect(() => {
    if (!enFoco && !fallo) setValores(casillerosDesdeTotal(total, casilleros));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, item?.conteo?.en]);

  // Escanear o "Contar" desde terminar: la tarjeta aparece y el foco va al campo.
  useEffect(() => {
    if (!autoFoco || !primero.current) return;
    primero.current.scrollIntoView?.({ block: "center" });
    primero.current.focus();
  }, [autoFoco]);

  async function guardar(v = valores) {
    const r = totalDeCasilleros(v, casilleros);
    if (r.invalido) {
      setFallo(true);
      return;
    }
    const nuevo = r.vacio ? null : r.total;
    if (nuevo === total && !fallo) return;
    const ok = await onGuardar?.(item.id, nuevo);
    setFallo(!ok);
    // Guardado, el campo dice el total como lo guarda el servidor ("3,0" → "3").
    if (ok) setValores(casillerosDesdeTotal(nuevo, casilleros));
  }

  const alSalir = (e) => {
    // Pasar de "bultos" a "sueltas" no es salir de la fila.
    if (contenedor.current?.contains(e.relatedTarget)) return;
    setEnFoco(false);
    guardar();
  };

  const alEntrar = () => {
    setEnFoco(true);
    if (fallo) guardar();
  };

  const alTeclear = (e) => {
    const ahora = Date.now();
    const r = rafaga.current;
    const ms = ahora - r.ultima;
    r.ultima = ahora;
    if (e.key === "Enter") {
      e.preventDefault();
      if (esLecturaDeEscaner(ms, r.texto)) {
        // Fue el lector: lo tecleado en la ráfaga no es una cantidad.
        const codigo = r.texto;
        const antes = r.antes;
        r.texto = "";
        setValores(antes);
        guardar(antes);
        onEscanear?.(codigo);
        return;
      }
      r.texto = "";
      guardar();
      onListo?.();
      return;
    }
    if (e.key.length === 1) {
      if (ms > MS_MAX_ENTRE_TECLAS_ESCANER) {
        r.texto = "";
        r.antes = valores;
      }
      r.texto += e.key;
    }
  };

  const escrito = totalDeCasilleros(valores, casilleros);
  const sinGuardar = !igualesValores(valores, guardados);
  const estado = fallo
    ? ESTADO_FILA.ERROR
    : enFoco || sinGuardar
      ? ESTADO_FILA.ESCRIBIENDO
      : total != null
        ? ESTADO_FILA.CONTADO
        : ESTADO_FILA.SIN_CONTAR;

  const campo = (clave, etiqueta, unidad) => (
    <div className="flex items-center gap-1.5">
      <SunmiInput
        ref={clave === "valor" || clave === "bultos" ? primero : undefined}
        type="text"
        inputMode={clave === "valor" && casilleros.decimales ? "decimal" : "numeric"}
        aria-label={etiqueta}
        value={valores[clave] ?? ""}
        onChange={(e) => setValores((v) => ({ ...v, [clave]: e.target.value }))}
        onFocus={alEntrar}
        onBlur={alSalir}
        onKeyDown={alTeclear}
        className={`w-20 text-right tabular-nums ${CLASE_CAMPO[estado]}`}
      />
      <span className="text-sm2 sunmi-text-muted">{unidad}</span>
    </div>
  );

  const fila = (
    <div ref={contenedor} data-fila-conteo={estado} className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <ResumenDeLaFila
          estado={estado}
          conteo={item?.conteo}
          igualA={casilleros.modo === MODO_CASILLEROS.DESGLOSE && escrito.total != null ? textoCantidad(escrito.total, casilleros.unidadFisica) : null}
        />
      </div>
      {casilleros.modo === MODO_CASILLEROS.DESGLOSE ? (
        <div className="flex flex-col items-end gap-1.5">
          {campo("bultos", "Bultos contados", "bultos")}
          {campo("sueltas", "Sueltas contadas", "sueltas")}
        </div>
      ) : (
        campo("valor", "Contado", casilleros.unidad)
      )}
    </div>
  );

  return (
    <TarjetaStockMovil
      item={item}
      proveedorNombre={item?.proveedorNombre ?? null}
      localEsDeposito={esDeposito}
      filaDeAbajo={fila}
      resaltada={estado === ESTADO_FILA.ESCRIBIENDO}
      ancla={`conteo-${item.id}`}
    />
  );
}

/** El lado izquierdo de la fila: qué pasa con este producto. */
export function ResumenDeLaFila({ estado, conteo, igualA = null }) {
  if (estado === ESTADO_FILA.ERROR) return <p className="text-sm3 font-semibold sunmi-text-danger">No se guardó</p>;
  if (estado === ESTADO_FILA.ESCRIBIENDO) {
    return (
      <>
        <p className="text-sm3 font-semibold sunmi-text-accent">Contado</p>
        {igualA ? <p className="text-xs2 sunmi-text-muted tabular-nums">= {igualA}</p> : null}
      </>
    );
  }
  if (estado === ESTADO_FILA.CONTADO) {
    return (
      <>
        <p className="text-sm3 font-semibold sunmi-text-success">✓ Contado</p>
        <p className="text-xs2 sunmi-text-muted">{`${conteo?.contadoPor ?? ""} · ${horaDelConteo(conteo?.en)}`}</p>
      </>
    );
  }
  return <p className="text-sm3 sunmi-text-muted">Sin contar</p>;
}
