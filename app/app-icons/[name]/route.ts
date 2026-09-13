import { getAppIcons } from "@/lib/app-icons";

export const dynamic = "force-dynamic";

// HTML metadata can stay static while Apple/touch icons follow the server's
// runtime ENV_TYPE. The manifest uses the versioned asset URLs directly.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const icons = getAppIcons();
  const paths: Record<string, string> = {
    "icon-192.png": icons.icon192,
    "apple-touch-icon.png": icons.apple,
  };
  const path = Object.hasOwn(paths, name) ? paths[name] : undefined;
  if (!path) return new Response("Not found", { status: 404 });
  return new Response(null, {
    status: 307,
    headers: {
      Location: path,
      "Cache-Control": "no-store",
    },
  });
}
