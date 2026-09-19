import {
  body,
  originCheck,
  requireSession,
  sb,
  json,
  clearSession,
  failure,
} from "@/lib/habitpilot/server";
export async function DELETE(req: Request) {
  try {
    originCheck(req);
    const a = await requireSession(),
      p = await body(req, 100);
    if (p.confirm !== "DELETE") throw new Error("Confirmation required");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error("Account deletion is not configured.");
    await sb(
      "/auth/v1/admin/users/" + encodeURIComponent(a.id),
      key,
      "DELETE",
      undefined,
      true,
    );
    await clearSession();
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
