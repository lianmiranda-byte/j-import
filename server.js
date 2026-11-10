const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const initializeSqlJs = require("sql.js");

const STATUSES = ["Aguardando", "Em andamento", "Pronta", "Entregue"];
const PUBLIC_DIR = path.join(__dirname, "public");

async function createServer(options = {}) {
  const host = options.host || "127.0.0.1";
  const requestedPort = options.port ?? 0;
  const dataDirectory = path.resolve(options.dataDirectory || path.join(__dirname, "data"));
  fs.mkdirSync(dataDirectory, { recursive: true });

  const SQL = await initializeSqlJs({
    locateFile: (filename) => path.join(path.dirname(require.resolve("sql.js")), filename)
  });
  const databasePath = path.join(dataDirectory, "j-iports.sqlite");
  const database = fs.existsSync(databasePath)
    ? new SQL.Database(fs.readFileSync(databasePath))
    : new SQL.Database();

  database.run(`
    CREATE TABLE IF NOT EXISTS work_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL UNIQUE,
      customer TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      vehicle TEXT NOT NULL,
      plate TEXT NOT NULL DEFAULT '',
      service TEXT NOT NULL,
      order_date TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0 CHECK(price >= 0),
      status TEXT NOT NULL DEFAULT 'Aguardando'
        CHECK(status IN ('Aguardando', 'Em andamento', 'Pronta', 'Entregue')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
    CREATE INDEX IF NOT EXISTS idx_work_orders_customer ON work_orders(customer COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_work_orders_created ON work_orders(created_at DESC);
  `);

  function persistDatabase() {
    const temporaryPath = `${databasePath}.tmp`;
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
    fs.writeFileSync(temporaryPath, Buffer.from(database.export()));
    fs.renameSync(temporaryPath, databasePath);
  }

  function queryAll(sql, parameters = []) {
    const statement = database.prepare(sql);
    try {
      statement.bind(parameters);
      const rows = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally {
      statement.free();
    }
  }

  function queryOne(sql, parameters = []) {
    return queryAll(sql, parameters)[0] || null;
  }

  function validateOrder(body) {
    const values = {
      customer: typeof body?.customer === "string" ? body.customer.trim() : "",
      phone: typeof body?.phone === "string" ? body.phone.trim() : "",
      vehicle: typeof body?.vehicle === "string" ? body.vehicle.trim() : "",
      plate: typeof body?.plate === "string" ? body.plate.trim().toLocaleUpperCase("pt-BR") : "",
      service: typeof body?.service === "string" ? body.service.trim() : "",
      date: typeof body?.date === "string" ? body.date : "",
      price: body?.price === "" || body?.price == null ? 0 : Number(body.price),
      status: typeof body?.status === "string" ? body.status : "Aguardando",
      notes: typeof body?.notes === "string" ? body.notes.trim() : ""
    };

    if (!values.customer || values.customer.length > 100) return { error: "Informe o nome do cliente (até 100 caracteres)." };
    if (values.phone.length > 30) return { error: "O telefone deve ter até 30 caracteres." };
    if (!values.vehicle || values.vehicle.length > 100) return { error: "Informe o veículo (até 100 caracteres)." };
    if (values.plate.length > 12) return { error: "A placa deve ter até 12 caracteres." };
    if (!values.service || values.service.length > 160) return { error: "Informe o serviço (até 160 caracteres)." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)
      || Number.isNaN(Date.parse(`${values.date}T00:00:00Z`))
      || new Date(`${values.date}T00:00:00Z`).toISOString().slice(0, 10) !== values.date) {
      return { error: "Informe uma data válida." };
    }
    if (!Number.isFinite(values.price) || values.price < 0) return { error: "O valor deve ser um número igual ou maior que zero." };
    if (!STATUSES.includes(values.status)) return { error: "Selecione um status válido." };
    if (values.notes.length > 1000) return { error: "As observações devem ter até 1.000 caracteres." };
    return { values };
  }

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok", app: "J-Iports", storage: "SQLite" });
  });

  app.get("/api/dashboard", (_request, response) => {
    const totals = queryOne(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status IN ('Aguardando', 'Em andamento') THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN status = 'Pronta' THEN 1 ELSE 0 END) AS ready,
        SUM(CASE WHEN status <> 'Entregue' THEN price ELSE 0 END) AS expected_revenue,
        COUNT(DISTINCT customer COLLATE NOCASE) AS customers
      FROM work_orders
    `);
    const byStatus = queryAll("SELECT status, COUNT(*) AS count FROM work_orders GROUP BY status");
    const statusCounts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
    byStatus.forEach((row) => { statusCounts[row.status] = row.count; });
    response.json({ ...totals, statusCounts });
  });

  app.get("/api/orders", (request, response) => {
    const query = typeof request.query.q === "string" ? request.query.q.trim().slice(0, 100) : "";
    const status = typeof request.query.status === "string" ? request.query.status : "";
    if (status && !STATUSES.includes(status)) return response.status(400).json({ error: "Filtro de status inválido." });

    const filters = [];
    const parameters = [];
    if (status) {
      filters.push("status = ?");
      parameters.push(status);
    }
    if (query) {
      filters.push("instr(lower(customer || ' ' || phone || ' ' || vehicle || ' ' || plate || ' ' || service || ' ' || number), lower(?)) > 0");
      parameters.push(query);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    response.json(queryAll(`SELECT * FROM work_orders ${where} ORDER BY created_at DESC, id DESC`, parameters));
  });

  app.post("/api/orders", (request, response) => {
    const result = validateOrder(request.body);
    if (result.error) return response.status(400).json({ error: result.error });
    const values = result.values;
    const timestamp = new Date().toISOString();
    const dateStamp = timestamp.slice(0, 10).replaceAll("-", "");
    const number = `OS-${dateStamp}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
    database.run(`
      INSERT INTO work_orders (number, customer, phone, vehicle, plate, service, order_date, price, status, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [number, values.customer, values.phone, values.vehicle, values.plate, values.service, values.date, values.price, values.status, values.notes, timestamp, timestamp]);
    persistDatabase();
    const order = queryOne("SELECT * FROM work_orders WHERE id = last_insert_rowid()");
    response.status(201).json(order);
  });

  app.put("/api/orders/:id", (request, response) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return response.status(400).json({ error: "Identificador de ordem inválido." });
    const result = validateOrder(request.body);
    if (result.error) return response.status(400).json({ error: result.error });
    const existing = queryOne("SELECT id FROM work_orders WHERE id = ?", [id]);
    if (!existing) return response.status(404).json({ error: "Ordem de serviço não encontrada." });
    const values = result.values;
    database.run(`
      UPDATE work_orders
      SET customer = ?, phone = ?, vehicle = ?, plate = ?, service = ?, order_date = ?, price = ?, status = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `, [values.customer, values.phone, values.vehicle, values.plate, values.service, values.date, values.price, values.status, values.notes, new Date().toISOString(), id]);
    persistDatabase();
    response.json(queryOne("SELECT * FROM work_orders WHERE id = ?", [id]));
  });

  app.patch("/api/orders/:id/status", (request, response) => {
    const id = Number(request.params.id);
    const status = request.body?.status;
    if (!Number.isSafeInteger(id) || id < 1) return response.status(400).json({ error: "Identificador de ordem inválido." });
    if (!STATUSES.includes(status)) return response.status(400).json({ error: "Selecione um status válido." });
    const existing = queryOne("SELECT id FROM work_orders WHERE id = ?", [id]);
    if (!existing) return response.status(404).json({ error: "Ordem de serviço não encontrada." });
    database.run("UPDATE work_orders SET status = ?, updated_at = ? WHERE id = ?", [status, new Date().toISOString(), id]);
    persistDatabase();
    response.json(queryOne("SELECT * FROM work_orders WHERE id = ?", [id]));
  });

  app.delete("/api/orders/:id", (request, response) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return response.status(400).json({ error: "Identificador de ordem inválido." });
    const existing = queryOne("SELECT id FROM work_orders WHERE id = ?", [id]);
    if (!existing) return response.status(404).json({ error: "Ordem de serviço não encontrada." });
    database.run("DELETE FROM work_orders WHERE id = ?", [id]);
    persistDatabase();
    response.status(204).end();
  });

  app.get("/api/customers", (_request, response) => {
    response.json(queryAll(`
      SELECT customer AS name, MAX(phone) AS phone, COUNT(*) AS order_count,
        group_concat(DISTINCT vehicle || CASE WHEN plate = '' THEN '' ELSE ' · ' || plate END) AS vehicles
      FROM work_orders
      GROUP BY customer COLLATE NOCASE
      ORDER BY customer COLLATE NOCASE
    `));
  });

  app.get("/api/backup", (_request, response) => {
    response.setHeader("Content-Disposition", `attachment; filename="backup-j-iports-${new Date().toISOString().slice(0, 10)}.json"`);
    response.json({
      app: "J-Iports",
      exportedAt: new Date().toISOString(),
      workOrders: queryAll("SELECT * FROM work_orders ORDER BY id")
    });
  });

  app.use(express.static(PUBLIC_DIR, { etag: false, lastModified: false, maxAge: 0 }));
  app.use((error, _request, response, _next) => {
    console.error("Erro na aplicação J-Iports:", error);
    if (response.headersSent) return;
    response.status(500).json({ error: "Ocorreu um erro interno. Consulte o terminal para mais detalhes." });
  });

  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(requestedPort, host, () => resolve(listener));
    listener.once("error", reject);
  });

  return {
    app,
    databasePath,
    host,
    port: server.address().port,
    server,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => {
        database.close();
        if (error) reject(error);
        else resolve();
      });
    })
  };
}

if (require.main === module) {
  createServer({ port: Number(process.env.PORT) || 3130 })
    .then(({ host, port, databasePath }) => {
      console.log(`J-Iports aberto em http://${host}:${port}`);
      console.log(`Banco SQL: ${databasePath}`);
    })
    .catch((error) => {
      console.error("Não foi possível iniciar o J-Iports:", error);
      process.exitCode = 1;
    });
}

module.exports = { createServer, STATUSES };
