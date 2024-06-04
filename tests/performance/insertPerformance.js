require("../../../../builds/output/testsRuntime");

const dc = require("double-check");
const fs = require("fs");
const assert = dc.assert;

function getEnclaveDB(dbName, autoSaveInterval) {
    const lokiEnclaveFacadeModule = require("../../index");
    let createLokiEnclaveFacadeInstance = lokiEnclaveFacadeModule.createLokiEnclaveFacadeInstance;
    return createLokiEnclaveFacadeInstance(dbName, autoSaveInterval, lokiEnclaveFacadeModule.Adapters.FS);
}

async function insertRecords(testDb, number) {
    const start = new Date().getTime();
    let i = 0;
    let failed = 0;
    let maxTime = 0;
    while (i < number) {
        const timeStart = new Date().getTime();
        try {
            await $$.promisify(testDb.insertRecord)("DID", "testTable", Math.random(), {name: `test`});
        } catch {
            failed += 1;
        }
        const timeEnd = new Date().getTime();
        const time = timeEnd - timeStart;
        i += 1;
        maxTime = maxTime < time ? time : maxTime;
    }
    const end = new Date().getTime();
    return {fails: failed, totalTime: end - start, maxTime: maxTime}
}

assert.callback("Performance - Enclave db insert test", (testFinishCallback) => {
    dc.createTestFolder("enclaveDBTest", async function (err, folder) {
        let dbPath = require("path").join(folder, "performance_test_db");
        let testDb = getEnclaveDB(dbPath, 200);

        testDb.createCollection("", "testTable", ["pk"])

        let stream = fs.createWriteStream("./insert-performance.txt", {flags: 'a'});
        const responses = [];
        const number = 200000;
        stream.write("\n\nStarted tests for FS Adaptor with indices - [PK]\n\n");
        for (let i = 0; i < 10; i++) {
            let response = await insertRecords(testDb, number);
            console.log(response);
            responses.push(response);
            stream.write(`- Added ${number} records (${response.fails} failed) in ${response.totalTime / 1000 / 60} minutes\n`);
        }
        const average = responses.reduce((prev, curr) => prev + curr.totalTime, 0) / responses.length / 1000 / 60;
        stream.write("Average time: " + average);
        console.log(average);
        stream.end();
        testFinishCallback();
    })
}, 60000)
