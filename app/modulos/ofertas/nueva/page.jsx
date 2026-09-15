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

import { useEffect, useMemo, useRef, useState } from "react";
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
import BloqueDePrecio from "@/components/ofertas/BloqueDePrecio";
import TarjetaDelProducto from "@/components/ofertas/TarjetaDelProducto";
import BloqueDeDuracion from "@/components/ofertas/BloqueDeDuracion";
import InterruptorSoloEfectivo from "@/components/ofertas/InterruptorSoloEfectivo";
import PieDeOferta from "@/components/ofertas/PieDeOferta";
import {
  CLAVE_OFERTA_EN_CURSO,
  deserializarOfertaEnCurso,
  serializarOfertaEnCurso,
  textoDelCartel,
} from "@/lib/ofertas/ofertaEnCurso";
import { margenInvalido } from "@/lib/ofertas/precioConMargen";
import useBloqueDePrecioDeOferta from "@/hooks/useBloqueDePrecioDeOferta";
// `lineasDePrecio` y `puedePublicar` YA NO SE IMPORTAN: el bloque de precio los
// reemplazó por `resolverBloque` y `listo`. Quedaron sin ningún lector en el
// repo —solo los llaman sus propios candados— y eso está anotado para resolverlo
// en su propia tanda, no de paso en ésta.
import {
  avisaSinStock,
  DURACIONES,
  DURACION_POR_DEFECTO,
  finDeLaOferta,
  money,
  resumenDeLaOferta,
  textoDeVigencia,
} from "@/lib/ofertas/crearOfertaMovil";
import { CONDICION_PAGO_OFERTA } from "@/lib/ofertas/vigencia";

const RUTA_OFERTAS = "/modulos/ofertas";

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
  // ── LOS DOS CAMPOS SINCRONIZADOS VIVEN EN UN HOOK ──────────────────────
  //
  // El estado y los tres manejadores son IDÉNTICOS en el detalle de la oferta.
  // Copiarlos allá habría sido el caso que la regla 1 nombra: dos funciones que
  // hacen lo mismo se rompen el día que una cambia. El estado sigue viviendo
  // acá arriba —esta pantalla lo necesita para `sessionStorage`— y lo que se
  // comparte es cómo se mueve.
  const {
    margen, precio, origen, redondear, bloque,
    arrancarEn, reponer, onMargen, onPrecio, onRedondear,
  } = useBloqueDePrecioDeOferta({ costo: producto?.costo, precioNormal: producto?.precioNormal });
  const [enCurso, setEnCurso] = useState(null);
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
  // PUBLICAR NECESITA QUE SEA UNA OFERTA DE VERDAD. El estado inicial —el precio
  // normal en los dos campos— no lo es, así que arranca apagado.
  //
  // Y el margen negativo TIPEADO frena acá, que es la única de las validaciones
  // que bloquea. El derivado de un precio bajo el costo no: eso es el líder de
  // pérdida y se publica igual. La distinción la hace `margenInvalido` mirando
  // el origen; sin ella, este renglón frenaría la venta bajo costo.
  const listo =
    Boolean(producto) && Boolean(finEn) && bloque.esOferta && !margenInvalido(margen, origen);

  // ── LO QUE SE ESTÁ CARGANDO SE GUARDA EN LA PESTAÑA ────────────────────
  //
  // Mismo mecanismo que el pedido a proveedor en curso: `sessionStorage`, una
  // clave propia y las dos funciones puras de `ofertaEnCurso`. No se crea un
  // borrador en el servidor — eso haría aparecer una oferta en la lista que
  // nadie pidió crear.
  // ── Y NO SE GUARDA EN EL PRIMER RENDER ─────────────────────────────────
  //
  // Éste es el defecto que tuvo esta pantalla y que ningún candado podía ver:
  // al montar, `producto` todavía es `null`, así que `serializarOfertaEnCurso`
  // devolvía `null` y la rama del `else` BORRABA la clave — antes de que el
  // efecto de abajo alcanzara a leerla. La oferta a medio armar se perdía en
  // todos los refrescos, que es exactamente lo que este bloque existe para
  // impedir, y la pantalla no daba ninguna señal: el cartel simplemente no
  // aparecía. Lo encontró el arnés recargando de verdad.
  //
  // El `else` se conserva —al soltar el producto hay que limpiar, o quedaría un
  // cartel ofreciendo retomar algo que ya no está—, pero SOLO BORRA LO QUE ESTE
  // EFECTO ESCRIBIÓ. No se cuentan montajes: en desarrollo React monta dos veces
  // y un contador de "primera corrida" volvería a borrar en la segunda.
  const yaGuardo = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const guardar = serializarOfertaEnCurso({
        productoLocalId: producto?.productoLocalId,
        productoBaseId: producto?.productoBaseId,
        nombre: producto?.nombre,
        margen, precio, redondear, duracion, fechaElegida, soloEfectivo,
      });
      if (guardar) {
        sessionStorage.setItem(CLAVE_OFERTA_EN_CURSO, JSON.stringify(guardar));
        yaGuardo.current = true;
      } else if (yaGuardo.current) {
        sessionStorage.removeItem(CLAVE_OFERTA_EN_CURSO);
      }
    } catch {
      // Sin sessionStorage se pierde lo cargado al volver, pero no se rompe la
      // pantalla: es una comodidad, no un requisito.
    }
  }, [producto, margen, precio, redondear, duracion, fechaElegida, soloEfectivo]);

  // Al montar: si había algo a medio armar, se avisa. NO se restaura solo —
  // aparece el cartel y la persona decide, igual que en compras.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const g = deserializarOfertaEnCurso(sessionStorage.getItem(CLAVE_OFERTA_EN_CURSO));
      if (g && !producto) setEnCurso(g);
    } catch {
      /* ídem */
    }
    // Solo al montar: si corriera con cada cambio, el cartel volvería a aparecer
    // mientras se está escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const limpiarEnCurso = () => {
    try {
      sessionStorage.removeItem(CLAVE_OFERTA_EN_CURSO);
    } catch {
      /* ídem */
    }
    setEnCurso(null);
  };

  /** Repone lo guardado. El costo y el precio normal NO salen de acá: se vuelven
   *  a pedir al servidor, porque entre que se fue y volvió pudieron cambiar. */
  const retomar = async () => {
    if (!enCurso) return;
    reponer({ margen: enCurso.margen, precio: enCurso.precio, redondear: enCurso.redondear });
    setDuracion(enCurso.duracion || DURACION_POR_DEFECTO);
    setFechaElegida(enCurso.fechaElegida || "");
    setSoloEfectivo(enCurso.soloEfectivo);
    try {
      const url = new URL("/api/ofertas/buscar-producto", window.location.origin);
      url.searchParams.set("q", enCurso.nombre || "");
      const res = await fetch(url.toString(), { credentials: "include" });
      const j = await res.json();
      const p = (j?.items || []).find((x) => x.productoLocalId === enCurso.productoLocalId);
      if (p) setProducto(p);
    } catch {
      setError("No se pudo recuperar el producto. Buscalo de nuevo.");
    }
    setEnCurso(null);
  };

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
            {
              productoLocalId: producto.productoLocalId,
              precioOferta: bloque.precioFinal,
              // POR QUÉ ESE PRECIO TERMINÓ SIENDO ÉSE. Ninguno de los dos se
              // puede reconstruir después: un precio redondo no prueba que hubo
              // redondeo, y uno con decimales no prueba que no lo hubo.
              redondeoAplicado: redondear,
              precioSinRedondear: bloque.precioSinRedondear,
            },
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
      // SE LIMPIA AL GUARDAR, en las dos salidas: publicando o como borrador.
      // Lo que quedó guardado ya está en el servidor; dejarlo en la pestaña
      // haría aparecer el cartel sobre una oferta que ya existe.
      limpiarEnCurso();
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

      {/* ── EL CARTEL VIVE DENTRO DEL ENCABEZADO, NO EN EL CONTENIDO ───────
          Es el error que ya se pagó una vez en compras y está escrito allá: un
          cartel en el contenido que scrollea se ve entero en reposo y al bajar
          queda tapado, justo cuando la persona está mirando lo que cargó. Acá
          va fuera del contenedor con `overflow-y-auto`, así que no se mueve.

          Y NO se restaura solo: aparece el cartel y la persona decide. Reponer
          en silencio haría que la pantalla se llene sola con algo de otro
          momento sin que nadie lo haya pedido. */}
      {enCurso && !producto && (
        <div className="shrink-0 px-4 pt-4">
          <div className="rounded-xl2 border-1.5 sunmi-border-warning sunmi-bg-card px-4 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm3 font-medium sunmi-text-warning">
                {textoDelCartel(enCurso)}
              </div>
              <div className="text-xs sunmi-text-muted">
                El costo y el precio normal se vuelven a leer del sistema, por si cambiaron.
              </div>
            </div>
            <div className="shrink-0 flex flex-col gap-1.5">
              <SunmiButton
                type="button"
                color="primary"
                onClick={retomar}
                className="min-h-0 px-3 py-1.5 rounded-md text-sm2 font-medium"
              >
                Retomar
              </SunmiButton>
              <SunmiButton
                type="button"
                color="ghost"
                onClick={limpiarEnCurso}
                className="min-h-0 px-3 py-1.5 rounded-md text-sm2 font-medium sunmi-text-muted"
              >
                Descartar
              </SunmiButton>
            </div>
          </div>
        </div>
      )}

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
              // ARRANCA EN EL MARGEN REAL DE HOY, no vacío: así se ve de dónde
              // se parte y cuánto se resigna al bajar. Ese estado NO es una
              // oferta —es el precio normal— y por eso Publicar sigue apagado.
              arrancarEn({ precioNormal: p.precioNormal, costo: p.costo });
              setEnCurso(null);
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
            {/* ── EL AVISO RESPETA LA CONFIGURACIÓN DEL LOCAL ──────────────
                Con venta sin stock HABILITADA un negativo es normal: el local
                vende igual y el stock se regulariza después. Avisar ahí sería
                ruido permanente, y un aviso que siempre está se deja de leer.

                Con venta sin stock DESHABILITADA y stock en cero o menos, el
                aviso dice lo que de verdad pasa: ese producto HOY no se puede
                vender en este local. No bloquea —se está programando un precio
                para los próximos días y el pedido puede estar por llegar—. */}
            {avisaSinStock(producto) && (
              <div className="text-sm3 font-medium sunmi-text-warning">
                Hoy este producto no se puede vender en {nombreDelLocal || "esta ubicación"}:
                no hay stock y el local no tiene habilitada la venta sin stock. Igual podés
                dejar la oferta cargada.
              </div>
            )}
          </section>
        )}

        {/* ── 3 · PRECIO DE OFERTA ─────────────────────────────────────── */}
        {producto && (
          <BloqueDePrecio
            costo={producto.costo}
            precioNormal={producto.precioNormal}
            escala={producto.escala || "por unidad"}
            margen={margen}
            precio={precio}
            redondear={redondear}
            origen={origen}
            bloque={bloque}
            money={money}
            onMargen={onMargen}
            onPrecio={onPrecio}
            onRedondear={onRedondear}
          />
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

      <PieDeOferta
        resumen={
          /* EL RESUMEN DICE EL PRECIO QUE SE VA A COBRAR, NO EL TIPEADO.
             Decía `precio` —el texto del campo— y con el redondeo puesto eso es
             un número que el POS nunca va a cobrar: con $ 433 escritos el pie
             anunciaba "pasa de $ 500,00 a $ 433,00" mientras el bloque de arriba
             decía que el precio quedaba en $ 500. La frase del pie es la que se
             lee antes de publicar, así que es la que no puede mentir. */
          resumenDeLaOferta({
            producto,
            precioOferta: bloque.precioFinal,
            finEn,
            nombreDelLocal,
            soloEfectivo,
          })
        }
        advertencia="Desde que publicás, el POS ya cobra este precio."
      >
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
      </PieDeOferta>
    </div>
  );
}
