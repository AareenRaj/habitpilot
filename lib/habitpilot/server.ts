// Server-only by import convention: never import this module from a client component.
import { cookies } from "next/headers";
import { State, stateSchema, emptyState, localDate, addDays } from "./core";
export const config = () => ({
  url: process.env.SUPABASE_URL || "",
  key: process.env.SUPABASE_ANON_KEY || "",
});
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function failure(e: unknown) {
  const m = e instanceof Error ? e.message : "Request failed";
  const allowed = [
    "Please sign in again.",
    "Your data changed on another device. Reload before saving.",
    "AI request limit reached. Try again later.",
    "Supabase is not configured.",
    "Account deletion is not configured.",
    "Invalid request origin.",
    "Request is too large.",
  ];
  return json(
    {
      error: allowed.includes(m)
        ? m
        : "Could not complete the request. Check your input and connection, then retry.",
    },
    m.includes("sign in")
      ? 401
      : m.includes("changed")
        ? 409
        : m.includes("limit")
          ? 429
          : 400,
  );
}
export function originCheck(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin)
    throw new Error("Invalid request origin.");
}
export async function body(req: Request, max = 2_000_000) {
  if (Number(req.headers.get("content-length") || 0) > max)
    throw new Error("Request is too large.");
  const reader = req.body?.getReader();
  if (!reader) throw new Error("Empty body");
  let size = 0,
    txt = "";
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Error("Request is too large.");
    }
    txt += decoder.decode(value, { stream: true });
  }
  return JSON.parse(txt + decoder.decode());
}
type SupabaseEnvelope = {
  id: string;
  access_token: string;
  refresh_token: string;
  message: string;
};
export async function sb<T = SupabaseEnvelope>(
  path: string,
  token: string,
  method = "GET",
  data?: unknown,
  admin = false,
) {
  const c = config();
  if (!c.url || !c.key) throw new Error("Supabase is not configured.");
  const key = admin ? process.env.SUPABASE_SERVICE_ROLE_KEY : c.key;
  const r = await fetch(c.url + path, {
    method,
    headers: {
      apikey: key || "",
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) {
    const value = (await r.json().catch(() => ({}))) as { message?: string };
    if (String(value.message || "").includes("revision conflict"))
      throw new Error(
        "Your data changed on another device. Reload before saving.",
      );
    throw new Error("Supabase request failed");
  }
  if (r.status === 204) return null as T;
  return r.json() as Promise<T>;
}
export async function setSession(data: {
  access_token: string;
  refresh_token: string;
}) {
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  for (const [name, value] of [
    ["hp_access", data.access_token],
    ["hp_refresh", data.refresh_token],
  ])
    jar.set(name, value, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
}
export async function clearSession() {
  const jar = await cookies();
  jar.delete("hp_access");
  jar.delete("hp_refresh");
}
export async function session() {
  const jar = await cookies();
  let token = jar.get("hp_access")?.value;
  const refresh = jar.get("hp_refresh")?.value;
  if (!token && !refresh) return null;
  try {
    if (token) {
      const user = await sb("/auth/v1/user", token);
      return { token, id: user.id as string };
    }
  } catch {
    /* Attempt refresh without logging token or response. */
  }
  if (refresh) {
    try {
      const data = await sb(
        "/auth/v1/token?grant_type=refresh_token",
        config().key,
        "POST",
        { refresh_token: refresh },
      );
      await setSession(data);
      token = data.access_token;
      const user = await sb("/auth/v1/user", token!);
      return { token: token!, id: user.id as string };
    } catch {
      throw new Error("Please sign in again.");
    }
  }
  throw new Error("Please sign in again.");
}
export async function requireSession() {
  const a = await session();
  if (!a) throw new Error("Please sign in again.");
  return a;
}
export async function readState(token: string): Promise<State> {
  const data = await sb("/rest/v1/rpc/load_habitpilot", token, "POST", {});
  return data ? stateSchema.parse(data) : emptyState("UTC");
}
export function validateTransition(old: State, next: State) {
  const today = localDate(old.profile.timezone),
    tomorrow = addDays(today, 1);
  for (const h of next.habits) {
    const prev = old.habits.find((p) => p.id === h.id);
    if (prev) {
      if (h.start !== prev.start || h.createdAt !== prev.createdAt)
        throw new Error("Immutable habit history");
      const oldPast = prev.schedules.filter((v) => v.effective < tomorrow),
        newPast = h.schedules.filter((v) => v.effective < tomorrow);
      if (JSON.stringify(oldPast) !== JSON.stringify(newPast))
        throw new Error("Schedule changes must be prospective");
    } else if (h.start < localDate(next.profile.timezone))
      throw new Error("New habits cannot be backdated");
    if (
      new Set(h.schedules.map((v) => v.effective)).size !== h.schedules.length
    )
      throw new Error("Duplicate schedule version");
  }
  for (const e of next.entries) {
    const prev = old.entries.find(
      (p) => p.habitId === e.habitId && p.date === e.date,
    );
    if (
      e.date > localDate(next.profile.timezone) &&
      JSON.stringify(e) !== JSON.stringify(prev)
    )
      throw new Error("No future check-ins");
    if (prev && e.timezone !== prev.timezone)
      throw new Error("Timezone history is immutable");
  }
  for (const r of next.reflections)
    if (
      r.date > localDate(next.profile.timezone) &&
      !old.reflections.some((p) => JSON.stringify(p) === JSON.stringify(r))
    )
      throw new Error("No future reflections");
}
