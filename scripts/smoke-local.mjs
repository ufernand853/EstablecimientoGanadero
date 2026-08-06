import { spawn } from "node:child_process";
import process from "node:process";
import { MongoMemoryServer } from "mongodb-memory-server";

const apiPort = Number(process.env.SMOKE_API_PORT ?? "3301");
const webPort = Number(process.env.SMOKE_WEB_PORT ?? "3300");
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? "60000");
const children = [];

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const startProcess = (name, args, env) => {
  const child = spawn("npm", args, {
    detached: true,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const collect = (chunk) => {
    output = `${output}${chunk}`.slice(-12000);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  children.push({ child, name, getOutput: () => output });
  return child;
};

const waitForResponse = async (label, url, expectedStatus = 200) => {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status === expectedStatus) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw new Error(`${label} no respondio en ${url}: ${lastError?.message ?? "timeout"}`);
};

const expectPageText = async (label, url, expectedText) => {
  const response = await waitForResponse(label, url);
  const body = await response.text();
  if (!body.toLocaleLowerCase("es").includes(expectedText.toLocaleLowerCase("es"))) {
    throw new Error(`${label} no contiene el texto esperado: ${expectedText}`);
  }
};

const stopChildren = async () => {
  for (const { child } of children.reverse()) {
    if (child.exitCode === null && child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
  }
  await delay(500);
};

let mongo;
try {
  const externalMongoUri = process.env.SMOKE_MONGODB_URI;
  console.log(externalMongoUri ? "[1/5] Usando MongoDB indicado en SMOKE_MONGODB_URI..." : "[1/5] Iniciando MongoDB temporal...");
  if (!externalMongoUri) {
    mongo = await MongoMemoryServer.create({
      binary: { version: process.env.SMOKE_MONGODB_VERSION ?? "8.0.16" },
      instance: { dbName: "establecimiento_ganadero_smoke" },
    });
  }
  const mongoUri = externalMongoUri ?? mongo.getUri("establecimiento_ganadero_smoke");

  console.log(`[2/5] Iniciando API en 127.0.0.1:${apiPort}...`);
  startProcess("API", ["--workspace", "apps/api", "run", "start"], {
    NODE_ENV: "test",
    PORT: String(apiPort),
    MONGODB_URI: mongoUri,
    MONGODB_DB: "establecimiento_ganadero_smoke",
    MONGODB_USERNAME: "",
    MONGODB_PASSWORD: "",
    SESSION_SECRET: "local-smoke-session-secret-not-for-production",
    BILLING_WEBHOOK_SECRET: "local-smoke-webhook-secret-not-for-production",
    MERCADOPAGO_ACCESS_TOKEN: "",
    DODO_PAYMENTS_API_KEY: "",
  });
  const apiHealth = await waitForResponse("API", `http://127.0.0.1:${apiPort}/health`);
  const apiBody = await apiHealth.json();
  if (apiBody.status !== "ok") throw new Error(`Health de API inesperado: ${JSON.stringify(apiBody)}`);

  const plansResponse = await waitForResponse("Planes publicos", `http://127.0.0.1:${apiPort}/public/plans`);
  const plans = await plansResponse.json();
  const trialPlan = plans.find((plan) => plan.code === "BASIC");
  if (!trialPlan?.isSelfService || trialPlan.trialDays <= 0) {
    throw new Error(`El plan BASIC no ofrece trial autoservicio: ${JSON.stringify(trialPlan)}`);
  }

  const registrationResponse = await fetch(`http://127.0.0.1:${apiPort}/auth/register-subscription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `smoke-${Date.now()}@test.local`,
      fullName: "Prueba Smoke",
      companyName: "Establecimiento Smoke",
      password: "smoke-password-123",
      planCode: "BASIC",
      billingProvider: "mercadopago",
    }),
  });
  const registration = await registrationResponse.json();
  if (registrationResponse.status !== 201 || !registration.activated || !registration.trialEndsAt) {
    throw new Error(`No se pudo activar el trial sin pasarela: HTTP ${registrationResponse.status} ${JSON.stringify(registration)}`);
  }

  console.log(`[3/5] Iniciando web de produccion en 127.0.0.1:${webPort}...`);
  startProcess("Web", ["--workspace", "apps/web", "run", "start"], {
    NODE_ENV: "production",
    PORT: String(webPort),
    API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
  });
  await expectPageText("Login", `http://127.0.0.1:${webPort}/login`, "Cargar usuario demo");
  await expectPageText("Registro con trial", `http://127.0.0.1:${webPort}/registro`, "prueba");

  console.log("[4/5] Verificando proxy Web -> API...");
  const proxyHealth = await waitForResponse("Proxy", `http://127.0.0.1:${webPort}/api/proxy/health`);
  const proxyBody = await proxyHealth.json();
  if (proxyBody.status !== "ok") throw new Error(`Health del proxy inesperado: ${JSON.stringify(proxyBody)}`);

  console.log("[5/5] OK: MongoDB, API, web, trial y proxy interno funcionan juntos.");
} catch (error) {
  console.error(`\nSmoke test local FALLIDO: ${error.message}`);
  for (const processInfo of children) {
    console.error(`\n--- Ultima salida de ${processInfo.name} ---\n${processInfo.getOutput()}`);
  }
  process.exitCode = 1;
} finally {
  await stopChildren();
  if (mongo) await mongo.stop();
}
