-- =============================================================================
-- 0066 · Cobros de las facturas: abonos con fecha, monto y método
-- =============================================================================
--
-- Hasta aquí una factura tenía un solo monto "abonado" que se escribía a mano. Un cobro real son varios abonos, cada uno con
-- su fecha, su monto, cómo se pagó y una nota (el número de transferencia, por ejemplo). Ahora:
--
--   · `business_documents.payments` (jsonb): la lista de abonos, `{ id, date, amount, method, note }`. Solo las facturas
--     tienen abonos; en una cotización se vacía.
--   · `paid` deja de escribirse desde el navegador: lo calcula `business_documents_prepare()` como la suma de los abonos, igual
--     que los demás totales. El pendiente (total − cobrado) lo calculan el navegador y las vistas con la misma regla
--     (`document-totals.ts`).
--   · Cada abono tiene que ser mayor que cero.
--   · Lo que ya estaba "abonado" a mano pasa a ser un abono ("Abono anterior", con la fecha de emisión) para no perder el dato.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES.
-- =============================================================================

alter table public.business_documents add column if not exists payments jsonb not null default '[]'::jsonb;

alter table public.business_documents drop constraint if exists business_documents_payments_check;
alter table public.business_documents
  add constraint business_documents_payments_check check (jsonb_typeof(payments) = 'array');

-- La misma función de la 0063, con el cálculo de lo cobrado a partir de los abonos.
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

  -- Lo cobrado es la suma de los abonos. Una cotización no se cobra: sin abonos.
  if new.kind = 'cotizacion' then
    new.payments := '[]'::jsonb;
    new.paid := 0;
  else
    -- La restricción de la tabla también lo exige, pero este trigger corre antes: aquí se dice con palabras claras.
    if jsonb_typeof(new.payments) is distinct from 'array' then
      raise exception 'Los abonos tienen que ser una lista.' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(new.payments) p
       where coalesce((p ->> 'amount')::numeric, 0) <= 0
    ) then
      raise exception 'Cada abono tiene que ser mayor que cero.' using errcode = '22023';
    end if;
    new.paid := round(coalesce((select sum((p ->> 'amount')::numeric) from jsonb_array_elements(new.payments) p), 0), 2);
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.business_documents_prepare() from public;
revoke execute on function public.business_documents_prepare() from anon, authenticated;

-- Lo "abonado" a mano antes de esta migración pasa a ser un abono. Solo si la factura aún no tiene abonos: repetir la migración no duplica.
update public.business_documents
   set payments = jsonb_build_array(
         jsonb_build_object(
           'id', gen_random_uuid()::text,
           'date', issue_date::text,
           'amount', paid,
           'method', 'otro',
           'note', 'Abono anterior'
         )
       )
 where kind = 'factura'
   and paid > 0
   and payments = '[]'::jsonb;
