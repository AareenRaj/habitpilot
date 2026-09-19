import { z } from "zod";
import {
  body,
  originCheck,
  config,
  sb,
  json,
  setSession,
  clearSession,
  failure,
} from "@/lib/habitpilot/server";
const schema = z.object({
  action: z.enum(["login", "signup"]),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});
export async function POST(req: Request) {
  try {
    originCheck(req);
    const p = schema.parse(await body(req, 2048));
    const data = await sb(
      p.action === "login"
        ? "/auth/v1/token?grant_type=password"
        : "/auth/v1/signup",
      config().key,
      "POST",
      { email: p.email, password: p.password },
    );
    if (data.access_token) {
      await setSession(data);
      return json({ ok: true });
    }
    return json({
      message:
        "Check your email to confirm your account, then return here to sign in.",
    });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(req: Request) {
  try {
    originCheck(req);
    await clearSession();
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
