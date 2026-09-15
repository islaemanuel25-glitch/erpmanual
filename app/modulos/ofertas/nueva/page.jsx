// app/modulos/ofertas/nueva/page.jsx
//
// CREAR UNA OFERTA, EN EL TELÉFONO.
//
// ── LA OFERTA NO TIENE NOMBRE PROPIO ─────────────────────────────────────
//
// Se llama como el producto, y el nombre lo pone el SERVIDOR al crear. Una
// oferta es UN producto —varios son un combo, que es otra cosa y otra
// pantalla—, así que pedir un nombre aparte era pedir lo mismo dos veces. La
// única oferta que llegó a producción terminó llamándose "91100" por eso.
//
// Y no hay un campo oculto con el nombre: un campo que nadie ve y que igual
// viaja es la forma de que mañana alguien lo llene con otra cosa.
//
// ── EL BUSCADOR ES EL DEL POS, SIN TOCARLO ───────────────────────────────
//
// `components/pos-ventas/BuscadorProductos` tal cual, apuntado por su prop
// `apiPath` a `/api/ofertas/buscar-producto`. Es el mismo componente que usan el
// POS y Stock: trae el escáner, el dictado por voz, el auto-agregado por código
// exacto y el ranking. Copiarlo para cambiarle dos cosas habría dejado tres
// buscadores que se parecen hasta el día que uno cambia.
//
// El endpoint devuelve la MISMA forma que el del POS más el costo, que es lo
// único que agrega: quien arma una oferta necesita verlo para no fijar el precio
// a ciegas, y el cajero no tiene por qué.
//
// ── EL SHELL DIBUJA EL ENCABEZADO ────────────────────────────────────────
//
// No hay header propio ni botón de volver propio. El título sale de
// `useTituloDePagina` y el "Volver" se registra en el slot del shell, que es lo
// que ya se corrigió en este proyecto cuando una pantalla mostraba dos
// encabezados en un teléfono de 390 px.
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiToggle from "@/components/sunmi/SunmiToggle";

import AccionDePantalla from "@/components/transferencias/AccionDePantalla";
import BuscadorProductos from "@/components/pos-ventas/BuscadorProductos";
import {
  DURACIONES,
  DURACION_POR_DEFECTO,
  finDeLaOferta,
  lineasDePrecio,
  money,
  puedePublicar,
  resumenDeLaOferta,
  textoDeVigencia,
} from "@/lib/ofertas/crearOfertaMovil";
import { CONDICION_PAGO_OFERTA } from "@/lib/ofertas/vigencia";

const RUTA_OFERTAS = "/modulos/ofertas";

/** El tono que devuelve el dominio, traducido a token del tema. */
const COLOR_DE_TONO = {
  ok: "sunmi-text-success",
  perdida: "sunmi-text-danger",
  invalida: "sunmi-text-danger",
  neutro: "sunmi-text-muted",
};

/** Un rótulo de bloque: 11px peso 500, apagado. */
function Rotulo({ children }) {
  return <div className="text-sm2 font-medium sunmi-text-muted">{children}</div>;
}

/** Una fila etiqueta/valor de la tarjeta del producto. */
function Dato({ etiqueta, valor }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm3 sunmi-text-muted">{etiqueta}</span>
      <span className="text-sm3 font-medium sunmi-text-strong tabular-nums">{valor}</span>
    </div>
  );
}

export default function NuevaOfertaPage() {
  const router = useRouter();
  const { perfil, cargando: cargandoUsuario } = useUser();
  const { contexto } = useContextoActivo();
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  const [producto, setProducto] = useState(null);
  const [precio, setPrecio] = useState("");
  const [duracion, setDuracion] = useState(DURACION_POR_DEFECTO);
  const [fechaElegida, setFechaElegida] = useState("");
  const [soloEfectivo, setSoloEfectivo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  useTituloDePagina("Nueva oferta");
  const volver = useAccionDePagina(() => <SunmiBackButton href={RUTA_OFERTAS} />, []);

  const finEn = useMemo(
    () => finDeLaOferta({ duracion, fechaElegida }),
    [duracion, fechaElegida]
  );
  const lineas = lineasDePrecio({
    precioNormal: producto?.precioNormal,
    precioOferta: precio,
    costo: producto?.costo,
  });
  const listo = puedePublicar({ producto, precioOferta: precio, finEn });

  if (cargandoUsuario) return null;
  if (!esAdmin && !permisos.includes("ofertas.crear")) return <SinPermisos />;

  /**
   * Guarda y, si se pidió, publica.
   *
   * Publicar son DOS llamadas y no un flag: la ruta de crear deja la oferta en
   * borrador y la de publicar es la que le pone autor y momento. Meterle un
   * `publicar: true` a la de crear habría duplicado esa decisión en dos lugares.
   */
  const guardar = async (publicando) => {
    setError(null);
    setGuardando(true);
    try {
      const res = await fetch("/api/ofertas/crear", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // SIN `nombre`: lo pone el servidor con el nombre del producto.
          inicioEn: new Date().toISOString(),
          finEn: finEn.toISOString(),
          condicionPago: soloEfectivo
            ? CONDICION_PAGO_OFERTA.SOLO_EFECTIVO
            : CONDICION_PAGO_OFERTA.CUALQUIER_MEDIO,
          lineas: [
            { productoLocalId: producto.productoLocalId, precioOferta: Number(precio) },
          ],
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error || `No se pudo crear la oferta (HTTP ${res.status}).`);
        return;
      }

      if (publicando) {
        const pub = await fetch(`/api/ofertas/${json.ofertaId}/publicar`, {
          method: "POST",
          credentials: "include",
        });
        const pj = await pub.json().catch(() => null);
        if (!pub.ok || !pj?.ok) {
          // La oferta SE CREÓ: se dice, y se la manda a verla en vez de dejar a
          // la persona creyendo que no se guardó nada y cargándola otra vez.
          setError(
            `La oferta se guardó como borrador pero no se pudo publicar: ${
              pj?.error || `HTTP ${pub.status}`
            }`
          );
          router.push(`${RUTA_OFERTAS}/${json.ofertaId}`);
          return;
        }
      }
      router.push(`${RUTA_OFERTAS}/${json.ofertaId}`);
    } catch (e) {
      setError(`No se pudo hablar con el servidor: ${e.message}`);
    } finally {
      setGuardando(false);
    }
  };

  const nombreDelLocal = contexto?.nombre || "";

  return (
    <div className="w-full min-h-full flex flex-col">
      <AccionDePantalla>{volver}</AccionDePantalla>

      {/* `pb` grande: el pie está anclado abajo y sin esto tapa el último bloque
          cuando el contenido llega hasta ahí. */}
      <div className="flex-1 px-4 pt-4 pb-4 space-y-3.5 overflow-y-auto">
        {/* ── 1 · BUSCADOR ─────────────────────────────────────────────── */}
        <div className="space-y-2">
          <Rotulo>Qué producto ponés en oferta</Rotulo>
          <BuscadorProductos
            localId={contexto?.localId}
            apiPath="/api/ofertas/buscar-producto"
            mostrarStock
            onAgregar={(p) => {
              setProducto(p);
              setPrecio("");
            }}
          />
        </div>

        {/* ── 2 · EL PRODUCTO ELEGIDO ──────────────────────────────────── */}
        {producto && (
          <section className="sunmi-bg-card rounded-xl2 border sunmi-border p-4 space-y-3">
            <div className="text-lg2 font-semibold sunmi-text-strong">{producto.nombre}</div>
            <div className="space-y-1.5">
              <Dato etiqueta="Precio normal" valor={money(producto.precioNormal)} />
              <Dato etiqueta="Costo" valor={money(producto.costo)} />
              <Dato
                etiqueta={`Stock hoy en ${nombreDelLocal || "esta ubicación"}`}
                valor={String(producto.stock ?? 0)}
              />
            </div>
            {/* SIN STOCK AVISA, NO BLOQUEA: acá se está programando un precio
                para los próximos días, y que hoy no haya no dice nada sobre
                mañana — puede estar por llegar el pedido. */}
            {Number(producto.stock ?? 0) <= 0 && (
              <div className="text-sm3 font-medium sunmi-text-warning">
                Hoy no hay stock de este producto. Igual podés dejar la oferta cargada.
              </div>
            )}
          </section>
        )}

        {/* ── 3 · PRECIO DE OFERTA ─────────────────────────────────────── */}
        {producto && (
          <section className="sunmi-bg-card rounded-xl2 border sunmi-border p-4 space-y-3">
            <Rotulo>Precio de oferta</Rotulo>
            <SunmiInput
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              aria-label="Precio de oferta"
              className="w-full text-xl2 tabular-nums"
            />
            {lineas.principal && (
              <div className="space-y-1">
                <div className={`text-sm3 font-medium ${COLOR_DE_TONO[lineas.tono]}`}>
                  {lineas.principal}
                </div>
                {lineas.secundaria && (
                  <div
                    className={`text-xs ${
                      lineas.tono === "ok" ? "sunmi-text-muted" : COLOR_DE_TONO[lineas.tono]
                    }`}
                  >
                    {lineas.secundaria}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── 4 · HASTA CUÁNDO ─────────────────────────────────────────── */}
        {producto && (
          <section className="sunmi-bg-card rounded-xl2 border sunmi-border p-4 space-y-3">
            <Rotulo>Hasta cuándo dura</Rotulo>
            <div className="flex flex-wrap gap-2">
              {DURACIONES.map((d) => {
                const activo = duracion === d.clave;
                return (
                  <SunmiButton
                    key={d.clave}
                    type="button"
                    color={activo ? "primary" : "slate"}
                    onClick={() => setDuracion(d.clave)}
                    aria-pressed={activo}
                    className="min-h-0 px-3.5 py-2.5 rounded-md text-sm3 font-medium"
                  >
                    {d.etiqueta}
                  </SunmiButton>
                );
              })}
            </div>

            {duracion === "ELEGIR" && (
              <SunmiInput
                type="date"
                value={fechaElegida}
                onChange={(e) => setFechaElegida(e.target.value)}
                aria-label="Último día de la oferta"
                className="w-full text-sm3"
              />
            )}

            <div className="text-sm3 font-medium sunmi-text-strong">{textoDeVigencia(finEn)}</div>
          </section>
        )}

        {/* ── 5 · SOLO EFECTIVO ────────────────────────────────────────── */}
        {producto && (
          <section className="sunmi-bg-card rounded-xl2 border sunmi-border p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm3 font-medium sunmi-text-strong">
                Solo si paga en efectivo
              </span>
              <SunmiToggle value={soloEfectivo} onChange={setSoloEfectivo} />
            </div>
          </section>
        )}

        {error && (
          <div className="rounded-xl border sunmi-border-danger px-4 py-3 text-xs sunmi-text-danger">
            {error}
          </div>
        )}
      </div>

      {/* ── EL PIE, ANCLADO ───────────────────────────────────────────────
          No scrollea con el contenido: el resumen y los dos botones son la
          decisión, y una decisión que hay que ir a buscar hacia abajo se toma
          sin leerla. */}
      <div className="sticky bottom-0 border-t sunmi-border sunmi-bg-pie px-4 pt-3 pb-4 space-y-3">
        <div className="text-sm3 sunmi-text-muted-strong">
          {resumenDeLaOferta({
            producto,
            precioOferta: precio,
            finEn,
            nombreDelLocal,
            soloEfectivo,
          })}
        </div>

        <div className="flex gap-2">
          <SunmiButton
            type="button"
            color="secondary"
            onClick={() => guardar(false)}
            disabled={!listo || guardando}
            className="flex-1 justify-center text-sm3 font-medium"
          >
            Guardar borrador
          </SunmiButton>
          <SunmiButton
            type="button"
            color="primary"
            onClick={() => guardar(true)}
            disabled={!listo || guardando}
            className="flex-1 justify-center text-sm3 font-medium"
          >
            {guardando ? "Guardando…" : "Publicar"}
          </SunmiButton>
        </div>

        <div className="text-sm2 sunmi-text-muted">
          Desde que publicás, el POS ya cobra este precio.
        </div>
      </div>
    </div>
  );
}
