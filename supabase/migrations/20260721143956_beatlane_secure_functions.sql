-- Harden trigger helpers (advisor WARN fixes)

alter function public.set_updated_at() set search_path = public;

revoke all on function public.set_updated_at() from public;
revoke all on function public.set_updated_at() from anon, authenticated;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon, authenticated;
-- Keep execute for postgres/supabase_admin (trigger owner)
grant execute on function public.handle_new_user() to postgres, service_role;
grant execute on function public.set_updated_at() to postgres, service_role;
