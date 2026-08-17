# La bitácora anterior al 2026-08-09 está incompleta

**Quien lea `AuditoriaBitacora` buscando qué pasó antes del 2026-08-09 tiene que
saber esto: registra una parte de las escrituras, no todas.** No es una sospecha:
está medido contra producción, y el número está más abajo.

Esta nota existe para que dentro de un año nadie lea esa tabla como si fuera
completa. La ausencia de una fila NO prueba que la escritura no ocurrió.

## Qué pasó

El interceptor de escrituras acumula lo que se escribe en un buffer del request
y lo vuelca en una fila al final, usando `after()`. La referencia al cliente de
Prisma que hace ese volcado —`baseRef`— era una variable suelta del módulo.

Turbopack re-evalúa los módulos, y cada evaluación arranca con sus variables en
cero. `lib/prisma.js` cachea el cliente extendido en `global.prisma`, que sí
sobrevive a la re-evaluación; la referencia del interceptor no. Cuando el volcado
corría en una instancia del módulo que no había creado el cliente, `baseRef`
estaba en null, el `after()` salía por la puerta del `if` y no escribía nada.

Sin error, sin excepción, sin log. Silencio.

Arreglado en el commit `515a897` anclando la referencia en `globalThis`, que es
lo que ya se había hecho con el `AsyncLocalStorage` de `contexto.js` por la misma
razón.

## Cuánto falta, medido

Medición del 2026-08-09 contra producción, en lectura, sobre los últimos 30 días.

**Enumerado:** los nueve modelos salen de la lista blanca de
`lib/auditoria/interceptor.js`. El universo de escrituras se toma de un hecho del
propio dato —`updatedAt`, que Prisma sella en cada escritura— y se compara contra
las filas de `AuditoriaBitacora` de la misma ventana.

- A nivel de ENTIDAD, la cobertura parece del 99,6 %: 1269 productos editados
  contra 1264 entidades distintas registradas. **Ese número engaña**: contar
  entidades distintas no ve un evento faltante en una entidad que tiene otros.
- A nivel de EVENTO —¿hay una fila de bitácora del producto cerca del instante de
  su última escritura?—: de **811 productos con su última escritura en la
  ventana, 451 no tienen rastro. El 56 %.**
- De esos 451, **265** caen en los seis minutos de las aplicaciones de listas de
  proveedor del 5 y 6 de agosto. Los otros **186** están repartidos en 91
  momentos distintos de 19 días distintos: actividad normal, no un lote.

### Lo que la medición no puede ver

- **Los borrados.** La fila ya no está y no deja `updatedAt`. Afecta sobre todo a
  `PosTransferencia`, que solo audita borrados.
- **Las escrituras anteriores a la última de cada entidad.** `updatedAt` guarda
  una sola fecha, así que 451 es un piso y no un techo.
- **`OperadorEnLocal`**, que no tiene ninguna marca de tiempo en el schema.
- **Los scripts**, que por diseño no auditan: sin request no hay contexto y el
  interceptor los deja pasar. Parte de esos 186 puede ser eso.
- **Las escrituras que no cambiaron ningún valor**: sellan `updatedAt` igual y la
  bitácora las descarta a propósito. También pueden ser parte de los 186.

## Los lugares que mueven costos

**El título decía "los DOS lugares" y la lista tiene TRES.** Se sacó el número el
2026-08-17 en vez de cambiarlo por otro: contar los ítems de esta lista no prueba
que sean todos los que hay, y cuántos son de verdad no se relevó. Un número que
nadie midió es peor que ninguno.

Los costos de producto no se escriben solo desde la ficha del producto:

1. `app/api/productos/editar/[id]` y `crear`, y la importación masiva
   `productos/import/apply`.
2. **Compras a proveedor**, por `lib/compras-proveedor/costoMaestro.js`, llamado
   **solo desde `compras-proveedor/recibir/[id]`**, y ahí adentro de un
   `if (escribeCosto)`. Escribe el costo maestro y **recalcula el precio de venta
   en todas las ubicaciones**.

   **CORREGIDO EL 2026-08-17.** Este punto decía "llamado desde
   `compras-proveedor/crear` y `compras-proveedor/editar-item`". Fue cierto hasta
   el 2026-08-10: `ed52991` sacó la propagación de las rutas de pedido, porque un
   pedido registra lo que se PIDIÓ y el costo real recién se conoce cuando llega
   la mercadería. Reverificado contra el árbol el 2026-08-17, enumerando las 26
   rutas del módulo de forma recursiva: ninguna otra lo llama.

   **La evidencia con datos de abajo NO se borra, se fecha**, porque prueba algo
   que era verdad entonces: el 2026-08-07 a las 11:56:46 se escribieron 6
   productos que son exactamente 6 líneas del pedido 217, creado a las 11:56:45.
   Eso ocurrió tres días ANTES del cambio, con `crear` todavía propagando. Hoy ese
   mismo pedido no escribiría nada hasta recibirse.
3. `proveedores/listas/[id]/aplicar`, que además arrastra la venta por margen.

## Lo que queda pendiente

- Confirmar si las escrituras dentro de una transacción interactiva —que es como
  escribe la aplicación de listas— quedan registradas ahora que el volcado
  funciona. Antes del arreglo no se podía medir en desarrollo.
- Volver a correr la medición a nivel de evento sobre las escrituras NUEVAS. Hoy
  da 451 sin rastro sobre 811; después del arreglo tiene que dar cerca de cero.
  Los 186 repartidos son la parte que hay que mirar, no solo el lote de las
  aplicaciones.

**Lo perdido no se reconstruye.** No hay forma de saber quién hizo cada una de
esas escrituras: la información nunca se guardó. Lo único que se puede hacer es
lo que hace esta nota: dejar dicho hasta dónde llega la tabla.
