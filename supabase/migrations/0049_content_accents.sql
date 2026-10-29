-- 0049 — Tildes y ñ en el contenido que ya estaba cargado.
--
-- El seed no actualiza filas que ya existen (`on conflict do nothing`), así que los nombres y descripciones
-- sembrados antes de pasar el sitio a español con tildes siguen como entraron ("Bateria", "Instalacion",
-- "Duenos y fanaticos"). Este bloque reemplaza **palabras completas** de una lista cerrada, en las columnas
-- de texto del contenido sembrado: productos, clubes, eventos, publicaciones del feed, noticias y Hub Market.
-- No toca slugs, rutas de imagen ni marcas, y conserva mayúsculas ("BUJIAS" → "BUJÍAS").
--
-- Se puede ejecutar dos veces: la segunda ya no encuentra ninguna palabra sin tilde.
-- Los triggers de republicación (0026) se enteran solos y piden un despliegue de las páginas prerenderizadas.

do $$
declare
  pares text[][] := array[
    array['absorcion', 'absorción'],
    array['aceleracion', 'aceleración'],
    array['admision', 'admisión'],
    array['aerodinamica', 'aerodinámica'],
    array['aleron', 'alerón'],
    array['bateria', 'batería'],
    array['bujias', 'bujías'],
    array['carroceria', 'carrocería'],
    array['ceramicas', 'cerámicas'],
    array['ceramico', 'cerámico'],
    array['codigos', 'códigos'],
    array['combustion', 'combustión'],
    array['disipacion', 'disipación'],
    array['duracion', 'duración'],
    array['ebullicion', 'ebullición'],
    array['estetica', 'estética'],
    array['frio', 'frío'],
    array['hibrida', 'híbrida'],
    array['hidrofobica', 'hidrofóbica'],
    array['iluminacion', 'iluminación'],
    array['instalacion', 'instalación'],
    array['liquido', 'líquido'],
    array['mas', 'más'],
    array['perdida', 'pérdida'],
    array['precision', 'precisión'],
    array['proteccion', 'protección'],
    array['rapida', 'rápida'],
    array['respiracion', 'respiración'],
    array['sintetico', 'sintético'],
    array['suspension', 'suspensión'],
    array['termica', 'térmica'],
    array['transmision', 'transmisión'],
    array['vehiculo', 'vehículo'],
    array['vehiculos', 'vehículos'],
    array['asesoria', 'asesoría'],
    array['duenos', 'dueños'],
    array['economicos', 'económicos'],
    array['fanaticos', 'fanáticos'],
    array['republica', 'república'],
    array['pais', 'país'],
    array['exhibicion', 'exhibición'],
    array['inspeccion', 'inspección'],
    array['tecnica', 'técnica'],
    array['premiacion', 'premiación'],
    array['fotograficas', 'fotográficas'],
    array['sesion', 'sesión'],
    array['autodromo', 'autódromo'],
    array['americas', 'américas'],
    array['anos', 'años'],
    array['catalogo', 'catálogo'],
    array['clasicos', 'clásicos'],
    array['cumplio', 'cumplió'],
    array['despues', 'después'],
    array['dia', 'día'],
    array['electrico', 'eléctrico'],
    array['tambien', 'también'],
    array['ultimas', 'últimas'],
    array['tecnologias', 'tecnologías'],
    array['rapido', 'rápido'],
    array['descripcion', 'descripción'],
    array['diametro', 'diámetro'],
    array['algodon', 'algodón'],
    array['presion', 'presión']
  ];
  destinos text[][] := array[
    array['hub_parts', 'name'], array['hub_parts', 'short_description'], array['hub_parts', 'description'],
    array['social_clubs', 'name'], array['social_clubs', 'focus'], array['social_clubs', 'description'],
    array['social_events', 'title'], array['social_events', 'location'], array['social_events', 'description'],
    array['social_posts', 'text'],
    array['news', 'title'], array['news', 'text'], array['news', 'text_large'],
    array['hub_market_items', 'title'], array['hub_market_items', 'description']
  ];
  d int;
  p int;
  viejo text;
  nuevo text;
  col text;
  r int;
  -- Palabra completa: ni letra, ni número, ni guion (un slug como bateria-agm no es texto) la rodean.
  pre constant text := '(^|[^[:alnum:]_-])';
  post constant text := '([^[:alnum:]_-]|$)';
begin
  for d in 1 .. array_length(destinos, 1) loop
    col := quote_ident(destinos[d][2]);
    for p in 1 .. array_length(pares, 1) loop
      viejo := pares[p][1];
      nuevo := pares[p][2];
      -- Dos pasadas: dos palabras separadas por un solo espacio ("mas mas") se pisan en una.
      for r in 1 .. 2 loop
        execute format(
          'update public.%I set %s = regexp_replace(regexp_replace(regexp_replace(%s, %L, %L, ''g''), %L, %L, ''g''), %L, %L, ''g'')
            where %s ~* %L',
          destinos[d][1], col, col,
          pre || viejo || post, '\1' || nuevo || '\2',
          pre || initcap(viejo) || post, '\1' || initcap(nuevo) || '\2',
          pre || upper(viejo) || post, '\1' || upper(nuevo) || '\2',
          col, pre || viejo || post
        );
      end loop;
    end loop;
  end loop;
end
$$;
