require(" ../../../builds/output/testsRuntime");

const dc = require("double-check");
const path = require("path");
const assert = dc.assert;
const numberOfREcords = 5;

const TABLE_NAME = "testTable";
const DID = "DID_newPk";

function getTestDb(adapter) {
    assert.callback("Enclave default db insert test", (testFinishCallback) => {
        dc.createTestFolder("enclaveDBTest", async function (err, folder) {
            const path = require("path");
            let dbPath = path.join(folder, "test_db");
            // fs.mkdirSync(dbPath, {recursive: true});
            let testDb = adapter;
            await $$.promisify(testDb.removeCollection)(DID, TABLE_NAME)
            await $$.promisify(testDb.createCollection, testDb)(DID, TABLE_NAME, ["pk", "age", "id", "name"]);
            for (let i = 0; i < numberOfREcords; i++) {
                let pk = Math.floor(Math.random() * 5000);
                await $$.promisify(testDb.insertRecord)("DID_" + pk, TABLE_NAME, pk, {
                    name: `test ${i}`,
                    age: 10 + i * 5,
                    id: Math.floor(Math.random() * 1000)
                });
            }
            let nr = await $$.promisify(testDb.count)(DID, TABLE_NAME);
            assert.equal(nr, numberOfREcords);

            await $$.promisify(testDb.insertRecord)(DID, TABLE_NAME, "newPk", {
                name: "test_new",
                id: Math.floor(Math.random() * 1000)
            });

            // let record = await $$.promisify(testDb.getAllRecords)(DID, TABLE_NAME);
            // console.log("----------------------", record);
            nr = await $$.promisify(testDb.count)(DID, TABLE_NAME)
            assert.equal(nr, numberOfREcords + 1);

            let data = await $$.promisify(testDb.getRecord)(DID, TABLE_NAME, "newPk");
            assert.equal(data.name, "test_new");

            await $$.promisify(testDb.updateRecord)(DID, TABLE_NAME, "newPk", {name: "newName", "id": "someID"});

            data = await $$.promisify(testDb.getRecord)(DID, TABLE_NAME, "wrongPk");
            assert.equal(data, null);

            data = await $$.promisify(testDb.getRecord)(DID, TABLE_NAME, "newPk");
            assert.equal(data.id, "someID");

            try {
                await $$.promisify(testDb.getRecord)(DID, TABLE_NAME, "newPk")
            } catch (e) {
                assert.notEqual(e, null);
            }

            try {
                await $$.promisify(testDb.deleteRecord)(DID, TABLE_NAME, "newPk")
            } catch (e) {
                assert.notEqual(e, null);
            }

            try {
                await $$.promisify(testDb.deleteRecord)(DID, TABLE_NAME, "wrongPk")
            } catch (e) {

                assert.notEqual(e, null);
            }

            try {
                await $$.promisify(testDb.deleteRecord)(DID, TABLE_NAME, "newPk")
            } catch (e) {
                assert.equal(e, null);
            }

            nr = await $$.promisify(testDb.count)(DID, TABLE_NAME)
            assert.equal(nr, numberOfREcords);

            data = await $$.promisify(testDb.filter)(DID, TABLE_NAME)
            assert.equal(data.length, 5);

            data = await $$.promisify(testDb.filter)(DID, TABLE_NAME, "age == 15");
            assert.equal(data.length, 1);

            data = await $$.promisify(testDb.filter)(DID, TABLE_NAME, ["age >= 15", "age <= 25"], "desc");
            assert.equal(data.length, 3);
            assert.equal(data[0].age > data[1].age && data[1].age > data[2].age, true)

            data = await $$.promisify(testDb.filter)(DID, TABLE_NAME, "name like \\btest\\w*", "desc", 3)
            assert.equal(data.length, 3);
            testFinishCallback();
        })
    }, 60000)
}

module.exports = { getTestDb };