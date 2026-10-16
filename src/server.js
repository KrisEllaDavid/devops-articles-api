const express = require("express");
const { pool, initializeDatabase } = require("./database");

const app = express();

app.use(express.json());

/**
 * Validate article
 */
function validateArticle(data) {
  const { name, description, price, stock_quantity } = data;

  if (!name || typeof name !== "string") {
    return "Name is required";
  }

  if (!description || typeof description !== "string") {
    return "Description is required";
  }

  if (price === undefined || typeof price !== "number" || price < 0) {
    return "The price must be a positive number or zero";
  }

  if (
    stock_quantity === undefined ||
    !Number.isInteger(stock_quantity) ||
    stock_quantity < 0
  ) {
    return "The quantity in stock must be a positive whole number or zero";
  }

  return null;
}

/**
 * POST /articles
 * Create article
 */
app.post("/articles", async (req, res) => {
  try {
    const error = validateArticle(req.body);

    if (error) {
      return res.status(400).json({
        message: error,
      });
    }

    const { name, description, price, stock_quantity } = req.body;

    const result = await pool.query(
      `
            INSERT INTO articles (
                name,
                description,
                price,
                stock_quantity
            )
            VALUES ($1, $2, $3, $4)
            RETURNING *
            `,
      [name, description, price, stock_quantity],
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erreur interne du serveur.",
    });
  }
});

/**
 * GET /articles
 * Get articles
 */
app.get("/articles", async (req, res) => {
  try {
    const result = await pool.query(
      `
            SELECT *
            FROM articles
            ORDER BY id DESC
            `,
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erreur interne du serveur.",
    });
  }
});

/**
 * GET /articles/:id
 * View article
 */
app.get("/articles/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        message: "Identifiant invalide.",
      });
    }

    const result = await pool.query(
      `
            SELECT *
            FROM articles
            WHERE id = $1
            `,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Article introuvable.",
      });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erreur interne du serveur.",
    });
  }
});

/**
 * PUT /articles/:id
 * Update article
 */
app.put("/articles/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        message: "Identifiant invalide.",
      });
    }

    const error = validateArticle(req.body);

    if (error) {
      return res.status(400).json({
        message: error,
      });
    }

    const { name, description, price, stock_quantity } = req.body;

    const result = await pool.query(
      `
            UPDATE articles
            SET
                name = $1,
                description = $2,
                price = $3,
                stock_quantity = $4
            WHERE id = $5
            RETURNING *
            `,
      [name, description, price, stock_quantity, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Article introuvable.",
      });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erreur interne du serveur.",
    });
  }
});

/**
 * DELETE /articles/:id
 * Delete article
 */
app.delete("/articles/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        message: "Identifiant invalide.",
      });
    }

    const result = await pool.query(
      `
            DELETE FROM articles
            WHERE id = $1
            RETURNING *
            `,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Article introuvable.",
      });
    }

    return res.status(204).send();
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erreur interne du serveur.",
    });
  }
});

/**
 * Health check
 */
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    return res.status(200).json({
      status: "UP",
      database: "UP",
    });
  } catch (error) {
    return res.status(503).json({
      status: "DOWN",
      database: "DOWN",
    });
  }
});

/**
 * Démarrage du serveur
 */
async function startServer() {
  try {
    await initializeDatabase();

    const PORT = process.env.PORT || 3000;

    app.listen(PORT, () => {
      console.log(`API started on port ${PORT}`);
    });
  } catch (error) {
    console.error("Cannot start application :", error);

    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
