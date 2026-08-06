export type SessionRole = "OWNER" | "ADMIN" | "SUPERVISOR" | "OPERATOR" | "READONLY";

const DEMO_USER_EMAIL = "prueba@linsse.com";
const PLATFORM_ADMIN_EMAIL = "admin@linsse.com";

export const getHomePathForRole = (_role?: string | null) => {
  return "/dashboard";
};

export const isCommercialDemoUser = (email?: string | null) => email?.trim().toLowerCase() === DEMO_USER_EMAIL;

const ADMIN_ONLY_PATHS = new Set([
  "/licencia",
  "/masters",
  "/admin/users",
  "/admin/planes",
  "/admin/ai-settings",
]);

const LINKS_BY_ROLE: Record<Exclude<SessionRole, "OWNER" | "ADMIN">, Set<string>> = {
  SUPERVISOR: new Set(["/", "/dashboard", "/supervision", "/gestion/tareas", "/commands", "/traceability", "/insumos"]),
  OPERATOR: new Set(["/", "/campo"]),
  READONLY: new Set(["/", "/dashboard", "/animals", "/traceability"]),
};

const TENANT_MANAGEMENT_LINKS = new Set([
  "/",
  "/operations",
  "/animals",
  "/dashboard",
  "/supervision",
  "/gestion/tareas",
  "/commands",
  "/traceability",
  "/insumos",
]);

export const isPlatformAdmin = (email?: string | null) => email?.trim().toLowerCase() === PLATFORM_ADMIN_EMAIL;

export const canSeeLink = (role: string | null, pathname: string, email?: string | null) => {
  if (isCommercialDemoUser(email)) {
    const hiddenForDemo = new Set([
      "/licencia",
      "/admin/planes",
      "/admin/ai-settings",
      "/admin/users",
      "/masters",
      "/masters/herd-categories",
      "/masters/breeds",
      "/masters/movement-types",
      "/masters/consignors",
      "/masters/slaughterhouses",
    ]);

    if (hiddenForDemo.has(pathname)) {
      return false;
    }
  }

  if (isPlatformAdmin(email)) return true;
  if (role === "OWNER" || role === "ADMIN") return TENANT_MANAGEMENT_LINKS.has(pathname);
  if (!role || !(role in LINKS_BY_ROLE)) return false;
  if (ADMIN_ONLY_PATHS.has(pathname)) return false;
  return LINKS_BY_ROLE[role as keyof typeof LINKS_BY_ROLE].has(pathname);
};
