try {
  const status = rs.status();
  if (status.ok === 1) {
    print('replica set already initialized');
  }
} catch {
  rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'mongo:27017' }] });
  print('initialized rs0');
}
let attempts = 0;
while (!db.hello().isWritablePrimary && attempts < 60) {
  sleep(1000);
  attempts += 1;
}
if (!db.hello().isWritablePrimary) {
  throw new Error('MongoDB replica set did not elect a primary within 60 seconds');
}
