-- Las fichas sembradas de Auto Hub llevaban texto de relleno en latín ("Lorem ipsum…") como descripción.
-- El seed no actualiza lo que ya existe, así que esto lo corrige en la base real: reemplaza SOLO
-- la descripción que sigue siendo el relleno (si alguien ya la escribió desde el panel, no se toca).
-- El texto usa únicamente datos de la ficha (año, color, kilometraje, carrocería, tracción, combustible, ubicación).

update public.auto_hub_vehicles v
   set description = d.description
  from (values
  (0, 'Citroën DS3 2015 en color gris, con 92,000 km. Es un hatchback con tracción delantera y motor a gasolina. Lo puedes ver en Santo Domingo Este: escríbenos por WhatsApp para coordinar una visita.'),
  (1, 'Volkswagen Tiguan 2014 en color negro, con 143,000 km. Es un SUV con tracción delantera y motor a gasolina. Lo puedes ver en Santo Domingo Norte: escríbenos por WhatsApp para coordinar una visita.'),
  (2, 'Citroën C3 2003 en color gris, con 116,000 km. Es un hatchback con tracción delantera y motor a gasolina. Lo puedes ver en Distrito Nacional: escríbenos por WhatsApp para coordinar una visita.'),
  (3, 'Dodge Charger 2018 en color gris, con 41,000 km. Es un sedán con tracción trasera y motor a gasolina. Lo puedes ver en Santiago: escríbenos por WhatsApp para coordinar una visita.'),
  (4, 'Volkswagen Jetta 2003 en color negro, con 41,000 km. Es un sedán con tracción delantera y motor a gasolina. Lo puedes ver en Punta Cana: escríbenos por WhatsApp para coordinar una visita.'),
  (5, 'Volkswagen Amarok 2019 en color azul, con 41,000 km. Es un pickup con tracción 4x4 y motor a diésel. Lo puedes ver en La Romana: escríbenos por WhatsApp para coordinar una visita.')
  ) as d(id, description)
 where v.id = d.id
   and v.is_test = false
   and v.description ~* '(lorem ipsum|fusce|vestibulum|maecenas|nunc|cras|praesent)';
