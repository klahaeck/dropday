import type { Instrumentation } from "next";
import { reportOperationalError } from "@/lib/observability";

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  reportOperationalError("next.request", error, {
    method: request.method,
    path: request.path.split("?", 1)[0],
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
  });
};

