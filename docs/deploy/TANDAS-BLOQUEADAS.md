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

### Issue #2 — Productos en el celular · rama `feat/issue-2-productos-mobile`

**Emanuel pidió expresamente NO desplegar** al encargar la tanda. No es un
problema encontrado: es que todavía no la miró.

**LA TANDA ES LA RAMA ENTERA, no dos commits.** Esta entrada decía
"`2a72f65c` y `9c79c050`" y quedó vieja apenas entraron las correcciones de las
dos revisiones de código; una lista de commits escrita a mano envejece con cada
`git commit`, y un archivo operativo que envejece solo es peor que no tenerlo.

Lo que está frenado es todo lo que la rama tiene por encima de `main`. Para verlo
en cualquier momento, sin depender de que este párrafo esté al día:

    git log --oneline main..feat/issue-2-productos-mobile

**Y NADA DE ESO ESTÁ EN `main`.** Mientras la rama no se mergee, el paso 0 no
puede encontrarse estos commits en `origin/main`: la entrada existe para el día
en que se mergee, y para que ese día nadie suponga que un merge equivale a una
aprobación de despliegue.

**No se puede cortar en el medio.** La pantalla dibuja las cards con los números
que calculan las rutas, y las correcciones de revisión tocan las dos mitades:
desplegar una parte deja la pantalla llamando a endpoints que no existen o
contando con reglas viejas.

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

**Y una pantalla que no es de Productos igual se mueve un poco:** el número de
las cards de "Para revisar" se pinta con el color semántico MEZCLADO al 12 % con
el color de texto de la aplicación, para llegar al contraste mínimo sin tocar
ningún theme. Eso vive adentro de `CarruselControles.jsx` y no sale de ahí, así
que el resto del ERP no cambia. Lo aclara porque en una versión anterior de esta
tanda sí se había tocado un token global y se revirtió.

**Para levantarlo:** Emanuel lo abre en el celular, y si está bien se borra esta
entrada en el mismo commit que autoriza el corte.

**Lo que queda declarado como NO cerrado, y no se disfraza de terminado:**

1. `--warning-fg` de `grafitoEjecutivo` mide **2,94** contra `--card-bg`, por
   debajo del mínimo de 3,0 para el borde de un componente. Se probó subirlo y se
   revirtió porque mueve `components/Header.jsx`, que no es de este issue.
   Productos ya no depende de eso —resuelve por composición—, pero el token sigue
   corto para cualquier otra pantalla de ese tema que lo use. Es una tanda propia
   y necesita que Emanuel apruebe el cambio visual.

2. El control **"Escala / precio en riesgo" está en 0 en los datos de
   desarrollo**, así que su filtro es el único de los cuatro que no se pudo
   ejercer en el navegador. La sonda lo informa como NO EJERCIDO en cada corrida.
   No se fabricaron filas para que apareciera.

3. El adaptador camelCase → snake_case que `scripts/sonda-revision-de-precio.mjs`
   necesita para llamar a `editar` está escrito en el arnés y **no** extraído de
   `FormProducto`, que es donde vive el original. Extraerlo toca el formulario y
   pide su propia verificación de que la pantalla no se movió un píxel.

---

El bloqueo que motivó este archivo —`289a036`, la tanda de la tarjeta— lo levantó
Emanuel el 2026-08-19 y esa tanda ya está en producción.
