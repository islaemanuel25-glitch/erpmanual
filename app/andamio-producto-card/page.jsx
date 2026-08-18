"use client";

// ANDAMIO de `SunmiProductoCard` — la tarjeta de producto y su capa de acciones.
//
// Monta la pieza SOLA, a 360 px, que es el ancho para el que está diseñada. Sin
// esto la única forma de verla sería dentro del catálogo, y ahí no se puede
// aislar qué mueve la tarjeta y qué mueve la pantalla.
//
// LOS DOS CASOS DIFÍCILES ESTÁN PUESTOS A PROPÓSITO, porque son los que rompen
// una tarjeta: un nombre largo en mayúsculas —que tiene que envolver en varias
// líneas y hacer crecer la tarjeta— y un precio de cinco cifras con decimales,
// que NO se puede partir en dos renglones.
//
// Los datos son de mentira y se ven: no salen de la base ni pretenden ser un
// producto real.
//
// ── PERO TIENEN LA FORMA DEL DATO REAL, Y ESO NO ES ADORNO ────────────────
//
// Acá el sufijo y la línea de equivalencia estaban escritos A MANO, como dos
// cadenas sueltas: `sufijo: "/ pack"` y `equivalencia: "1 pack = 6 un · …"`.
// Eso hizo que este andamio TAPARA el defecto más grave de la tanda.
//
// En producción los dos salen del MISMO campo —el precio— y por eso pueden
// contradecirse: la pantalla rotulaba el número como unitario mientras lo
// dividía por el factor para armar la equivalencia. Acá esa contradicción era
// imposible de ver, porque no había un campo del que los dos salieran: había dos
// textos escritos por la misma persona, y coincidían porque los escribió juntos.
//
// Ahora los productos de mentira traen `precio`, `unidadMedida` y `factorPack`,
// y las dos cosas se derivan de ahí con las mismas funciones que usa el catálogo.
// Si alguna vuelve a contradecir a la otra, se ve acá primero.

import { useState } from "react";
import { notFound } from "next/navigation";

import SunmiProductoCard from "@/components/sunmi/SunmiProductoCard";
import SunmiSelectorUnidad, { UNIDAD } from "@/components/sunmi/SunmiSelectorUnidad";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { formatearMoneda, lineaDeEquivalencia } from "@/lib/moneda";
import { etiquetaEscalaPrecio } from "@/lib/precios/escalaPrecio";

const PRODUCTOS = [
  {
    id: 1,
    // EL CASO LARGO: mayúsculas y sin espacios cortos donde cortar.
    nombre: "QUESO SARDO LA PAULINA HORMA ENTERA X KG",
    empresa: "La Paulina Alimentos S.A.",
    // EL CASO DEL PRECIO: cinco cifras y dos decimales, en una sola línea.
    // Va como NÚMERO: lo formatea `lib/moneda.js`, que es el único formateador.
    precio: 128864.36,
    unidadMedida: "pack",
    factorPack: 6,
    codigoBarra: "7790580123456",
    codigoInterno: "10453",
  },
  {
    id: 2,
    nombre: "Bon o Bon Bombón Relleno 15 g",
    empresa: "Arcor",
    precio: 3499,
    unidadMedida: "pack",
    factorPack: 6,
    codigoBarra: "7790040112233",
    codigoInterno: "20871",
  },
  {
    id: 3,
    nombre: "Jamón cocido natural",
    empresa: "Paladini",
    precio: 1298,
    unidadMedida: "kg",
    factorPack: null,
    codigoBarra: "7791234998877",
    codigoInterno: "30112",
  },
  {
    // EL CASO SUELTO, que faltaba: es el único donde "por unidad" es cierto, y
    // sin él el andamio no muestra nunca la etiqueta que lleva la mitad del
    // catálogo real.
    id: 4,
    nombre: "Yerba mate Playadito 1 kg",
    empresa: "Cooperativa Liebig",
    precio: 4850,
    unidadMedida: "unidad",
    factorPack: null,
    codigoBarra: "7792200000123",
    codigoInterno: "40219",
  },
];

export default function AndamioProductoCard() {
  // GUARDIA DE ENTORNO — ver `scripts/andamiosNoSeCommitean.test.mjs`.
  if (process.env.NODE_ENV === "production") notFound();

  // Una sola tarjeta abierta a la vez: abrir otra cierra la anterior.
  const [abierta, setAbierta] = useState(null);
  const [modo, setModo] = useState(UNIDAD.PACK);

  return (
    <div className="sunmi-surface min-h-screen">
      <div className="mx-auto w-[360px]">
        <SunmiSelectorUnidad
          valor={modo}
          onCambiar={setModo}
          nota="Mostrando precio por bulto · los de kilo van por kg"
        />
      </div>
      <div className="mx-auto w-[360px] px-2.5 pb-6 pt-2 flex flex-col gap-[9px]">
        {PRODUCTOS.map((p) => (
          <SunmiProductoCard
            key={p.id}
            nombre={p.nombre}
            empresa={p.empresa}
            // Derivada del precio y del factor, con la misma función que el
            // catálogo. No es un texto escrito al lado — ver el encabezado.
            equivalencia={lineaDeEquivalencia({
              precio: p.precio,
              factor: p.factorPack,
              unidad: p.unidadMedida,
            })}
            codigoBarra={p.codigoBarra}
            codigoInterno={p.codigoInterno}
            abierta={abierta === p.id}
            onToggle={() => setAbierta((a) => (a === p.id ? null : p.id))}
            valor={
              <>
                <span className="text-[22px] font-bold sunmi-text-strong whitespace-nowrap [font-variant-numeric:tabular-nums] tracking-[-.01em]">
                  {formatearMoneda(p.precio)}
                </span>
                <span className="text-[11.5px] sunmi-text-muted">
                  {etiquetaEscalaPrecio(p.unidadMedida)}
                </span>
              </>
            }
            // UN SOLO BOTÓN, Y ES EL QUE EXISTE.
            //
            // Acá había además uno rotulado "Información" **sin manejador**, o
            // sea decoración. Despistó de verdad: el informe de la tanda dijo
            // "la capa tiene los dos botones", la pantalla real salió con uno
            // solo, y la diferencia se leyó como una regresión del cableado
            // cuando en el ERP **no existe ninguna acción de Información** —las
            // que existen para una fila son Ver composición, Editar combo,
            // Activar, Subir al depósito, Editar y Eliminar—.
            //
            // Un botón de mentira en un andamio no prueba que la acción exista:
            // prueba que el kit sabe dibujar dos botones, que no era la pregunta.
            //
            // VUELVE cuando se construya la pantalla de ficha completa del
            // handoff, que es la que le daría a dónde ir. Hasta entonces no se
            // dibuja, ni siquiera acá.
            acciones={
              <SunmiButton color="primary" type="button">
                Editar
              </SunmiButton>
            }
          />
        ))}
      </div>
    </div>
  );
}
