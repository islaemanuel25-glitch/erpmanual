# El costo como opción de precio en la tarjeta

**Estado: FUERA DE ALCANCE, por decisión de Emanuel (2026-08-18).** Se anota
acá para que quede la idea y, sobre todo, el motivo — no como tarea aprobada.

Relevado sobre el árbol de `main` al 2026-08-18.

## De dónde salió

Al relevar la "tarjeta editable" apareció como tercera opción posible de precio,
al lado de las dos que sí entraron: mostrar siempre el precio unitario, y ocultar
la equivalencia de bulto. Emanuel la dejó afuera con dos palabras: **"es otra
idea y además sensible"**.

Las dos partes de esa frase son ciertas por razones distintas, y las dos importan
para quien la retome.

## Por qué es otra idea: el eje de la decisión no es el mismo

Las dos preferencias que se implementaron son **del local**. Viven en columnas de
`ConfiguracionLocal`, las prende alguien con `config_local.apariencia`, y valen
para todos los que miren el catálogo parados en esa ubicación. Eso es correcto
para ellas: cómo se presenta un precio que **todo el mundo puede ver igual** es
una decisión de presentación.

El costo no funciona así. Hay un permiso propio —`costos.ver`, en
`lib/rbac/registry.js:106`, con alcance de local— y su descripción dice
literalmente que desbloquea secciones que hoy son solo de admin. O sea: **quién
ve un costo es una decisión por PERSONA, no por ubicación.**

Un interruptor por local que pusiera el costo en la tarjeta atravesaría eso: lo
prende uno y lo ve cualquiera que entre al catálogo desde ese local, tenga o no
`costos.ver`. Es la misma familia de defecto que la regla 3 de `CLAUDE.md` —dos
hechos distintos metidos en un solo dato—, y no se arregla eligiendo mejor el
rótulo del interruptor.

La forma que sí cerraría es la combinación de los dos: el local declara que
quiere la opción, y el costo se dibuja **solo si además quien mira tiene
`costos.ver`**. Eso es un predicado nuevo que lee dos hechos, no una tercera
columna al lado de las otras dos.

## Por qué es sensible

Porque el costo es lo único de la tarjeta que no es público hacia adentro del
local. El precio de venta lo ve el cliente en la góndola; el costo es lo que
paga el negocio. Ponerlo en la pantalla que más se abre —el catálogo, en un
teléfono, en el mostrador— lo deja a la vista de quien esté parado al lado.

Esto no es un argumento en contra de la idea. Es la razón por la que **no puede
salir de arrastre en la tanda de otra cosa**, que es exactamente lo que se
evitó.

## Qué habría que decidir antes de escribir una línea

1. **¿El interruptor del local existe, o alcanza con `costos.ver`?** Si alcanza
   con el permiso, no hay nada que configurar por local y esto no es una
   preferencia de la tarjeta: es una condición de dibujo. Es el camino más
   barato y el más difícil de hacer mal.
2. **Si existe el interruptor: ¿qué gana cuando el local dice que sí y la
   persona no tiene `costos.ver`?** Tiene que ganar el permiso. Escribirlo al
   revés sería una fuga.
3. **¿Costo de qué?** El costo es de una ubicación y hay un pendiente abierto de
   redondeo entre `||` y `??` al leer el override —punto 6 de la deuda técnica en
   [README.md](README.md)—. Mostrar un costo en la tarjeta antes de resolver eso
   pondría a la vista dos números distintos para el mismo producto según la
   pantalla.

## Lo que ya está hecho y sirve si esto se retoma

Nada de lo implementado en la tanda del 2026-08-18 estorba:

- `lib/config/aparienciaLocal.js` hace el update PARCIAL, así que una tercera
  preferencia se agrega a `CAMPOS_TARJETA` y no pisa las otras dos.
- El camino de la preferencia hasta el cliente ya está probado de punta a punta:
  columna → `/api/me` → `UserContext` → catálogo, con el local resuelto por
  contexto activo.
- Los candados de `lib/config/aparienciaLocal.test.mjs` afirman el default
  apagado y el no-pisado, y los dos valen igual para una preferencia más.

Lo que **no** existe y habría que escribir es el predicado que junta los dos
hechos del punto 2.
