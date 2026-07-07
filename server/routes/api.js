const express = require("express");
const router = express.Router();
const db = require("../db");

// Colonnes récentes non couvertes par les migrations déjà appliquées en
// production : on les ajoute à la volée (une seule fois par démarrage),
// comme ensureStorageSchema dans routes/storage.js.
let businessSchemaReady = false;
router.use(async (req, res, next) => {
  if (!businessSchemaReady) {
    try {
      await db.query(
        `ALTER TABLE quotes ADD COLUMN IF NOT EXISTS include_signature boolean DEFAULT true`,
      );
      businessSchemaReady = true;
    } catch (e) {
      console.error("ensure business schema failed:", e.message);
    }
  }
  next();
});

// Generic handler for "supabase-like" queries
// POST /api/:table
// Body: { select: '*', eq: { col: val }, order: { col: 'asc' } }
// This is a simplified adapter.

router.all("/:table", async (req, res) => {
  const table = req.params.table;
  const method = req.method;

  try {
    if (method === "GET") {
      // Handle SELECT
      // Query params: select=*, company_id=eq.123, order=created_at.desc
      // This requires parsing PostgREST syntax or custom query params.
      // Simplification: We look at query string.

      // Add standard logging to verify endpoint hit
      console.log(`[API] ${method} ${table} query:`, req.query);

      let query = `SELECT * FROM ${table}`;
      let conditions = [];
      let values = [];
      let paramIndex = 1;

      // Simple filter parsing
      for (const [key, val] of Object.entries(req.query)) {
        if (key === "select") continue;
        if (key === "order") continue;
        if (key === "limit") continue;
        if (key === "or") continue; // Handled separately
        if (key.startsWith("_")) continue;

        // Handle string operators
        let handled = false;
        if (typeof val === "string") {
          // in
          if (val.startsWith("in.(") && val.endsWith(")")) {
            const inner = val.slice(4, -1);
            if (inner.length === 0) {
              conditions.push("1=0");
              handled = true;
            } else {
              const items = inner.split(",");
              const placeholders = items
                .map(() => `$${paramIndex++}`)
                .join(", ");
              conditions.push(`${key} IN (${placeholders})`);
              values.push(...items);
              handled = true;
            }
          }
          // ilike
          else if (val.startsWith("ilike.")) {
            const pattern = val.substring(6);
            conditions.push(`${key} ILIKE $${paramIndex}`);
            values.push(pattern);
            paramIndex++;
            handled = true;
          }
          // gt
          else if (val.startsWith("gt.")) {
            const v = val.substring(3);
            conditions.push(`${key} > $${paramIndex}`);
            values.push(v);
            paramIndex++;
            handled = true;
          }
          // lt
          else if (val.startsWith("lt.")) {
            const v = val.substring(3);
            conditions.push(`${key} < $${paramIndex}`);
            values.push(v);
            paramIndex++;
            handled = true;
          }
          // gte
          else if (val.startsWith("gte.")) {
            const v = val.substring(4);
            conditions.push(`${key} >= $${paramIndex}`);
            values.push(v);
            paramIndex++;
            handled = true;
          }
          // lte
          else if (val.startsWith("lte.")) {
            const v = val.substring(4);
            conditions.push(`${key} <= $${paramIndex}`);
            values.push(v);
            paramIndex++;
            handled = true;
          }
        }

        if (handled) continue;

        conditions.push(`${key} = $${paramIndex}`);
        values.push(val);
        paramIndex++;
      }

      if (req.query.or) {
        let conditionsStr = req.query.or;
        if (conditionsStr.startsWith("(") && conditionsStr.endsWith(")")) {
          conditionsStr = conditionsStr.slice(1, -1);
        }

        // This is a naive split that doesn't handle commas inside values
        // Ideally should support quoted values or smarter parsing
        const parts = conditionsStr.split(",");
        const orConditions = [];

        for (const part of parts) {
          // split by FIRST dot only to separate column from operator
          const firstDot = part.indexOf(".");
          if (firstDot === -1) continue;

          let col = part.substring(0, firstDot);
          let rest = part.substring(firstDot + 1);

          if (rest.startsWith("ilike.")) {
            let val = rest.substring(6);
            orConditions.push(`${col} ILIKE $${paramIndex}`);
            values.push(val);
            paramIndex++;
          } else if (rest.startsWith("eq.")) {
            let val = rest.substring(3);
            orConditions.push(`${col} = $${paramIndex}`);
            values.push(val);
            paramIndex++;
          } else {
            // Fallback default equality if no operator found or simpler format
            // But usually it should match one of the above.
            // If we just got column.value (which is not standard supabase but maybe assumed)
            // Standard is col.op.val
          }
        }

        if (orConditions.length > 0) {
          conditions.push(`(${orConditions.join(" OR ")})`);
        }
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }

      if (req.query.order) {
        // format: column.direction (e.g. created_at.desc)
        const [col, dir] = req.query.order.split(".");
        query += ` ORDER BY ${col} ${dir === "desc" ? "DESC" : "ASC"}`;
      }

      if (req.query.limit) {
        const limitVal = parseInt(req.query.limit, 10);
        if (!isNaN(limitVal)) {
          // Ensure space before LIMIT
          query += ` LIMIT ${limitVal}`;
        }
      }

      // Standard logging
      console.log(`[API] ${method} ${table} query:`, req.query);
      console.log(`[Query]`, query, values);

      const result = await db.query(query, values);
      res.json(result.rows);
    } else if (method === "POST") {
      // INSERT / UPSERT
      const body = req.body;
      const isUpsert = req.query._upsert === "true";
      const ignoreDuplicates = req.query._ignore_duplicates === "true";
      const conflictTarget = req.query._on_conflict;

      const performInsert = async (item) => {
        const keys = Object.keys(item);
        const values = Object.values(item).map((val) => {
          // Simple fix: if it's an array or object, stringify it so PG treats it as JSON string
          // instead of trying to format it as a PG Array.
          if (
            val !== null &&
            typeof val === "object" &&
            !(val instanceof Date)
          ) {
            return JSON.stringify(val);
          }
          return val;
        });
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");

        let query = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`;

        if (isUpsert) {
          const target = conflictTarget || "id";
          if (ignoreDuplicates) {
            query += ` ON CONFLICT (${target}) DO NOTHING`;
          } else {
            const updateSet = keys
              .map((k) => `${k} = EXCLUDED.${k}`)
              .join(", ");
            query += ` ON CONFLICT (${target}) DO UPDATE SET ${updateSet}`;
          }
        }

        query += ` RETURNING *`;
        return db.query(query, values);
      };

      // If array insert (batch)
      if (Array.isArray(body)) {
        const results = [];
        for (const item of body) {
          const res = await performInsert(item);
          if (res.rows.length > 0) results.push(res.rows[0]);
        }
        res.status(201).json(results);
        return;
      }

      const result = await performInsert(body);
      res.status(201).json(result.rows);
    } else if (method === "PATCH") {
      // UPDATE
      // Need ID or filter.
      // Assuming ?id=...
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: "Update requires id" });

      const body = req.body;
      const keys = Object.keys(body);
      const values = Object.values(body).map((val) => {
        // Simple fix: if it's an array or object, stringify it so PG treats it as JSON string
        // instead of trying to format it as a PG Array.
        if (val !== null && typeof val === "object" && !(val instanceof Date)) {
          return JSON.stringify(val);
        }
        return val;
      });

      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      values.push(id);

      const query = `UPDATE ${table} SET ${setClause} WHERE id = $${values.length} RETURNING *`;
      try {
        const result = await db.query(query, values);
        res.json(result.rows);
      } catch (e) {
        console.error("Update error:", e);
        res.status(500).json({ error: e.message });
      }
    } else if (method === "DELETE") {
      // DELETE
      // Should support filtering by any column, e.g. quote_id=eq.123

      let conditions = [];
      let values = [];
      let paramIndex = 1;

      for (const [key, val] of Object.entries(req.query)) {
        if (key.startsWith("_")) continue;
        if (key === "select") continue; // Although delete with return is not fully implemented here

        // Handle specialized operators if needed (eq is default)
        // For now, assume simpler equality for DELETE or basic operators

        let handled = false;
        if (typeof val === "string") {
          // ilike, gt, lt etc support if needed, but DELETE usually by ID or FK
          if (val.startsWith("eq.")) {
            conditions.push(`${key} = $${paramIndex}`);
            values.push(val.substring(3));
            paramIndex++;
            handled = true;
          }
        }

        if (!handled) {
          conditions.push(`${key} = $${paramIndex}`);
          values.push(val);
          paramIndex++;
        }
      }

      if (conditions.length === 0) {
        return res
          .status(400)
          .json({ error: "Delete requires at least one filter" });
      }

      const whereClause = conditions.join(" AND ");
      const query = `DELETE FROM ${table} WHERE ${whereClause}`;

      try {
        await db.query(query, values);
        res.status(204).send();
      } catch (e) {
        console.error("Delete error:", e);
        res.status(500).json({ error: e.message });
      }
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Specific route for POST /rpc/ (Supabase Functions) if any
// router.post('/rpc/:function', ...);

module.exports = router;
