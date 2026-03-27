const express = require("express");
const router = express.Router();
const multer = require("multer");
const db = require("../db");

// Use memory storage for Vercel compatibility
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Upload route: /storage/v1/object/:bucket/:filename
router.post(/^\/object\/([^/]+)\/(.+)$/, upload.single("file"), async (req, res) => {
  const bucket = req.params[0];
  const relativePath = req.params[1];

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    // 1. Ensure bucket exists in database (simplified)
    await db.query(`INSERT INTO storage.buckets (id, name, public) VALUES ($1, $1, true) ON CONFLICT DO NOTHING`, [bucket]);

    // 2. Insert or update object in database with the actual file content
    const name = relativePath;
    await db.query(`
      INSERT INTO storage.objects (bucket_id, name, content, content_type)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (bucket_id, name) DO UPDATE SET 
        content = EXCLUDED.content,
        content_type = EXCLUDED.content_type,
        updated_at = NOW()
    `, [bucket, name, req.file.buffer, req.file.mimetype]);

    const key = `${bucket}/${relativePath}`;
    res.json({ Key: key, path: key });
  } catch (e) {
    console.error("Upload error:", e);
    return res.status(500).json({ error: "Failed to save file to database: " + e.message });
  }
});

// Get Public URL
router.get(/^\/object\/public\/([^/]+)\/(.+)$/, async (req, res) => {
  const bucket = req.params[0];
  const relativePath = req.params[1];

  try {
    const result = await db.query(
      "SELECT content, content_type FROM storage.objects WHERE bucket_id = $1 AND name = $2",
      [bucket, relativePath]
    );

    if (result.rows.length > 0) {
      const { content, content_type } = result.rows[0];
      res.setHeader("Content-Type", content_type || "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(content);
    } else {
      res.status(404).json({ error: "File not found" });
    }
  } catch (e) {
    console.error("Download error:", e);
    res.status(500).json({ error: "Database error: " + e.message });
  }
});

module.exports = router;
