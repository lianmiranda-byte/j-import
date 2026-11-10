const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createServer } = require("../server");

test("work orders are validated, persisted, searchable and updated through the API", async (t) => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "j-iports-test-"));
  let instance = await createServer({ dataDirectory, port: 0 });
  t.after(async () => {
    await instance.close();
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  });
  let baseUrl = `http://127.0.0.1:${instance.port}`;
  const send = (url, method, body) => fetch(`${baseUrl}${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const validOrder = {
    customer: "Ana Souza",
    phone: "11999999999",
    vehicle: "Honda Fit 2018",
    plate: "ABC1D23",
    service: "Revisão",
    date: "2026-11-10",
    price: 250,
    status: "Aguardando",
    notes: ""
  };

  const homepage = await fetch(`${baseUrl}/`);
  assert.equal(homepage.status, 200);
  assert.match(await homepage.text(), /J-Iports/);

  const invalid = await send("/api/orders", "POST", { ...validOrder, price: -1 });
  assert.equal(invalid.status, 400);
  const invalidDate = await send("/api/orders", "POST", { ...validOrder, date: "2026-02-31" });
  assert.equal(invalidDate.status, 400);

  const createdResponse = await send("/api/orders", "POST", validOrder);
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.match(created.number, /^OS-/);
  assert.equal(created.plate, "ABC1D23");

  const searchResponse = await fetch(`${baseUrl}/api/orders?q=Honda`);
  assert.equal((await searchResponse.json()).length, 1);

  const editResponse = await send(`/api/orders/${created.id}`, "PUT", { ...validOrder, service: "Alinhamento", status: "Em andamento" });
  assert.equal((await editResponse.json()).service, "Alinhamento");

  const statusResponse = await send(`/api/orders/${created.id}/status`, "PATCH", { status: "Pronta" });
  assert.equal((await statusResponse.json()).status, "Pronta");

  const customerList = await (await fetch(`${baseUrl}/api/customers`)).json();
  assert.equal(customerList.length, 1);
  assert.equal(customerList[0].vehicles, "Honda Fit 2018 · ABC1D23");

  const dashboard = await (await fetch(`${baseUrl}/api/dashboard`)).json();
  assert.equal(dashboard.ready, 1);
  assert.equal(dashboard.customers, 1);

  const backup = await (await fetch(`${baseUrl}/api/backup`)).json();
  assert.equal(backup.workOrders.length, 1);

  await instance.close();
  instance = await createServer({ dataDirectory, port: 0 });
  baseUrl = `http://127.0.0.1:${instance.port}`;
  assert.equal((await (await fetch(`${baseUrl}/api/orders`)).json()).length, 1);
  assert.equal((await send(`/api/orders/${created.id}`, "DELETE")).status, 204);
  assert.equal((await (await fetch(`${baseUrl}/api/dashboard`)).json()).total, 0);
});
