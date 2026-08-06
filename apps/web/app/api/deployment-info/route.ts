import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export const GET = () => NextResponse.json({
  commit: process.env.NEXT_PUBLIC_APP_COMMIT ?? "unknown",
  builtAt: process.env.NEXT_PUBLIC_APP_BUILT_AT ?? null,
});
