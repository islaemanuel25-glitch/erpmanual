# INC-0005 — El sitio se cayó dos veces, más de tres minutos, durante una jornada de 15 despliegues

**Fecha:** 2026-08-12
**Estado:** abierto — causa principal identificada, sin confirmar contra el servidor
**Impacto:** producción con cinco locales vendiendo. Emanuel no pudo entrar, dos veces, por más de tres minutos cada una.

> **Este informe se escribió SIN tocar el VPS**, por pedido expreso. Todo lo que
> sigue sale del historial de lo que corrí y del código del repositorio. Lo que
> haría falta mirar en el servidor para confirmarlo está listado al final, sin
> ejecutar.

## Qué corrí en el VPS hoy

**Quince despliegues**, entre las 22:31 de ayer y las 12:37 de hoy. Cada uno es
un `docker compose up -d --no-deps app`, o sea **una recreación del contenedor
que atiende a los cinco locales**. Cuatro de ellos además corrieron migraciones
en un contenedor descartable.

Además, y esto es lo que más pesa:

- **Una ráfaga de 10 lecturas seguidas DENTRO del contenedor de producción**
  (`docker exec erpazul_app node …`), midiendo cuántas aguanta la cuota de
  Gemini. Cada lectura carga una foto de **6,5 MB** en memoria y la codifica en
  base64 —otros ~8,7 MB— y espera hasta 45 segundos. La corrida entera duró
  **229 segundos**. Corrió en el MISMO proceso y el MISMO contenedor que sirve
  la aplicación.
- Otras nueve corridas sueltas del mismo tipo (relecturas, medición de identidad,
  del contador de cuota, de la lista de recetas), todas con la misma foto.
- Cinco `pg_dump` completos, uno por despliegue con migración.

## La causa principal, y es un defecto mío

`instrumentation.js` corre al levantar el servidor, **antes del primer pedido**.
Adentro hace:

```
const v = await verificarModelo();
```

`verificarModelo()` es **una llamada de red a la API de Google**, con
`AbortSignal.timeout(10_000)`.

El comentario que está tres líneas más arriba, escrito por mí, dice:

> *"Va DESPUÉS del chequeo del volumen y sin bloquear nada: es una consulta de
> red y no puede demorar el arranque de la aplicación."*

**El comentario y el código dicen cosas distintas.** El `await` bloquea
`register()`, y Next no atiende el primer pedido hasta que `register()` termina.
Así que **cada recreación del contenedor puede sumar hasta 10 segundos de sitio
caído** esperando a Google.

Y hoy Google estaba mal justamente por mi culpa: agoté la cuota diaria del modelo
titular con las mediciones, y las llamadas empezaron a devolver 429, timeouts y
`SERVICIO_CAIDO`. O sea que el peor caso de esos 10 segundos era el caso normal
de hoy.

Quince despliegues × hasta 10 segundos son dos minutos y medio de indisponibilidad
repartida, sin contar el arranque normal de Next.

## Lo que no explica esa causa, y lo que probablemente sí

Diez segundos por despliegue no son tres minutos seguidos. Lo que puede
producirlos, por orden de probabilidad:

1. **La ráfaga adentro del contenedor de producción.** Diez lecturas
   secuenciales con una foto de 6,5 MB cada una, más su base64, más las
   respuestas del modelo, durante casi cuatro minutos. Si el contenedor tiene
   límite de memoria, eso es presión sostenida sobre el mismo proceso que
   responde a los locales; si el límite se cruzó, el kernel mata el proceso y
   Docker lo reinicia — y ahí hay otro arranque, con su espera a Google.
   **La ventana de esa ráfaga coincide con la clase de corte que se reportó.**
2. **Los despliegues encimados.** Hubo tramos de tres despliegues en 20 minutos
   (23:32, 23:42, 23:57) y otro de cuatro en 40 (00:16 a 01:00). Cada uno corta.
3. **Los `pg_dump`.** Cinco dumps completos compiten por E/S con la base que
   atiende las ventas.

**Lo que descarto:** no hubo ningún `docker build` en el servidor —las imágenes
vienen armadas de GHCR—, y ningún `docker compose up` sin `--no-deps`, así que
PostgreSQL nunca se recreó.

## Lo que hay que mirar en el servidor para confirmarlo

No lo hice. Cuando se autorice:

- `docker inspect erpazul_app --format '{{.State.OOMKilled}} {{.RestartCount}}'` —
  si el contenedor murió por memoria, esto lo dice.
- `docker events --since 24h` filtrando `container die|kill|start` de
  `erpazul_app`: da la hora exacta de cada caída y cuántas hubo.
- `free -m` y el límite de memoria del servicio en `docker-compose.prod.yml`.
- El log de nginx —necesita `sudo` con contraseña, que no tengo— para ver los 502
  y su duración.

## Lo que cambia a partir de acá

1. **Un tope de corte de 30 segundos**, escrito en el skill `/deploy`: si el
   sitio no responde 30 segundos después de recrear, es un incidente y se
   revierte a la imagen anterior. No se espera a ver si levanta.
2. **La lista de operaciones que pueden dejar el sitio abajo**, también en
   `/deploy`, para que se hagan sabiendo el costo y no de paso.
3. **`instrumentation.js` no puede bloquear el arranque con una llamada de red.**
   El chequeo del modelo tiene que arrancar en segundo plano y avisar cuando
   termine, no demorar el primer pedido. (Preparado, sin desplegar.)
4. **Nada de mediciones pesadas dentro del contenedor de producción.** Si hay que
   medir con la foto real, va en un contenedor aparte con la misma imagen, no en
   el que atiende.
5. **Los despliegues no se encadenan.** Quince en un día es la decisión de fondo
   que hay que revisar: cada arreglo chico salió por su propio despliegue, y cada
   despliegue es un corte.
