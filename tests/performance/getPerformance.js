require("../../../../builds/output/testsRuntime");

const dc = require("double-check");
const assert = dc.assert;

function getEnclaveDB(dbName, autoSaveInterval) {
    const lokiEnclaveFacadeModule = require("../../index");
    let createLokiEnclaveFacadeInstance = lokiEnclaveFacadeModule.createLokiEnclaveFacadeInstance;
    return createLokiEnclaveFacadeInstance(dbName, autoSaveInterval, lokiEnclaveFacadeModule.Adapters.FS);
}

async function insertRecords(testDb, number) {
    const ids = []
    for (let i = 0; i < number; i++) {
        try {
            await $$.promisify(testDb.insertRecord)("DID", "testTable", i, {name: `test`});
            ids.push(i);
        } catch {
        }
    }
    return ids;
}

assert.callback("Performance - Enclave db insert test", (testFinishCallback) => {
    dc.createTestFolder("enclaveDBTest", async function (err, folder) {
        let dbPath = require("path").join(folder, "performance_test_db");
        let testDb = getEnclaveDB(dbPath, 200);
        testDb.createCollection("", "testTable", ["pk"])

        const number = 100000;
        const ids = await insertRecords(testDb, number);
        const times = []

        for (let i = 0; i < 10; i++) {
            const id = ids[Math.floor(Math.random() * ids.length)];
            const start = new Date().getTime();
            await $$.promisify(testDb.getRecord)("", "testTable", id);
            times.push(new Date().getTime() - start);
        }
        console.log(times.map(timp => timp + " ms"));
        console.log(`Max time: ${Math.max(...times)} ms`)
        console.log(`Average time: ${times.reduce((prev, curr) => prev + curr) / times.length} ms`)
        testFinishCallback();
    })
}, 60000)
