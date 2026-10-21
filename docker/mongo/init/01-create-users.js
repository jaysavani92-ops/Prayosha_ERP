// Runs once, on first start of an empty data volume (official mongo image
// executes /docker-entrypoint-initdb.d/*.js as the root user).
//
// Creates three least-privilege users on the application database:
//   app       prayoshaApp role      find/insert/update/remove only — used by the API and worker.
//                                   (The built-in readWrite role also grants createIndex,
//                                   dropCollection and dropIndex, which the app never needs.)
//   migrator  readWrite + dbAdmin   used only by `npm run db:migrate`
//   backup    backup (admin db)     used only by the backup script
// The root user is for emergency administration only.

const dbName = process.env.MONGO_APP_DB || 'prayosha';

function required(name) {
  const value = process.env[name];
  if (!value || value.length < 16) {
    throw new Error(`${name} must be set to at least 16 characters`);
  }
  return value;
}

const appDb = db.getSiblingDB(dbName);

appDb.createRole({
  role: 'prayoshaApp',
  privileges: [{ resource: { db: dbName, collection: '' }, actions: ['find', 'insert', 'update', 'remove'] }],
  roles: [],
});

appDb.createUser({
  user: process.env.MONGO_APP_USER || 'prayosha_app',
  pwd: required('MONGO_APP_PASSWORD'),
  roles: [{ role: 'prayoshaApp', db: dbName }],
});

appDb.createUser({
  user: process.env.MONGO_MIGRATOR_USER || 'prayosha_migrator',
  pwd: required('MONGO_MIGRATOR_PASSWORD'),
  roles: [
    { role: 'readWrite', db: dbName },
    { role: 'dbAdmin', db: dbName },
  ],
});

db.getSiblingDB('admin').createUser({
  user: process.env.MONGO_BACKUP_USER || 'prayosha_backup',
  pwd: required('MONGO_BACKUP_PASSWORD'),
  roles: [
    { role: 'backup', db: 'admin' },
    { role: 'clusterMonitor', db: 'admin' },
  ],
});

print(`Created application users for database "${dbName}"`);
