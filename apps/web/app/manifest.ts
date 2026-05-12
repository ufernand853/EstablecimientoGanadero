import type { MetadataRoute } from "next";

const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
const basePath = rawBasePath ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}` : "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gestión Ganadera",
    short_name: "Ganadera",
    description: "Gestión multi-establecimiento para ganadería extensiva",
    start_url: `${basePath}/login`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#166534",
    lang: "es",
    icons: [
      {
        src: `${basePath}/linsse-logo.svg`,
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
    ],
  };
}
