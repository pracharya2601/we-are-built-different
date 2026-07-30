import { withApiAuth } from "@/lib/auth";
import {
  buildWorkflowFixture,
  isViewerRole,
  isWorkflowFixtureName,
} from "@/lib/openchair/fixtures";

type FixtureRouteContext = {
  params: Promise<{ fixtureName: string }>;
};

export const GET = withApiAuth(
  async function getOpenChairFixture(
    request,
    context: FixtureRouteContext,
  ) {
    const { fixtureName } = await context.params;
    if (!isWorkflowFixtureName(fixtureName)) {
      return Response.json(
        {
          error: {
            code: "fixture_not_found",
            message: "The requested OpenChair fixture does not exist.",
          },
        },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }
    const role = new URL(request.url).searchParams.get("role") ?? "";
    const viewerRole = isViewerRole(role) ? role : "operator";
    return Response.json(buildWorkflowFixture(fixtureName, viewerRole), {
      headers: {
        "cache-control": "private, no-store",
        "x-openchair-data-source": "synthetic-fixture",
      },
    });
  },
);
