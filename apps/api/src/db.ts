import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { MongoClient, MongoServerSelectionError } from "mongodb";

const loadEnvironment = () => {
  let currentDir = process.cwd();
  const visitedDirs = new Set<string>();

  while (!visitedDirs.has(currentDir)) {
    visitedDirs.add(currentDir);

    const envPath = resolve(currentDir, ".env");
    const envExamplePath = resolve(currentDir, ".env.example");

    if (existsSync(envPath)) {
      loadEnv({ path: envPath, override: false });
      return;
    }

    if (existsSync(envExamplePath)) {
      loadEnv({ path: envExamplePath, override: false });
      return;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }
};

loadEnvironment();

const buildMongoUri = () => {
  if (process.env.MONGODB_URI) {
    return process.env.MONGODB_URI;
  }

  const host = process.env.MONGODB_HOST ?? "127.0.0.1";
  const port = process.env.MONGODB_PORT ?? "27017";
  const username = process.env.MONGODB_USERNAME;
  const password = process.env.MONGODB_PASSWORD;
  const authSource = process.env.MONGODB_AUTH_SOURCE ?? "admin";
  const dbName = process.env.MONGODB_DB ?? "establecimiento_ganadero";

  if (!username || !password) {
    return `mongodb://${host}:${port}`;
  }

  return `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(dbName)}?authSource=${encodeURIComponent(authSource)}`;
};

const getDbNameFromUri = (uri: string) => {
  const dbNameMatch = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/i);
  return dbNameMatch?.[1] ? decodeURIComponent(dbNameMatch[1]) : null;
};

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const MONGODB_URI = buildMongoUri();
const MONGODB_DB =
  process.env.MONGODB_DB ?? getDbNameFromUri(MONGODB_URI) ?? "establecimiento_ganadero";

const MONGODB_SERVER_SELECTION_TIMEOUT_MS = parsePositiveInteger(
  process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
  5000,
);

let client: MongoClient | null = null;

export const getMongoClient = () => {
  if (!client) {
    client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    });
  }
  return client;
};

export const getDb = async () => {
  const mongoClient = getMongoClient();

  try {
    await mongoClient.connect();
  } catch (error) {
    if (error instanceof MongoServerSelectionError) {
      throw new Error(
        `No se pudo conectar a MongoDB en ${MONGODB_URI}. ` +
          "Verifica que MongoDB esté levantado, que MONGODB_URI/MONGODB_DB apunten al servicio correcto " +
          `y que el puerto sea accesible. Timeout: ${MONGODB_SERVER_SELECTION_TIMEOUT_MS}ms.`,
        { cause: error },
      );
    }

    throw error;
  }

  return mongoClient.db(MONGODB_DB);
};
