import { NextRequest } from "next/server";

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";

const buildTargetUrl = (path: string[], search: string) => {
  const normalizedBase = API_INTERNAL_URL.replace(/\/$/, "");
  const normalizedPath = path.join("/");
  return `${normalizedBase}/${normalizedPath}${search}`;
};

const forwardRequest = async (request: NextRequest, path: string[]) => {
  const targetUrl = buildTargetUrl(path, request.nextUrl.search);

  try {
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("connection");

    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch {
    return Response.json(
      {
        message: "No se pudo conectar con la API interna.",
        targetUrl,
      },
      { status: 502 },
    );
  }
};

export const dynamic = "force-dynamic";

export const GET = async (request: NextRequest, context: { params: { path: string[] } }) =>
  forwardRequest(request, context.params.path);

export const POST = async (request: NextRequest, context: { params: { path: string[] } }) =>
  forwardRequest(request, context.params.path);

export const PATCH = async (request: NextRequest, context: { params: { path: string[] } }) =>
  forwardRequest(request, context.params.path);

export const PUT = async (request: NextRequest, context: { params: { path: string[] } }) =>
  forwardRequest(request, context.params.path);

export const DELETE = async (request: NextRequest, context: { params: { path: string[] } }) =>
  forwardRequest(request, context.params.path);

export const OPTIONS = async (request: NextRequest, context: { params: { path: string[] } }) =>
  forwardRequest(request, context.params.path);
