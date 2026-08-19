# El depósito vende al costo, y es a propósito

**NO ES UN ERROR DE CONFIGURACIÓN. No lo "corrijas".**

Decidido por Emanuel, anotado el 2026-08-19. Este archivo existe porque la
configuración se ve exactamente igual que un error, y ya hizo dudar dos veces.

## Qué está configurado

`GrupoDeposito.listaPrecioDefaultId` apunta a la lista **2, "Costo"**, que es
`tipoBase = COSTO` con `margenPorcentaje = 0`. `calcularPrecioConLista` la
resuelve como `COSTO_PURO`.

Consecuencia: en el depósito, **una venta sin cliente —o con un cliente que no
tenga lista propia— se cobra al costo**. Medido sobre la copia con datos reales:
**2.021 de 2.047 filas activas del depósito** tienen un precio de POS distinto
del `precio_venta` guardado, y en 1.991 el POS cobra MENOS, un 12,9 % menos en
promedio.

Con un cliente que sí tiene lista asignada gana la suya: son 6 clientes.

## Por qué

El fin es que **los locales que trabajan con el depósito reciban la mercadería al
costo**. Esa es la relación: el depósito no le saca ganancia al local, la ganancia
la hace el local al vender al público.

Hoy eso no se logra del todo por transferencias, porque **hay locales que no están
en el sistema** y a esos se les VENDE. Y también se les vende al costo — de ahí
la lista. La lista es el mecanismo que hace que la venta a un local externo salga
al mismo precio que saldría una transferencia.

## LA CONDICIÓN FUTURA — leer antes de tocar la lista

**El día que todos los locales estén en el sistema y el movimiento pase a ser por
transferencia, esta lista deja de tener sentido como venta**, porque una
transferencia no es una venta.

O sea que la lista no es permanente: es correcta MIENTRAS exista el caso de
locales fuera del sistema. Lo que la vuelve innecesaria no es un cambio de
opinión sobre el precio, es que desaparezca el caso que la justifica.

Antes de sacarla hay que comprobar las dos cosas, no una:

1. Que no queden locales operando fuera del sistema.
2. Que el movimiento depósito → local sea efectivamente por transferencia y no
   por venta.

Si alguien saca la lista con la primera cumplida y la segunda no, el depósito
pasa a cobrarle el precio de venta a un local, que es exactamente lo que esta
configuración existe para evitar.

## La consecuencia abierta, que NO está resuelta

**En el depósito la tarjeta del catálogo muestra el precio de VENTA, y el POS
cobra el costo.** Son las mismas 2.021 filas. La tarjeta corrigió la ESCALA el
2026-08-19 —commit `ad10fcf`— pero sigue leyendo la columna `precio_venta` en vez
de preguntar por el precio que el POS resuelve con la lista.

Lo que haría falta, y por qué no entra de arrastre, está medido en
[../roadmap/el-precio-que-se-cobra.md](../roadmap/el-precio-que-se-cobra.md),
sección "La tarjeta con el precio resuelto".

## Dónde está implementado

- `lib/precios/resolverListaCliente.js:109-124` — elige la lista default del
  depósito. El comentario de la línea 10 aclara que `ListaPrecio.esDefault` no se
  consulta en runtime: lo que manda es `GrupoDeposito.listaPrecioDefaultId`.
- `lib/precios/calcularPrecioConLista.js:58-68` — la rama `COSTO`, que con margen
  nulo o 0 devuelve el costo puro.
- `app/api/pos-ventas/buscar-producto/route.js:334-376` — donde se aplica.
