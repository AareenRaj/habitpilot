-- Run once in a fresh Supabase project's SQL editor. All timestamps are timestamptz (UTC).
begin;
create table public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 data jsonb not null, revision integer not null default 0 check(revision>=0),
 updated_at timestamptz not null default now(),
 check(length(data->>'name') between 1 and 60),
 check(length(data->>'goal')<=300)
);
create table public.habits (
 id uuid not null, user_id uuid not null references public.profiles(user_id) on delete cascade,
 name text not null check(length(name) between 1 and 80), category text not null,
 description text not null default '' check(length(description)<=400),
 start_date date not null, created_at timestamptz not null, primary key(user_id,id)
);
create table public.schedule_history (
 user_id uuid not null, habit_id uuid not null, effective_date date not null,
 weekdays integer[] not null check(cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]),
 target numeric not null check(target>0 and target<=10000),
 tracking_type text not null check(tracking_type in ('boolean','quantity')),
 unit text not null check(length(unit)<=30),
 status text not null check(status in ('active','paused','archived')),
 primary key(user_id,habit_id,effective_date),
 foreign key(user_id,habit_id) references public.habits(user_id,id) on delete cascade,
 check(tracking_type='boolean' or length(unit)>0)
);
create table public.check_ins (
 user_id uuid not null, habit_id uuid not null, local_date date not null,
 value numeric not null check(value>=0 and value<=10000), note text not null default '' check(length(note)<=1000),
 timezone text not null, updated_at timestamptz not null default now(),
 primary key(user_id,habit_id,local_date),
 foreign key(user_id,habit_id) references public.habits(user_id,id) on delete cascade
);
create table public.reflections (
 user_id uuid not null references public.profiles(user_id) on delete cascade,
 local_date date not null, text text not null check(length(text)<=1000),
 timezone text not null, updated_at timestamptz not null default now(), primary key(user_id,local_date)
);
create table public.ai_reviews (
 user_id uuid not null references public.profiles(user_id) on delete cascade,
 cache_key text not null check(length(cache_key)=64),response jsonb not null,
 created_at timestamptz not null default now(),primary key(user_id,cache_key)
);
create table public.ai_rate_limits (
 user_id uuid not null references public.profiles(user_id) on delete cascade,
 bucket timestamptz not null,requests integer not null default 1,primary key(user_id,bucket)
);
create index check_ins_user_date on public.check_ins(user_id,local_date);
create index habits_user_start on public.habits(user_id,start_date);
create index ai_reviews_created on public.ai_reviews(user_id,created_at);

-- Each table is owner isolated even if accessed directly through PostgREST.
-- Writes ONLY through checked RPCs; no anon grants and no direct authenticated DML.
do $$ declare t text; begin
 foreach t in array array['profiles','habits','schedule_history','check_ins','reflections','ai_reviews','ai_rate_limits'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy owner_read on public.%I for select to authenticated using (user_id = (select auth.uid()))',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;

create function public.load_habitpilot() returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare u uuid := auth.uid(); result jsonb; begin
 if u is null then raise exception 'authentication required'; end if;
 select jsonb_build_object('version',1,'revision',p.revision,'profile',p.data,
 'habits',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'name',h.name,'category',h.category,'description',h.description,'start',h.start_date,'createdAt',to_char(h.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'schedules',coalesce((select jsonb_agg(jsonb_build_object('effective',v.effective_date,'days',v.weekdays,'target',v.target,'type',v.tracking_type,'unit',v.unit,'status',v.status) order by v.effective_date) from public.schedule_history v where v.user_id=u and v.habit_id=h.id),'[]'::jsonb)) order by h.created_at,h.id) from public.habits h where h.user_id=u),'[]'::jsonb),
 'entries',coalesce((select jsonb_agg(jsonb_build_object('habitId',c.habit_id,'date',c.local_date,'value',c.value,'note',c.note,'timezone',c.timezone,'updatedAt',to_char(c.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) from public.check_ins c where c.user_id=u),'[]'::jsonb),
 'reflections',coalesce((select jsonb_agg(jsonb_build_object('date',r.local_date,'text',r.text,'timezone',r.timezone,'updatedAt',to_char(r.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) from public.reflections r where r.user_id=u),'[]'::jsonb)) into result from public.profiles p where p.user_id=u;
 return result;
end $$;

create function public.save_habitpilot(payload jsonb, expected_revision integer) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare u uuid:=auth.uid(); prior jsonb; h jsonb; v jsonb; e jsonb; r jsonb; old_h jsonb; old_e jsonb; old_v jsonb; hid uuid; zone text; today date; cutoff date; rev integer; selected public.schedule_history; begin
 if u is null then raise exception 'authentication required'; end if;
 if octet_length(payload::text)>2000000 then raise exception 'payload too large'; end if;
 -- Serialize even the first save, then reject stale clients rather than losing updates.
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 prior:=public.load_habitpilot(); rev:=coalesce((prior->>'revision')::integer,0);
 if expected_revision<>rev then raise exception 'revision conflict'; end if;
 zone:=payload->'profile'->>'timezone';
 if not exists(select 1 from pg_timezone_names where name=zone) then raise exception 'invalid timezone'; end if;
 today:=(now() at time zone zone)::date;
 cutoff:=coalesce((now() at time zone (prior->'profile'->>'timezone'))::date,today)+1;
 if payload->>'version'<>'1' or jsonb_typeof(payload->'habits')<>'array' or jsonb_typeof(payload->'entries')<>'array' or jsonb_typeof(payload->'reflections')<>'array' or jsonb_array_length(payload->'habits')>100 or jsonb_array_length(payload->'entries')>50000 then raise exception 'invalid state'; end if;
 if (select count(*) from jsonb_array_elements(payload->'habits'))<>(select count(distinct x->>'id') from jsonb_array_elements(payload->'habits') x) then raise exception 'duplicate habits'; end if;
 for h in select * from jsonb_array_elements(payload->'habits') loop
 hid:=(h->>'id')::uuid;
 select x into old_h from jsonb_array_elements(prior->'habits') x where x->>'id'=h->>'id';
 if old_h is null then
 if (h->>'start')::date<today then raise exception 'new habit cannot be backdated'; end if;
 else
 if h->>'start'<>old_h->>'start' or (h->>'createdAt')::timestamptz<>(old_h->>'createdAt')::timestamptz then raise exception 'immutable habit fields'; end if;
 if (select coalesce(jsonb_agg(x order by x->>'effective'),'[]') from jsonb_array_elements(h->'schedules') x where (x->>'effective')::date<cutoff) <>
 (select coalesce(jsonb_agg(x order by x->>'effective'),'[]') from jsonb_array_elements(old_h->'schedules') x where (x->>'effective')::date<cutoff) then raise exception 'history is immutable'; end if;
 end if;
 if jsonb_array_length(h->'schedules') not between 1 and 2000 then raise exception 'invalid schedules'; end if;
 end loop;
 -- Preserve timezone labels and reject newly written future records, including timezone travel.
 for e in select * from jsonb_array_elements(payload->'entries') loop
 select x into old_e from jsonb_array_elements(prior->'entries') x where x->>'habitId'=e->>'habitId' and x->>'date'=e->>'date';
 if (e->>'date')::date>today and e is distinct from old_e then raise exception 'future check-in'; end if;
 if old_e is not null and e->>'timezone'<>old_e->>'timezone' then raise exception 'immutable entry timezone'; end if;
 end loop;
 for r in select * from jsonb_array_elements(payload->'reflections') loop
 select x into old_e from jsonb_array_elements(prior->'reflections') x where x->>'date'=r->>'date';
 if (r->>'date')::date>today and r is distinct from old_e then raise exception 'future reflection'; end if;
 end loop;
 insert into public.profiles(user_id,data,revision) values(u,payload->'profile',rev+1) on conflict(user_id) do update set data=excluded.data,revision=excluded.revision,updated_at=now();
 -- Bounded transactional replacement: foreign keys cascade only this owner's records.
 delete from public.habits where user_id=u;
 delete from public.reflections where user_id=u;
 for h in select * from jsonb_array_elements(payload->'habits') loop
 hid:=(h->>'id')::uuid;
 insert into public.habits values(hid,u,h->>'name',h->>'category',coalesce(h->>'description',''),(h->>'start')::date,(h->>'createdAt')::timestamptz);
 for v in select * from jsonb_array_elements(h->'schedules') loop
 insert into public.schedule_history values(u,hid,(v->>'effective')::date,array(select jsonb_array_elements_text(v->'days')::integer),(v->>'target')::numeric,v->>'type',v->>'unit',v->>'status');
 end loop;
 end loop;
 for e in select * from jsonb_array_elements(payload->'entries') loop
 select * into selected from public.schedule_history where user_id=u and habit_id=(e->>'habitId')::uuid and effective_date<=(e->>'date')::date order by effective_date desc limit 1;
 if selected is null or selected.status<>'active' or not (extract(dow from (e->>'date')::date)::integer=any(selected.weekdays)) or (e->>'date')::date<(select start_date from public.habits where user_id=u and id=(e->>'habitId')::uuid) then raise exception 'ineligible check-in'; end if;
 insert into public.check_ins values(u,(e->>'habitId')::uuid,(e->>'date')::date,(e->>'value')::numeric,coalesce(e->>'note',''),e->>'timezone',(e->>'updatedAt')::timestamptz);
 end loop;
 for r in select * from jsonb_array_elements(payload->'reflections') loop
 insert into public.reflections values(u,(r->>'date')::date,r->>'text',r->>'timezone',(r->>'updatedAt')::timestamptz);
 end loop;
 return public.load_habitpilot();
end $$;

create function public.consume_ai_request() returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid(); hourly integer; daily integer; begin
 if u is null then raise exception 'authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,1));
 select coalesce(sum(requests),0) into daily from public.ai_rate_limits where user_id=u and bucket>=date_trunc('day',now());
 select coalesce(sum(requests),0) into hourly from public.ai_rate_limits where user_id=u and bucket=date_trunc('hour',now());
 if hourly>=12 or daily>=60 then return false; end if;
 insert into public.ai_rate_limits values(u,date_trunc('hour',now()),1) on conflict(user_id,bucket) do update set requests=public.ai_rate_limits.requests+1;
 delete from public.ai_rate_limits where user_id=u and bucket<now()-interval '2 days';
 return true;
end $$;
create function public.cache_ai_review(key text,result jsonb) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 if length(key)<>64 or octet_length(result::text)>20000 then raise exception 'invalid review'; end if;
 insert into public.ai_reviews(user_id,cache_key,response) values(auth.uid(),key,result) on conflict(user_id,cache_key) do update set response=excluded.response,created_at=now();
 delete from public.ai_reviews where user_id=auth.uid() and cache_key not in(select cache_key from public.ai_reviews where user_id=auth.uid() order by created_at desc limit 20);
end $$;
revoke all on function public.load_habitpilot() from public,anon;
revoke all on function public.save_habitpilot(jsonb,integer) from public,anon;
revoke all on function public.consume_ai_request() from public,anon;
revoke all on function public.cache_ai_review(text,jsonb) from public,anon;
grant execute on function public.load_habitpilot(), public.save_habitpilot(jsonb,integer), public.consume_ai_request(), public.cache_ai_review(text,jsonb) to authenticated;
commit;
