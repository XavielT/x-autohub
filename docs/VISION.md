# Visión del producto — X AutoHub

## La idea en una frase

**El hub central de los autos en RD.** Un solo lugar donde un entusiasta
dominicano compra un carro, encuentra la pieza que necesita, contrata un taller y
sigue lo que pasa en la escena.

## El problema que resuelve

Hoy la escena automotriz dominicana está repartida en pedazos: los carros se
venden en grupos de Facebook y clasificados genéricos, las piezas se buscan por
WhatsApp preguntando de taller en taller, los eventos se enteran por Instagram si
seguías a la cuenta correcta, y no hay forma de saber si el vendedor del otro lado
es serio.

X AutoHub junta esas cuatro cosas y le pone una capa de confianza encima: hay
inventario **verificado por la casa** y hay inventario **de la comunidad**, y el
usuario siempre sabe cuál está viendo.

## Para quién

- **El entusiasta** — proyectos, performance, modificaciones. Quiere piezas
  específicas y gente que hable su idioma.
- **El comprador común** — busca un carro confiable a buen precio y necesitar
  saber que no lo van a estafar.
- **El que vende** — un particular con un carro, o un taller con inventario.
  Necesita publicar rápido y que lo vean.
- **Los clubes y crews** — ya existen, pero sin un lugar central donde organizarse.

## Los cinco pilares

### 1. Auto Hub — `/auto-hub`

Vehículos **de X AutoHub**, revisados por el equipo. El copy de la página lo dice:
*"Vehículos verificados por X AutoHub"*. Este es el inventario propio y es la
diferencia con cualquier clasificado: si está aquí, la casa responde por él.

### 2. Hub Market — `/hub-market`

Los clasificados de la **comunidad**: vehículos, piezas y accesorios que publican
los usuarios desde `/publicar`. Volumen y variedad. Aquí X AutoHub es la
plataforma, no el vendedor.

> Auto Hub y Hub Market conviven a propósito. Son dos promesas distintas al
> usuario y no deben fundirse en una sola lista.

### 3. Catálogo — `/catalogo`

La **tienda propia de piezas**, con carrito y checkout. Filtro por 17 categorías
(frenos, suspensión, motor, escape, audio, detailing…). Es el único pilar con
flujo de compra completo dentro del sitio.

### 4. Servicios — `/servicios`

El taller: mantenimiento, reparación, chequeo y diagnóstico computarizado, y
búsqueda/verificación de vehículos para quien está por comprar. El cierre es por
WhatsApp, que es como realmente se contrata un servicio en RD.

### 5. Social Hub — `/social-hub`

La comunidad. Feed de builds y preguntas, directorio de clubes por enfoque y
provincia, y calendario de eventos (car shows, drift days, caravanas). Es lo que
hace que alguien vuelva sin querer comprar nada.

## Tono y marca

- **Idioma:** español dominicano. Directo, sin corporativismo. "Qué estás
  buscando?", no "Realice su búsqueda".
- **Paleta:** negro (`--main: #121212`) con ámbar (`--Hub: #ffb300`) y naranja
  (`--primary: #ff5f00`). Oscuro, alto contraste, energía de garaje nocturno.
- **Tipografía:** Space Grotesk para marca y títulos, Manrope para cuerpo y
  precios, ROLNER como acento de marca.
- **Sensación:** alto octanaje. El badge del hero dice *"Experiencia de Alto
  Octanaje"* — eso es la vara.

## Qué no es

- No es un concesionario con catálogo estático.
- No es una red social genérica con tema de carros.
- No es un marketplace internacional. Es **RD**: los precios son en `RD$`, las
  ubicaciones son provincias dominicanas, los teléfonos son 809.

## Estado actual (2026-08-11)

Frontend Angular funcional sobre datos simulados. Los cinco pilares tienen página.
Login/registro y Social Hub funcionan con autenticación y contenido simulados.
Falta el backend real: ver `docs/ROADMAP.md`.
