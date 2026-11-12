import mongoose, { type ConnectOptions } from 'mongoose';

export interface MongoConnectionConfig {
  uri: string;
  databaseName: string;
  maxPoolSize?: number;
}

export async function connectMongo(config: MongoConnectionConfig): Promise<typeof mongoose> {
  const options: ConnectOptions = {
    dbName: config.databaseName,
    autoIndex: false,
    maxPoolSize: config.maxPoolSize ?? 20,
    serverSelectionTimeoutMS: 5_000,
  };
  return mongoose.connect(config.uri, options);
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
