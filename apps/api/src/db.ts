import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
const MONGODB_DB = process.env.MONGODB_DB ?? "establecimiento_ganadero";

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
