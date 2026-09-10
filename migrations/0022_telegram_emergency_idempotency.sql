CREATE UNIQUE INDEX telegram_emergency_one_open
ON telegram_emergency_reports(organization_id,assignment_id)
WHERE status='open';
