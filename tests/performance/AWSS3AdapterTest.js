const loki = require('../../lib/lokijs/src/lokijs');
const AWSS3SyncAdapter = require('../../lib/lokijs/src/aws-s3-sync-adapter');
process.env.AWS_ACCESS_KEY_ID = ""
process.env.AWS_SECRET_ACCESS_KEY = ""
process.env.AWS_SESSION_TOKEN = ""
process.env.AWS_REGION = ""
process.env.AWS_BUCKET = ""
const AWS = require('../../lib/lokijs/node_modules/aws-sdk');
const options = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    region: process.env.AWS_REGION,
    bucket: process.env.AWS_BUCKET,
    AWS
}

const numDocs = 100000;
const fileNameBase = 'test-loki-db';
const filename = `${fileNameBase}-aws-s3-sync-adapter.json`;
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
    const users = db.getCollection('users');
    users.find({age: {'$gt': 50}});
    console.timeEnd(`${adapterName} - Query`);
    const s3 = new AWS.S3({
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
        sessionToken: options.sessionToken,
        region: options.region
    });
    const params = {
        Bucket: options.bucket,
        Key: filename
    }
    await promisify(s3.deleteObject, s3)(params);
}


setTimeout(async () => {
    console.log(`Starting performance tests with ${numDocs} documents...\n`);
    const collections = ['users', 'posts', 'comments', 'likes', 'followers', 'messages'];

    await measurePerformance('AWSS3SyncAdapter', new AWSS3SyncAdapter(options), filename, collections, numDocs);
    console.log('\nDone!');
    process.exit(0);
}, 1000);
