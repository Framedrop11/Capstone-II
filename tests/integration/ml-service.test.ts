import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import test from 'node:test';
import { MongoDBContainer } from '@testcontainers/mongodb';
import { GenericContainer } from 'testcontainers';

const root = process.cwd();
const python = resolve(root, 'services/ml-service/.venv/Scripts/python.exe');
const artifact = resolve(root, 'services/ml-service/models/stable.joblib');

test('ML service responds over HTTP and exposes health and prediction metrics', { timeout: 30_000 }, async () => {
  const redis = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
  const portServer = createServer();
  portServer.listen(0, '127.0.0.1');
  await once(portServer, 'listening');
  const address = portServer.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>((resolveClose, reject) => portServer.close((error) => error ? reject(error) : resolveClose()));

  const service = spawn(python, ['-m', 'uvicorn', 'carelens_ml.app:app', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env: { ...process.env, PYTHONPATH: resolve(root, 'services/ml-service/src/main/python'), ML_STABLE_MODEL_PATH: artifact, CACHE_REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}/0` },
    stdio: 'ignore',
  });
  try {
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 100 && !ready; attempt += 1) {
      if (service.exitCode !== null) throw new Error(`ML service exited with ${service.exitCode}`);
      try { ready = (await fetch(`${base}/health`)).ok; } catch { await new Promise((resolveWait) => setTimeout(resolveWait, 100)); }
    }
    assert.ok(ready, 'ML service did not become ready');
    const response = await fetch(`${base}/predict`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ responses: {
        ageYears: 50, bmi: 32, sex: 'female', waistCm: 90, activity30MinDaily: true,
        fruitVegetablesDaily: false, antihypertensiveTreatment: false, historyHighGlucose: false,
        familyHistoryDiabetes: 'none',
      }, basicScore: 0.3 }),
    });
    assert.equal(response.status, 200);
    const result = await response.json() as { score: number; modelVersion: string; factors: string[] };
    assert.ok(result.score >= 0 && result.score <= 1);
    assert.equal(result.modelVersion, 'carelens-logreg-v1');
    assert.ok(Array.isArray(result.factors));
    const secondResponse = await fetch(`${base}/predict`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ responses: {
        ageYears: 50, bmi: 32, sex: 'female', waistCm: 90, activity30MinDaily: true,
        fruitVegetablesDaily: false, antihypertensiveTreatment: false, historyHighGlucose: false,
        familyHistoryDiabetes: 'none',
      }, basicScore: 0.3 }),
    });
    assert.equal(secondResponse.status, 200);
    const metrics = await (await fetch(`${base}/metrics`)).text();
    assert.match(metrics, /carelens_ml_prediction_requests_total 2/);
    assert.match(metrics, /carelens_ml_result_cache_hits_total 1/);
    assert.match(metrics, /carelens_ml_http_requests_total\{route="\/predict",status_code="200"\} 2/);
    assert.match(metrics, /carelens_ml_prediction_score_count 2/);
  } finally {
    service.kill();
    await once(service, 'exit');
    await redis.stop();
  }
});

test('training registry writes a modelVersions record to MongoDB', { timeout: 120_000 }, async () => {
  const mongo = await new MongoDBContainer('mongo:7.0').withUsername('root').withPassword('root-password').start();
  try {
    const uri = new URL(mongo.getConnectionString());
    uri.searchParams.set('directConnection', 'true');
    const database = `carelens_ml_registry_${Date.now()}`;
    const source = [
      'import sys',
      `sys.path.insert(0, ${JSON.stringify(resolve(root, 'services/ml-service/src/main/python'))})`,
      'from pathlib import Path',
      'from carelens_ml.training import record_model_version',
      `record_model_version('carelens-logreg-v1', 'stable', Path(${JSON.stringify(artifact)}), {'auc': 0.82, 'recall': 0.73, 'precision': 0.75, 'brier': 0.16}, {'holdoutRows': 104}, True)`,
      'from pymongo import MongoClient',
      `client = MongoClient(${JSON.stringify(uri.toString())}, serverSelectionTimeoutMS=10000)`,
      `record = client[${JSON.stringify(database)}]['modelVersions'].find_one({'version': 'carelens-logreg-v1'})`,
      'assert record and record["status"] == "stable" and record["testResults"]["promotionEligible"] is True',
      'print(record["version"] + ":" + record["status"])',
      'client.close()',
    ].join('\n');
    const result = spawnSync(python, ['-c', source], {
      cwd: root,
      env: { ...process.env, MONGODB_URI: uri.toString(), MONGODB_DATABASE: database },
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /carelens-logreg-v1:stable/);
  } finally {
    await mongo.stop();
  }
});
