require(" ../../../psknode/bundles/testsRuntime");

const dc = require("double-check");
const assert = dc.assert;
const numberOfRecords = 5;

function getEnclaveDB(dbName) {
  let EnclaveDB = require("../index.js");
  return new EnclaveDB(dbName);
}

assert.callback("Enclave Queue test", (testFinishCallback) => {
  dc.createTestFolder("enclaveQueueTest", async function (err, folder) {
    let dbPath = require("path").join(folder, "test_queue");
    let testQ = getEnclaveDB(dbPath);

    for (let i = 0; i < numberOfRecords; i++) {

      let insertResult = await $$.promisify(testQ.addInQueue)("DID_" + Math.floor(Math.random() * 1000), "queueTable", {
        name: `test ${i}`,
        age: 10 + i * 5,
        id: Math.floor(Math.random() * 1000)
      })
      assert.equal(insertResult, true);
    }

    let sizeResult = await $$.promisify(testQ.queueSize)("", "queueTable");
    assert.equal(sizeResult, numberOfRecords);

    let insertResult = await $$.promisify(testQ.addInQueue)("DID_newPK", "queueTable", {
      name: "test_new",
      id: Math.floor(Math.random() * 1000)
    })
    assert.equal(insertResult, true);
    sizeResult = await $$.promisify(testQ.queueSize)("", "queueTable");
    assert.equal(sizeResult, numberOfRecords + 1);


    let resultList = await $$.promisify(testQ.listQueue)("", "queueTable", "asc");

    assert.equal(resultList.length, numberOfRecords + 1);

    let gueueObject = await $$.promisify(testQ.getObjectFromQueue)("", "queueTable", resultList[1]);
    assert.equal(gueueObject.value.name, "test 1");

    let deleteObjectResult = await $$.promisify(testQ.deleteObjectFromQueue)("", "queueTable", resultList[1]);
    assert.equal(deleteObjectResult, true);

    gueueObject = await $$.promisify(testQ.getObjectFromQueue)("", "queueTable", resultList[1]);
    assert.equal(gueueObject, null);

    /*    testQ.listQueue("", "queueTable", "asc", (err, resultList) => {
          assert.equal(err, null);
          assert.equal(resultList.length, numberOfRecords + 1);
          testQ.getObjectFromQueue("", "queueTable", resultList[1], (err, result) => {
            assert.equal(err, null);
            assert.equal(result.name, "test 1");
          })
          testQ.deleteObjectFromQueue("", "queueTable", resultList[1], (err, result) => {
            assert.equal(err, null);
            assert.equal(result, true);
            testQ.queueSize("","queueTable", (err, nr) => {
              assert.equal(nr, numberOfRecords);
            })
            testQ.getObjectFromQueue("", "queueTable", resultList[1], (err, result) => {
              assert.equal(result, null);
            })
          })

        })*/

    testFinishCallback();
  })
}, 60000)
