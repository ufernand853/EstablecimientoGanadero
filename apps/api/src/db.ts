import { MongoClient } from "mongodb";

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

const MONGODB_URI = buildMongoUri();
const MONGODB_DB =
  process.env.MONGODB_DB ?? getDbNameFromUri(MONGODB_URI) ?? "establecimiento_ganadero";

let client: MongoClient | null = null;

export const getMongoClient = () => {
  if (!client) {
    client = new MongoClient(MONGODB_URI);
  }
  return client;
};

export const getDb = async () => {
  const mongoClient = getMongoClient();
  await mongoClient.connect();
  return mongoClient.db(MONGODB_DB);
};
