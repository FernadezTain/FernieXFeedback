import crypto from "crypto";
import express from "express";
import bcrypt from "bcrypt";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(cors());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "ferniex-feedback-secret";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn("SUPABASE_URL or SUPABASE_KEY is missing.");
}

const supabaseHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation"
};

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", ADMIN_SESSION_SECRET)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  const expected = crypto
    .createHmac("sha256", ADMIN_SESSION_SECRET)
    .update(body)
    .digest("base64url");

  if (signature !== expected) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

async function sb(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...supabaseHeaders,
      ...(options.headers || {})
    }
  });

  const text = await res.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(message || "Supabase request failed");
  }

  return data;
}

function getAdminToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function requireAdmin(req, res, next) {
  const token = getAdminToken(req);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, error: "Нет доступа" });
  }
  req.admin = payload;
  next();
}

function normalizeAuthor(nickname, anonymous) {
  if (anonymous) return "Анонимный опрос";
  const value = String(nickname || "").trim();
  return value || "Гость";
}

app.get("/api/health", (req, res) => {
  res.json({ success: true });
});

app.post("/api/feedback/rating", async (req, res) => {
  const { nickname, anonymous, support_rating, bot_rating, products_rating } = req.body;

  const ratings = [support_rating, bot_rating, products_rating].map(Number);
  if (ratings.some((item) => !item || item < 1 || item > 5)) {
    return res.status(400).json({ success: false, error: "Оценки должны быть от 1 до 5" });
  }

  try {
    await sb("feedback_reviews", {
      method: "POST",
      body: JSON.stringify({
        nickname: anonymous ? null : String(nickname || "").trim() || null,
        display_name: normalizeAuthor(nickname, anonymous),
        anonymous: !!anonymous,
        support_rating: ratings[0],
        bot_rating: ratings[1],
        products_rating: ratings[2],
        average_rating: Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2))
      })
    });

    res.json({ success: true });
  } catch (error) {
    console.error("feedback/rating", error);
    res.status(500).json({ success: false, error: "Ошибка сохранения отзыва" });
  }
});

app.post("/api/feedback/idea", async (req, res) => {
  const { nickname, anonymous, idea_text } = req.body;
  const idea = String(idea_text || "").trim();

  if (idea.length < 8) {
    return res.status(400).json({ success: false, error: "Опишите идею чуть подробнее" });
  }

  try {
    await sb("feedback_ideas", {
      method: "POST",
      body: JSON.stringify({
        nickname: anonymous ? null : String(nickname || "").trim() || null,
        display_name: normalizeAuthor(nickname, anonymous),
        anonymous: !!anonymous,
        idea_text: idea
      })
    });

    res.json({ success: true });
  } catch (error) {
    console.error("feedback/idea", error);
    res.status(500).json({ success: false, error: "Ошибка сохранения идеи" });
  }
});

app.post("/api/admin/login", async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, error: "Введите пароль" });
  }

  try {
    const rows = await sb("admin_access?select=id,password_hash,is_active&is_active=eq.true&limit=1");
    const adminRow = rows?.[0];

    if (!adminRow?.password_hash) {
      return res.status(500).json({ success: false, error: "Пароль администратора не настроен" });
    }

    const ok = await bcrypt.compare(String(password), adminRow.password_hash);
    if (!ok) {
      return res.status(401).json({ success: false, error: "Неверный пароль" });
    }

    const token = signToken({
      scope: "feedback-admin",
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7
    });

    res.json({ success: true, token });
  } catch (error) {
    console.error("admin/login", error);
    res.status(500).json({ success: false, error: "Ошибка входа" });
  }
});

app.get("/api/admin/entries", requireAdmin, async (req, res) => {
  const type = req.query.type === "ideas" ? "ideas" : "reviews";

  try {
    if (type === "ideas") {
      const ideas = await sb("feedback_ideas?select=id,display_name,anonymous,idea_text,created_at&order=created_at.desc");
      return res.json({ success: true, items: ideas });
    }

    const reviews = await sb("feedback_reviews?select=id,display_name,anonymous,support_rating,bot_rating,products_rating,average_rating,created_at&order=created_at.desc");
    res.json({ success: true, items: reviews });
  } catch (error) {
    console.error("admin/entries", error);
    res.status(500).json({ success: false, error: "Ошибка загрузки данных" });
  }
});

app.get("/api/admin/entry/:type/:id", requireAdmin, async (req, res) => {
  const { type, id } = req.params;

  try {
    if (type === "ideas") {
      const rows = await sb(`feedback_ideas?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
      return res.json({ success: true, item: rows?.[0] || null });
    }

    const rows = await sb(`feedback_reviews?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
    res.json({ success: true, item: rows?.[0] || null });
  } catch (error) {
    console.error("admin/entry", error);
    res.status(500).json({ success: false, error: "Ошибка загрузки записи" });
  }
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`FernieX Feedback server started on port ${PORT}`);
});
