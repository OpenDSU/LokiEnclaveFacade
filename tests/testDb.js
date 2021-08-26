require(" ../../../psknode/bundles/testsRuntime");

const dc = require("double-check");
const assert = dc.assert;
const numberOfREcords = 5;

function getEnclaveDB(dbName) {
  let EnclaveDB = require("../index.js");
  return new EnclaveDB(dbName);
}

assert.callback("Enclave dafault db insert test", (testFinishCallback) => {
  dc.createTestFolder("enclaveDBTest", async function (err, folder) {
    const no_retries = 10;

    let testDb = getEnclaveDB("test_db");
    let deleteResult = await $$.promisify(testDb.deleteTable)("testTable")
    assert.equal(deleteResult, true);

    for (let i = 0; i < numberOfREcords; i++) {
      let pk = Math.floor(Math.random() * 5000);
      testDb.insertRecord("DID_" + pk, "testTable", pk, {
        name: `test ${i}`,
        age: 10 + i * 5,
        id: Math.floor(Math.random() * 1000)
      }, (err, data) => {
        assert.equal(err, null);
        assert.equal(data, true);
      });
    }
    testDb.count("testTable", (err, nr) => {
      assert.equal(nr, numberOfREcords);
    })

    testDb.insertRecord("DID_newPK", "testTable", "newPk", {
      name: "test_new",
      id: Math.floor(Math.random() * 1000)
    }, (err, data) => {
      assert.equal(err, null);
      assert.equal(data, true);
    });

    testDb.count("testTable", (err, nr) => {
      assert.equal(nr, numberOfREcords + 1);
    })

    testDb.getRecord("DID_newPK", "testTable", "newPk", (err, data) => {
      assert.equal(err, null);
      assert.equal(data.value.name, "test_new");
    })

    testDb.getRecord("DID_newPK", "testTable", "wrongPk", (err, data) => {
      assert.equal(err, null);
      assert.equal(data, null);
    })

    testDb.getRecord("DID_newPK", "wrongTable", "newPk", (err, data) => {
      assert.notEqual(err, null);
    })
    testDb.deleteRecord("DID_newPK", "wrongTable", "newPk", (err, data) => {
      assert.notEqual(err, null);
    })

    testDb.deleteRecord("DID_newPK", "testTable", "wrongPk", (err, data) => {
      assert.notEqual(err, null);
    })

    testDb.deleteRecord("DID_newPK", "testTable", "newPk", (err, data) => {
      assert.equal(err, null);
      assert.equal(data, true);
      testDb.count("testTable", (err, nr) => {
        assert.equal(nr, numberOfREcords);
      })
    })

    testDb.filterRecords("DID_newPK", "testTable", {"value.age": {$between: [10, 20]}}, "value.age desc", (err, data) => {
      assert.equal(err, null);
      assert.equal(data.length, 3);
      assert.equal(data[0].value.age > data[1].value.age && data[1].value.age > data[2].value.age, true)
    })

    testDb.filterRecords("DID_newPK", "testTable", {"value.age": {$between: [10, 20]}}, "value.age asc", (err, data) => {
      assert.equal(err, null);
      assert.equal(data.length, 3);
      assert.equal(data[0].value.age < data[1].value.age && data[1].value.age < data[2].value.age, true)
    })

    testDb.filterRecords("DID_newPK", "testTable", {"value.age": {$jgte: 15}}, null, 3,(err, data) => {
      assert.equal(err, null);
      assert.equal(data.length, 3);
      assert.equal(data[0].value.age < data[1].value.age && data[1].value.age < data[2].value.age, true)
    })

    testDb.filterRecords("DID_newPK", "testTable", (err, data) => {
      assert.equal(err, null);
      assert.equal(data.length, 5);
      assert.equal(data[0].value.age < data[1].value.age && data[1].value.age < data[2].value.age, true)
    })
    testFinishCallback();
  })
})
