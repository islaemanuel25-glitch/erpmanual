"use client";

// LOS DOS CAMPOS SINCRONIZADOS, CON SU ESTADO.
//
// ── POR QUÉ ES UN HOOK Y NO UN COMPONENTE CON ESTADO ADENTRO ─────────────
//
// `BloqueDePrecio` dibuja y no guarda nada: recibe los valores y avisa qué se
// tocó. Eso está bien y no se cambia — pero entonces los tres manejadores
// —margen, precio, interruptor— viven en la pantalla, y son treinta líneas que
// la de crear y la de detalle necesitan IGUALES.
//
// Copiarlas sería el caso exacto que la regla 1 del proyecto nombra: dos
// funciones que hacen lo mismo no se rompen el día que se escriben, se rompen el
// día que una cambia.
//
// Un componente con el estado adentro tampoco servía: la pantalla de crear
// necesita leer `margen` y `precio` para guardarlos en `sessionStorage`, y la de
// detalle para saber si hay cambios sin guardar. El estado tiene que quedar
// arriba; lo que se comparte es CÓMO se mueve.
//
// ── QUÉ HACE, EN UNA LÍNEA ───────────────────────────────────────────────
//
// Cuando se toca un campo, el OTRO se recalcula. El tocado vuelve tal cual —por
// eso existe `origen`—, porque reescribirlo debajo del dedo es lo que hace que
// no se pueda tipear "12" sin que salte a "1" y vuelva con el cursor movido.

import { useCallback, useState } from "react";

import { estadoInicial, resolverBloque } from "@/lib/ofertas/precioConMargen";

export default function useBloqueDePrecioDeOferta({ costo, precioNormal } = {}) {
  const [margen, setMargen] = useState("");
  const [precio, setPrecio] = useState("");
  // EL ÚLTIMO CAMPO TOCADO. Es lo que decide cuál NO se reescribe.
  const [origen, setOrigen] = useState("PRECIO");
  // ENCENDIDO POR DEFECTO, como el POS redondea el precio unitario.
  const [redondear, setRedondear] = useState(true);

  const bloque = resolverBloque({ origen, margen, precio, costo, precioNormal, redondear });

  /**
   * ARRANCA EN EL MARGEN REAL DE HOY, no vacío: así se ve de dónde se parte y
   * cuánto se resigna al bajar. Ese estado NO es una oferta —es el precio
   * normal— y por eso Publicar sigue apagado.
   *
   * Lo usa la pantalla de crear al elegir un producto. La de detalle NO lo
   * llama: ahí los valores salen de la oferta guardada.
   */
  const arrancarEn = useCallback(({ precioNormal: pn, costo: c }) => {
    const ini = estadoInicial({ precioNormal: pn, costo: c });
    setMargen(ini.margen == null ? "" : String(ini.margen));
    setPrecio(ini.precio == null ? "" : String(ini.precio));
    setOrigen("PRECIO");
  }, []);

  /** Repone un par ya conocido —de `sessionStorage` o de la oferta guardada—. */
  const reponer = useCallback(({ margen: m, precio: p, redondear: r }) => {
    setMargen(m == null ? "" : String(m));
    setPrecio(p == null ? "" : String(p));
    if (r !== undefined) setRedondear(r !== false);
    setOrigen("PRECIO");
  }, []);

  const onMargen = useCallback(
    (v) => {
      setOrigen("MARGEN");
      setMargen(v);
      // El OTRO campo se recalcula. Se hace acá y no adentro del componente para
      // que el estado siga viviendo en un solo lugar.
      const r = resolverBloque({ origen: "MARGEN", margen: v, costo, precioNormal, redondear });
      setPrecio(r.precioFinal == null ? "" : String(r.precioFinal));
    },
    [costo, precioNormal, redondear]
  );

  const onPrecio = useCallback(
    (v) => {
      setOrigen("PRECIO");
      setPrecio(v);
      const r = resolverBloque({ origen: "PRECIO", precio: v, costo, precioNormal, redondear });
      setMargen(r.margenReal == null ? "" : String(r.margenReal));
    },
    [costo, precioNormal, redondear]
  );

  const onRedondear = useCallback(
    (v) => {
      setRedondear(v);
      // Al cambiar el interruptor se recalcula desde el campo que se tocó
      // último: si no, el precio quedaría con el redondeo viejo.
      const r = resolverBloque({ origen, margen, precio, costo, precioNormal, redondear: v });
      if (origen === "MARGEN") setPrecio(r.precioFinal == null ? "" : String(r.precioFinal));
      else setMargen(r.margenReal == null ? "" : String(r.margenReal));
    },
    [origen, margen, precio, costo, precioNormal]
  );

  return {
    margen,
    precio,
    origen,
    redondear,
    bloque,
    setMargen,
    setPrecio,
    setRedondear,
    arrancarEn,
    reponer,
    onMargen,
    onPrecio,
    onRedondear,
  };
}
