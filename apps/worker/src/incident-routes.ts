import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnvironment } from "./types";
import { ApplicationError } from "../../../packages/domain/src/errors";
import {
  createIncidentSchema,
  escalateIncidentSchema,
  queryIncidentsSchema,
  resolveIncidentSchema,
} from "../../../packages/validation/src/incidents";
import { resourceIdSchema } from "../../../packages/validation/src/users";
import { limitMutation, readMutation } from "./mutation-request";
import {
  createIncident,
  escalateIncident,
  getIncidentById,
  listIncidents,
  resolveIncident,
} from "./incident-repository";

const boundedBody = bodyLimit({
  maxSize: 4096,
  onError: () => {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      422,
      "Permintaan terlalu besar.",
    );
  },
});

export function incidentRoutes() {
  const routes = new Hono<AppEnvironment>();

  // List incidents (filtered by status, service, coordinator scope)
  routes.get("/", async (c) => {
    const query = queryIncidentsSchema.parse(c.req.query());
    const result = await listIncidents(c.env.DB, c.get("actor"), query);
    return c.json({ request_id: c.get("requestId"), ...result });
  });

  // Get incident detail with recommended candidates
  routes.get("/:id", async (c) => {
    const id = resourceIdSchema.parse(c.req.param("id"));
    const result = await getIncidentById(c.env.DB, c.get("actor"), id);
    return c.json({ request_id: c.get("requestId"), ...result });
  });

  // Open an incident case manually
  routes.post("/", boundedBody, async (c) => {
    const { body } = await readMutation(c);
    const input = createIncidentSchema.parse(body);
    await limitMutation(c);
    const result = await createIncident(
      c.env.DB,
      c.get("actor"),
      input,
      c.get("requestId"),
    );
    return c.json({ request_id: c.get("requestId"), data: result }, 201);
  });

  // Resolve an incident by approving a replacement candidate
  routes.post("/:id/resolve", boundedBody, async (c) => {
    const id = resourceIdSchema.parse(c.req.param("id"));
    const { body, key } = await readMutation(c);
    const input = resolveIncidentSchema.parse(body);
    await limitMutation(c);
    const result = await resolveIncident(
      c.env.DB,
      c.get("actor"),
      id,
      input,
      key,
      c.get("requestId"),
    );
    return c.json({ request_id: c.get("requestId"), data: result });
  });

  // Escalate an incident to manual handling
  routes.post("/:id/escalate", boundedBody, async (c) => {
    const id = resourceIdSchema.parse(c.req.param("id"));
    const { body } = await readMutation(c);
    const input = escalateIncidentSchema.parse(body);
    await limitMutation(c);
    const result = await escalateIncident(
      c.env.DB,
      c.get("actor"),
      id,
      input,
      c.get("requestId"),
    );
    return c.json({ request_id: c.get("requestId"), data: result });
  });

  return routes;
}
