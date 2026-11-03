"use client";

// components/pos-transferencias/HojaCambiarPorOtro.jsx
//
// "CAMBIAR POR OTRO" (2026-11-03): la hoja de preparar pedido para mandar OTRO
// producto en lugar del pedido. Diseño aprobado en Figma (archivo
// EVJ2KvVCrY0oVSowfboymQ, página "Pedidos · Depósito · Cambiar por otro").
//
// La usan el celular (`PrepararPedidoCelular.jsx`, como hoja) y la computadora
// (`PrepararPedidoEscritorio.jsx`, centrada): mismas reglas en las dos.
//
//   · "Pidió: <producto> · <cantidad>" arriba;
//   · el buscador de la pantalla, con su micrófono —"Escaneá el que vas a
//     mandar"—: el lector escribe el código y manda Enter; a mano, se escribe y
//     Enter. Busca en el catálogo del depósito que prepara (`buscarProductos`),
//     por el código de unidad, el de caja o el propio;
//   · OTRO producto: "Va este: …" en verde, "Cantidad que va" y "Mandar este
//     en lugar del pedido";
//   · el MISMO: "✓ Es el mismo que pidieron", la cantidad pedida y "✓ Va
//     completo", que es lo mismo que el "Va completo" de la tarjeta;
//   · un código que no está en ningún producto: el aviso, y no deja seguir.
//
// Qué se leyó, con qué cantidad arranca y qué se manda es
// `lib/pedidos/cambiarPorOtro.js`. Guardar lo hace la pantalla, por
// `detalle/editar`, como todo lo preparado.

import { useState } from "react";

import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiCampoCantidad from "@/components/sunmi/SunmiCampoCantidad";
import SunmiCampoBusquedaVoz from "@/components/sunmi/SunmiCampoBusquedaVoz";
import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import { CajaDeCantidad, ParDeCantidades } from "@/components/revision/PiezasDeRevision";
import FilaCatalogoRecepcion from "@/components/transferencias/FilaCatalogoRecepcion";
import { vaCompleto } from "@/lib/pedidos/revisionDeLinea";
import { rotuloDeLoPedido } from "@/lib/pedidos/preparacionDelPedido";
import {
  LEIDO,
  PLACEHOLDER_CAMBIAR,
  TEXTO_CANTIDAD_QUE_VA,
  TEXTO_CODIGO_DESCONOCIDO,
  TEXTO_ES_EL_MISMO,
  TEXTO_MANDAR_ESTE,
  TITULO_CAMBIAR,
  cantidadInicial,
  cuerpoDelCambio,
  loElegido,
  queEsLoLeido,
  rotuloDeLaCantidad,
  textoPidioProducto,
  textoVaEste,
} from "@/lib/pedidos/cambiarPorOtro";
// El mismo texto que la tarjeta. Se lee al dibujar, no al cargar el módulo: que
// el celular importe esta hoja y esta hoja importe su texto no hace un ciclo.
import { TEXTO_VA_COMPLETO } from "@/components/pos-transferencias/PrepararPedidoCelular";

/** El cuerpo de la hoja: se monta de nuevo por cada línea (`key`), y arranca vacío. */
function CuerpoCambiar({ linea, depositoId, guardando, onGuardar }) {
  const [texto, setTexto] = useState("");
  const [leido, setLeido] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [inicial, setInicial] = useState(null);
  const [cantidad, setCantidad] = useState("");

  const pidio = rotuloDeLoPedido(linea);

  const mostrar = (r) => {
    setLeido(r);
    if (r.tipo === LEIDO.OTRO) {
      const i = cantidadInicial(linea, r.producto);
      setInicial(i);
      setCantidad(i.valor);
    }
  };

  const leer = async (q) => {
    const t = String(q ?? "").trim();
    if (!t || !depositoId) return;
    setBuscando(true);
    try {
      const res = await fetch(`/api/pos-transferencias/buscarProductos?q=${encodeURIComponent(t)}&origenId=${depositoId}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      mostrar(queEsLoLeido(linea, json.ok ? json.items || [] : [], t));
    } catch (err) {
      console.error(err);
      mostrar({ tipo: LEIDO.DESCONOCIDO });
    } finally {
      setBuscando(false);
    }
  };

  const cuerpo = leido?.tipo === LEIDO.OTRO && inicial ? cuerpoDelCambio(leido.producto, inicial, cantidad) : null;
  const nombreQueVa = leido?.producto?.nombre ?? "";

  return (
    <>
      <p className="text-sm2 sunmi-text-muted">{textoPidioProducto(linea.productoNombre, pidio)}</p>
      <SunmiCampoBusquedaVoz
        value={texto}
        onChange={(t) => {
          setTexto(t);
          setLeido(null);
        }}
        onVoz={(t) => {
          setTexto(t);
          leer(t);
        }}
        onKeyDown={(e) => {
          // El lector escribe el código y manda Enter; a mano, también Enter.
          if (e.key !== "Enter") return;
          e.preventDefault();
          leer(texto);
        }}
        autoFocus
        placeholder={PLACEHOLDER_CAMBIAR}
        ariaLabel={PLACEHOLDER_CAMBIAR}
      />
      {buscando ? <p className="text-sm2 sunmi-text-muted">Buscando...</p> : null}

      {leido?.tipo === LEIDO.DESCONOCIDO ? (
        <SunmiAviso tono="danger">{TEXTO_CODIGO_DESCONOCIDO}</SunmiAviso>
      ) : null}

      {leido?.tipo === LEIDO.VARIOS
        ? leido.items.map((p) => (
            <FilaCatalogoRecepcion key={p.productoLocalId} p={p} onElegir={(x) => mostrar(loElegido(linea, x))} agregando={guardando} />
          ))
        : null}

      {leido?.tipo === LEIDO.MISMO ? (
        <>
          <SunmiAviso tono="success">{TEXTO_ES_EL_MISMO}</SunmiAviso>
          <p className="text-sm2 sunmi-text-muted">{`Va ${pidio}`}</p>
          <SunmiButton color="primary" className="w-full min-h-toque justify-center" onClick={() => onGuardar(vaCompleto(linea))} disabled={guardando}>
            {guardando ? "Guardando..." : TEXTO_VA_COMPLETO}
          </SunmiButton>
        </>
      ) : null}

      {leido?.tipo === LEIDO.OTRO && inicial ? (
        <>
          <SunmiAviso tono="success">{textoVaEste(leido.producto)}</SunmiAviso>
          <p className="text-sm2 sunmi-text-muted">{TEXTO_CANTIDAD_QUE_VA}</p>
          <ParDeCantidades>
            <CajaDeCantidad rotulo={rotuloDeLaCantidad(inicial)}>
              {inicial.porKilo ? (
                <SunmiInput
                  type="text"
                  inputMode="decimal"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  placeholder="0,000"
                  aria-label={`${TEXTO_CANTIDAD_QUE_VA} de ${nombreQueVa}`}
                  className="text-lg"
                />
              ) : (
                <SunmiCampoCantidad
                  valor={cantidad}
                  onCambiar={setCantidad}
                  etiqueta={`${TEXTO_CANTIDAD_QUE_VA} de ${nombreQueVa}`}
                  minimo={0}
                  tipo="number"
                  claseMarco="flex-1"
                  claseInput="text-lg"
                />
              )}
            </CajaDeCantidad>
          </ParDeCantidades>
          <SunmiButton color="primary" className="w-full min-h-toque justify-center" onClick={() => onGuardar(cuerpo)} disabled={guardando || !cuerpo}>
            {guardando ? "Guardando..." : TEXTO_MANDAR_ESTE}
          </SunmiButton>
        </>
      ) : null}
    </>
  );
}

/**
 * @param {object}   p
 * @param {object|null} p.linea     la línea que se cambia (como la manda `detalle`); null, cerrada
 * @param {number}   p.depositoId   el depósito que prepara: en su catálogo se busca
 * @param {"hoja"|"centrado"} p.forma  hoja en el celular, centrada en la computadora
 * @param {boolean}  p.guardando
 * @param {(cuerpo: object) => void} p.onGuardar  lo que va a `detalle/editar`
 * @param {() => void} p.onCerrar
 */
export default function HojaCambiarPorOtro({ linea, depositoId, forma, guardando, onGuardar, onCerrar }) {
  return (
    <SunmiModalLayout
      open={!!linea}
      title={TITULO_CAMBIAR}
      onClose={onCerrar}
      z={NIVEL_MODAL_GLOBAL}
      forma={forma}
      // Es carga: hay un producto leído y una cantidad que un toque al costado tiraría.
      destructivo
      espacioCuerpo="gap-2"
    >
      {linea ? <CuerpoCambiar key={linea.detalleId} linea={linea} depositoId={depositoId} guardando={guardando} onGuardar={onGuardar} /> : null}
    </SunmiModalLayout>
  );
}
