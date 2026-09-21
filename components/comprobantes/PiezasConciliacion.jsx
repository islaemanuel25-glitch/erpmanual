"use client";

// Las piezas de una fila de conciliación: el estado del vínculo, la unidad, el
// precio y el buscador a mano.
//
// Viven acá y no adentro de la lista porque la lista ya es larga y estas cuatro
// no dependen de ella: reciben lo que muestran y avisan lo que se tocó.
//
// Vienen de `LineasComprobante.jsx`, que se reemplazó por la lista única. No se
// reescribieron: se movieron, porque cada una tiene adentro el motivo por el que
// está como está.

import { useEffect, useRef, useState } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";

/**
 * El estado del vínculo, con PALABRA propia.
 *
 * Los textos largos vienen del servidor; acá va la etiqueta corta, que es lo que
 * se lee de un vistazo.
 */
export function estadoDeVinculo(l) {
  if (l.productoLocalId) return { etiqueta: "Vinculado", tono: "sunmi-text-success", pideAccion: false };
  if (l.vinculadaSola) return { etiqueta: "Vinculado solo", tono: "sunmi-text-success", pideAccion: false };
  if (l.origen === "SIN_CANDIDATOS") return { etiqueta: "Sin encontrar", tono: "sunmi-text-danger", pideAccion: true };
  // DEL PEDIDO se dice distinto y no solo con otro tono: "está en tu pedido" es
  // una afirmación mucho más fuerte que "existe en el catálogo".
  if (l.origen === "LINEA_DEL_PEDIDO") {
    return { etiqueta: "Está en el pedido", tono: "sunmi-text-warning", pideAccion: true };
  }
  return { etiqueta: "¿Es este?", tono: "sunmi-text-warning", pideAccion: true };
}

/** La tira de aviso: barra del mismo color que el texto, palabra corta, detalle. */
export function Revisar({ linea, children }) {
  const e = estadoDeVinculo(linea);
  return (
    <div className={`flex gap-2 ${e.tono}`}>
      <div className="w-1 rounded shrink-0 bg-current" aria-hidden />
      <div className="min-w-0 w-full">
        <p className="text-xs font-bold">{e.etiqueta}</p>
        {(linea.problema || linea.textoOrigen) && (
          <p className="text-sm2 sunmi-text-muted leading-snug">{linea.problema || linea.textoOrigen}</p>
        )}
        {linea.textoMotivoPedido && (
          <p className="text-sm2 sunmi-text-warning leading-snug">{linea.textoMotivoPedido}</p>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * La unidad, EN CRIOLLO.
 *
 * El cociente no le dice nada a nadie: "3,08" no es una respuesta. La respuesta
 * es "36 ÷ 12 = 3 bultos, y el bulto sale 37.464". Y cuando no se puede decidir,
 * la pregunta va entre DOS RESULTADOS CONCRETOS con su cantidad y su costo.
 */
export function Unidad({ u, onElegir, puedeElegir, elegida }) {
  if (!u) return null;

  if (elegida && u.lecturas) {
    const op = elegida === "POR_UNIDAD" ? u.lecturas.porUnidad : u.lecturas.porBulto;
    return (
      <div className="mt-1">
        <p className="text-sm2 sunmi-text-strong">{op.texto}</p>
        <p className="text-sm2 sunmi-text-muted">{op.cuenta}</p>
        <div className="mt-1">
          <SunmiButton color="slate" type="button" onClick={() => onElegir?.(null)}>
            Cambiar
          </SunmiButton>
        </div>
      </div>
    );
  }

  if (u.requiereDecision && u.lecturas) {
    return (
      <div className="mt-1">
        <p className="text-sm2 sunmi-text-warning font-bold">¿Por unidad o por bulto?</p>
        <p className="text-sm2 sunmi-text-muted leading-snug">{u.porque}</p>
        <div className="mt-1 flex flex-col gap-1">
          {[u.lecturas.porUnidad, u.lecturas.porBulto].map((op) => (
            <SunmiButton
              key={op.unidad}
              color="cyan"
              type="button"
              className="justify-start text-left"
              disabled={!puedeElegir}
              onClick={() => onElegir?.(op.unidad)}
            >
              {op.texto}
            </SunmiButton>
          ))}
        </div>
      </div>
    );
  }

  if (u.explicacion) {
    return (
      <div className="mt-1">
        <p className="text-sm2 sunmi-text-strong">{u.explicacion.frase}</p>
        <p className="text-sm2 sunmi-text-muted">{u.explicacion.detalle}</p>
        {u.explicacion.avisoDivision && (
          <p className="text-sm2 sunmi-text-warning leading-snug">{u.explicacion.avisoDivision}</p>
        )}
      </div>
    );
  }

  return <p className="text-sm2 sunmi-text-muted mt-1">{u.texto}</p>;
}

/**
 * EL PRECIO: qué cambió y qué se puede hacer.
 *
 *   · Subió más del umbral → el porcentaje y los dos botones.
 *   · Bajó → el porcentaje SIN botón. El costo no se baja solo.
 *   · Salto brusco → en rojo y sin botón: es sospecha de mala lectura.
 *
 * El texto viene armado del servidor. Acá no se recalcula ningún porcentaje: si
 * la pantalla dijera un número y el servidor escribiera otro, sería peor que no
 * mostrarlo.
 */
export function Precio({ p, onAceptar, onNo, puede, aceptando, decidida }) {
  const d = p?.decision;
  if (!d || d.accion === "NINGUNA") return null;

  const tono =
    d.accion === "FRENA" ? "sunmi-text-danger"
    : d.accion === "OFRECER" ? "sunmi-text-warning"
    : "sunmi-text-muted";

  return (
    <div className={`mt-1 flex gap-2 ${tono}`}>
      <div className="w-1 rounded shrink-0 bg-current" aria-hidden />
      <div className="min-w-0 w-full">
        <p className="text-xs font-bold">{d.titulo}</p>
        <p className="text-sm2 sunmi-text-muted leading-snug">{d.detalle}</p>
        {d.ofreceAceptar && puede && !decidida && (
          <div className="mt-1 flex flex-wrap gap-1">
            <SunmiButton color="cyan" type="button" disabled={aceptando} onClick={onAceptar}>
              {aceptando ? "Aceptando…" : "Aceptar"}
            </SunmiButton>
            <SunmiButton color="slate" type="button" disabled={aceptando} onClick={onNo}>
              No
            </SunmiButton>
          </div>
        )}
        {decidida === "NO" && (
          <p className="text-sm2 sunmi-text-muted mt-1">
            Queda con el precio que tenía. No se escribió nada.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Buscar un producto a mano, sin salir de la pantalla.
 *
 * ── DOS ARREGLOS, LOS DOS DEL MISMO EPISODIO ───────────────────────────────
 *
 * 1. TIENE PLAZO. Antes el `fetch` no tenía ninguno: una petición que no vuelve
 *    —dato móvil que se corta— dejaba "Buscando…" para siempre, sin forma de
 *    salir más que cerrar. Emanuel lo vio en el Sunmi. Ahora se corta a los 10
 *    segundos y lo dice.
 *
 * 2. EL ERROR SE MUESTRA. Antes cualquier respuesta que no trajera `items`
 *    —un 401 de sesión vencida, un 409 de contexto, un 500— caía en la misma
 *    rama que "no hay coincidencias", y la pantalla decía "Ninguno con ese
 *    nombre". Un fallo de red y un catálogo sin resultados NO son lo mismo, y
 *    decir uno por el otro manda a buscar el problema donde no está.
 */
export const TEXTO_TODO_EL_CATALOGO = "Buscar en todo el catálogo";

export function BuscadorProducto({
  onElegir,
  onCancelar,
  /**
   * ── SE BUSCA ENTRE LO QUE SE LE COMPRA A ESTE PROVEEDOR ─────────────────
   *
   * Sin esto el buscador traía el catálogo ENTERO. Medido el 2026-09-21 con la
   * factura de Paty: su universo son 26 productos y el catálogo 2.711. Elegir
   * entre 2.711 para vincular un renglón de Paty no es difícil, es peligroso —
   * un vínculo equivocado escribe un alias que se repite en cada factura que
   * venga, y el costo entra en el producto que no era.
   *
   * Sin `proveedorId` se busca en todo, que es como se comportaba antes: las
   * pantallas que todavía no lo pasan no cambian.
   */
  proveedorId = null,
  proveedorNombre = null,
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [fallo, setFallo] = useState(null);
  /**
   * ── LA SALIDA PARA UN PRODUCTO NUEVO DEL PROVEEDOR ─────────────────────
   *
   * Un proveedor trae por primera vez algo que nunca le compramos: ese producto
   * NO está en su universo y sin esta puerta no se podría vincular nunca. Es
   * explícita —hay que tocarla— para que quede claro que se está saliendo del
   * universo, y al vincularlo el servidor lo asocia al proveedor para que la
   * próxima vez aparezca en la búsqueda normal.
   */
  const [enTodoElCatalogo, setEnTodoElCatalogo] = useState(!proveedorId);
  const abortRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const texto = q.trim();
      if (texto.length < 3) { setItems([]); setFallo(null); return; }
      // Si había una búsqueda anterior en vuelo, se corta: lo que vuelva de una
      // consulta vieja no sirve y encima pisaría lo nuevo.
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const plazo = setTimeout(() => ctrl.abort(), 10_000);

      setBuscando(true);
      setFallo(null);
      try {
        // El catálogo del proveedor es el MISMO endpoint que arma un pedido
        // para él: ahí ya vive la definición de qué se le compra, con sus tres
        // relaciones y los códigos que ya se le vincularon. No se escribe una
        // segunda búsqueda al lado.
        const url = enTodoElCatalogo
          ? `/api/productos/listar?q=${encodeURIComponent(texto)}&pageSize=8`
          : `/api/compras-proveedor/productos?proveedorId=${proveedorId}` +
            `&search=${encodeURIComponent(texto)}`;
        const r = await fetch(url, { credentials: "include", signal: ctrl.signal });
        const d = await r.json().catch(() => null);
        if (!r.ok) {
          // El mensaje del servidor gana: sabe más que cualquier tabla de acá.
          setItems([]);
          setFallo(d?.queHacer || d?.error || `El servidor contestó ${r.status}.`);
          return;
        }
        setItems(d?.items || d?.productos || []);
      } catch (e) {
        setItems([]);
        setFallo(
          e?.name === "AbortError"
            ? "La búsqueda tardó más de 10 segundos y se cortó. Puede ser la conexión: probá de nuevo."
            : "No se pudo consultar el catálogo: se cortó la conexión."
        );
      } finally {
        clearTimeout(plazo);
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, enTodoElCatalogo, proveedorId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <div className="mt-2 rounded border sunmi-border p-2">
      <div className="flex gap-2 items-center">
        <SunmiInput
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar producto por nombre…"
          className="flex-1"
        />
        <SunmiButton color="slate" type="button" onClick={onCancelar}>Cancelar</SunmiButton>
      </div>
      {/* DÓNDE SE ESTÁ BUSCANDO, dicho siempre. Sin esto, "Ninguno con ese
          nombre" es ambiguo: no se sabe si el producto no existe o si existe
          pero no es de este proveedor, que son dos cosas distintas y se
          resuelven distinto. */}
      {proveedorId && (
        <p className="text-sm2 sunmi-text-muted mt-1">
          {enTodoElCatalogo
            ? "Buscando en TODO el catálogo."
            : `Buscando entre lo que se le compra a ${proveedorNombre || "este proveedor"}.`}
        </p>
      )}
      {buscando && <p className="text-sm2 sunmi-text-muted mt-1">Buscando…</p>}
      {/* EL FALLO SE DICE COMO FALLO. No se disfraza de catálogo vacío. */}
      {!buscando && fallo && <p className="text-sm2 sunmi-text-danger mt-1 leading-snug">{fallo}</p>}
      {!buscando && !fallo && q.trim().length >= 3 && items.length === 0 && (
        <p className="text-sm2 sunmi-text-muted mt-1">
          {enTodoElCatalogo
            ? "Ninguno con ese nombre."
            : "Ninguno con ese nombre entre los de este proveedor."}
        </p>
      )}

      {/* La puerta al catálogo entero: solo cuando hay un universo que la haga
          falta, y solo hasta que se abre. */}
      {proveedorId && !enTodoElCatalogo && (
        <SunmiButton
          color="slate"
          type="button"
          className="mt-1 w-full justify-center"
          onClick={() => setEnTodoElCatalogo(true)}
        >
          {TEXTO_TODO_EL_CATALOGO}
        </SunmiButton>
      )}
      <div className="flex flex-col gap-1 mt-1">
        {items.map((p) => (
          <SunmiButton
            key={p.baseId ?? p.id}
            color="slate"
            type="button"
            className="justify-start text-left"
            onClick={() => onElegir({ productoBaseId: p.baseId ?? p.base?.id ?? p.id, nombre: p.nombre })}
          >
            {p.nombre}
          </SunmiButton>
        ))}
      </div>
    </div>
  );
}
