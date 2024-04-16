require(" ../../../builds/output/testsRuntime");

const dc = require("double-check");
const assert = dc.assert;

function getEnclaveDB(dbName, autoSaveInterval) {
    let createLokiEnclaveFacadeInstance = require("../index.js").createLokiEnclaveFacadeInstance;
    return createLokiEnclaveFacadeInstance(dbName, autoSaveInterval);
}

assert.callback("Enclave dafault db insert test", (testFinishCallback) => {
    dc.createTestFolder("enclaveDBTest", async function (err, folder) {
        let dbPath = require("path").join(folder, "performance_test_db");
        let testDb = getEnclaveDB(dbPath, 200);

        let numberOfTryes = 4;
        let currentTry = 0;

        function insertRecords(initTime, duration) {
            while (new Date().getTime() - initTime < duration) {
                testDb.insertRecord("DID", "testTable", Math.random(), {
                    name: `test`,
                }, () => {
                });
            }
        }

        let myInterval = setInterval(function () {
            console.log('setInterval')

            insertRecords(new Date().getTime(), 1000);
            currentTry++;
            testDb.count("testTable", (err, nr) => {
                console.log('In memory number of records in db = ', nr);
            });
            if (numberOfTryes <= currentTry) {
                clearInterval(myInterval);
                const loki = require("../lib/lokijs/src/lokijs.js");
                const lfsa = require("../lib/lokijs/src/loki-fs-structured-adapter.js");

                const adapter = new lfsa();
                let readDb = new loki(dbPath, {
                    adapter: adapter,
                    autosave: false,
                })
                setTimeout(() => {
                    readDb.loadDatabase({}, () => {
                        let collection = readDb.getCollection("testTable");
                        let nr = collection.count();
                        console.log('Persisted number of records = ', nr);
                        console.log('Number of records per second = ', nr / numberOfTryes);
                        testFinishCallback();
                    })
                }, 0)


            }
        }, 2000)

    })
}, 60000)
