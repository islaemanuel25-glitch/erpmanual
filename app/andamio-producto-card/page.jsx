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

import SunmiProductoCard, { AccionTarjeta } from "@/components/sunmi/SunmiProductoCard";
import SunmiSelectorUnidad, { UNIDAD } from "@/components/sunmi/SunmiSelectorUnidad";
import { Eye, Pencil } from "lucide-react";
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

  // Ya no hay capa que abrir, así que la tarjeta no tiene estado. Lo único que
  // se guarda es qué botón se tocó último, para que se vea que responden.
  const [ultimo, setUltimo] = useState(null);
  const [modo, setModo] = useState(UNIDAD.PACK);

  return (
    <div className="sunmi-surface min-h-screen">
      <div className="mx-auto w-[360px]">
        <SunmiSelectorUnidad
          valor={modo}
          onCambiar={setModo}
          nota="Mostrando precio por bulto · los de kilo van por kg"
        />
        {/* Qué botón respondió último. Sin esto los botones del andamio no se
            distinguen de unos que no hacen nada, que es el error que ya costó
            una tanda. */}
        <div className="px-2.5 pt-2 text-xs sunmi-text-muted min-h-5">
          {ultimo ? `último toque: ${ultimo}` : "ningún botón tocado todavía"}
        </div>
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
            // LOS DOS BOTONES, CON MANEJADOR DE VERDAD.
            //
            // Acá hubo una vez un botón "Información" SIN manejador, o sea
            // decoración, y despistó: el informe dijo "la capa tiene los dos
            // botones" y la pantalla real salió con uno. Un botón de mentira en
            // un andamio no prueba que la acción exista.
            //
            // Por eso ahora los dos hacen algo visible —dejan dicho qué se tocó—
            // en vez de quedarse mudos. Es un andamio: no navega a ningún lado,
            // pero se nota si un botón no responde.
            acciones={
              <>
                <AccionTarjeta icono={Eye} onClick={() => setUltimo(`Ver ${p.id}`)}>
                  Ver
                </AccionTarjeta>
                <AccionTarjeta icono={Pencil} onClick={() => setUltimo(`Editar ${p.id}`)}>
                  Editar
                </AccionTarjeta>
              </>
            }
          />
        ))}
      </div>
    </div>
  );
}
