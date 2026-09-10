CREATE UNIQUE INDEX telegram_activation_org_id ON telegram_activation_codes(organization_id,id);
CREATE TABLE telegram_activation_requests (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 servant_id TEXT NOT NULL, activation_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
 created_at TEXT NOT NULL,
 FOREIGN KEY(organization_id,actor_id) REFERENCES users(organization_id,id),
 FOREIGN KEY(organization_id,servant_id) REFERENCES servants(organization_id,id),
 FOREIGN KEY(organization_id,activation_id) REFERENCES telegram_activation_codes(organization_id,id),
 UNIQUE(organization_id,actor_id,idempotency_key)
);
