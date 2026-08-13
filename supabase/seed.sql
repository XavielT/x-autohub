-- =============================================================================
-- X AutoHub — Datos iniciales
-- =============================================================================
-- GENERADO AUTOMÁTICAMENTE por scripts/generate-seed.mjs desde los mocks de
-- src/shared/models. No lo edites a mano: edita el mock y vuelve a generar.
--
-- Ejecutar después de 0001_schema.sql, 0002_rls.sql y 0003_storage.sql.
--
-- Las rutas de imagen apuntan a los assets locales del frontend
-- (assets/imgs/...). Cuando subas las fotos reales a Storage, reemplázalas por
-- la URL pública del bucket.
-- =============================================================================


-- Auto Hub: inventario propio

-- 6 registro(s)
insert into public.auto_hub_vehicles (id, brand, model, year, price, color, mileage, chasis_type, doors, traction, fuel, cylinders, images, description, location, contact) values
  (0, 'Citroen', 'DS3', 2015, 480000, 'Gris', 92000, 'hatchback'::public.chasis_type, 2, 'fwd'::public.traction_type, 'gasoline'::public.fuel_type, 4, array['assets/imgs/auto-hub/ds3.jpeg', 'assets/imgs/auto-hub/ds3-2.jpeg', 'assets/imgs/auto-hub/ds3-3.jpeg'], 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus pulvinar risus urna, in auctor eros porttitor sit amet. Nullam commodo velit ut massa viverra pretium. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Cras id mollis velit. Maecenas bibendum, ipsum ut semper sagittis, dolor orci consectetur nibh, in molestie nunc odio non nulla.', 'Santo Domingo Este', '8099539782'),
  (1, 'Volkswagen', 'Tiguan', 2014, 600000, 'negro', 143000, 'suv'::public.chasis_type, 4, 'fwd'::public.traction_type, 'gasoline'::public.fuel_type, 4, array['assets/imgs/auto-hub/tiguan.jpeg', 'assets/imgs/auto-hub/tiguan-2.jpeg', 'assets/imgs/auto-hub/tiguan-3.jpeg'], 'Fusce pretium dolor vitae tortor congue, quis eleifend mauris accumsan. Phasellus est sapien, finibus non molestie ut, placerat non arcu. Nunc id nisi egestas, porta odio sit amet, tempus tellus. Cras viverra nulla ex, in fermentum eros aliquam eu. Praesent velit justo, lobortis quis nunc ut, blandit iaculis ante.', 'Santo Domingo Norte', '8099539782'),
  (2, 'Citroen', 'C3', 2003, 280000, 'gris', 116000, 'hatchback'::public.chasis_type, 4, 'fwd'::public.traction_type, 'gasoline'::public.fuel_type, 4, array['assets/imgs/auto-hub/c3.jpeg', 'assets/imgs/auto-hub/c3-2.jpeg'], 'Vestibulum accumsan, dui eu sagittis accumsan, turpis lacus condimentum tortor, eu fringilla eros nibh in orci. Morbi dapibus, leo nec tempus maximus, eros sapien pharetra justo, tempor imperdiet nisi purus ac augue. Nunc ac orci at nunc elementum rutrum in vel arcu. Aliquam vitae gravida tortor.', 'Distrito Nacional', '8099539782'),
  (3, 'Dodge', 'Charger', 2018, 1980000, 'gris', 41000, 'sedan'::public.chasis_type, 8, 'rwd'::public.traction_type, 'gasoline'::public.fuel_type, 4, array['assets/imgs/auto-hub/charger.jpeg'], 'Vestibulum accumsan, dui eu sagittis accumsan, turpis lacus condimentum tortor, eu fringilla eros nibh in orci. Morbi dapibus, leo nec tempus maximus, eros sapien pharetra justo, tempor imperdiet nisi purus ac augue. Nunc ac orci at nunc elementum rutrum in vel arcu. Aliquam vitae gravida tortor.', 'Santiago', '8099539782'),
  (4, 'Volkswagen', 'Jetta', 2003, 200000, 'negro', 41000, 'sedan'::public.chasis_type, 4, 'fwd'::public.traction_type, 'gasoline'::public.fuel_type, 4, array['assets/imgs/auto-hub/jetta.jpeg'], 'Maecenas consequat aliquam facilisis. In nibh neque, ornare in rhoncus nec, ultricies et orci. Pellentesque id magna in diam fringilla suscipit.', 'Punta Cana', '8099539782'),
  (5, 'Volkswagen', 'Amarok', 2019, 900000, 'azul', 41000, 'pickup'::public.chasis_type, 4, '4x4'::public.traction_type, 'diesel'::public.fuel_type, 6, array['assets/imgs/auto-hub/amarok.jpeg'], 'Fusce fringilla arcu sit amet est tristique, vitae cursus nibh eleifend. Donec porttitor feugiat turpis, id blandit est placerat sed.', 'La Romana', '8099539782')
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('public.auto_hub_vehicles', 'id'), (select max(id) from public.auto_hub_vehicles));


-- Catálogo: piezas de la tienda propia

-- 35 registro(s)
insert into public.hub_parts (id, category, name, brand, img_url, images, stars_calification, price, description, stock) values
  (1, 'frenos', 'Disco ventilado GTR 355mm', 'Brembo', 'assets/imgs/hub-parts/disco-brembo-gtr.jpg', array['assets/imgs/hub-parts/disco-brembo-gtr.jpg', 'assets/imgs/hub-parts/disco-brembo-gtr-2.jpg', 'assets/imgs/hub-parts/disco-brembo-gtr-3.jpg'], 4.9, 12950, 'Disco de alto rendimiento con excelente disipacion de calor para uso diario y track day.', 25),
  (2, 'filtros', 'Filtro de aire de alto flujo', 'K&N', 'assets/imgs/hub-parts/filtro-kyn-universal.jpg', '{}', 4.7, 2850, 'Filtro reusable que mejora la respiracion del motor y la respuesta de aceleracion.', 25),
  (3, 'suspension', 'Kit Coilover Street Pro', 'BC Racing', 'assets/imgs/hub-parts/coilover-street-pro.jpg', '{}', 4.8, 32500, 'Suspension ajustable en altura y dureza para mayor control y mejor estabilidad.', 25),
  (4, 'aceites', 'Aceite sintetico 5W-30 5L', 'Motul', 'assets/imgs/hub-parts/aceite-5w30-sintetico.jpg', '{}', 4.6, 2250, 'Lubricante premium para motores gasolina y turbo con proteccion termica avanzada.', 25),
  (5, 'luces', 'Kit LED H7 Cool White', 'Philips', 'assets/imgs/hub-parts/kit-led-h7-coolwhite.jpg', '{}', 4.5, 3650, 'Iluminacion blanca de alta intensidad con bajo consumo y larga duracion.', 25),
  (6, 'escape', 'Downpipe 3 pulgadas inox', 'Borla', 'assets/imgs/hub-parts/downpipe-3in-stainless.jpg', '{}', 4.8, 11800, 'Mejora el flujo de gases para obtener mejor sonido y respuesta del turbo.', 25),
  (7, 'bateria', 'Bateria AGM 70Ah', 'Bosch', 'assets/imgs/hub-parts/bateria-agm-70ah.jpg', '{}', 4.7, 6900, 'Bateria de alto arranque para vehiculos modernos con sistema start-stop.', 25),
  (8, 'interior', 'Alfombras all-weather', 'WeatherTech', 'assets/imgs/hub-parts/alfombras-allweather.jpg', '{}', 4.4, 2950, 'Juego de alfombras de goma reforzada para proteger contra agua, lodo y polvo.', 25),
  (9, 'refrigeracion', 'Radiador aluminio racing', 'Mishimoto', 'assets/imgs/hub-parts/radiador-aluminio-race.jpg', '{}', 4.9, 15400, 'Radiador de mayor capacidad para mantener temperaturas estables en uso exigente.', 25),
  (10, 'llantas', 'Rin forjado 18x8.5', 'Enkei', 'assets/imgs/hub-parts/rin-forjado-18x8.jpg', '{}', 4.6, 9800, 'Aro ligero y resistente que mejora manejo, frenado y estetica del vehiculo.', 25),
  (11, 'frenos', 'Pastillas ceramicas Sport', 'EBC', 'assets/imgs/hub-parts/pastillas-ceramicas-sport.jpg', '{}', 4.7, 4100, 'Compuesto ceramico con menor polvo y frenada consistente en ciudad y carretera.', 25),
  (12, 'frenos', 'Liquido de frenos DOT 4', 'Liqui Moly', 'assets/imgs/hub-parts/liquido-frenos-dot4.jpg', '{}', 4.5, 950, 'Liquido de alto punto de ebullicion para mantener respuesta firme del pedal.', 25),
  (13, 'suspension', 'Barra estabilizadora ajustable', 'Whiteline', 'assets/imgs/hub-parts/barra-estabilizadora-adjust.jpg', '{}', 4.6, 7400, 'Reduce balanceo de carroceria y mejora la precision en curvas.', 25),
  (14, 'suspension', 'Amortiguador a gas Premium', 'KYB', 'assets/imgs/hub-parts/amortiguador-gas-premium.jpg', '{}', 4.4, 5200, 'Confort y control mejorados para uso diario con mejor absorcion de impactos.', 25),
  (15, 'motor', 'Bobina de encendido performance', 'NGK', 'assets/imgs/hub-parts/bobina-encendido-coil.jpg', '{}', 4.7, 2150, 'Entrega chispa estable para mejorar arranque y eficiencia de combustion.', 25),
  (16, 'motor', 'Set bujias iridio x4', 'Denso', 'assets/imgs/hub-parts/bujias-iridio-set4.jpg', '{}', 4.8, 1850, 'Mayor durabilidad y respuesta del motor con electrodo de iridio.', 25),
  (17, 'motor', 'Intake cold air carbono', 'Corsa', 'assets/imgs/hub-parts/intake-cold-air-carbon.jpg', '{}', 4.6, 11200, 'Sistema de admision de aire frio para mejorar flujo y sonido de admision.', 25),
  (18, 'escape', 'Catback Street Series', 'MagnaFlow', 'assets/imgs/hub-parts/catback-street-series.jpg', '{}', 4.8, 22400, 'Escape completo con tono deportivo y flujo optimizado.', 25),
  (19, 'transmision', 'Kit clutch Stage 2', 'Exedy', 'assets/imgs/hub-parts/clutch-stage2-kit.jpg', '{}', 4.7, 16700, 'Mayor capacidad de torque para proyectos turbo y manejo exigente.', 25),
  (20, 'transmision', 'Aceite transmision 75W-90', 'Red Line', 'assets/imgs/hub-parts/aceite-transmision-75w90.jpg', '{}', 4.5, 1450, 'Proteccion de engranajes y cambios mas suaves en caja manual.', 25),
  (21, 'refrigeracion', 'Intercooler front mount', 'Garrett', 'assets/imgs/hub-parts/intercooler-front-mount.jpg', '{}', 4.9, 19800, 'Reduce temperatura del aire de admision para mantener potencia estable.', 25),
  (22, 'refrigeracion', 'Termostato racing 68C', 'Mishimoto', 'assets/imgs/hub-parts/termostato-racing.jpg', '{}', 4.4, 1350, 'Apertura temprana para controlar mejor la temperatura del motor.', 25),
  (23, 'electrico', 'Alternador high output', 'Powermaster', 'assets/imgs/hub-parts/alternador-high-output.jpg', '{}', 4.3, 13200, 'Mayor salida de corriente para sistemas de audio y accesorios adicionales.', 25),
  (24, 'electrico', 'Kit cableado 0 AWG', 'Stinger', 'assets/imgs/hub-parts/cable-kit-0awg.jpg', '{}', 4.6, 2950, 'Kit completo de instalacion para amplificador con conductores de baja perdida.', 25),
  (25, 'luces', 'Faro proyector Bi-LED', 'Morimoto', 'assets/imgs/hub-parts/faro-proyector-bi-led.jpg', '{}', 4.8, 18600, 'Haz mas uniforme y potente para mejor visibilidad nocturna.', 25),
  (26, 'luces', 'Barra LED offroad 20in', 'Rigid', 'assets/imgs/hub-parts/barra-led-offroad-20.jpg', '{}', 4.7, 6400, 'Iluminacion auxiliar de largo alcance ideal para rutas y caminos oscuros.', 25),
  (27, 'audio', 'Subwoofer 12in 1000W', 'JL Audio', 'assets/imgs/hub-parts/subwoofer-12-1000w.jpg', '{}', 4.9, 9600, 'Bajos profundos con gran control para sistemas SQ o SPL.', 25),
  (28, 'audio', 'Amplificador monoblock Clase D', 'Pioneer', 'assets/imgs/hub-parts/amplificador-monoblock.jpg', '{}', 4.5, 7800, 'Amplificador eficiente de alta potencia para subwoofers.', 25),
  (29, 'detailing', 'Shampoo pH neutro 1L', 'Meguiar''s', 'assets/imgs/hub-parts/shampoo-ph-neutro.jpg', '{}', 4.4, 780, 'Limpieza segura para pintura con acabado brillante sin remover cera.', 25),
  (30, 'detailing', 'Cera hibrida en spray', 'Turtle Wax', 'assets/imgs/hub-parts/cera-hibrida-spray.jpg', '{}', 4.3, 1150, 'Proteccion hidrofobica rapida con brillo intenso para uso frecuente.', 25),
  (31, 'interior', 'Volante racing en gamuza', 'MOMO', 'assets/imgs/hub-parts/volante-gamuza-racing.jpg', '{}', 4.8, 8900, 'Agarre superior y look deportivo para cabina estilo track.', 25),
  (32, 'exterior', 'Lip frontal universal', 'Maxton', 'assets/imgs/hub-parts/lip-frontal-universal.jpg', '{}', 4.2, 3250, 'Mejora estetica frontal con instalacion sencilla y acabado resistente.', 25),
  (33, 'exterior', 'Spoiler GT ajustable', 'APR', 'assets/imgs/hub-parts/spoiler-gt-ajustable.jpg', '{}', 4.6, 21400, 'Aleron con soportes regulables para look agresivo y carga aerodinamica.', 25),
  (34, 'herramientas', 'Llave torque 20-200 Nm', 'Tekton', 'assets/imgs/hub-parts/torque-wrench-20-200.jpg', '{}', 4.7, 3650, 'Ajuste preciso de torque para trabajos de mantenimiento y montaje.', 25),
  (35, 'herramientas', 'Scanner OBD2 Bluetooth', 'Autel', 'assets/imgs/hub-parts/scanner-obd2-bluetooth.jpg', '{}', 4.5, 2450, 'Lectura y borrado de codigos de falla desde el celular.', 25)
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('public.hub_parts', 'id'), (select max(id) from public.hub_parts));


-- Hub Market: publicaciones de la comunidad (seller_id null = contenido sembrado)

-- 7 registro(s)
insert into public.hub_market_items (id, seller_name, title, description, images, price, location, category, condition, is_featured, spec_year, spec_mileage, spec_hp, spec_zero_to_100, spec_top_speed, spec_brand, spec_model, created_at) values
  (101, 'Juan M.', 'Toyota Supra MK4', '2JZ armado, interior restaurado y listo para calle/pista. Incluye sistema de escape deportivo, frenos mejorados y un historial de mantenimiento completo. El auto ha sido pulido recientemente, con pintura en impecable estado y detalles interiores renovados para ofrecer una experiencia de conducción tanto para uso diario como para eventos. Se entrega con documentación al día y una inspección mecánica reciente que certifica el excelente estado de todos sus componentes.', array['assets/imgs/supra-white.webp', 'assets/imgs/supra-mk4-2.webp', 'assets/imgs/supra-mk4-3.webp'], 130000, 'Santo Domingo', 'vehiculos'::public.hub_market_category, null, true, 1994, 180000, 873, 3.8, 350, 'Toyota', 'Supra', '2026-04-12'),
  (102, 'AutoHub Garage', 'Volkswagen Golf MK4', 'Project car con upgrades de suspensión y frenos.', array['assets/imgs/vw-golf-mk4.webp'], 8000, 'Santiago', 'vehiculos'::public.hub_market_category, null, true, 2003, 210000, 325, 10, 220, 'Volkswagen', 'Golf', '2026-04-08'),
  (103, 'Carlos R.', 'Citroen C3', 'Uso diario, mantenimiento al dia y pintura reciente.', array['assets/imgs/citroen-c3.jpg'], 5000, 'La Romana', 'vehiculos'::public.hub_market_category, null, true, 2003, 185000, 110, 14.9, 180, 'Citroen', 'C3', '2026-04-01'),
  (201, 'Racing Parts RD', 'Discos Brembo GTR', 'Set de discos ventilados, poco uso y sin alabeo.', array['assets/imgs/hub-parts/disco-brembo-gtr-2.jpg'], 600, 'Santo Domingo', 'piezas'::public.hub_market_category, null, false, null, null, null, null, null, null, null, '2026-04-18'),
  (202, 'Miguel P.', 'Disco Brembo GTR (Unidad)', 'Unidad individual, ideal para reemplazo rapido.', array['assets/imgs/hub-parts/disco-brembo-gtr-3.jpg'], 180, 'Bani', 'piezas'::public.hub_market_category, null, false, null, null, null, null, null, null, null, '2026-04-10'),
  (301, 'Accesorios Hub', 'Pack accesorios interior', 'Kit de accesorios universales para interior deportivo.', array['assets/imgs/catalog/accesorios.jpg'], 120, 'San Cristobal', 'accesorios'::public.hub_market_category, null, false, null, null, null, null, null, null, null, '2026-03-29'),
  (104, 'Jose T.', 'Volkswagen Amarok', 'Uso diario, mantenimiento al dia y pintura reciente.', array['assets/imgs/amarok.jpeg'], 847000, 'Neiba', 'vehiculos'::public.hub_market_category, null, true, 2018, 97000, 220, 11.3, 240, 'Volkswagen', 'Amarok', '2026-05-20')
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('public.hub_market_items', 'id'), (select max(id) from public.hub_market_items));


-- Servicios del taller

-- 4 registro(s)
insert into public.services (id, icon, title, description, sort_order) values
  (1, 'assets/icons/maintenance-hub-icon.svg', 'Mantenimiento', 'Preventivo y correctivo para tu vehiculo.', 0),
  (2, 'assets/icons/repair-hub-icon.svg', 'Reparacion', 'Especialistas en mecanica avanzada y Performance.', 1),
  (3, 'assets/icons/medical-scanner-hub-icon.svg', 'Chequeo y Diagnostico', 'Analisis computarizado y revision de toda la electronica de su vehiculo.', 2),
  (4, 'assets/icons/search-check-hub-icon.svg', 'Busqueda y Revision', 'Te ayudamos a encontrar y verificar tu proximo vehiculo.', 3)
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('public.services', 'id'), (select max(id) from public.services));


-- Noticias

-- 2 registro(s)
insert into public.news (id, title, text, text_large, image_url, images, scope, author, published_at) values
  (1, '809 Expo por primera vez en RD 🇩🇴', 'Evento con Car Show, Drift exhibition y entretenimiento en vivo. Con los mejores pilotos y proyectos de US y RD.', 'Por primera ves en Republica Dominicana. @809expo Presentado por 100X35 Expo y Clean Culture, traen AutoShow / Drift / Caribbean Culture en un evento con @adam_lz y amigos. El evento tendra lugar en el Autodromo de las Americas este Domingo 7 de Junio de 2026. Sera una experiencia de dia completo con seccion de Car Show, seccion de Drift, Vendor midway, entretenimiento en vivo y la premiacion de los mejores carros del evento. Podras registrar tu vehiculo para el evento proximamente en: cleancultureevents.com', 'assets/imgs/news/expo-809.jpg', array['assets/imgs/news/expo-809.jpg'], 'local'::public.news_scope, null, '2026-04-15'),
  (2, 'Primer Mercedes Benz completamente electrico', 'Mercedes ha lanzado su primer modelo totalmente electrico, el Mercedes C-Class. Un sedan con las ultimas tecnologias y comfort.', 'Así que, ¡que empiece el juego! Después de que BMW nos impresionara a todos con su revolucionario iX3, elegido Coche del Año por TG, y lo complementara con el magnífico sedán i3, Mercedes ha contraatacado: tras el GLC Electric llega este, el primer Mercedes-Benz Clase C totalmente eléctrico. Y el dato más destacado para muchos será su autonomía, porque… aún se queda corta en comparación con BMW. Mercedes anuncia hasta 760 kilómetros (473 millas) con una sola carga de su batería de 94 kWh, que, como bien saben los entusiastas de los coches eléctricos, es más pequeña que la batería que Múnich ha instalado en el i3. ¿Y para el resto de ustedes? Su aspecto. Este Clase C eléctrico incorpora la última versión del lenguaje de diseño de Mercedes, y la marca afirma que su "silueta de coupé" y su "expresivo diseño trasero GT" dan como resultado una "elegancia con un carisma impresionante".', 'assets/imgs/news/electric-mercedes.png', array['assets/imgs/news/electric-mercedes.png'], 'internacional'::public.news_scope, null, '2026-04-18')
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('public.news', 'id'), (select max(id) from public.news));


-- Social Hub: clubes

-- 4 registro(s)
insert into public.social_clubs (id, name, location, focus, description, image_url, members, is_official) values
  (1, 'Supra Club RD', 'Santo Domingo', 'JDM / Performance', 'Duenos y fanaticos de la Supra en Republica Dominicana. Meets mensuales y compras grupales de piezas.', 'assets/imgs/supra-mk4-2.webp', 312, true),
  (2, 'MK4 Crew', 'Santiago', 'Volkswagen / Project cars', 'Todo lo relacionado con la plataforma MK4. Asesoria entre miembros, herramientas compartidas y caravanas.', 'assets/imgs/vw-golf-mk4.webp', 178, false),
  (3, 'Citroen Crew', 'Distrito Nacional', 'Europeos / Daily drivers', 'Comunidad enfocada en mantener europeos economicos rodando. Piezas usadas verificadas y talleres de confianza.', 'assets/imgs/auto-hub/c3.jpeg', 94, false),
  (4, 'Offroad 809', 'La Vega', 'Pickups / 4x4', 'Rutas de fin de semana, montaje de barras LED y suspension elevada. Se recorre el pais completo.', 'assets/imgs/auto-hub/amarok.jpeg', 205, false)
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('public.social_clubs', 'id'), (select max(id) from public.social_clubs));


-- Social Hub: feed (author_id null = contenido sembrado)

-- 4 registro(s)
insert into public.social_posts (id, author_name, author_club, text, image_url, tags, likes, comments, created_at) values
  (1, 'Juan M.', 'Supra Club RD', 'Terminamos el armado del 2JZ despues de tres meses. Suena mejor de lo que esperaba. Gracias a todos los que ayudaron con las piezas.', 'assets/imgs/supra-white.webp', array['2JZ', 'Supra', 'BuildLog'], 184, 32, '2026-08-09T18:30:00'),
  (2, 'AutoHub Garage', null, 'Recordatorio: los coilovers Street Pro que estaban agotados ya volvieron al catalogo. Instalacion incluida esta semana.', 'assets/imgs/hub-parts/coilover-street-pro.jpg', array['Suspension', 'Catalogo'], 96, 11, '2026-08-08T14:05:00'),
  (3, 'Carlos R.', 'Citroen Crew', 'Mi C3 cumplio 20 anos rodando y sigue firme. Mantenimiento al dia y cero problemas. Los clasicos economicos tambien cuentan.', 'assets/imgs/citroen-c3.jpg', array['Citroen', 'DailyDriver'], 61, 8, '2026-08-07T09:20:00'),
  (4, 'Laura P.', 'MK4 Crew', 'Buscando quien haya hecho el swap de frenos delanteros en un Golf MK4. Quiero saber que kit usaron antes de comprar.', 'assets/imgs/vw-golf-mk4.webp', array['Golf', 'Frenos', 'Ayuda'], 43, 27, '2026-08-05T20:45:00')
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('public.social_posts', 'id'), (select max(id) from public.social_posts));


-- Social Hub: eventos

-- 3 registro(s)
insert into public.social_events (id, title, event_date, location, organizer, description, image_url, attendees, price) values
  (1, '809 Expo — Car Show & Drift', '2026-09-07', 'Autodromo de las Americas', '100X35 Expo / Clean Culture', 'Car show, exhibicion de drift, vendor midway y premiacion de los mejores proyectos del pais.', 'assets/imgs/news/expo-809.jpg', 1240, 1500),
  (2, 'Caravana Hub — Ruta Sur', '2026-09-21', 'Salida desde Santo Domingo', 'X AutoHub', 'Caravana abierta hasta Barahona. Punto de encuentro a las 6:00 AM, desayuno y paradas fotograficas.', 'assets/imgs/auto-hub/tiguan.jpeg', 86, 0),
  (3, 'Track Day — Novatos', '2026-10-05', 'Autodromo de las Americas', 'X AutoHub / Supra Club RD', 'Sesion guiada para quienes nunca han pisado pista. Incluye inspeccion tecnica previa e instructor.', 'assets/imgs/supra-mk4-3.webp', 48, 3500)
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('public.social_events', 'id'), (select max(id) from public.social_events));


-- Checkout: opciones de envío y métodos de pago (id de texto, sin secuencia)

-- 3 registro(s)
insert into public.shipping_options (id, label, description, price, eta_label, sort_order) values
  ('standard', 'Estándar', 'Entrega en 5–7 días hábiles.', 0, '5–7 días', 0),
  ('express', 'Express', 'Prioridad en almacén y envío acelerado.', 450, '2–3 días', 1),
  ('pickup', 'Retiro en hub', 'Coordinación por WhatsApp / correo al confirmar el pedido.', 0, 'A coordinar', 2)
on conflict (id) do nothing;


-- 3 registro(s)
insert into public.payment_methods (id, label, description, sort_order) values
  ('card', 'Tarjeta débito / crédito', 'Visa, Mastercard, American Express (integración pendiente).', 0),
  ('transfer', 'Transferencia bancaria', 'Recibirás los datos al confirmar el pedido.', 1),
  ('mercadopago', 'Mercado Pago', 'Wallet y cuotas según disponibilidad (integración pendiente).', 2)
on conflict (id) do nothing;

