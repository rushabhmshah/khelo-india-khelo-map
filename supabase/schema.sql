-- ============================================================================
-- Khelo India Khelo Member Map — Supabase schema
-- Run once in Supabase → SQL Editor. Then run categories_seed.sql.
--
-- Flow:
--   1. The join form calls auth.signInWithOtp(email) and puts the form data in the
--      new user's metadata. Supabase emails a confirmation link.
--   2. Nothing is public yet. The person is only an unconfirmed auth user.
--   3. When they click the link, auth.users.email_confirmed_at is set, and the
--      trigger below copies their details into public.members, which puts the pin on the map.
-- ============================================================================

-- Allowed category / sub-category pairs (seeded from js/categories.js)
create table if not exists public.business_categories (
  category    text not null,
  subcategory text not null,
  primary key (category, subcategory)
);

create table if not exists public.members (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null check (char_length(full_name) between 2 and 80),
  email         text not null,
  phone         text not null check (phone ~ '^\+[0-9]{7,15}$'),
  whatsapp      text not null check (whatsapp ~ '^\+[0-9]{7,15}$'),
  business_name text not null check (char_length(business_name) between 2 and 120),
  category      text not null,
  subcategory   text not null,
  place_label   text not null,          -- e.g. "Andheri, Mumbai, Maharashtra, India"
  locality      text,
  city          text,
  state         text,
  country       text not null,
  country_code  text,
  lat           double precision not null check (lat between -90 and 90),
  lng           double precision not null check (lng between -180 and 180),
  verified_at   timestamptz not null default now(),
  foreign key (category, subcategory) references public.business_categories (category, subcategory)
);

create index if not exists members_category_idx on public.members (category, subcategory);
create index if not exists members_country_idx  on public.members (country, state, city);

-- ---------------------------------------------------------------------------
-- Copy a confirmed sign-up into members
-- ---------------------------------------------------------------------------
create or replace function public.handle_confirmed_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m jsonb := new.raw_user_meta_data;
begin
  if new.email_confirmed_at is null or coalesce(m->>'kik_signup', '') <> 'true' then
    return new;
  end if;

  insert into public.members (
    id, full_name, email, phone, whatsapp, business_name, category, subcategory,
    place_label, locality, city, state, country, country_code, lat, lng
  ) values (
    new.id,
    trim(m->>'full_name'),
    lower(new.email),
    m->>'phone',
    m->>'whatsapp',
    trim(m->>'business_name'),
    m->>'category',
    m->>'subcategory',
    m->>'place_label',
    nullif(m->>'locality', ''),
    nullif(m->>'city', ''),
    nullif(m->>'state', ''),
    m->>'country',
    nullif(m->>'country_code', ''),
    (m->>'lat')::double precision,
    (m->>'lng')::double precision
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.handle_confirmed_signup();

-- ---------------------------------------------------------------------------
-- Privacy (DPDP-friendly)
--   • The public map shows name, business, category and area. It never shows contact details.
--   • Phone, WhatsApp and email are visible only to signed-in, confirmed members.
--   • Members can edit or delete their own entry.
-- ---------------------------------------------------------------------------
alter table public.members enable row level security;
alter table public.business_categories enable row level security;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where id = auth.uid());
$$;

drop policy if exists "categories readable" on public.business_categories;
create policy "categories readable" on public.business_categories for select using (true);

drop policy if exists "members see full directory" on public.members;
create policy "members see full directory" on public.members
  for select to authenticated using (public.is_member());

drop policy if exists "member edits own row" on public.members;
create policy "member edits own row" on public.members
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "member deletes own row" on public.members;
create policy "member deletes own row" on public.members
  for delete to authenticated using (id = auth.uid());

-- Public pins: a view without contact columns, readable by anyone
create or replace view public.member_pins
with (security_invoker = false) as
  select id, full_name, business_name, category, subcategory,
         place_label, locality, city, state, country, country_code, lat, lng, verified_at
  from public.members;

revoke all on public.members from anon;
grant select on public.member_pins to anon, authenticated;
grant select, update, delete on public.members to authenticated;
