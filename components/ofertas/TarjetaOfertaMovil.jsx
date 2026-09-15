"use client";

import { Pencil } from "lucide-react";

import SunmiProductoCard, {
  AccionTarjeta,
  BloqueValorTarjeta,
  NumeroBloqueValor,
  RotuloBloqueValor,
} from "@/components/sunmi/SunmiProductoCard";
import SunmiPill from "@/components/sunmi/SunmiPill";
import { money } from "@/lib/ofertas/crearOfertaMovil";
import {
  lineaDeCuando,
  renglonesDeComparacion,
  selloDeOferta,
} from "@/lib/ofertas/tarjetaDeOferta";

// LA TARJETA DE UNA OFERTA EN LA LISTA DEL CELULAR.
//
// ── ESTA PIEZA NO DIBUJA UNA TARJETA: ADAPTA OFERTAS A LA DEL KIT ─────────
//
// Es exactamente lo que hace `TarjetaStockMovil`, y por el mismo motivo. La
// tarjeta la dibuja `SunmiProductoCard` —la MISMA que usan el catálogo y stock—
// y acá solo se decide QUÉ va en cada ranura. No hay un píxel propio: ni un
// padding, ni un radio, ni un color.
//
// ── LO QUE VA EN CADA RANURA ─────────────────────────────────────────────
//
//   nombre      el producto. En el flujo móvil el nombre de la oferta ES el del
//               producto —lo pone el servidor al crear— así que no hay dos.
//   empresa     la línea de CUÁNDO: "Termina mañana", "Arranca el sábado 19",
//               con " · Solo efectivo" pegado si corresponde. Es la ranura del
//               renglón chico debajo del nombre; que en el catálogo sea el
//               proveedor no la ata a eso, igual que stock la usa para lo suyo.
//   marca       dos renglones cortos: "Normal $ 3.700,00" y "11 % menos". El
//               importe lleva los centavos porque pasa por `money`, el MISMO
//               formateador del módulo: una segunda forma de escribir plata es
//               cómo empiezan a discrepar dos pantallas. Entran en
//               la mitad izquierda de la fila del valor SIN costar un renglón,
//               que es la única forma de agregarle algo a esta tarjeta.
//   valor       el precio de oferta, con su rótulo.
//   aviso       null. El estado va en la píldora — ver abajo.
//   destacado   la píldora de estado.
//   códigos     los dos en `false`: esta pantalla no los muestra, y `false` es
//               "no va" mientras que `null` sería "no hay dato" y dejaría el
//               renglón diciendo "sin código de barras".
//   acciones    UNA sola: Editar, a lo ancho, igual que la del catálogo.
//
// ── POR QUÉ UNA SOLA ACCIÓN, Y NO DOS ────────────────────────────────────
//
// Tenía dos —"Terminar ahora" y "Editar"— y con dos la píldora de estado, que el
// kit pone absoluta abajo a la derecha, se montaba sobre el texto del SEGUNDO
// botón. Medido a 390 px: PROGRAMADA tapaba 35 px, VENCE HOY 21 y ACTIVA 0.
//
// El detalle importa: dependía del LARGO de la palabra, así que el choque
// aparecía en unas tarjetas y en otras no — que es lo que lo hacía fácil de
// pasar por alto y difícil de reproducir.
//
// Con una sola acción el botón ocupa el ancho entero y su texto queda centrado,
// lejos de la esquina donde vive la píldora. El problema desaparece sin tocar el
// kit —que dibuja también el catálogo y stock— y sin acortar ninguna palabra.
//
// Terminar la oferta se hace desde el DETALLE, que es a donde lleva Editar, y
// que ya tenía su acción de finalizar para los cuatro estados que la admiten.
//
// ── EL ESTADO VA EN LA PÍLDORA Y NO EN `aviso` ───────────────────────────
//
// `aviso` sale SIEMPRE en ámbar y con triángulo, fijo en la pieza del kit. Poner
// ACTIVA en verde ahí obligaría a que la tarjeta aceptara un color, y eso cambia
// `SunmiProductoCard` —que dibuja también el catálogo y stock— por una necesidad
// de esta pantalla.
//
// `destacado` ya es la ranura para un sello: recibe el nodo entero, así que el
// color lo decide quien la usa. Es la que el catálogo usa para "último editado".
//
// ── LA PÍLDORA VA ABAJO A LA DERECHA, Y AHORA NO TAPA NADA ───────────────
//
// Es donde el kit la pone, absoluta y sin ocupar alto. Con una sola acción
// centrada a lo ancho, esa esquina queda vacía —exactamente como en el
// catálogo—, así que la píldora no se monta sobre ningún texto. El arnés lo
// mide en los tres estados y se pone rojo si vuelve a haber superposición.

export default function TarjetaOfertaMovil({
  oferta,
  ahora = undefined,
  puedeEditar = false,
  onEditar,
}) {
  if (!oferta) return null;

  const sello = selloDeOferta(oferta, ahora ?? new Date());
  const cuando = lineaDeCuando(oferta, ahora ?? new Date());
  const { normal, descuento } = renglonesDeComparacion({
    precioNormal: oferta.precioNormal,
    precioOferta: oferta.precioOferta,
    money,
  });

  // Una oferta de VARIOS productos no tiene "el" precio. En vez de mostrar el de
  // uno como si fuera el de la oferta —una afirmación falsa sobre los otros— el
  // bloque no se dibuja y la marca dice cuántos hay.
  const hayPrecio = oferta.precioOferta != null;

  return (
    <SunmiProductoCard
      ancla={`oferta:${oferta.id}`}
      nombre={oferta.producto || oferta.nombre}
      empresa={cuando}
      codigoBarra={false}
      codigoInterno={false}
      destacado={sello ? <SunmiPill color={sello.color}>{sello.texto}</SunmiPill> : null}
      marca={
        hayPrecio ? (
          <span className="flex min-w-0 flex-col items-start gap-1 leading-tight">
            {normal && <span className="text-xs sunmi-text-muted">{normal}</span>}
            {descuento && <span className="text-xs sunmi-text-muted">{descuento}</span>}
          </span>
        ) : (
          <span className="text-xs sunmi-text-muted whitespace-nowrap">
            {oferta.cantidadProductos}{" "}
            {oferta.cantidadProductos === 1 ? "producto" : "productos"}
          </span>
        )
      }
      valor={
        hayPrecio ? (
          <BloqueValorTarjeta className="flex-col justify-center">
            <RotuloBloqueValor className="sunmi-text-muted">PRECIO DE OFERTA</RotuloBloqueValor>
            <NumeroBloqueValor>{money(oferta.precioOferta)}</NumeroBloqueValor>
          </BloqueValorTarjeta>
        ) : null
      }
      aviso={null}
      acciones={
        puedeEditar ? (
          <AccionTarjeta icono={Pencil} onClick={() => onEditar?.(oferta)}>
            Editar
          </AccionTarjeta>
        ) : null
      }
    />
  );
}
