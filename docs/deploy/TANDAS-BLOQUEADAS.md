# Tandas que están en `main` y NO se despliegan

**Este archivo se lee en el paso 0 de `/deploy`, junto con
[MIGRACIONES-SIN-APLICAR.md](MIGRACIONES-SIN-APLICAR.md) y antes del backup.**
Existe para que el próximo despliegue sepa que hay commits en `origin/main` que
**no tienen que salir**, y no lo descubra después de haberlos desplegado.

Es una lista viva, no un histórico: **cuando un bloqueo se levanta, la entrada se
borra de acá** en el mismo commit que lo levanta. Un archivo que acumula bloqueos
viejos deja de decir qué está frenado y pasa a ser otra cosa que hay que
interpretar.

Si la lista está vacía, todo lo que está en `origin/main` se puede desplegar.

---

## EMPUJADO NO ES DESPLEGADO

Esto es lo que este archivo existe para decir, y va primero porque es lo que se
lee mal.

Que un commit esté en `origin/main` significa que no se va a perder y que Actions
va a construir su imagen. **No significa que esté aprobado para producción.**

El paso 0 compara `REMOTO` contra `DESPLEGADO` y sigue si difieren. Esa
comparación contesta **si hay algo nuevo, no si ese algo tiene que salir**. Son
dos preguntas distintas y solo la primera está automatizada: la segunda es esta
lista.

**En la práctica:** si `REMOTO` difiere de `DESPLEGADO`, mirar el rango real
—`git log --oneline <DESPLEGADO>..<REMOTO>`— y comprobar acá si alguno de esos
commits está frenado. Si lo está, el corte no sale, o sale cortado antes de ese
commit.

### De dónde salió

El 2026-08-19 la tanda `289a036` quedó empujada y bloqueada a propósito: la
tarjeta afirmaba un margen que en el depósito no existe. Cuando se corrió
`/deploy`, **el paso 0 dio luz verde** —cero commits sin empujar y el remoto
distinto de lo desplegado— y lo único que frenó el despliegue fue que quien lo
corría se acordaba del bloqueo, dicho unos mensajes antes en la misma
conversación. Una sesión nueva no se habría acordado.

Es la misma familia que el 2026-08-14, cuando el procedimiento corrió entero con
17 commits sin empujar y no desplegó nada: **los chequeos del paso 0 son de
consistencia, no de contenido ni de intención.** Este archivo es lo que agrega la
intención, y por eso vale aunque la lista esté vacía.

---

## Bloqueos vigentes

### Issue #2 — Productos en el celular · `2a72f65c` y `9c79c050`

**Emanuel pidió expresamente NO desplegar** al encargar la tanda. No es un
problema encontrado: es que todavía no la miró.

Los dos commits van juntos y no se pueden cortar en el medio: el segundo dibuja
las cards con los números que calcula el primero, así que desplegar solo la
pantalla la deja llamando a un endpoint que no existe.

**Y trae migración**, la primera desde el 2026-08-20 —ver
[MIGRACIONES-SIN-APLICAR.md](MIGRACIONES-SIN-APLICAR.md)—. Es aditiva y sin paso
de datos, pero el despliegue deja de ser de solo código.

Lo que se va a ver el día que salga, para que se pueda comparar: en el celular
el módulo deja de estar adentro de una tarjeta, aparece el bloque "Para revisar"
con cuatro cards arriba de todo, el buscador queda suelto, los otros filtros y
las acciones que no son "+ Producto" pasan a dos hojas, la tarjeta pierde el
botón "Ver" y los dos avisos ámbar, y "Edición rápida" desaparece del sistema.
De 768 px para arriba lo único que cambia es que se va el botón de Edición
rápida — la huella de escritorio, medida, da cero diferencias.

**Para levantarlo:** Emanuel lo abre en el celular, y si está bien se borra esta
entrada en el mismo commit que autoriza el corte.

---

El bloqueo que motivó este archivo —`289a036`, la tanda de la tarjeta— lo levantó
Emanuel el 2026-08-19 y esa tanda ya está en producción.
