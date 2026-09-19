import { stateSchema } from "@/lib/habitpilot/core";
import {
  config,
  json,
  session,
  requireSession,
  body,
  originCheck,
  readState,
  validateTransition,
  sb,
  failure,
} from "@/lib/habitpilot/server";
export async function GET() {
  try {
    if (!config().url) return json({ authenticated: false });
    const a = await session();
    if (!a) return json({ authenticated: false });
    return json({ authenticated: true, state: await readState(a.token) });
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(req: Request) {
  try {
    originCheck(req);
    const a = await requireSession(),
      next = stateSchema.parse(await body(req)),
      old = await readState(a.token);
    validateTransition(old, next);
    const state = await sb("/rest/v1/rpc/save_habitpilot", a.token, "POST", {
      payload: next,
      expected_revision: next.revision,
    });
    return json({ state: stateSchema.parse(state) });
  } catch (e) {
    return failure(e);
  }
}
