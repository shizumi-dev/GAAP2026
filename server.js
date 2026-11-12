require("dotenv").config();
const express = require("express");
const session = require("express-session");
const pg = require("pg");
const connectPgSimple = require("connect-pg-simple");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
});
const PgSession = connectPgSimple(session);

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  store: new PgSession({ pool, tableName: "user_sessions", createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || "development-only-change-this",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "public")));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-7", legacyHeaders: false });
const COLLEGE_COURSES = ["BSTM", "BSIT"];
const COLLEGE_YEARS = [1, 2, 3, 4];
const SHS_STRANDS = { 11: ["ASSH", "BE", "CUART", "ICT", "STEM"], 12: ["MAWD", "CUART", "HUMSS", "STEM", "ABM"] };

async function countRows() {
  const { rows } = await pool.query(`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE division='college')::int AS college,
      COUNT(*) FILTER (WHERE division='senior_high')::int AS senior_high
    FROM registrations
  `);
  const total = rows[0].total;
  return { total, college: rows[0].college, seniorHigh: rows[0].senior_high, target: 200, remaining: Math.max(0, 200-total), percent: Math.min(100, Math.round(total/200*100)), targetReached: total >= 200 };
}
function requireAdmin(req,res,next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: "Admin authentication required." });
}
function csvCell(value) {
  const s = String(value ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}
function rowsToCsv(rows, kind) {
  const common = ["Full name", "Age"];
  const payment = ["Payment status", "Registered at"];
  let headers;
  if (kind === "college") headers = [...common, "Course", "College year", ...payment];
  else if (kind === "senior-high") headers = [...common, "Grade level", "Strand", ...payment];
  else if (kind === "college-categorized") headers = [...common, "Division", "Course", "College year", ...payment];
  else if (kind === "senior-high-categorized") headers = [...common, "Division", "Grade level", "Strand", ...payment];
  else headers = [...common, "Division", "Course", "College year", "Grade level", "Strand", ...payment];

  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) {
    const division = r.division === "senior_high" ? "Senior High School" : "College";
    const registeredAt = new Date(r.created_at).toISOString();
    let values;
    if (kind === "college") values = [r.full_name, r.age, r.course, r.college_year, r.payment_status, registeredAt];
    else if (kind === "senior-high") values = [r.full_name, r.age, r.grade_level, r.strand, r.payment_status, registeredAt];
    else if (kind === "college-categorized") values = [r.full_name, r.age, division, r.course, r.college_year, r.payment_status, registeredAt];
    else if (kind === "senior-high-categorized") values = [r.full_name, r.age, division, r.grade_level, r.strand, r.payment_status, registeredAt];
    else values = [r.full_name, r.age, division, r.course, r.college_year, r.grade_level, r.strand, r.payment_status, registeredAt];
    lines.push(values.map(csvCell).join(","));
  }
  return "\uFEFF" + lines.join("\r\n");
}

app.get("/api/stats", async (req,res) => {
  try { res.json(await countRows()); }
  catch (e) { console.error(e); res.status(500).json({error:"Unable to load registration count."}); }
});
app.post("/api/register", limiter, async (req,res) => {
  const b = req.body || {};
  const fullName = String(b.fullName || "").trim().replace(/\s+/g, " ");
  const age = Number(b.age);
  const division = b.division;
  const normalizedName = fullName.toLocaleLowerCase("en").normalize("NFKC");
  if (fullName.length < 3 || fullName.length > 120 || !/^[\p{L}\p{M} .,'’-]+$/u.test(fullName))
    return res.status(400).json({error:"Enter a valid name using letters and ordinary name punctuation."});
  if (!Number.isInteger(age) || age < 10 || age > 100) return res.status(400).json({error:"Enter a valid age."});
  if (b.acknowledged !== true) return res.status(400).json({error:"Please acknowledge the event conditions before registering."});
  let course = null, collegeYear = null, gradeLevel = null, strand = null;
  if (division === "college") {
    course = b.course; collegeYear = Number(b.year);
    if (!COLLEGE_COURSES.includes(course) || !COLLEGE_YEARS.includes(collegeYear))
      return res.status(400).json({error:"Choose a valid college course and year."});
  } else if (division === "senior_high") {
    gradeLevel = Number(b.gradeLevel); strand = b.strand;
    if (!SHS_STRANDS[gradeLevel] || !SHS_STRANDS[gradeLevel].includes(strand))
      return res.status(400).json({error:"Choose a valid grade level and strand."});
  } else return res.status(400).json({error:"Choose College or Senior High School."});

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [normalizedName]);
    const duplicate = await client.query(
      `SELECT id FROM registrations WHERE normalized_name=$1 AND age=$2 AND division=$3
       AND COALESCE(course,'')=COALESCE($4,'') AND COALESCE(college_year,0)=COALESCE($5,0)
       AND COALESCE(grade_level,0)=COALESCE($6,0) AND COALESCE(strand,'')=COALESCE($7,'')`,
      [normalizedName,age,division,course,collegeYear,gradeLevel,strand]
    );
    if (duplicate.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({error:"A matching registration already exists. Please contact the Council of Leaders if you believe this is a mistake."});
    }
    const inserted = await client.query(
      `INSERT INTO registrations (full_name,normalized_name,age,division,course,college_year,grade_level,strand,conditions_acknowledged)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE) RETURNING id, created_at`,
      [fullName,normalizedName,age,division,course,collegeYear,gradeLevel,strand]
    );
    await client.query("COMMIT");
    res.status(201).json({ message:"Registration recorded.", registrationId: inserted.rows[0].id, stats: await countRows() });
  } catch (e) {
    await client.query("ROLLBACK"); console.error(e);
    res.status(500).json({error:"Registration could not be saved. Please try again or contact the organizers."});
  } finally { client.release(); }
});

app.post("/api/admin/login", limiter, (req,res) => {
  const password = String(req.body.password || "");
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD)
    return res.status(401).json({error:"Incorrect admin password."});
  req.session.regenerate(err => {
    if (err) return res.status(500).json({error:"Unable to start admin session."});
    req.session.isAdmin = true;
    res.json({ok:true});
  });
});
app.post("/api/admin/logout", requireAdmin, (req,res) => req.session.destroy(() => res.json({ok:true})));
app.get("/api/admin/me", (req,res) => res.json({authenticated:!!(req.session && req.session.isAdmin)}));
app.get("/api/admin/summary", requireAdmin, async (req,res) => {
  try {
    const stats = await countRows();
    const { rows } = await pool.query(`
      SELECT division, course, college_year, grade_level, strand,
        COUNT(*)::int AS count
      FROM registrations GROUP BY division,course,college_year,grade_level,strand
      ORDER BY division,grade_level,course,college_year,strand
    `);
    const payment = await pool.query(`SELECT payment_status,COUNT(*)::int AS count FROM registrations GROUP BY payment_status`);
    res.json({stats, groups:rows, payments:payment.rows});
  } catch(e) { console.error(e); res.status(500).json({error:"Unable to load dashboard."}); }
});
app.get("/api/admin/registrations", requireAdmin, async (req,res) => {
  try {
    const { rows } = await pool.query("SELECT id,full_name,age,division,course,college_year,grade_level,strand,payment_status,created_at FROM registrations ORDER BY created_at DESC");
    res.json(rows);
  } catch(e) { console.error(e); res.status(500).json({error:"Unable to load registrations."}); }
});
app.patch("/api/admin/registrations/:id/payment", requireAdmin, async (req,res) => {
  if (!["paid","pending"].includes(req.body.status)) return res.status(400).json({error:"Invalid payment status."});
  try {
    const result = await pool.query("UPDATE registrations SET payment_status=$1 WHERE id=$2 RETURNING id", [req.body.status, req.params.id]);
    if (!result.rowCount) return res.status(404).json({error:"Registration not found."});
    res.json({ok:true});
  } catch(e) { console.error(e); res.status(500).json({error:"Unable to update payment status."}); }
});
app.get("/api/admin/export/:kind", requireAdmin, async (req,res) => {
  const kind = req.params.kind;
  const allowed = ["college", "senior-high", "college-categorized", "senior-high-categorized", "bulk"];
  if (!allowed.includes(kind)) return res.status(404).end();
  const division = kind.startsWith("college") ? "college" : kind.startsWith("senior-high") ? "senior_high" : null;
  const order = kind === "college" || kind === "college-categorized"
    ? "college_year,course,full_name"
    : kind === "senior-high" || kind === "senior-high-categorized"
      ? "grade_level,strand,full_name"
      : "division,grade_level,course,college_year,strand,full_name";
  try {
    const query = division
      ? await pool.query(`SELECT * FROM registrations WHERE division=$1 ORDER BY ${order}`, [division])
      : await pool.query(`SELECT * FROM registrations ORDER BY ${order}`);
    const csv = rowsToCsv(query.rows, kind);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="royals-${kind}-registrations.csv"`);
    res.send(csv);
  } catch(e) { console.error(e); res.status(500).send("Export failed."); }
});

app.get("/admin", (req,res) => res.sendFile(path.join(__dirname,"public","admin.html")));
app.get("/health", (req,res) => res.json({ok:true}));
const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => console.log(`ROYALS G.A.A.P. server listening on ${port} (all network interfaces)`));
