"use client";

// components/stock_locales/control/TarjetaConteo.jsx
//
// LA TARJETA DEL CONTROL DE STOCK: la de Stock Locales, con la fila del conteo
// donde Stock tiene Ajustar y Límites.
//
// No es una tarjeta nueva. Es `TarjetaStockMovil`, la MISMA que dibuja Stock
// —nombre, proveedor, código y "STOCK · <unidad>" con `presentacionCantidadStock`,
// el stock DEL SISTEMA—, con su ranura de abajo ocupada por:
//
//   · sin contar: "Está bien" —el stock del sistema es lo que hay— y al lado la
//     cantidad, con `SunmiCampoCantidad`, el − / + de la caja y de recibir
//     transferencias. Con el sistema en negativo no hay "Está bien": hay que
//     poner lo que hay;
//   · contado: "✓ Contado · quién · hh:mm" y "Sistema x · Contado y · Faltan n",
//     con la cantidad todavía editable.
//
// ── EL CAMPO ES EL TOTAL, Y SE GUARDA SOLO ──────────────────────────────────
//
// Lo que se escribe es el TOTAL contado de ese producto en el control. Se guarda
// al salir del campo, con Enter, al escanear el próximo producto y, después de
// tocar − o +, a los 1,5 s sin tocar más. No hay botón. Si el guardado falla,
// el campo queda en peligro con "No se guardó" y lo escrito se queda: vuelve a
// intentar apenas se lo toca.
//
// ── EL LECTOR PUEDE ESCRIBIR ACÁ ADENTRO ────────────────────────────────────
//
// El foco queda en la cantidad después de escanear, así que el próximo escaneo
// lo teclea el lector EN este campo. Se reconoce con la misma regla que la caja
// (`esLecturaDeEscaner`: teclas muy seguidas y un Enter): lo tecleado en esa
// ráfaga se saca, se guarda lo que había antes, y el código va al buscador.

import { useEffect, useRef, useState } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiCampoCantidad from "@/components/sunmi/SunmiCampoCantidad";
import TarjetaStockMovil from "@/components/stock_locales/TarjetaStockMovil";
import { MS_MAX_ENTRE_TECLAS_ESCANER, esLecturaDeEscaner } from "@/lib/pos-ventas/lecturaEscaner";
import {
  MODO_CASILLEROS,
  casillerosDe,
  casillerosDesdeTotal,
  horaDelConteo,
  textoCantidad,
  textoDeLaDiferencia,
  textoNumero,
  totalDeCasilleros,
} from "@/lib/stock/control/controlStock";

/** Lo que dice la fila, según cómo está. */
export const ESTADO_FILA = Object.freeze({
  SIN_CONTAR: "sin_contar",
  ESCRIBIENDO: "escribiendo",
  CONTADO: "contado",
  ERROR: "error",
});

/** Lo que espera la cantidad después del último − o + antes de guardarse. */
export const ESPERA_TRAS_BOTON_MS = 1500;

// La caja del número tiene que verse contra el fondo de la tarjeta aun vacía:
// el input del tema y la tarjeta son casi el mismo color en varios temas. Los
// estados del tema la tiñen; `border-0` del kit sigue mandando adentro del marco.
const CLASE_CAJA = Object.freeze({
  [ESTADO_FILA.SIN_CONTAR]: "sunmi-state-warning",
  [ESTADO_FILA.ESCRIBIENDO]: "sunmi-state-warning",
  [ESTADO_FILA.CONTADO]: "sunmi-state-success",
  [ESTADO_FILA.ERROR]: "sunmi-state-danger-soft",
});

/** El color de una diferencia: el mismo en la tarjeta y en el informe. */
export const CLASE_TONO = Object.freeze({
  danger: "sunmi-text-danger",
  warning: "sunmi-text-warning",
  success: "sunmi-text-success",
});

const igualesValores = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function TarjetaConteo({ item, esDeposito, proveedorNombre = null, onGuardar, onEscanear, onListo, autoFoco = 0 }) {
  const casilleros = casillerosDe(item, esDeposito);
  const desglose = casilleros.modo === MODO_CASILLEROS.DESGLOSE;
  const conteo = item?.conteo ?? null;
  const total = conteo?.total ?? null;
  const guardados = casillerosDesdeTotal(total, casilleros);

  const [valores, setValores] = useState(guardados);
  const [enFoco, setEnFoco] = useState(false);
  const [fallo, setFallo] = useState(false);
  const contenedor = useRef(null);
  const primero = useRef(null);
  const rafaga = useRef({ ultima: 0, texto: "", antes: guardados });
  const tocoBoton = useRef(false);
  const espera = useRef(null);

  // Lo que dice el servidor manda mientras no se está escribiendo: otro celular
  // pudo haber fijado otro total.
  useEffect(() => {
    if (!enFoco && !fallo) setValores(casillerosDesdeTotal(total, casilleros));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, conteo?.en]);

  // Escanear o "Contar" desde terminar: la tarjeta aparece y el foco va al campo.
  useEffect(() => {
    if (!autoFoco || !primero.current) return;
    primero.current.scrollIntoView?.({ block: "center" });
    primero.current.focus();
  }, [autoFoco]);

  useEffect(() => () => clearTimeout(espera.current), []);

  // Lo último que se mandó, para no mandarlo dos veces: Enter guarda y lleva el
  // foco al buscador, y el campo, al perderlo, volvía a guardar lo mismo con el
  // `total` viejo de antes de que contestara el servidor.
  const enviado = useRef(total);
  useEffect(() => {
    enviado.current = total;
  }, [total, conteo?.en]);

  async function guardar(v = valores) {
    clearTimeout(espera.current);
    const r = totalDeCasilleros(v, casilleros);
    if (r.invalido) {
      setFallo(true);
      return;
    }
    const nuevo = r.vacio ? null : r.total;
    if (nuevo === enviado.current && !fallo) return;
    const antes = enviado.current;
    enviado.current = nuevo;
    const ok = await onGuardar?.(item.id, { total: nuevo });
    if (!ok) enviado.current = antes;
    setFallo(!ok);
    // Guardado, el campo dice el total como lo guarda el servidor ("3,0" → "3").
    if (ok) setValores(casillerosDesdeTotal(nuevo, casilleros));
  }

  // ── "ESTÁ BIEN" Y "ACEPTAR" SON BOTONES DE LA FILA, Y ESO ERA EL ERROR ─────
  //
  // Con el foco en el campo, tocar un botón de la fila le saca el foco al campo
  // pero `alSalir` lo ignora —el foco se quedó en la fila, como al pasar de
  // bultos a sueltas—, así que `enFoco` seguía en true. Y mientras se escribe, lo
  // que contesta el servidor no pisa el campo: el "Está bien" se guardaba, la
  // tarjeta nueva llegaba, y el campo seguía vacío y la fila "escribiendo". El
  // próximo salir del campo mandaba ese vacío, que BORRA el conteo.
  //
  // Tocar uno de los dos es terminar de escribir: el foco ya no cuenta, y el
  // campo dice lo que quedó guardado.
  async function estaBien() {
    setEnFoco(false);
    const guardado = await onGuardar?.(item.id, { estaBien: true });
    setFallo(!guardado);
    if (guardado?.conteo) setValores(casillerosDesdeTotal(guardado.conteo.total, casilleros));
  }

  function aceptar() {
    setEnFoco(false);
    guardar();
  }

  // Un cambio que vino del − o del +: se guarda a los 1,5 s sin tocar más.
  const cambiar = (clave) => (texto) => {
    const v = { ...valores, [clave]: texto };
    setValores(v);
    if (tocoBoton.current) {
      tocoBoton.current = false;
      clearTimeout(espera.current);
      espera.current = setTimeout(() => guardar(v), ESPERA_TRAS_BOTON_MS);
    }
  };

  // El − y el + son botones del kit: se reconocen al tocarlos, antes de que la
  // pieza avise el cambio.
  const alTocar = (e) => {
    if (e.target?.closest?.("button[aria-label^='Restar'], button[aria-label^='Sumar']")) tocoBoton.current = true;
  };

  const alSalir = (e) => {
    // Pasar de "bultos" a "sueltas", o tocar el − o el +, no es salir de la fila.
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
  // "Contado" en el color de acción es ESCRIBIENDO: un valor distinto de lo
  // guardado, sin aceptar. Tener el foco en un campo vacío no es escribir.
  const estado = fallo
    ? ESTADO_FILA.ERROR
    : sinGuardar
      ? ESTADO_FILA.ESCRIBIENDO
      : total != null
        ? ESTADO_FILA.CONTADO
        : ESTADO_FILA.SIN_CONTAR;
  const stockDelSistema = Number(item?.stock ?? 0);
  // En el renglón del botón va uno de los dos: "Aceptar" si hay algo escrito que
  // no está guardado, y si no "Está bien" mientras está sin contar.
  const conAceptar = sinGuardar && !escrito.vacio;
  const conEstaBien = !conAceptar && total == null && !sinGuardar && !fallo && stockDelSistema >= 0;

  const campo = (clave, etiqueta, ref) => (
    <SunmiCampoCantidad
      valor={valores[clave] ?? ""}
      onCambiar={cambiar(clave)}
      etiqueta={etiqueta}
      minimo={0}
      decimales={!desglose && casilleros.decimales ? 3 : 0}
      conservaLoEscrito={!desglose && casilleros.decimales}
      tipo="text"
      // Grande y a lo ancho: el − y el + de 44 × 44, y la caja del número es la
      // que se achica si no entra —en el depósito, la mitad de la fila cada uno—.
      tamano="grande"
      ocupaElAncho
      claseInput={`font-semibold tabular-nums ${CLASE_CAJA[estado]}`}
      difiere={estado === ESTADO_FILA.ERROR}
      inputRef={ref}
      onFocus={alEntrar}
      onBlur={alSalir}
      onKeyDown={alTeclear}
    />
  );

  // Depósito: bultos y sueltas uno al lado del otro, la mitad cada uno, con su
  // rótulo debajo. Local: un solo campo a lo ancho de la fila, con su unidad.
  const campos = desglose ? (
    <div className="grid grid-cols-2 gap-2">
      <div className="flex min-w-0 flex-col items-center gap-0.5">
        {campo("bultos", "Bultos contados", primero)}
        <span className="text-xs2 sunmi-text-muted">bultos</span>
      </div>
      <div className="flex min-w-0 flex-col items-center gap-0.5">
        {campo("sueltas", "Sueltas contadas")}
        <span className="text-xs2 sunmi-text-muted">sueltas</span>
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-1.5">
      {campo("valor", "Contado", primero)}
      <span className="shrink-0 text-sm2 sunmi-text-muted">{casilleros.unidad}</span>
    </div>
  );

  const fila = (
    <div ref={contenedor} onClickCapture={alTocar} data-fila-conteo={estado} className="px-3 py-2.5 space-y-1.5">
      <EncabezadoDeLaFila estado={estado} conteo={conteo} />
      {/* "Está bien" va en su renglón, del alto de los campos (44 px): al lado
          no entran los dos grupos del depósito en 360 px. */}
      {conAceptar ? (
        <SunmiButton color="primary" type="button" onClick={aceptar} className="min-h-toque w-full">
          Aceptar
        </SunmiButton>
      ) : conEstaBien ? (
        <SunmiButton color="primary" type="button" onClick={estaBien} className="min-h-toque">
          Está bien
        </SunmiButton>
      ) : null}
      {campos}
      {desglose && estado === ESTADO_FILA.ESCRIBIENDO && escrito.total != null ? (
        <p className="text-xs2 sunmi-text-muted tabular-nums text-right">{`= ${textoCantidad(escrito.total, casilleros.unidadFisica)}`}</p>
      ) : null}
      {estado === ESTADO_FILA.CONTADO ? <LineaDeLaDiferencia conteo={conteo} unidadFisica={casilleros.unidadFisica} /> : null}
    </div>
  );

  // En el depósito con desglose, debajo del stock su total en unidades.
  const notaDelStock = desglose ? (
    <span className="text-xs2 sunmi-text-muted tabular-nums">{`= ${textoCantidad(stockDelSistema, casilleros.unidadFisica)}`}</span>
  ) : null;

  return (
    <TarjetaStockMovil
      item={item}
      proveedorNombre={proveedorNombre}
      localEsDeposito={esDeposito}
      filaDeAbajo={fila}
      notaDelStock={notaDelStock}
      resaltada={estado === ESTADO_FILA.ESCRIBIENDO}
      ancla={`conteo-${item.id}`}
    />
  );
}

/** El renglón de arriba de la fila: qué pasa con este producto. */
export function EncabezadoDeLaFila({ estado, conteo }) {
  if (estado === ESTADO_FILA.ERROR) return <p className="text-sm3 font-semibold sunmi-text-danger">No se guardó</p>;
  if (estado === ESTADO_FILA.ESCRIBIENDO) return <p className="text-sm3 font-semibold sunmi-text-accent">Contado</p>;
  if (estado === ESTADO_FILA.CONTADO) {
    return (
      <p className="text-sm3 font-semibold sunmi-text-success">
        {`✓ Contado · ${conteo?.contadoPor ?? ""} · ${horaDelConteo(conteo?.en)}`}
      </p>
    );
  }
  return <p className="text-sm3 sunmi-text-muted">Sin contar</p>;
}

/** "Sistema 5 · Contado 3 · Faltan 2 un", con la diferencia en su color. */
export function LineaDeLaDiferencia({ conteo, unidadFisica }) {
  if (!conteo) return null;
  const d = textoDeLaDiferencia(conteo.diferencia, unidadFisica);
  return (
    <p className="text-xs2 tabular-nums sunmi-text-muted">
      {`Sistema ${textoNumero(conteo.sistema)} · Contado ${textoNumero(conteo.total)} · `}
      <span className={`font-semibold ${CLASE_TONO[d.tono]}`}>{d.texto}</span>
    </p>
  );
}
