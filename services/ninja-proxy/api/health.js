// Cheap liveness check for the proxy.
//
// Exists because a Vercel deployment can report READY while having built
// nothing useful. When this project's Root Directory was unset, the git build
// succeeded, showed a green "Ready" badge, and produced zero serverless
// functions — every endpoint 404'd. The only way to catch that was to call a
// real endpoint, which means hitting poe.ninja just to find out whether our
// own deploy worked.
//
// This answers that question on its own: if /api/health returns 200 with the
// expected endpoint list, the functions directory was found and built.

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  // Never cached — the point is to reflect the deployment being asked.
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  res.status(200).json({
    ok: true,
    service: "poe2-endgame-ninja-proxy",
    endpoints: ["/api/character", "/api/ladder", "/api/health"],
    // Set by Vercel on every deployment; useful for telling which build a
    // response came from when a deploy looks like it did not take effect.
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    env: process.env.VERCEL_ENV ?? null,
  });
}
