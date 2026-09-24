-- Ejecutar una vez en Supabase SQL Editor.
-- No modifica las tablas históricas hardware/logs ni la tabla usuario existente.

do $$
begin
  create type public.app_role as enum ('ADMIN', 'OPERATOR');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'OPERATOR'
);

alter table public.user_profiles enable row level security;
alter table public.user_roles enable row level security;

grant select, update on public.user_profiles to authenticated;
revoke all on public.user_profiles from anon;
revoke all on public.user_roles from anon, authenticated, public;

drop policy if exists "Users read own profile" on public.user_profiles;
create policy "Users read own profile"
on public.user_profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users update own profile" on public.user_profiles;
create policy "Users update own profile"
on public.user_profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.user_profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'OPERATOR')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_green_ai on auth.users;
create trigger on_auth_user_created_green_ai
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

-- Cubre usuarios creados en Auth antes de instalar el trigger.
insert into public.user_profiles (id, full_name)
select id, coalesce(raw_user_meta_data ->> 'full_name', '')
from auth.users
on conflict (id) do nothing;

insert into public.user_roles (user_id, role)
select id, 'OPERATOR'
from auth.users
on conflict (user_id) do nothing;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  assigned_role public.app_role;
begin
  select role into assigned_role
  from public.user_roles
  where user_id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';
  claims := jsonb_set(
    claims,
    '{user_role}',
    to_jsonb(coalesce(assigned_role, 'OPERATOR'::public.app_role))
  );
  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant all on table public.user_roles to supabase_auth_admin;

drop policy if exists "Auth hook reads user roles" on public.user_roles;
create policy "Auth hook reads user roles"
on public.user_roles
as permissive for select
to supabase_auth_admin
using (true);

-- Para promover un usuario, ejecutar manualmente con su correo:
-- update public.user_roles
-- set role = 'ADMIN'
-- where user_id = (select id from auth.users where email = 'admin@ejemplo.com');
