require(" ../../../builds/output/testsRuntime");
const loki = require('../lib/lokijs/src/lokijs');
const LokiPartitioningAdapter = loki.LokiPartitioningAdapter;
const lokiPartitioningAdapter = new LokiPartitioningAdapter(new loki.LokiFsAdapter());
const fs = require('fs');
const path = require('path');
const assert = require('double-check').assert;

assert.callback("Test removeCollection function with LokiPartitioningAdapter", async (testFinishCallback) => {
    // create a test folder
    const folder = './testFolder';
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, {recursive: true});
    }
    const DB_FILEPATH = path.join(folder, 'test.db.json')

    // Create a new database with LokiPartitioningAdapter
    const db = new loki(DB_FILEPATH, {adapter: lokiPartitioningAdapter});
    const saveDatabaseAsync = () => {
        return new Promise((resolve, reject) => {
            db.saveDatabase((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    };

    const loadDatabaseAsync = () => {
        return new Promise((resolve, reject) => {
            db.loadDatabase({}, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
    // Create multiple collections
    const collectionNames = ['testCollection1', 'testCollection2', 'testCollection3'];
    collectionNames.forEach(name => db.addCollection(name));

    // Save the database
    await saveDatabaseAsync();

    // Remove a collection
    const removedCollectionName = collectionNames[collectionNames.length - 1];
    db.removeCollection(removedCollectionName);

    // Save the database again
    await saveDatabaseAsync();

    const newLokiInstance = new loki(DB_FILEPATH, {adapter: lokiPartitioningAdapter});
    // Load the database
    await loadDatabaseAsync();

    // Check if the removed collection is still present in the database
    const removedCollection = newLokiInstance.getCollection(removedCollectionName);
    assert.equal(removedCollection, null);

    // remove the test folder
    fs.rmSync(folder, {recursive: true});

    testFinishCallback();
});