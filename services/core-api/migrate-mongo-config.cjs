if (!process.env.MONGODB_MIGRATION_URI || !process.env.MONGODB_DATABASE) {
  throw new Error('MONGODB_MIGRATION_URI and MONGODB_DATABASE are required');
}

module.exports = {
  mongodb: { url: process.env.MONGODB_MIGRATION_URI, databaseName: process.env.MONGODB_DATABASE },
  migrationsDir: `${__dirname}/migrations`,
  changelogCollectionName: 'schemaMigrations',
  migrationFileExtension: '.js',
  useFileHash: true,
};
