"use client";

import { Pencil, Square } from "lucide-react";

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
//   marca       dos renglones cortos: "Normal $ 3.700" y "11 % menos". Entran en
//               la mitad izquierda de la fila del valor SIN costar un renglón,
//               que es la única forma de agregarle algo a esta tarjeta.
//   valor       el precio de oferta, con su rótulo.
//   aviso       null. El estado va en la píldora — ver abajo.
//   destacado   la píldora de estado.
//   códigos     los dos en `false`: esta pantalla no los muestra, y `false` es
//               "no va" mientras que `null` sería "no hay dato" y dejaría el
//               renglón diciendo "sin código de barras".
//   acciones    Terminar ahora y Editar, cada una sujeta a su permiso.
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
// ── LA PÍLDORA VA ABAJO A LA DERECHA, SOBRE LA FRANJA DE ACCIONES ────────
//
// Es donde el kit la pone, absoluta y sin ocupar alto. En el catálogo esa zona
// está vacía porque "Editar" va centrado; acá hay DOS acciones, así que el
// segundo botón queda debajo de la píldora. Está medido en el arnés y el ancho
// de la píldora no alcanza a tapar el texto de la acción — si algún día lo
// tapara, se mueve de lugar y se avisa, no se cambia el kit.

export default function TarjetaOfertaMovil({
  oferta,
  ahora = undefined,
  puedeFinalizar = false,
  puedeEditar = false,
  onTerminar,
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
        puedeFinalizar || puedeEditar ? (
          <>
            {puedeFinalizar && (
              <AccionTarjeta icono={Square} onClick={() => onTerminar?.(oferta)}>
                Terminar ahora
              </AccionTarjeta>
            )}
            {puedeEditar && (
              <AccionTarjeta icono={Pencil} onClick={() => onEditar?.(oferta)}>
                Editar
              </AccionTarjeta>
            )}
          </>
        ) : null
      }
    />
  );
}
