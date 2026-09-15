"use client";

// EL DETALLE DE UNA OFERTA ES LA MISMA PANTALLA QUE CREARLA, CON TODO CARGADO.
//
// ── POR QUÉ NO ES UNA PANTALLA PARECIDA ──────────────────────────────────
//
// Antes eran dos pantallas distintas: crear tenía los dos campos sincronizados,
// los chips y el pie anclado, y entrar a una oferta mostraba una tabla con dos
// botones —"Editar productos" y "Editar datos"— que abrían dos formularios más.
// Tres formas de tocar lo mismo.
//
// Ahora los bloques son LOS MISMOS componentes: `TarjetaDelProducto`,
// `BloqueDePrecio`, `BloqueDeDuracion`, `InterruptorSoloEfectivo` y
// `PieDeOferta`, y los dos campos se mueven con el mismo hook. Lo único que
// cambia son los botones del pie, porque dependen del estado.
//
// ── LO QUE SE VERIFICÓ ANTES DE DIBUJAR ──────────────────────────────────
//
// Las dos preguntas que había que contestar antes de poner campos que quizá no
// guardan, y las dos dieron que SÍ:
//
//   · EL PRECIO SE PUEDE EDITAR DESPUÉS DE PUBLICAR. Lo dice `[id]/lineas` con
//     su motivo: la oferta estaba en $900 y pasa a $950; desde ese momento las
//     ventas nuevas usan $950 y las anteriores NO cambian, porque cada venta
//     guardó su propio snapshot. Solo se bloquea sobre una FINALIZADA.
//   · EL CONJUNTO DE PRODUCTOS TAMBIÉN. La misma ruta concilia: agrega, cambia
//     y saca, revalidando choques con otras ofertas.
//
// Así que el bloque de precio va EDITABLE. Lo que no va es el buscador: el
// diseño no lo pide y la tarjeta del producto es fija.
//
// ── Y POR ESO UNA OFERTA DE VARIOS PRODUCTOS NO SE EDITA ACÁ ─────────────
//
// `[id]/lineas` recibe el CONJUNTO COMPLETO y borra lo que no viene. Esta
// pantalla manda una sola línea, así que sobre una oferta de dos productos
// guardar el precio BORRARÍA el otro. No es un riesgo teórico: es lo que haría.
//
// Con más de una línea, el bloque de precio no se dibuja y se dice por qué. El
// flujo del celular crea ofertas de UN producto; las de varias vienen de
// escritorio y se editan desde ahí.
//
// ── DOS GUARDADOS, PORQUE SON DOS RUTAS ──────────────────────────────────
//
// `PATCH /api/ofertas/[id]` guarda la ventana y la condición de pago;
// `PUT /api/ofertas/[id]/lineas` guarda el precio. Son dos llamadas y el botón
// es uno: si la primera falla, la segunda no sale, y se dice cuál falló.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import { useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiPill from "@/components/sunmi/SunmiPill";

import EstadoOfertaPill from "@/components/ofertas/EstadoOfertaPill";
import BloqueDePrecio from "@/components/ofertas/BloqueDePrecio";
import TarjetaDelProducto from "@/components/ofertas/TarjetaDelProducto";
import BloqueDeDuracion from "@/components/ofertas/BloqueDeDuracion";
import InterruptorSoloEfectivo from "@/components/ofertas/InterruptorSoloEfectivo";
import PieDeOferta from "@/components/ofertas/PieDeOferta";
import ModalConfirmarOferta from "@/components/ofertas/ModalConfirmarOferta";

import useBloqueDePrecioDeOferta from "@/hooks/useBloqueDePrecioDeOferta";
import { carteDeEliminar, carteDeFinalizar } from "@/lib/ofertas/confirmaciones";
import { margenInvalido } from "@/lib/ofertas/precioConMargen";
import { ESTADO_OFERTA } from "@/lib/ofertas/estados";
import { lineaDeCuando } from "@/lib/ofertas/tarjetaDeOferta";
import { pesos } from "@/lib/ofertas/formato";
import {
  DURACION_POR_DEFECTO,
  finDeLaOferta,
  money,
  resumenDeLaOferta,
  ultimoDiaVigente,
} from "@/lib/ofertas/crearOfertaMovil";
import { CONDICION_PAGO_OFERTA } from "@/lib/ofertas/vigencia";

const RUTA_OFERTAS = "/modulos/ofertas";

/**
 * EL DÍA QUE MUESTRA EL CAMPO DE FECHA, en el formato del input.
 *
 * No es `finEn`: es el ÚLTIMO DÍA VIGENTE. La ventana es semiabierta, así que
 * `finEn` es el día siguiente y ponerlo en el campo correría la oferta un día
 * cada vez que se abre y se guarda sin tocar nada.
 */
function diaParaElCampo(finEn) {
  const u = ultimoDiaVigente(finEn);
  if (!u) return "";
  // En hora argentina: a las 23:00 UTC ya es otro día allá.
  const ar = new Date(u.getTime() - 3 * 60 * 60 * 1000);
  return ar.toISOString().slice(0, 10);
}

export default function DetalleOfertaPage() {
  const router = useRouter();
  const params = useParams();
  const ofertaId = Number(params?.id);
  const { perfil, cargando } = useUser();

  useTituloDePagina("Oferta");

  const permisos = useMemo(() => perfil?.permisos || [], [perfil]);
  const esAdmin = permisos.includes("*");
  const puede = useCallback((c) => esAdmin || permisos.includes(c), [esAdmin, permisos]);
  const puedeVer = puede("ofertas.ver");
  const puedeEditar = puede("ofertas.editar");
  const puedeFinalizar = puede("ofertas.finalizar");
  const puedeEliminar = puede("ofertas.eliminar");

  const [oferta, setOferta] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(true);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(null);

  const [duracion, setDuracion] = useState("ELEGIR");
  const [fechaElegida, setFechaElegida] = useState("");
  const [soloEfectivo, setSoloEfectivo] = useState(false);

  const linea = oferta?.lineas?.length === 1 ? oferta.lineas[0] : null;
  const unSoloProducto = Boolean(linea);

  // La tarjeta del producto quiere los mismos campos que en la pantalla de
  // crear. Salen de la línea, que ya trae lo de HOY.
  const producto = linea
    ? {
        nombre: linea.nombre,
        precioNormal: linea.precioNormalActual ?? linea.precioNormalReferencia,
        costo: linea.costoActual ?? linea.costoReferencia,
        stock: linea.stock,
        escala: linea.escala,
        permiteVenderSinStock: linea.permiteVenderSinStock,
      }
    : null;

  const {
    margen, precio, origen, redondear, bloque,
    reponer, onMargen, onPrecio, onRedondear,
  } = useBloqueDePrecioDeOferta({ costo: producto?.costo, precioNormal: producto?.precioNormal });

  const finEn = useMemo(
    () => finDeLaOferta({ duracion, fechaElegida }),
    [duracion, fechaElegida]
  );

  const cargar = useCallback(async () => {
    setCargandoDetalle(true);
    setError(null);
    try {
      const res = await fetch(`/api/ofertas/${ofertaId}`, { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setOferta(null);
        setError(json?.error || `No se pudo abrir la oferta (HTTP ${res.status}).`);
        return;
      }
      setOferta(json.oferta);
      setSoloEfectivo(json.oferta.condicionPago === CONDICION_PAGO_OFERTA.SOLO_EFECTIVO);
      // ── LA DURACIÓN ARRANCA EN "ELEGIR", CON LA FECHA PUESTA ────────────
      //
      // Los chips son atajos para una oferta nueva. Una ya cargada puede
      // terminar cualquier día, así que adivinar qué chip le corresponde sería
      // inventar: se muestra la fecha real y los chips siguen ahí para
      // reemplazarla de un toque.
      setDuracion("ELEGIR");
      setFechaElegida(diaParaElCampo(json.oferta.finEn));
      const l = json.oferta.lineas?.length === 1 ? json.oferta.lineas[0] : null;
      if (l) {
        // El redondeo GUARDADO, si se registró. `null` es "no se registró", que
        // no es lo mismo que "no se redondeó": en ese caso queda el default.
        reponer({
          precio: l.precioOferta,
          margen: null,
          redondear: l.redondeoAplicado === null || l.redondeoAplicado === undefined
            ? undefined
            : l.redondeoAplicado,
        });
      }
    } catch (e) {
      setOferta(null);
      setError(`No se pudo hablar con el servidor: ${e.message}`);
    } finally {
      setCargandoDetalle(false);
    }
  }, [ofertaId, reponer]);

  useEffect(() => {
    if (puedeVer && Number.isInteger(ofertaId)) cargar();
  }, [puedeVer, ofertaId, cargar]);

  // Al reponer el precio hay que recalcular el margen: `reponer` deja los dos
  // campos como vinieron y el margen no viaja guardado —se deriva del costo de
  // HOY, que puede no ser el de cuando se cargó—.
  useEffect(() => {
    if (!linea || !producto?.costo) return;
    if (margen !== "" || precio === "") return;
    onPrecio(String(precio));
    // Solo cuando el precio ya está puesto y el margen todavía no: es el
    // arranque, no cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linea, producto?.costo, precio, margen]);

  const llamar = async (url, opciones) => {
    const res = await fetch(url, { credentials: "include", ...opciones });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      throw new Error(json?.error || `No se pudo completar la acción (HTTP ${res.status}).`);
    }
    return json;
  };

  const guardarCambios = async (publicar = false) => {
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      // 1 · la ventana y la condición de pago.
      await llamar(`/api/ofertas/${ofertaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finEn: finEn ? finEn.toISOString() : undefined,
          condicionPago: soloEfectivo
            ? CONDICION_PAGO_OFERTA.SOLO_EFECTIVO
            : CONDICION_PAGO_OFERTA.CUALQUIER_MEDIO,
        }),
      });

      // 2 · el precio. Solo si hay UNA línea: ver el encabezado.
      if (unSoloProducto && bloque.precioFinal != null) {
        await llamar(`/api/ofertas/${ofertaId}/lineas`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lineas: [{ productoLocalId: linea.productoLocalId, precioOferta: bloque.precioFinal }],
          }),
        });
      }

      if (publicar) {
        await llamar(`/api/ofertas/${ofertaId}/publicar`, { method: "POST" });
      }

      setAviso(publicar ? "Oferta publicada." : "Cambios guardados.");
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return null;
  if (!puedeVer) return <SinPermisos />;
  if (cargandoDetalle) return <SunmiLoader />;

  if (!oferta) {
    return (
      <div className="w-full min-h-full p-4">
        <div className="rounded-xl border sunmi-border-danger px-4 py-3 text-xs sunmi-text-danger">
          {error || "No se pudo abrir la oferta."}
        </div>
      </div>
    );
  }

  const esBorrador = oferta.estado === ESTADO_OFERTA.BORRADOR;
  const esFinalizada = oferta.estado === ESTADO_OFERTA.FINALIZADA;
  const acciones = oferta.acciones || {};
  // Guardar necesita que siga siendo una oferta: un precio que no baja del
  // normal no se puede publicar, y el margen negativo TIPEADO frena.
  const listo =
    puedeEditar &&
    !esFinalizada &&
    Boolean(finEn) &&
    (!unSoloProducto || (bloque.esOferta && !margenInvalido(margen, origen)));

  return (
    <div className="w-full min-h-full flex flex-col">
      <div className="flex-1 px-4 pt-4 pb-4 space-y-3.5 overflow-y-auto">
        {/* ── LA LÍNEA DE CONTEXTO ─────────────────────────────────────────
            Estaba apretada contra el título, en una cinta con el botón de
            volver al lado. Ahora es un renglón que se lee: el sello, el medio
            de pago, cuándo y dónde. */}
        <div className="flex flex-wrap items-center gap-2">
          <EstadoOfertaPill estado={oferta.estado} />
          {oferta.soloEfectivo && <SunmiPill color="slate">Solo efectivo</SunmiPill>}
        </div>
        <div className="text-sm3 sunmi-text-muted leading-snug">
          {lineaDeCuando(oferta)}
          {oferta.localNombre ? ` · ${oferta.localNombre}` : ""}
        </div>

        {/* ── EL PRODUCTO ──────────────────────────────────────────────── */}
        {producto && (
          <TarjetaDelProducto producto={producto} nombreDelLocal={oferta.localNombre} />
        )}

        {/* ── EL PRECIO ────────────────────────────────────────────────── */}
        {producto && !esFinalizada && (
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

        {/* UNA FINALIZADA NO SE EDITA: el servidor la rechaza, así que dibujar
            campos sería ofrecer algo que no guarda. Se muestra el precio que
            tuvo, que es lo que se viene a consultar. */}
        {producto && esFinalizada && (
          <section className="sunmi-bg-card rounded-xl2 border sunmi-border p-4 space-y-1">
            <div className="text-sm2 font-medium sunmi-text-muted">Precio que tuvo</div>
            <div className="text-xl2 font-semibold sunmi-text-strong tabular-nums">
              {pesos(linea.precioOferta)}
            </div>
            <div className="text-sm3 sunmi-text-muted">
              Una oferta terminada no se edita. Para volver a usarla, duplicala con Renovar.
            </div>
          </section>
        )}

        {/* VARIOS PRODUCTOS: no se edita el precio acá. El motivo está en el
            encabezado del archivo y no es de estilo — guardar borraría las
            otras líneas. */}
        {!unSoloProducto && (
          <section className="sunmi-bg-card rounded-xl2 border sunmi-border p-4 space-y-2">
            <div className="text-sm3 font-medium sunmi-text-strong">
              {oferta.cantidadProductos} productos en esta oferta
            </div>
            {(oferta.lineas || []).map((l) => (
              <div key={l.id} className="flex items-baseline justify-between gap-3">
                <span className="text-sm3 sunmi-text-muted">{l.nombre}</span>
                <span className="text-sm3 font-medium sunmi-text-strong tabular-nums">
                  {pesos(l.precioOferta)}
                </span>
              </div>
            ))}
            <div className="text-sm2 sunmi-text-muted leading-snug">
              Los precios de una oferta de varios productos se editan desde la pantalla de
              escritorio. Acá se pueden cambiar la fecha y el medio de pago.
            </div>
          </section>
        )}

        {/* ── HASTA CUÁNDO ─────────────────────────────────────────────── */}
        {!esFinalizada && (
          <BloqueDeDuracion
            duracion={duracion}
            fechaElegida={fechaElegida}
            finEn={finEn}
            onDuracion={setDuracion}
            onFechaElegida={setFechaElegida}
          />
        )}

        {/* ── SOLO EFECTIVO ────────────────────────────────────────────── */}
        {!esFinalizada && (
          <InterruptorSoloEfectivo valor={soloEfectivo} onChange={setSoloEfectivo} />
        )}

        {aviso && (
          <div className="rounded-xl border sunmi-border px-4 py-3 text-xs sunmi-text-success">
            {aviso}
          </div>
        )}
        {error && (
          <div className="rounded-xl border sunmi-border-danger px-4 py-3 text-xs sunmi-text-danger">
            {error}
          </div>
        )}
      </div>

      <PieDeOferta
        resumen={
          producto
            ? resumenDeLaOferta({
                producto,
                precioOferta: esFinalizada ? linea.precioOferta : bloque.precioFinal,
                finEn: esFinalizada ? oferta.finEn : finEn,
                nombreDelLocal: oferta.localNombre,
                soloEfectivo,
              })
            : `${oferta.cantidadProductos} productos · ${lineaDeCuando(oferta)}`
        }
        advertencia={
          esBorrador ? "Desde que publicás, el POS ya cobra este precio." : null
        }
      >
        {esFinalizada ? (
          <SunmiButton
            type="button"
            color="secondary"
            onClick={() => router.push(RUTA_OFERTAS)}
            className="flex-1 justify-center text-sm3 font-medium"
          >
            Volver a la lista
          </SunmiButton>
        ) : (
          <>
            <SunmiButton
              type="button"
              color="secondary"
              onClick={() => guardarCambios(false)}
              disabled={!listo || guardando}
              className="flex-1 justify-center text-sm3 font-medium"
            >
              {esBorrador ? "Guardar borrador" : "Guardar cambios"}
            </SunmiButton>

            {esBorrador ? (
              <SunmiButton
                type="button"
                color="primary"
                onClick={() => guardarCambios(true)}
                disabled={!listo || guardando}
                className="flex-1 justify-center text-sm3 font-medium"
              >
                {guardando ? "Guardando…" : "Publicar"}
              </SunmiButton>
            ) : (
              acciones.finalizar &&
              puedeFinalizar && (
                <SunmiButton
                  type="button"
                  color="amber"
                  onClick={() => setConfirmando("FINALIZAR")}
                  disabled={guardando}
                  className="flex-1 justify-center text-sm3 font-medium"
                >
                  Finalizar
                </SunmiButton>
              )
            )}
          </>
        )}
      </PieDeOferta>

      {/* BORRAR queda donde estaba: solo si el estado lo permite, y con su
          propio cartel. Va fuera del pie porque no es una de las dos acciones
          principales — es la salida de una oferta que todavía no rigió. */}
      {acciones.eliminar && puedeEliminar && (
        <div className="px-4 pb-4">
          <SunmiButton
            type="button"
            color="red"
            onClick={() => setConfirmando("ELIMINAR")}
            disabled={guardando}
            className="w-full justify-center text-sm3 font-medium"
          >
            Borrar esta oferta
          </SunmiButton>
        </div>
      )}

      <ModalConfirmarOferta
        abierto={confirmando !== null}
        cartel={
          confirmando === "FINALIZAR"
            ? carteDeFinalizar({ oferta, money: pesos })
            : confirmando === "ELIMINAR"
              ? carteDeEliminar({ oferta, money: pesos })
              : null
        }
        color={confirmando === "ELIMINAR" ? "red" : "amber"}
        trabajando={guardando}
        error={error}
        onCerrar={() => setConfirmando(null)}
        onConfirmar={async () => {
          setGuardando(true);
          setError(null);
          try {
            if (confirmando === "FINALIZAR") {
              await llamar(`/api/ofertas/${ofertaId}/finalizar`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              });
              setConfirmando(null);
              await cargar();
            } else if (confirmando === "ELIMINAR") {
              await llamar(`/api/ofertas/${ofertaId}`, { method: "DELETE" });
              setConfirmando(null);
              router.push(RUTA_OFERTAS);
            }
          } catch (e) {
            // El error se dibuja ADENTRO del cartel: cerrarlo dejaría el mensaje
            // detrás de un modal que ya no está.
            setError(e.message);
          } finally {
            setGuardando(false);
          }
        }}
      />
    </div>
  );
}
