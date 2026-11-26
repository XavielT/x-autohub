-- =============================================================================
-- 0063 · Cotizaciones y facturas de X AutoHub (solo admin)
-- =============================================================================
--
-- El panel (/admin/documentos) arma cotizaciones y facturas a partir de plantillas por tipo de
-- trabajo (mecánica, eléctrica y A/C, mantenimiento, instalación, venta de piezas, general), con
-- el logo y los datos de X AutoHub, para entregárselas al cliente en PDF o por WhatsApp.
--
--   · `business_documents`: el documento. Las líneas viven en `items` (jsonb): cada una lleva
--     `kind`, `description`, `quantity` y `unitPrice`. Solo un admin la lee y escribe.
--   · `document_counters`: el consecutivo por tipo (COT-0001, FAC-0001). Nunca retrocede, ni
--     aunque se borre un borrador. Nadie la toca desde el navegador.
--   · Los totales los calcula SIEMPRE Postgres al guardar (`business_documents_prepare()`); el
--     navegador solo los muestra. Es la misma regla que `document-totals.ts`: si cambias una,
--     cambia la otra.
--   · Una factura emitida no se borra, se anula: solo un borrador se puede eliminar.
--   · Ajuste `business_profile` en `site_settings`: nombre legal, RNC, teléfono, correo, dirección
--     y pie de los documentos. Nace aquí porque `set_site_setting()` solo cambia claves que existen.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES.
-- =============================================================================

create table if not exists public.document_counters (
  kind text primary key check (kind in ('cotizacion', 'factura')),
  last integer not null default 0
);

alter table public.document_counters enable row level security;
revoke all on public.document_counters from public;
revoke all on public.document_counters from anon, authenticated;

create table if not exists public.business_documents (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('cotizacion', 'factura')),
  number         integer not null default 0,
  template       text not null check (template in ('mecanica', 'electrica', 'mantenimiento', 'instalacion', 'venta', 'general')),
  status         text not null default 'borrador',
  customer_name  text not null check (length(btrim(customer_name)) > 0),
  customer_phone text not null default '',
  customer_email text not null default '',
  customer_rnc   text not null default '',
  vehicle        jsonb not null default '{}'::jsonb,
  issue_date     date not null default current_date,
  valid_until    date,
  items          jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  discount_type  text not null default 'amount' check (discount_type in ('amount', 'percent')),
  discount_value numeric(12, 2) not null default 0 check (discount_value >= 0),
  apply_itbis    boolean not null default false,
  itbis_rate     numeric(5, 2) not null default 18 check (itbis_rate >= 0 and itbis_rate <= 100),
  paid           numeric(12, 2) not null default 0 check (paid >= 0),
  notes          text not null default '',
  terms          text not null default '',
  source_id      uuid references public.business_documents (id) on delete set null,
  subtotal       numeric(12, 2) not null default 0,
  itbis          numeric(12, 2) not null default 0,
  total          numeric(12, 2) not null default 0,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint business_documents_status_valid check (
    (kind = 'cotizacion' and status in ('borrador', 'enviada', 'aceptada', 'rechazada', 'anulada'))
    or (kind = 'factura' and status in ('borrador', 'emitida', 'pagada', 'anulada'))
  )
);

create unique index if not exists business_documents_kind_number_key on public.business_documents (kind, number);
create index if not exists business_documents_created_idx on public.business_documents (created_at desc);

comment on table public.business_documents is
  'Cotizaciones y facturas de X AutoHub. Solo admin. Los totales los recalcula business_documents_prepare().';

-- Consecutivo y totales. security definer porque el contador no es del navegador.
create or replace function public.business_documents_prepare()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub   numeric;
  v_disc  numeric;
  v_base  numeric;
  v_itbis numeric;
begin
  if tg_op = 'INSERT' then
    insert into public.document_counters as c (kind, last)
    values (new.kind, 1)
    on conflict (kind) do update set last = c.last + 1
    returning c.last into new.number;
    new.created_by := coalesce(new.created_by, auth.uid());
  else
    -- El tipo, el número y el autor no se cambian después de creado.
    new.kind := old.kind;
    new.number := old.number;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  select round(coalesce(sum(
           greatest(coalesce((i ->> 'quantity')::numeric, 0), 0)
           * greatest(coalesce((i ->> 'unitPrice')::numeric, 0), 0)
         ), 0), 2)
    into v_sub
    from jsonb_array_elements(new.items) i;

  if new.discount_type = 'percent' then
    v_disc := round(v_sub * least(greatest(new.discount_value, 0), 100) / 100, 2);
  else
    v_disc := least(round(greatest(new.discount_value, 0), 2), v_sub);
  end if;

  v_base := round(v_sub - v_disc, 2);
  v_itbis := case when new.apply_itbis then round(v_base * greatest(new.itbis_rate, 0) / 100, 2) else 0 end;

  new.subtotal := v_sub;
  new.itbis := v_itbis;
  new.total := round(v_base + v_itbis, 2);
  new.paid := round(greatest(new.paid, 0), 2);
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.business_documents_prepare() from public;
revoke execute on function public.business_documents_prepare() from anon, authenticated;

drop trigger if exists business_documents_prepare on public.business_documents;
create trigger business_documents_prepare
  before insert or update on public.business_documents
  for each row execute function public.business_documents_prepare();

-- Solo admin. `anon` ni siquiera tiene el permiso de tabla.
alter table public.business_documents enable row level security;

revoke all on public.business_documents from public;
revoke all on public.business_documents from anon, authenticated;
grant select, insert, update, delete on public.business_documents to authenticated;

drop policy if exists "solo admin lee los documentos" on public.business_documents;
create policy "solo admin lee los documentos" on public.business_documents
  for select to authenticated using (public.is_admin());

drop policy if exists "solo admin crea los documentos" on public.business_documents;
create policy "solo admin crea los documentos" on public.business_documents
  for insert to authenticated with check (public.is_admin());

drop policy if exists "solo admin edita los documentos" on public.business_documents;
create policy "solo admin edita los documentos" on public.business_documents
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Solo un borrador se elimina; lo ya emitido se anula.
drop policy if exists "solo admin borra borradores" on public.business_documents;
create policy "solo admin borra borradores" on public.business_documents
  for delete to authenticated using (public.is_admin() and status = 'borrador');

-- Datos de quien emite. Lo vacío se completa en /admin/documentos.
insert into public.site_settings (key, value)
values (
  'business_profile',
  jsonb_build_object(
    'legal_name', 'X AutoHub',
    'rnc', '',
    'phone', '809-953-9782',
    'email', '',
    'address', '',
    'footer', 'Gracias por confiar en X AutoHub.'
  )
)
on conflict (key) do nothing;
