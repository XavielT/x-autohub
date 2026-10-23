-- =============================================================================
-- X AutoHub — Pedidos con pago por transferencia o WhatsApp (pivote, fase 4)
-- =============================================================================
--
-- Hasta aquí un pedido nacía `pending`, sin forma de pagarlo: el checkout
-- ofrecía una tarjeta que no existe y alguien tenía que llamar al cliente. Esta
-- migración le da al pedido su ciclo de vida real:
--
--   awaiting_payment → paid → preparing → shipped | ready_for_pickup → delivered
--                    ↘ cancelled (hasta que sale de la tienda)
--
-- y las piezas que lo sostienen:
--
--   1. Estados nuevos, y las columnas de `orders` que los necesitan: número
--      legible (#1042), tipo de entrega, provincia, comprobante, instalación.
--   2. `order_status_history`: quién cambió qué y cuándo. La llena un trigger.
--   3. `create_order()` con stock: valida y descuenta lo de inventario propio, no
--      toca lo bajo pedido, y deja el pedido en `awaiting_payment`.
--   4. `set_order_status()`: el único camino para cambiar el estado, con el orden
--      lógico comprobado dentro de Postgres.
--   5. Bucket privado `payment-proofs` y las funciones que dejan a un invitado
--      adjuntar su comprobante sin poder tocar nada más.
--   6. `get_order()` y `my_orders()`: lo que lee /pedido/:id y "Mis pedidos".
--   7. Métodos de pago (sin tarjeta, con WhatsApp) y los ajustes de las cuentas
--      bancarias y la dirección de retiro.
--
--
-- DOS TRAMPAS DE POSTGRES QUE ESTA MIGRACIÓN ESQUIVA
-- ---------------------------------------------------
-- · `ALTER TYPE ... ADD VALUE` no deja **usar** el valor nuevo en la misma
--   transacción (y las migraciones corren en una). Por eso nada de aquí lo
--   referencia donde Postgres lo evalúe al crear el objeto: no hay `update`
--   sobre `orders` con un estado nuevo, ni un `check` o un índice parcial que lo
--   nombre, y las funciones que lo comparan están en plpgsql o lo hacen como
--   texto (`status::text`). plpgsql no resuelve los literales hasta ejecutarse,
--   que ya es otra transacción.
--
-- · Una función `security definer` **no** necesita un interruptor de sesión para
--   saltarse un trigger de congelado: dentro de ella `current_user` es su dueño,
--   no `authenticated`. Por eso el trigger de `orders` bloquea por nombre de rol
--   (como el de 0014) y las funciones de aquí pasan sin más.
--
--
-- QUÉ SE DECIDIÓ EN ESTA MIGRACIÓN
-- ---------------------------------
-- · `payment_proof_url` guarda la **ruta** del archivo en el bucket, no una URL:
--   el bucket es privado y una URL pública no existe. El nombre de la columna es
--   el del plan; el panel pide una URL firmada de diez minutos cuando la
--   necesita.
--
-- · El stock que se descuenta queda **anotado por línea** (`stock_deducted`), y
--   es exactamente lo que se devuelve al cancelar. Derivarlo del producto
--   después sería frágil: la pieza puede haber pasado de inventario a bajo pedido
--   entre el pedido y la cancelación.
--
-- · Los pedidos anteriores a esta migración conservan su estado `pending` y su
--   `stock_deducted = 0`: nunca descontaron stock, así que cancelarlos no
--   inventa existencias.
--
-- · `bank_accounts` y `pickup_address` nacen con un valor **de ejemplo marcado
--   como tal** (`is_example`). El sitio público no muestra una cuenta de ejemplo
--   como si fuera real: cae a "te enviamos los datos por WhatsApp". Un cliente
--   que transfiere a una cuenta inventada es peor que un cliente que espera.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Estados y columnas
-- -----------------------------------------------------------------------------
-- El orden en el enum es el orden del ciclo. `pending` se queda como estado
-- técnico de los pedidos viejos y del instante entre el insert y su primer
-- cambio.

alter type public.order_status add value if not exists 'awaiting_payment' after 'pending';
alter type public.order_status add value if not exists 'preparing'        after 'paid';
alter type public.order_status add value if not exists 'ready_for_pickup' after 'shipped';

do $$
begin
  create type public.order_fulfillment as enum ('shipping', 'pickup');
exception when duplicate_object then null;
end
$$;

alter table public.orders
  add column if not exists order_number         integer,
  add column if not exists fulfillment_type     public.order_fulfillment not null default 'shipping',
  add column if not exists province             text,
  add column if not exists payment_proof_url    text,
  add column if not exists payment_confirmed_at timestamptz,
  add column if not exists whatsapp_opened_at   timestamptz,
  add column if not exists wants_installation   boolean not null default false,
  add column if not exists updated_at           timestamptz not null default now();

alter table public.order_items
  add column if not exists stock_deducted integer not null default 0;

do $$
begin
  alter table public.order_items
    add constraint order_items_stock_deducted_check
    check (stock_deducted >= 0 and stock_deducted <= quantity);
exception when duplicate_object then null;
end
$$;

-- Lo que ya era retiro en el taller lo sigue siendo.
update public.orders set fulfillment_type = 'pickup'
 where shipping_option_id = 'pickup' and fulfillment_type <> 'pickup';

-- El número legible. Los pedidos que ya existen lo reciben en el orden en que se
-- hicieron (una columna `identity` agregada a una tabla con filas los numera en
-- el orden físico del heap, que no es el cronológico).
create sequence if not exists public.orders_order_number_seq start with 1001;

update public.orders o
   set order_number = base.top + r.rn
  from (select id, row_number() over (order by created_at, id) as rn
          from public.orders where order_number is null) r,
       (select coalesce(max(order_number), 1000) as top from public.orders) base
 where o.id = r.id;

select setval('public.orders_order_number_seq',
              (select coalesce(max(order_number), 1000) from public.orders), true);

alter table public.orders alter column order_number set default nextval('public.orders_order_number_seq');
alter table public.orders alter column order_number set not null;
alter sequence public.orders_order_number_seq owned by public.orders.order_number;

create unique index if not exists orders_order_number_key on public.orders (order_number);

-- El comprobante de un pedido vive en la carpeta de ese pedido. Una restricción y
-- no solo la política del bucket: así nadie puede apuntar un pedido al archivo de
-- otro aunque llegue a escribir la columna.
do $$
begin
  alter table public.orders
    add constraint orders_proof_path_matches_order
    check (payment_proof_url is null or payment_proof_url like id::text || '/%');
exception when duplicate_object then null;
end
$$;

comment on column public.orders.order_number is 'El numero que se le dice al cliente: #1042.';
comment on column public.orders.payment_proof_url is
  'RUTA del comprobante en el bucket privado payment-proofs (<order_id>/<archivo>), no una URL.';
comment on column public.order_items.stock_deducted is
  'Cuanto stock descontó esta linea al crearse el pedido (0 si era bajo pedido o es anterior a 0018). Es lo que se devuelve al cancelar.';

create or replace function public.orders_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch
  before update on public.orders
  for each row execute function public.orders_touch();


-- -----------------------------------------------------------------------------
-- 2. Historial de estados
-- -----------------------------------------------------------------------------

create table if not exists public.order_status_history (
  id          bigint generated by default as identity primary key,
  order_id    uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status   public.order_status not null,
  changed_by  uuid references public.profiles(id) on delete set null,
  -- La nota la ve el cliente en su línea de tiempo ("Enviado con Vimenpaq, guía
  -- 123"). El panel lo dice junto al campo.
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists order_status_history_order_idx
  on public.order_status_history (order_id, created_at);

alter table public.order_status_history enable row level security;

drop policy if exists "el historial lo lee el dueño del pedido o un admin" on public.order_status_history;
create policy "el historial lo lee el dueño del pedido o un admin"
  on public.order_status_history for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.user_id = auth.uid() or public.is_admin())
    )
  );
-- Sin política de escritura: lo llena el trigger de abajo, que es `security
-- definer`. Es el mecanismo, no un olvido (misma idea que `site_settings`).

create or replace function public.log_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
  values (
    new.id,
    case when tg_op = 'UPDATE' then old.status else null end,
    new.status,
    auth.uid(),
    nullif(current_setting('app.order_status_note', true), '')
  );
  return new;
end;
$$;

drop trigger if exists orders_log_status_insert on public.orders;
create trigger orders_log_status_insert
  after insert on public.orders
  for each row execute function public.log_order_status();

drop trigger if exists orders_log_status_update on public.orders;
create trigger orders_log_status_update
  after update of status on public.orders
  for each row
  when (old.status is distinct from new.status)
  execute function public.log_order_status();


-- -----------------------------------------------------------------------------
-- 3. Congelado: el estado y el pago no se escriben a mano
-- -----------------------------------------------------------------------------
-- La política de `orders` deja a un admin actualizar cualquier columna, y con eso
-- se podría saltar el orden del ciclo (de `awaiting_payment` a `shipped` sin
-- pasar por `paid`). El trigger lo cierra para las claves del navegador; las
-- funciones `security definer` de abajo pasan porque dentro de ellas
-- `current_user` es su dueño. Una conexión SQL directa o `service_role` también:
-- es quien administra la base.

create or replace function public.guard_order_write()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.status               is distinct from old.status
    or new.payment_confirmed_at is distinct from old.payment_confirmed_at
    or new.payment_proof_url    is distinct from old.payment_proof_url
    or new.whatsapp_opened_at   is distinct from old.whatsapp_opened_at
    or new.order_number         is distinct from old.order_number
    or new.user_id              is distinct from old.user_id
  ) then
    raise exception 'El estado y el pago de un pedido solo cambian con las funciones del sistema.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_guard_write on public.orders;
create trigger orders_guard_write
  before update on public.orders
  for each row execute function public.guard_order_write();


-- -----------------------------------------------------------------------------
-- 4. create_order(): stock, entrega, instalación y estado inicial
-- -----------------------------------------------------------------------------
-- Cambia la firma (tres parámetros nuevos) **y** lo que devuelve. Dejar la de
-- diez parámetros viva haría que PostgREST respondiera PGRST203 ("no puedo elegir
-- entre dos funciones") a cualquier llamada con los diez, así que se retira.
-- Consecuencia: entre aplicar esta migración y desplegar el frontend nuevo, un
-- navegador con el JavaScript viejo no puede confirmar un pedido. Se aplica y se
-- despliega seguido.

drop function if exists public.create_order(
  text, text, text, text, text, jsonb, text, text, text, text
);

create or replace function public.create_order(
  p_contact_email      text,
  p_full_name          text,
  p_address_line1      text,
  p_shipping_option_id text,
  p_payment_method_id  text,
  p_items              jsonb,
  p_contact_phone      text    default null,
  p_city               text    default null,
  p_postal_code        text    default null,
  p_order_notes        text    default null,
  p_fulfillment_type   text    default 'shipping',
  p_province           text    default null,
  p_wants_installation boolean default false
)
returns table (
  id             uuid,
  order_number   integer,
  subtotal       numeric,
  shipping_price numeric,
  total          numeric
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_order_id       uuid;
  v_number         integer;
  v_subtotal       numeric(12,2);
  v_shipping_price numeric(12,2);
  v_total          numeric(12,2);
  v_item_count     integer;
  v_fulfillment    public.order_fulfillment;
  v_address        text;
  v_province       text;
  v_wants          boolean;
  v_row            record;
begin
  -- Quién compra. Se pide aquí y no solo en el formulario: es la única puerta.
  if coalesce(btrim(p_contact_email), '') = '' then
    raise exception 'Escribe tu correo electronico.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_full_name), '') = '' then
    raise exception 'Escribe tu nombre completo.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_contact_phone), '') = '' then
    raise exception 'Escribe tu telefono: lo usamos para coordinar la entrega.' using errcode = '22023';
  end if;

  -- Cómo se entrega.
  begin
    v_fulfillment := p_fulfillment_type::public.order_fulfillment;
  exception when invalid_text_representation then
    raise exception 'Tipo de entrega no valido.' using errcode = '22023';
  end;

  -- Un null no es "envio" ni "retiro": sin esto caeria en la rama de retiro.
  if v_fulfillment is null then
    raise exception 'Tipo de entrega no valido.' using errcode = '22023';
  end if;

  if v_fulfillment = 'shipping' then
    v_address  := btrim(coalesce(p_address_line1, ''));
    v_province := btrim(coalesce(p_province, ''));
    if v_address = '' then
      raise exception 'Escribe la direccion de entrega.' using errcode = '22023';
    end if;
    if v_province = '' then
      raise exception 'Elige la provincia de entrega.' using errcode = '22023';
    end if;
  else
    v_address  := 'Retiro en el taller';
    v_province := null;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Un pedido necesita al menos una pieza.' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_items) as i(part_id bigint, quantity integer)
    where i.part_id is null or i.quantity is null or i.quantity <= 0
  ) then
    raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  -- El envío sale de la tabla, no del navegador, y tiene que corresponder al tipo
  -- de entrega: retirar en el taller no cuesta envío y enviar no es retirar.
  select s.price into v_shipping_price
  from public.shipping_options s
  where s.id = p_shipping_option_id and s.is_active;

  if v_shipping_price is null then
    raise exception 'Metodo de envio no valido.' using errcode = '22023';
  end if;

  if (v_fulfillment = 'pickup') <> (p_shipping_option_id = 'pickup') then
    raise exception 'La opcion de envio no corresponde al tipo de entrega.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.payment_methods m
    where m.id = p_payment_method_id and m.is_active
  ) then
    raise exception 'Metodo de pago no valido.' using errcode = '22023';
  end if;

  -- Se bloquean las piezas, **en orden de id**, antes de mirar el stock: dos
  -- pedidos simultaneos de la ultima unidad no pueden ganar los dos, y dos
  -- pedidos con las mismas piezas en distinto orden no se bloquean entre si.
  perform 1
  from public.hub_parts h
  where h.id in (select i.part_id from jsonb_to_recordset(p_items) as i(part_id bigint))
  order by h.id
  for update;

  -- Subtotal calculado contra el catalogo: solo piezas activas y que quien compra
  -- pueda ver (0013).
  select coalesce(sum(h.price * i.quantity), 0), count(*)
  into v_subtotal, v_item_count
  from jsonb_to_recordset(p_items) as i(part_id bigint, quantity integer)
  join public.hub_parts h
    on h.id = i.part_id
   and h.is_active
   and (not h.is_test or public.can_see_test_items());

  if v_item_count <> jsonb_array_length(p_items) then
    raise exception 'Alguna pieza del carrito ya no esta disponible.' using errcode = '22023';
  end if;

  -- Stock: solo lo de inventario propio. Lo bajo pedido no depende de existencias.
  -- Si el carrito trae la misma pieza dos veces, se suman.
  for v_row in
    select h.id as part_id, h.name, h.stock, sum(i.quantity)::integer as wanted
    from jsonb_to_recordset(p_items) as i(part_id bigint, quantity integer)
    join public.hub_parts h on h.id = i.part_id
    where h.fulfillment = 'stock'
    group by h.id, h.name, h.stock
    order by h.id
  loop
    if v_row.stock <= 0 then
      raise exception 'Se agoto "%". Quitala del carrito para continuar.', v_row.name
        using errcode = '22023';
    elsif v_row.wanted > v_row.stock then
      raise exception 'De "%" solo quedan % y pediste %. Ajusta la cantidad.',
        v_row.name, v_row.stock, v_row.wanted
        using errcode = '22023';
    end if;
  end loop;

  -- La instalacion solo se puede pedir si algo del pedido se instala.
  v_wants := coalesce(p_wants_installation, false) and exists (
    select 1
    from jsonb_to_recordset(p_items) as i(part_id bigint, quantity integer)
    join public.hub_parts h on h.id = i.part_id
    where h.installable
  );

  v_total := v_subtotal + v_shipping_price;

  insert into public.orders (
    user_id, contact_email, contact_phone, full_name, address_line1,
    city, postal_code, province, shipping_option_id, payment_method_id, order_notes,
    fulfillment_type, wants_installation,
    subtotal, shipping_price, total, status
  ) values (
    auth.uid(), btrim(p_contact_email), btrim(p_contact_phone), btrim(p_full_name), v_address,
    nullif(btrim(coalesce(p_city, '')), ''), nullif(btrim(coalesce(p_postal_code, '')), ''),
    v_province, p_shipping_option_id, p_payment_method_id, nullif(btrim(coalesce(p_order_notes, '')), ''),
    v_fulfillment, v_wants,
    v_subtotal, v_shipping_price, v_total, 'awaiting_payment'
  )
  returning orders.id, orders.order_number into v_order_id, v_number;

  -- El nombre y el precio se congelan aqui, como ya documentaba el esquema. Y lo
  -- que se descuenta queda anotado en la linea, para poder devolverlo.
  insert into public.order_items (order_id, part_id, name, unit_price, quantity, stock_deducted)
  select v_order_id, h.id, h.name, h.price, i.quantity,
         case when h.fulfillment = 'stock' then i.quantity else 0 end
  from jsonb_to_recordset(p_items) as i(part_id bigint, quantity integer)
  join public.hub_parts h on h.id = i.part_id;

  update public.hub_parts h
     set stock = h.stock - d.qty
    from (select oi.part_id, sum(oi.stock_deducted) as qty
            from public.order_items oi
           where oi.order_id = v_order_id and oi.stock_deducted > 0
           group by oi.part_id) d
   where h.id = d.part_id;

  return query select v_order_id, v_number, v_subtotal, v_shipping_price, v_total;
end;
$$;

comment on function public.create_order(
  text, text, text, text, text, jsonb, text, text, text, text, text, text, boolean
) is 'Crea un pedido: precios y envio de la base, stock validado y descontado, estado awaiting_payment.';

-- Se le da a `anon` a propósito: el checkout de invitado existe (0002) y esta es
-- la única puerta por la que el navegador puede crear un pedido.
revoke all on function public.create_order(
  text, text, text, text, text, jsonb, text, text, text, text, text, text, boolean
) from public;

grant execute on function public.create_order(
  text, text, text, text, text, jsonb, text, text, text, text, text, text, boolean
) to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 5. Cambiar el estado: solo set_order_status(), solo un admin
-- -----------------------------------------------------------------------------
-- El orden lógico vive aquí y no en el panel: el panel solo ofrece los botones
-- que esta función aceptaría, pero quien la llame por otro lado recibe lo mismo.
--
--   pending           → awaiting_payment · paid · cancelled   (los pendientes viejos)
--   awaiting_payment  → paid · cancelled
--   paid              → preparing · cancelled
--   preparing         → shipped (si es envio) · ready_for_pickup (si es retiro) · cancelled
--   shipped           → delivered
--   ready_for_pickup  → delivered
--
-- Cancelar solo se puede antes de que la pieza salga. Estricto a propósito: saltar
-- `preparing` ahorraría un toque, pero el día que alguien lo necesite se agrega
-- aquí en una línea; quitar un atajo que ya se usa es peor.

create or replace function public.set_order_status(
  p_order_id uuid,
  p_to       text,
  p_note     text default null
)
returns table (id uuid, order_number integer, status text, payment_confirmed_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_order   public.orders%rowtype;
  v_from    text;
  v_allowed boolean;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar el estado de los pedidos.'
      using errcode = '42501';
  end if;

  select o.* into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'Ese pedido no existe.' using errcode = '22023';
  end if;

  if p_to is null or p_to not in (
    'pending', 'awaiting_payment', 'paid', 'preparing',
    'shipped', 'ready_for_pickup', 'delivered', 'cancelled'
  ) then
    raise exception 'Estado no valido: %.', coalesce(p_to, 'vacio') using errcode = '22023';
  end if;

  v_from := v_order.status::text;

  v_allowed := case v_from
    when 'pending'          then p_to in ('awaiting_payment', 'paid', 'cancelled')
    when 'awaiting_payment' then p_to in ('paid', 'cancelled')
    when 'paid'             then p_to in ('preparing', 'cancelled')
    when 'preparing'        then (p_to = 'shipped'          and v_order.fulfillment_type::text = 'shipping')
                              or (p_to = 'ready_for_pickup' and v_order.fulfillment_type::text = 'pickup')
                              or  p_to = 'cancelled'
    when 'shipped'          then p_to = 'delivered'
    when 'ready_for_pickup' then p_to = 'delivered'
    else false
  end;

  if not v_allowed then
    raise exception 'Un pedido % no puede pasar a %.', v_from, p_to using errcode = '22023';
  end if;

  perform set_config('app.order_status_note', coalesce(btrim(p_note), ''), true);

  update public.orders o
     set status = p_to::public.order_status,
         payment_confirmed_at = case when p_to = 'paid' then now() else o.payment_confirmed_at end
   where o.id = p_order_id;

  perform set_config('app.order_status_note', '', true);

  -- Cancelar devuelve lo que el pedido descontó, una sola vez.
  if p_to = 'cancelled' then
    update public.hub_parts h
       set stock = h.stock + d.qty
      from (select oi.part_id, sum(oi.stock_deducted) as qty
              from public.order_items oi
             where oi.order_id = p_order_id and oi.stock_deducted > 0 and oi.part_id is not null
             group by oi.part_id) d
     where h.id = d.part_id;

    update public.order_items oi set stock_deducted = 0 where oi.order_id = p_order_id;
  end if;

  return query
    select o.id, o.order_number, o.status::text, o.payment_confirmed_at
    from public.orders o where o.id = p_order_id;
end;
$$;

comment on function public.set_order_status(uuid, text, text) is
  'Mueve un pedido al siguiente estado valido. Solo admin (lo comprueba dentro de Postgres).';

revoke all on function public.set_order_status(uuid, text, text) from public;
revoke execute on function public.set_order_status(uuid, text, text) from anon;
grant execute on function public.set_order_status(uuid, text, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 6. Comprobantes de pago
-- -----------------------------------------------------------------------------
-- Bucket privado: nadie lo lee con una URL. Sube el invitado (con el id del
-- pedido, que es un uuid imposible de adivinar, en la ruta del archivo) o el
-- dueño; leen el dueño y un admin. 10 MB, imagen o PDF.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs', 'payment-proofs', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ¿Puede este pedido recibir un comprobante? Existe, se paga por transferencia,
-- todavía no se confirmó el pago y no es de otra persona. `security definer`
-- porque la política de storage se evalúa con el rol de quien sube, y un invitado
-- no puede leer `orders`. El parámetro es texto y se compara como texto: una
-- carpeta que no sea un uuid dice "no" en vez de romper la política con un error
-- de cast.
create or replace function public.order_accepts_proof(p_folder text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.orders o
    where o.id::text = p_folder
      and o.payment_method_id = 'transfer'
      and o.status::text in ('pending', 'awaiting_payment')
      and (o.user_id is null or o.user_id = auth.uid() or public.is_admin())
  );
$$;

revoke all on function public.order_accepts_proof(text) from public;
grant execute on function public.order_accepts_proof(text) to anon, authenticated;

drop policy if exists "se sube el comprobante al pedido propio" on storage.objects;
create policy "se sube el comprobante al pedido propio"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'payment-proofs'
    and public.order_accepts_proof((storage.foldername(name))[1])
  );

drop policy if exists "el comprobante lo lee el dueño o un admin" on storage.objects;
create policy "el comprobante lo lee el dueño o un admin"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (
      public.is_admin()
      or exists (
        select 1 from public.orders o
        where o.id::text = (storage.foldername(name))[1]
          and o.user_id = auth.uid()
      )
    )
  );

-- Registrar el comprobante en el pedido. Un invitado no puede hacer `update` en
-- `orders` (ni debe), así que esta función hace el único cambio que le toca:
-- apuntar su pedido a un archivo que **ya existe** en la carpeta de ese pedido.
create or replace function public.attach_payment_proof(p_order_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_path is null or p_path not like p_order_id::text || '/%' or length(p_path) > 200 then
    raise exception 'Ese archivo no pertenece a este pedido.' using errcode = '22023';
  end if;

  if not public.order_accepts_proof(p_order_id::text) then
    raise exception 'Este pedido ya no recibe comprobantes.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from storage.objects so
    where so.bucket_id = 'payment-proofs' and so.name = p_path
  ) then
    raise exception 'No encontramos el archivo subido. Intenta de nuevo.' using errcode = '22023';
  end if;

  update public.orders o set payment_proof_url = p_path where o.id = p_order_id;
end;
$$;

revoke all on function public.attach_payment_proof(uuid, text) from public;
grant execute on function public.attach_payment_proof(uuid, text) to anon, authenticated;

-- Quedó anotado que el cliente abrió WhatsApp. Idempotente: solo la primera vez.
create or replace function public.mark_whatsapp_opened(p_order_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.orders o
     set whatsapp_opened_at = coalesce(o.whatsapp_opened_at, now())
   where o.id = p_order_id;
$$;

revoke all on function public.mark_whatsapp_opened(uuid) from public;
grant execute on function public.mark_whatsapp_opened(uuid) to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 7. Leer un pedido
-- -----------------------------------------------------------------------------
-- /pedido/:id es público por id: el uuid es la llave. Devuelve lo que el cliente
-- necesita ver y **nada de lo personal**: ni correo, ni teléfono, ni dirección.
-- Quien tiene el enlace (un invitado, o el dueño desde otro dispositivo) ve su
-- pedido; quien lo adivinara no tendría con qué.

create or replace function public.get_order(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id',                    o.id,
    'order_number',          o.order_number,
    'status',                o.status,
    'fulfillment_type',      o.fulfillment_type,
    'payment_method_id',     o.payment_method_id,
    'wants_installation',    o.wants_installation,
    'subtotal',              o.subtotal,
    'shipping_price',        o.shipping_price,
    'total',                 o.total,
    'created_at',            o.created_at,
    'has_proof',             o.payment_proof_url is not null,
    'whatsapp_opened_at',    o.whatsapp_opened_at,
    'payment_confirmed_at',  o.payment_confirmed_at,
    'installation_service_id', (
      select h.installation_service_id
      from public.order_items oi
      join public.hub_parts h on h.id = oi.part_id
      where oi.order_id = o.id and h.installable and h.installation_service_id is not null
      order by oi.id
      limit 1
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', oi.name, 'unit_price', oi.unit_price, 'quantity', oi.quantity
             ) order by oi.id)
      from public.order_items oi where oi.order_id = o.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'from_status', hs.from_status, 'to_status', hs.to_status,
               'note', hs.note, 'created_at', hs.created_at
             ) order by hs.created_at, hs.id)
      from public.order_status_history hs where hs.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  where o.id = p_order_id;
$$;

revoke all on function public.get_order(uuid) from public;
grant execute on function public.get_order(uuid) to anon, authenticated;

-- "Mis pedidos". `security invoker`: RLS ya dice que cada quien ve los suyos, y
-- el `where` lo repite para que el plan sea el del índice.
create or replace function public.my_orders()
returns table (
  id                 uuid,
  order_number       integer,
  status             public.order_status,
  fulfillment_type   public.order_fulfillment,
  payment_method_id  text,
  total              numeric,
  created_at         timestamptz,
  item_count         bigint,
  has_proof          boolean,
  wants_installation boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select o.id, o.order_number, o.status, o.fulfillment_type, o.payment_method_id,
         o.total, o.created_at,
         coalesce((select sum(oi.quantity) from public.order_items oi where oi.order_id = o.id), 0),
         o.payment_proof_url is not null,
         o.wants_installation
  from public.orders o
  where o.user_id = auth.uid()
  order by o.created_at desc;
$$;

revoke all on function public.my_orders() from public;
revoke execute on function public.my_orders() from anon;
grant execute on function public.my_orders() to authenticated;


-- -----------------------------------------------------------------------------
-- 8. Métodos de pago, ajustes y entrega
-- -----------------------------------------------------------------------------
-- Sin pasarela de tarjeta en esta ronda: `card` y `mercadopago` se desactivan, no
-- se borran (los pedidos viejos los referencian y el día que haya pasarela se
-- vuelven a encender). Se agrega `whatsapp`. En una base nueva estas filas no
-- existen todavía (el seed va después) y se crean ya con su valor final.

insert into public.payment_methods (id, label, description, sort_order, is_active) values
  ('card',        'Tarjeta débito / crédito', 'Visa, Mastercard, American Express (integración pendiente).', 8, false),
  ('mercadopago', 'Mercado Pago', 'Wallet y cuotas según disponibilidad (integración pendiente).',        9, false)
on conflict (id) do update set is_active = false;

insert into public.payment_methods (id, label, description, sort_order, is_active) values
  ('transfer', 'Transferencia bancaria', 'Transfieres y subes el comprobante; confirmamos tu pago y preparamos el pedido.', 0, true),
  ('whatsapp', 'Pedir por WhatsApp', 'Cerramos el pedido y el pago por WhatsApp con nuestro equipo.', 1, true)
on conflict (id) do nothing;

-- El texto del seed original, que ya no es cierto: ahora el cliente sube el
-- comprobante. Solo se toca si nadie lo editó.
update public.payment_methods
   set description = 'Transfieres y subes el comprobante; confirmamos tu pago y preparamos el pedido.'
 where id = 'transfer' and description = 'Recibirás los datos al confirmar el pedido.';

update public.shipping_options
   set description = 'Retira tu pedido en el taller. Te avisamos cuando esté listo.'
 where id = 'pickup' and description = 'Coordinación por WhatsApp / correo al confirmar el pedido.';

-- `site_settings`: la forma de los dos ajustes nuevos. Postgres no comprueba el
-- tipo de un jsonb, así que se comprueba aquí, como ya se hace con `stats_mode`.
alter table public.site_settings
  drop constraint if exists site_settings_value_valid;

alter table public.site_settings
  add constraint site_settings_value_valid check (
    (key <> 'stats_mode'     or value #>> '{}' in ('showcase', 'real'))
    and (key <> 'bank_accounts'  or jsonb_typeof(value) = 'array')
    and (key <> 'pickup_address' or jsonb_typeof(value) = 'object')
  );

-- Valores de EJEMPLO, marcados como tales. El sitio no los muestra como reales:
-- ver la cabecera. Se reemplazan desde /admin/ajustes.
insert into public.site_settings (key, value) values
  ('bank_accounts',
   '[{"bank":"Banco de ejemplo","holder":"Titular de ejemplo","number":"000-000000-0","type":"Corriente","is_example":true}]'),
  ('pickup_address',
   '{"address":"Dirección de ejemplo: reemplázala desde Ajustes","hours":"Horario de ejemplo","is_example":true}')
on conflict (key) do nothing;
