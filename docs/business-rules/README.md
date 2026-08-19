# Reglas de negocio

Una regla entra acá **solo si se puede señalar en un archivo**. Si no hay archivo
y línea, no es una regla: es una impresión.

## Cómo se etiqueta

- **[CÓDIGO]** — implementada, con archivo y función. La fuente de verdad.
- **[DOC]** — afirmada en documentación, **sin** confirmar contra el código.
- **[CÓDIGO+DOC]** — las dos coinciden.
- **[CONTRADICCIÓN]** — código y documentación dicen cosas distintas. **No se
  elige una en silencio**: se registra que hay dos versiones y quién dice qué.

Una implementación no es automáticamente una regla de negocio. Que el código haga
algo puede ser una decisión deliberada o un accidente que nadie miró. Cuando no
está claro cuál de las dos es, va como **[ACCIDENTE POSIBLE]** y no como regla.

## Los archivos

- [deposito-y-local.md](deposito-y-local.md) — quién ve qué, quién crea qué, quién
  manda sobre el costo. Es la raíz de casi todo lo demás.
- [costos-y-precios.md](costos-y-precios.md) — quién puede escribir un costo, cómo
  se propaga, cómo se calcula un precio de venta.
- [deposito-vende-al-costo.md](deposito-vende-al-costo.md) — **la lista "Costo"
  del depósito NO es un error de configuración.** Está a propósito y tiene una
  condición futura para saber cuándo deja de tener sentido. Leerlo antes de
  tocarla.
- [caja-y-turnos.md](caja-y-turnos.md) — cuándo se puede vender, qué es un turno
  abierto, cómo se cierra una caja.
- [contradicciones.md](contradicciones.md) — **empezá por acá si vas a tocar
  algo.** Los lugares donde el repo se contradice a sí mismo.

## Lo que NO está acá

Las reglas del POS de venta (pagos, servicios, descuentos, puntos) están
identificadas y verificadas pero todavía no volcadas: son muchas y merecen su
propio archivo. Están enumeradas en el relevamiento y listadas como pendiente en
[../roadmap/README.md](../roadmap/README.md).
