const loki = require('../../lib/lokijs/src/lokijs');
const LokiFsStructuredAdapter = require('../../lib/lokijs/src/loki-fs-structured-adapter');
const LokiFsSyncAdapter = require('../../lib/lokijs/src/loki-fs-sync-adapter');
const LokiFsAdapter = require('../../lib/lokijs/src/lokijs').LokiFsAdapter;
const LokiPartitioningAdapter = loki.LokiPartitioningAdapter;
const lokiPartitioningAdapter = new LokiPartitioningAdapter(new LokiFsAdapter());
const fs = require('fs');

const promisify = (fn, instance) => {
    return (...args) => {
        return new Promise((resolve, reject) => {
            fn.call(instance, ...args, (err, data) => {
                if (err) {
                    return reject(err);
                }
                resolve(data);
            });
        });
    };
}

const initDatabase = (adapter, filename) => {
    const db = new loki(filename, {
        adapter: adapter,
        autoload: true,
        autoloadCallback: () => {
        },
        autosave: true,
        autosaveInterval: 1000

    });
    return db;
}

function setupDatabase(adapter, filename) {
    return new Promise((resolve, reject) => {
        const db = new loki(filename, {
            adapter: adapter,
            autoload: true,
            autoloadCallback: () => resolve(db),
            autosave: true,
            autosaveInterval: 1000
        });
    });
}

function addDocuments(db, collectionName, numDocs) {
    const collection = db.getCollection(collectionName) || db.addCollection(collectionName);
    for (let i = 0; i < numDocs; i++) {
        collection.insert({name: `User ${i}`, age: Math.floor(Math.random() * 100)});
    }
    return db;
}

async function measurePerformance(adapterName, adapter, filename, collections, numDocs) {
    const folder = require('path').dirname(filename);
    fs.mkdirSync(folder, {recursive: true});
    console.time(`${adapterName} - Setup`);
    let db = initDatabase(adapter, filename)
    console.timeEnd(`${adapterName} - Setup`);

    console.time(`${adapterName} - Insert`);
    for (let i = 0; i < collections.length; i++) {
        db = addDocuments(db, collections[i], numDocs);
    }
    console.timeEnd(`${adapterName} - Insert`);

    console.time(`${adapterName} - Save`);
    await promisify(db.saveDatabase, db)();
    console.timeEnd(`${adapterName} - Save`);

    console.time(`${adapterName} - Load`);
    db = await setupDatabase(adapter, filename)
    console.timeEnd(`${adapterName} - Load`);

    console.time(`${adapterName} - Query`);
    const users = db.getCollection(collections[0]);
    users.find({age: {'$gt': 50}});
    console.timeEnd(`${adapterName} - Query`);
    fs.rmSync(folder, {recursive: true, force: true});
}

const numDocs = 100000;
const folder = 'test-loki-db';
fs.mkdirSync(folder, {recursive: true});
const fileNameBase = `${folder}/loki`;

setTimeout(async () => {
    console.log(`Starting performance tests with ${numDocs} documents...\n`);
    const collections = ['users', 'posts', 'comments', 'likes', 'followers', 'messages'];
    // LokiFsAdapter (default)
    await measurePerformance('LokiFsAdapter', new LokiFsAdapter(), `${fileNameBase}-default.json`, collections, numDocs);

    // LokiFsSyncAdapter
    await measurePerformance('LokiFsSyncAdapter', new LokiFsSyncAdapter(), `${fileNameBase}-sync.json`, collections, numDocs);

    // LokiPartitioningAdapter
    await measurePerformance('lokiPartitioningAdapter', lokiPartitioningAdapter, `${fileNameBase}-lokiPartitioningAdapter.json`, collections, numDocs);

    // LokiFsStructuredAdapter
    await measurePerformance('LokiFsStructuredAdapter', new LokiFsStructuredAdapter(), `${fileNameBase}-structured.json`, collections, numDocs);
    console.log('\nDone!');
    process.exit(0);
}, 2000);
