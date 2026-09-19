import { config, json } from "@/lib/habitpilot/server";
export async function GET() {
  const c = config();
  return json({ supabase: !!(c.url && c.key) });
}
