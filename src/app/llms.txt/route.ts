import { env } from "@/lib/env";
import { buildLlmsText } from "@/lib/llms";

export function GET() {
  return new Response(buildLlmsText(env.appUrl), {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
