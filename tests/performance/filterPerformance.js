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
            await $$.promisify(testDb.insertRecord)("DID", "testTable", i, {
                age: Math.round(Math.random() * 100),
                account: Math.round(Math.random() * 200000),
                prob: Math.random()
            });
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
        const number = 100000;

        await insertRecords(testDb, number);


        // Without indices
        let start = new Date().getTime();
        let filterRecords = await $$.promisify(testDb.filter)("", "testTable", ["age > 50", "account <= 100000", "prob > 0.7"]);
        let time = new Date().getTime() - start;
        console.log(`No indices - Retrieved ${filterRecords.length} records in ${time}ms`);

        testDb.addIndex("", "testTable", "age");
        start = new Date().getTime();
        filterRecords = await $$.promisify(testDb.filter)("", "testTable", ["age > 50", "account <= 100000", "prob > 0.7"]);
        time = new Date().getTime() - start;
        console.log(`Index on age - Retrieved ${filterRecords.length} records in ${time}ms`);

        testDb.addIndex("", "testTable", "account");
        start = new Date().getTime();
        filterRecords = await $$.promisify(testDb.filter)("", "testTable", ["age > 50", "account <= 100000", "prob > 0.7"]);
        time = new Date().getTime() - start;
        console.log(`Index on age & account- Retrieved ${filterRecords.length} records in ${time}ms`);

        testDb.addIndex("", "testTable", "prob");
        start = new Date().getTime();
        filterRecords = await $$.promisify(testDb.filter)("", "testTable", ["age > 50", "account <= 100000", "prob > 0.7"]);
        time = new Date().getTime() - start;
        console.log(`Index on age & account & prob - Retrieved ${filterRecords.length} records in ${time}ms`);

        testFinishCallback();
    })
}, 60000)
