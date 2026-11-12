import assert from 'node:assert/strict';
import { MongoClient, ObjectId } from 'mongodb';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { MongoDBContainer } from '@testcontainers/mongodb';

test('application MongoDB identity can insert/read audit rows but cannot update/delete', { timeout: 120_000 }, async (t) => {
  const builder = new MongoDBContainer('mongo:7.0')
    .withUsername('root')
    .withPassword('root-password');
  const container = await builder.start();
  t.after(async () => container.stop());

  const rootUri = container.getConnectionString();
  const rootClient = new MongoClient(rootUri, { authSource: 'admin', directConnection: true });
  try {
    await rootClient.connect();
  } catch (error) {
    throw new Error('MongoDB admin authentication failed', { cause: error });
  }
  t.after(async () => rootClient.close());
  const databaseName = `carelens_test_${Date.now()}`;
  const database = rootClient.db(databaseName);

  process.env['MONGODB_APP_USER'] = 'carelens_app';
  process.env['MONGODB_APP_PASSWORD'] = 'carelens-app-password';
  const migrationUrl = pathToFileURL(resolve('services/core-api/migrations/20261112000000-create-carelens-data.js')).href;
  const migration = await import(migrationUrl);
  try {
    await migration.up(database);
  } catch (error) {
    throw new Error('MongoDB schema and role migration failed', { cause: error });
  }

  const appUrl = new URL(rootUri);
  appUrl.username = 'carelens_app';
  appUrl.password = 'carelens-app-password';
  appUrl.pathname = `/${databaseName}`;
  appUrl.searchParams.set('authSource', databaseName);
  appUrl.searchParams.set('directConnection', 'true');
  const appClient = new MongoClient(appUrl.toString());
  try {
    await appClient.connect();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`MongoDB application user authentication failed: ${message}`, { cause: error });
  }
  t.after(async () => appClient.close());
  const auditLogs = appClient.db(databaseName).collection('auditLogs');
  const entry = {
    actorId: new ObjectId(),
    patientId: new ObjectId(),
    action: 'view_report', timestamp: new Date(), createdAt: new Date(), updatedAt: new Date(),
  };
  const inserted = await auditLogs.insertOne(entry);
  assert.equal((await auditLogs.findOne({ _id: inserted.insertedId }))?.['action'], 'view_report');
  await assert.rejects(auditLogs.updateOne({ _id: inserted.insertedId }, { $set: { action: 'hidden' } }), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal((error as { code?: number }).code, 13);
    return true;
  });
  await assert.rejects(auditLogs.deleteOne({ _id: inserted.insertedId }), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal((error as { code?: number }).code, 13);
    return true;
  });
  await assert.rejects(auditLogs.insertOne({ action: 'invalid' }), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal((error as { code?: number }).code, 121);
    return true;
  });

  await migration.down(database);
  await database.dropDatabase();
});
