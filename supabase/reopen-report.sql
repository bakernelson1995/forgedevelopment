-- ==========================================================================
-- REOPEN A PUBLISHED REPORT  (run after stages.sql)
-- Published reports stay locked. An administrator can reopen one for
-- corrections: it goes back to a draft (hidden from the family), the coach
-- edits it, approves it and publishes it again.
-- ==========================================================================
create or replace function public.guard_assessment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status in ('ready','published') then
      raise exception 'New assessments start as drafts.';
    end if;
    new.coach_id := coalesce(new.coach_id, public.me());
    new.approved_at := null; new.published_at := null; new.acknowledged_at := null;
    return new;
  end if;

  if old.status = 'published' then
    -- Only the reopen_report() function (admin-checked) may unlock a report.
    if coalesce(current_setting('forge.reopening', true), '') = 'on' and new.status = 'draft' then
      new.updated_at := now(); new.approved_at := null; new.published_at := null; new.acknowledged_at := null;
      return new;
    end if;
    if (new.status, new.ratings, new.style_ratings, new.stand, new.well, new.tough, new.adj_coach,
        new.adj_athlete, new.take, new.period, new.athlete_id, new.published_at, new.approved_at)
       is distinct from
       (old.status, old.ratings, old.style_ratings, old.stand, old.well, old.tough, old.adj_coach,
        old.adj_athlete, old.take, old.period, old.athlete_id, old.published_at, old.approved_at) then
      raise exception 'This report is published and locked. Contact an administrator for corrections.';
    end if;
    return new;
  end if;

  new.updated_at := now();
  if new.status = 'published' then
    if old.status <> 'ready' then raise exception 'Approve the report before publishing.'; end if;
    new.published_at := now();
    new.acknowledged_at := null;
  elsif new.status = 'ready' then
    new.approved_at := coalesce(case when old.status = 'ready' then old.approved_at end, now());
  else
    new.approved_at := null;
  end if;
  return new;
end $$;

create or replace function public.reopen_report(p_assessment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not public.is_admin() then raise exception 'Only an administrator can reopen a published report.'; end if;
  select s.period, s.status, a.full_name into r
    from public.assessments s join public.athletes a on a.id = s.athlete_id where s.id = p_assessment;
  if not found then raise exception 'Report not found.'; end if;
  if r.status <> 'published' then raise exception 'This report isn''t published.'; end if;
  perform set_config('forge.reopening', 'on', true);
  update public.assessments set status = 'draft' where id = p_assessment;
  perform set_config('forge.reopening', '', true);
  insert into public.audit_log (actor_id, action)
    values (public.me(), 'Reopened ' || to_char(r.period, 'FMMonth YYYY') || ' report for corrections — ' || r.full_name);
end $$;
revoke execute on function public.reopen_report(uuid) from public, anon;
grant execute on function public.reopen_report(uuid) to authenticated;
