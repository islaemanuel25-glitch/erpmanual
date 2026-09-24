"use client";

// El buscador a mano de un producto, dentro de la conciliación.
//
// Viene de `LineasComprobante.jsx`, que se reemplazó por la lista única. No se
// reescribió: se movió, porque tiene adentro el motivo por el que está como
// está.

import { useEffect, useRef, useState } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { textoDeFallo } from "@/components/compras-proveedor/ExplicacionDelPapel";

// ── ACÁ ESTABAN `estadoDeVinculo`, `Revisar`, `Unidad` y `Precio` ──────────
//
// Las piezas de la fila de `ListaConciliacion`, la tabla que dibujaba la
// recepción vieja de "Llegó sin factura". Esa pantalla se borró el 2026-09-24:
// sin factura es la misma recepción que con papel. `Unidad` y `Precio` no
// tenían otro consumidor, y `Revisar` con `estadoDeVinculo` ya no tenían
// ninguno. Queda el buscador, que usa la hoja de corregir.

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
          setFallo(textoDeFallo(d, r.status));
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
