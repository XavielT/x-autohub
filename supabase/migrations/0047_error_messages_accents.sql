-- 0047 — Los mensajes de error que ve la persona, con tildes y ñ.
--
-- Los `raise exception` de las migraciones anteriores salieron sin tildes ("Esa hora ya no esta
-- disponible"): la interfaz los muestra tal cual (`translateDbError` deja pasar el texto de los
-- errores 22023 y el de varias funciones de pedidos, citas y cupones). Cada función se definió en
-- una migración distinta y varias se redefinieron, así que aquí no se copian cuerpos: este bloque
-- recorre las funciones de `public`, toma su definición actual (`pg_get_functiondef`), cambia cada
-- mensaje viejo por el nuevo y la vuelve a crear. Conserva firma, permisos (`create or replace`
-- no los toca), `security definer` y `search_path`.
--
-- Se puede ejecutar dos veces: la segunda ya no encuentra ningún mensaje viejo.
-- El frontend acepta los dos textos donde compara (`agendar.ts`), así que el orden no importa.

do $$
declare
  pares text[][] := array[
    array[$m$Alguna pieza del carrito ya no esta disponible.$m$, $m$Alguna pieza del carrito ya no está disponible.$m$],
    array[$m$Decision no valida: %. Usa aprobado o rechazado.$m$, $m$Decisión no válida: %. Usa aprobado o rechazado.$m$],
    array[$m$El subtotal no es valido.$m$, $m$El subtotal no es válido.$m$],
    array[$m$El vehiculo o las notas son demasiado largos.$m$, $m$El vehículo o las notas son demasiado largos.$m$],
    array[$m$Elige el dia y la hora.$m$, $m$Elige el día y la hora.$m$],
    array[$m$Elige una opcion de "%" antes de comprarlo.$m$, $m$Elige una opción de "%" antes de comprarlo.$m$],
    array[$m$Esa hora ya no esta disponible. Elige otra.$m$, $m$Esa hora ya no está disponible. Elige otra.$m$],
    array[$m$Esa publicacion no existe.$m$, $m$Esa publicación no existe.$m$],
    array[$m$Escribe el codigo del cupon.$m$, $m$Escribe el código del cupón.$m$],
    array[$m$Escribe la direccion de entrega.$m$, $m$Escribe la dirección de entrega.$m$],
    array[$m$Escribe tu correo electronico.$m$, $m$Escribe tu correo electrónico.$m$],
    array[$m$Escribe tu telefono: lo usamos para coordinar la entrega.$m$, $m$Escribe tu teléfono: lo usamos para coordinar la entrega.$m$],
    array[$m$Escribe un telefono valido: lo usamos para confirmar tu cita.$m$, $m$Escribe un teléfono válido: lo usamos para confirmar tu cita.$m$],
    array[$m$Ese cupon no existe o ya no esta disponible.$m$, $m$Ese cupón no existe o ya no está disponible.$m$],
    array[$m$Ese vehiculo no es de tu garaje.$m$, $m$Ese vehículo no es de tu garaje.$m$],
    array[$m$Esta cita es de una cuenta: inicia sesion y activa los avisos desde tu perfil.$m$, $m$Esta cita es de una cuenta: inicia sesión y activa los avisos desde tu perfil.$m$],
    array[$m$Esta cita ya termino: no va a cambiar de estado.$m$, $m$Esta cita ya terminó: no va a cambiar de estado.$m$],
    array[$m$Estado no valido: %.$m$, $m$Estado no válido: %.$m$],
    array[$m$Este cupon no aplica a tu pedido.$m$, $m$Este cupón no aplica a tu pedido.$m$],
    array[$m$Este cupon pide una compra de al menos RD$ %.$m$, $m$Este cupón pide una compra de al menos RD$ %.$m$],
    array[$m$Este cupon ya se agoto.$m$, $m$Este cupón ya se agotó.$m$],
    array[$m$Este pedido es de una cuenta: inicia sesion y activa los avisos desde tu perfil.$m$, $m$Este pedido es de una cuenta: inicia sesión y activa los avisos desde tu perfil.$m$],
    array[$m$Este pedido ya termino: no va a cambiar de estado.$m$, $m$Este pedido ya terminó: no va a cambiar de estado.$m$],
    array[$m$Explica en al menos 10 caracteres por que se rechaza.$m$, $m$Explica en al menos 10 caracteres por qué se rechaza.$m$],
    array[$m$Inicia sesion para activar los avisos.$m$, $m$Inicia sesión para activar los avisos.$m$],
    array[$m$La opcion de envio no corresponde al tipo de entrega.$m$, $m$La opción de envío no corresponde al tipo de entrega.$m$],
    array[$m$La opcion elegida de "%" ya no esta disponible.$m$, $m$La opción elegida de "%" ya no está disponible.$m$],
    array[$m$Las categorias admiten dos niveles como maximo.$m$, $m$Las categorías admiten dos niveles como máximo.$m$],
    array[$m$Llegaste al maximo de 200 favoritos. Quita alguno para guardar otro.$m$, $m$Llegaste al máximo de 200 favoritos. Quita alguno para guardar otro.$m$],
    array[$m$Metodo de envio no valido.$m$, $m$Método de envío no válido.$m$],
    array[$m$Metodo de pago no valido.$m$, $m$Método de pago no válido.$m$],
    array[$m$Necesitas una sesion para ver tu perfil.$m$, $m$Necesitas una sesión para ver tu perfil.$m$],
    array[$m$Rol no valido: %.$m$, $m$Rol no válido: %.$m$],
    array[$m$Se agoto "%". Quitala del carrito para continuar.$m$, $m$Se agotó "%". Quítala del carrito para continuar.$m$],
    array[$m$Solo se puede cancelar con mas de 24 horas de anticipacion. Escribenos por WhatsApp.$m$, $m$Solo se puede cancelar con más de 24 horas de anticipación. Escríbenos por WhatsApp.$m$],
    array[$m$Solo su dueno puede marcar una publicacion como vendida.$m$, $m$Solo su dueño puede marcar una publicación como vendida.$m$],
    array[$m$Solo su dueno puede renovar una publicacion.$m$, $m$Solo su dueño puede renovar una publicación.$m$],
    array[$m$Solo un administrador puede ver el estado de la publicacion.$m$, $m$Solo un administrador puede ver el estado de la publicación.$m$],
    array[$m$Solo una publicacion aprobada se puede marcar como vendida.$m$, $m$Solo una publicación aprobada se puede marcar como vendida.$m$],
    array[$m$Solo una publicacion aprobada se puede renovar.$m$, $m$Solo una publicación aprobada se puede renovar.$m$],
    array[$m$Tipo de entrega no valido.$m$, $m$Tipo de entrega no válido.$m$],
    array[$m$Una categoria con subcategorias no puede ser subcategoria.$m$, $m$Una categoría con subcategorías no puede ser subcategoría.$m$],
    array[$m$Ya tienes 3 citas abiertas con este telefono. Escribenos por WhatsApp para cambiarlas.$m$, $m$Ya tienes 3 citas abiertas con este teléfono. Escríbenos por WhatsApp para cambiarlas.$m$],
    array[$m$Ya usaste este cupon.$m$, $m$Ya usaste este cupón.$m$]
  ];
  f record;
  def text;
  nuevo text;
  i int;
begin
  for f in
    select p.oid, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
  loop
    def := pg_get_functiondef(f.oid);
    nuevo := def;
    for i in 1 .. array_length(pares, 1) loop
      nuevo := replace(nuevo, pares[i][1], pares[i][2]);
    end loop;
    if nuevo <> def then
      execute nuevo;
      raise notice 'mensajes con tildes: %', f.proname;
    end if;
  end loop;
end
$$;
