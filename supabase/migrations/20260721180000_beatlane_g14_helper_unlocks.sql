-- G14: allow helper unlock rows (Slow-mo / Shield purchase inventory).
-- unlock_key format: slow_mo:<purchase_id> | shield:<purchase_id>

alter table public.unlocks
  drop constraint if exists unlocks_unlock_type_check;

alter table public.unlocks
  add constraint unlocks_unlock_type_check
  check (
    unlock_type in (
      'chart',
      'pack',
      'continue',
      'season_pass',
      'helper'
    )
  );
