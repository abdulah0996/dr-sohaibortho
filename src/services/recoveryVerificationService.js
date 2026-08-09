async function copyDatabaseForRecoveryVerification(sourceDb, targetDb) {
  if (!sourceDb || !targetDb) throw new Error("Source and restore-test databases are required.");
  if (sourceDb.databaseName === targetDb.databaseName) throw new Error("Restore verification must use a separate database.");
  const existingTarget = await targetDb.listCollections({}, { nameOnly: true }).toArray();
  if (existingTarget.length) throw new Error("Restore-test database must be empty; existing data was not changed.");

  const collections = await sourceDb.listCollections({ type: "collection" }, { nameOnly: true }).toArray();
  const result = { collections: 0, documents: 0, indexes: 0 };
  for (const { name } of collections) {
    if (name.startsWith("system.")) continue;
    await targetDb.createCollection(name);
    const sourceCollection = sourceDb.collection(name);
    const targetCollection = targetDb.collection(name);
    const documents = await sourceCollection.find({}).toArray();
    if (documents.length) await targetCollection.insertMany(documents, { ordered: true });
    const indexes = await sourceCollection.indexes();
    for (const index of indexes.filter((entry) => entry.name !== "_id_")) {
      const options = { ...index };
      delete options.v;
      delete options.key;
      delete options.ns;
      await targetCollection.createIndex(index.key, options);
      result.indexes += 1;
    }
    result.collections += 1;
    result.documents += documents.length;
  }
  return result;
}

module.exports = { copyDatabaseForRecoveryVerification };
