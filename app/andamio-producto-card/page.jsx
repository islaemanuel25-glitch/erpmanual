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
import TarjetaProductoMovil from "@/components/productos/TarjetaProductoMovil";
import { Eye, Pencil } from "lucide-react";
import { formatearMoneda } from "@/lib/moneda";
import { etiquetaEscalaPrecio } from "@/lib/precios/escalaPrecio";
import { carasDeTarjeta } from "@/lib/productos/carasDeTarjeta";
import {
  ESCALA_BULTO,
  ESCALA_KG,
  ESCALA_PIEZA,
  ESCALA_UNIDAD,
} from "@/lib/precios/escalaDeVenta";

/**
 * ── LOS CUATRO CASOS DE DORSO, UNO POR CADA FORMA QUE PUEDE TENER ─────────
 *
 * Y los dos del medio —kilo y pieza fija— son los que NO EXISTEN en la base de
 * desarrollo, así que sin este fixture su dorso no se puede abrir ni mirar.
 *
 * Las caras salen de `carasDeTarjeta`, o sea de las funciones del POS: lo que el
 * andamio fabrica es la ENTRADA, nunca la respuesta. Escribir a mano lo que cada
 * cara tiene que decir es exactamente lo que hizo que este andamio tapara tres
 * defectos la primera vez.
 */
const CARAS = [
  {
    id: "pack",
    nombre: "361 LATA X24",
    empresa: "Colombres",
    codigoBarra: "7790580132286",
    codigoInterno: "1254",
    caras: carasDeTarjeta({
      escala: ESCALA_BULTO,
      precio: 24500,
      costo: 20000,
      factor: 24,
      unidad: "pack",
    }),
  },
  {
    id: "kilo",
    nombre: "QUESO SARDO LA PAULINA HORMA ENTERA X KG",
    empresa: "La Paulina Alimentos S.A.",
    codigoBarra: "7791234998877",
    codigoInterno: "30112",
    caras: carasDeTarjeta({ escala: ESCALA_KG, precio: 1300, costo: 900, unidad: "kg" }),
  },
  {
    id: "pieza",
    nombre: "PALETA COCIDA PIEZA FIJA",
    empresa: "Paladini",
    codigoBarra: null,
    codigoInterno: null,
    caras: carasDeTarjeta({
      escala: ESCALA_PIEZA,
      precio: 1000,
      costo: 800,
      unidad: "kg",
      pesoReferenciaKg: 6,
    }),
  },
  {
    id: "suelto",
    nombre: "Yerba mate Playadito 1 kg",
    empresa: "Cooperativa Liebig",
    codigoBarra: "7792200000123",
    codigoInterno: "40219",
    // Sin conversión: su dorso existe solo por la identificación.
    caras: carasDeTarjeta({
      escala: ESCALA_UNIDAD,
      precio: 4850,
      costo: 3600,
      factor: 1,
      unidad: "unidad",
    }),
  },
];

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

  // La columna del andamio: 360 px, que es el ancho para el que la tarjeta está
  // diseñada. Se define UNA vez y la usan los tres bloques — repetirla era el
  // mismo número escrito tres veces, y el día que se mida a otro ancho quedarían
  // dos bloques a 360 y uno a otra cosa.
  const COLUMNA = "mx-auto w-[360px]";
  const LISTA = `${COLUMNA} px-2.5 flex flex-col gap-[9px]`;

  return (
    <div className="sunmi-surface min-h-screen">
      <div className={COLUMNA}>
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
      {/* ── LAS DOS CARAS, CON FIXTURE DETERMINÍSTICO ────────────────────────
          Estas tarjetas son las del CATÁLOGO —`TarjetaProductoMovil`, con su
          frente y su dorso— y no la pieza pelada del kit.

          Están acá por un motivo concreto: **el dorso de kilo y de pieza fija no
          se puede ejercer con los datos de desarrollo.** No hay ningún producto
          por kilo ni ningún fiambre de pieza fija en la base, así que la sonda
          del navegador los informa como NO EJERCIDOS — y ahí vivía el defecto de
          esta pasada, un dorso que decía "Importe variable" sobre un producto que
          sí tiene precio.

          Los datos son de mentira y se ven, pero las CARAS no: salen de
          `carasDeTarjeta` con las mismas funciones del POS. Lo que el andamio
          fabrica es la entrada, no la respuesta — que es la diferencia entre
          ejercer un caso y dibujarlo. */}
      <div className={`${LISTA} pt-4`}>
        <div className="text-xs sunmi-text-muted">
          Tarjeta del catálogo, con sus dos caras. Tocá la flecha para dar vuelta.
        </div>
        {CARAS.map((c) => (
          <TarjetaProductoMovil
            key={c.id}
            nombre={c.nombre}
            empresa={c.empresa}
            codigoBarra={c.codigoBarra}
            codigoInterno={c.codigoInterno}
            caras={c.caras}
            muestraCosto
            onEditar={() => setUltimo(`Editar ${c.id}`)}
          />
        ))}
      </div>

      <div className={`${LISTA} pb-6 pt-6`}>
        <div className="text-xs sunmi-text-muted">
          Pieza pelada del kit, sin las caras.
        </div>
        {PRODUCTOS.map((p) => (
          <SunmiProductoCard
            key={p.id}
            nombre={p.nombre}
            empresa={p.empresa}
            codigoBarra={p.codigoBarra}
            codigoInterno={p.codigoInterno}
            // ── LA FRANJA DE EQUIVALENCIA SE FUE DE LA PIEZA ────────────────
            //
            // Acá se le pasaba `equivalencia`, derivada con `lineaDeEquivalencia`.
            // El kit dejó de tener ese bloque: la presentación viaja pegada al
            // precio y la otra escala vive en el dorso, que administra
            // `TarjetaProductoMovil` —el envoltorio del catálogo, no la pieza—.
            //
            // Este andamio sigue montando la PIEZA pelada, que es para lo que
            // sirve: comprobar que el núcleo dibuja sin sesión ni datos reales.
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
