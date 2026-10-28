-- ==========================================================================
-- DEVELOPMENT STAGES  (run after coach-requests.sql)
-- The coach and the family each place the athlete on the 5-stage ladder.
-- When they differ, the portal flags it as a talking point.
--   1 Physical Literacy · 2 Wrestling Foundations · 3 Style Exploration
--   4 Regional Performance · 5 National Performance
-- ==========================================================================
alter table public.athletes
  add column if not exists coach_stage     smallint check (coach_stage between 1 and 5),
  add column if not exists family_stage    smallint check (family_stage between 1 and 5),
  add column if not exists coach_stage_at  timestamptz,
  add column if not exists family_stage_at timestamptz;

-- Coaches (or admins) set the coach view; guardians set the family view.
create or replace function public.set_athlete_stage(p_athlete uuid, p_stage int) returns text
language plpgsql security definer set search_path = public as $$
declare who text; nm text;
begin
  if p_stage is null or p_stage < 1 or p_stage > 5 then raise exception 'Pick a stage from 1 to 5.'; end if;
  select full_name into nm from public.athletes where id = p_athlete;
  if public.coaches_athlete(p_athlete) or public.is_admin() then
    update public.athletes set coach_stage = p_stage, coach_stage_at = now() where id = p_athlete;
    who := 'coach';
  elsif public.guards_athlete(p_athlete) then
    update public.athletes set family_stage = p_stage, family_stage_at = now() where id = p_athlete;
    who := 'family';
  else
    raise exception 'You don''t have permission to change this athlete''s stage.';
  end if;
  insert into public.audit_log (actor_id, action)
    values (public.me(), 'Set ' || who || ' stage ' || p_stage || ' — ' || coalesce(nm, 'athlete'));
  return who;
end $$;
revoke execute on function public.set_athlete_stage(uuid, int) from public, anon;
grant execute on function public.set_athlete_stage(uuid, int) to authenticated;
