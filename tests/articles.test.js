/**
 * Integration tests for the articles API.
 *
 * They run against a real PostgreSQL instance configured through the DB_*
 * environment variables (see .env.example). Locally:
 *   docker compose up -d db && npm test
 * In CI, a PostgreSQL service container is provided by the workflow.
 */
const request = require("supertest");
const app = require("../src/server");
const { pool, initializeDatabase } = require("../src/database");

const validArticle = {
  name: "Keyboard",
  description: "Mechanical keyboard",
  price: 49.99,
  stock_quantity: 10,
};

beforeAll(async () => {
  await initializeDatabase();
});

beforeEach(async () => {
  await pool.query("TRUNCATE TABLE articles RESTART IDENTITY");
});

afterAll(async () => {
  await pool.end();
});

describe("GET /health", () => {
  it("reports the API and database as UP", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "UP", database: "UP" });
  });
});

describe("POST /articles", () => {
  it("creates an article", async () => {
    const res = await request(app).post("/articles").send(validArticle);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 1,
      name: validArticle.name,
      description: validArticle.description,
      stock_quantity: validArticle.stock_quantity,
    });
    expect(Number(res.body.price)).toBe(validArticle.price);
  });

  it.each([
    [{ ...validArticle, name: undefined }, "Name is required"],
    [{ ...validArticle, description: "" }, "Description is required"],
    [{ ...validArticle, price: -1 }, "The price must be a positive number or zero"],
    [
      { ...validArticle, stock_quantity: 1.5 },
      "The quantity in stock must be a positive whole number or zero",
    ],
  ])("rejects an invalid payload (%#)", async (payload, message) => {
    const res = await request(app).post("/articles").send(payload);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
  });
});

describe("GET /articles", () => {
  it("lists articles, newest first", async () => {
    await request(app).post("/articles").send(validArticle);
    await request(app)
      .post("/articles")
      .send({ ...validArticle, name: "Mouse" });

    const res = await request(app).get("/articles");

    expect(res.status).toBe(200);
    expect(res.body.map((a) => a.name)).toEqual(["Mouse", "Keyboard"]);
  });
});

describe("GET /articles/:id", () => {
  it("returns an existing article", async () => {
    const created = await request(app).post("/articles").send(validArticle);

    const res = await request(app).get(`/articles/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe(validArticle.name);
  });

  it("returns 404 for an unknown article", async () => {
    const res = await request(app).get("/articles/999");

    expect(res.status).toBe(404);
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await request(app).get("/articles/abc");

    expect(res.status).toBe(400);
  });
});

describe("PUT /articles/:id", () => {
  it("updates an existing article", async () => {
    const created = await request(app).post("/articles").send(validArticle);

    const res = await request(app)
      .put(`/articles/${created.body.id}`)
      .send({ ...validArticle, stock_quantity: 3 });

    expect(res.status).toBe(200);
    expect(res.body.stock_quantity).toBe(3);
  });

  it("returns 404 for an unknown article", async () => {
    const res = await request(app).put("/articles/999").send(validArticle);

    expect(res.status).toBe(404);
  });
});

describe("DELETE /articles/:id", () => {
  it("deletes an existing article", async () => {
    const created = await request(app).post("/articles").send(validArticle);

    const res = await request(app).delete(`/articles/${created.body.id}`);
    expect(res.status).toBe(204);

    const lookup = await request(app).get(`/articles/${created.body.id}`);
    expect(lookup.status).toBe(404);
  });

  it("returns 404 for an unknown article", async () => {
    const res = await request(app).delete("/articles/999");

    expect(res.status).toBe(404);
  });
});
