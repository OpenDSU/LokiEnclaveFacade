require("../../../../builds/output/testsRuntime");
const dc = require('double-check');
const assert = dc.assert;

function getEnclaveDB(dbName, autoSaveInterval) {
    const LokiDb = require('../../LokiDb');
    return new LokiDb(dbName, autoSaveInterval);
}

async function benchmarkCRUDOperations(testDb, numberOfRecords) {
    const results = {
        create: 0,
        read: 0,
        update: 0,
        delete: 0,
        filter: 0
    };

    let start, end;
    // Create records
    for (let i = 0; i < numberOfRecords; i++) {
        start = Date.now();
        await $$.promisify(testDb.insertRecord)('testTable', `pk${i}`, { name: `test${i}` });
        end = Date.now();
        results.create += (end - start);
    }
    results.create /= numberOfRecords;

    // Read records
    for (let i = 0; i < numberOfRecords; i++) {
        start = Date.now();
        await $$.promisify(testDb.getRecord)('testTable', `pk${i}`);
        end = Date.now();
        results.read += (end - start);
    }
    results.read /= numberOfRecords;

    // Update records
    for (let i = 0; i < numberOfRecords; i++) {
        start = Date.now();
        await $$.promisify(testDb.updateRecord)('testTable', `pk${i}`, { name: `updatedTest${i}` });
        end = Date.now();
        results.update += (end - start);
    }
    results.update /= numberOfRecords;

    // Delete records
    for (let i = 0; i < numberOfRecords; i++) {
        start = Date.now();
        await $$.promisify(testDb.deleteRecord)('testTable', `pk${i}`);
        end = Date.now();
        results.delete += (end - start);
    }
    results.delete /= numberOfRecords;

    // Filter records
    start = Date.now();
    await $$.promisify(testDb.filter)('testTable', 'name like test%', 'asc', numberOfRecords);
    end = Date.now();
    results.filter = end - start;

    return results;
}

assert.callback('Benchmark - CRUD and Filter operations (1 Million Records)', (testFinishCallback) => {
    dc.createTestFolder('benchmarkTest', async function (err, folder) {
        let dbPath = require('path').join(folder, 'benchmark_test_db');
        let testDb = getEnclaveDB(dbPath, 5000);
        await $$.promisify(testDb.createCollection)('testTable', ['pk', '__timestamp', 'name']);
        const numberOfRecords = 1000000;  // Set to 1 million
        const results = await benchmarkCRUDOperations(testDb, numberOfRecords);

        console.log('Benchmark results (Average Time in ms per operation):', {
            create: results.create,
            read: results.read,
            update: results.update,
            delete: results.delete,
            filter: results.filter
        });
        testFinishCallback();
    });
}, 600000);  // Increased timeout to 10 minutes
