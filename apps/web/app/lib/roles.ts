export type SessionRole = "OWNER" | "ADMIN" | "SUPERVISOR" | "OPERATOR" | "READONLY";

const DEMO_USER_EMAIL = "prueba@linsse.com";

export const getHomePathForRole = (_role?: string | null) => {
  return "/dashboard";
};

export const isCommercialDemoUser = (email?: string | null) => email?.trim().toLowerCase() === DEMO_USER_EMAIL;

export const canSeeLink = (_role: string | null, pathname: string, email?: string | null) => {
  if (isCommercialDemoUser(email)) {
    const hiddenForDemo = new Set([
      "/licencia",
      "/admin/planes",
      "/admin/ai-settings",
      "/admin/users",
      "/masters/herd-categories",
      "/masters/consignors",
      "/masters/slaughterhouses",
    ]);

    if (hiddenForDemo.has(pathname)) {
      return false;
    }
  }

  return true;
};
