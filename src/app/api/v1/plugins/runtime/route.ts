import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';
import { getInstalledPluginMap } from "@/server/plugins/state";
import { pluginRuntime } from "@/server/plugins/runtime";

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "dashboard";
    const installedMap = await getInstalledPluginMap();

    if (action === "dashboard") {
      const widgets = await Promise.all(
        pluginRuntime
          .getDashboardWidgets(installedMap, { userId })
          .sort((a, b) => a.definition.priority - b.definition.priority)
          .map(async (binding) => ({
            pluginSlug: binding.pluginSlug,
            definition: binding.definition,
            data: await binding.load(),
          }))
      );

      return NextResponse.json({ widgets });
    }

    if (action === "imports") {
      const imports = pluginRuntime.getImportTabs(installedMap).map((binding) => ({
        pluginSlug: binding.pluginSlug,
        definition: binding.definition,
        openPath: binding.openPath,
        routePath: binding.routePath,
        source: binding.source,
      }));

      return NextResponse.json({ imports });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error("Plugin runtime route error:", error);
    return NextResponse.json({ error: "Failed to load runtime plugin data" }, { status: 500 });
  }
}
