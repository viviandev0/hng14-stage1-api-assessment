const express = require('express');
const cors = require('cors');
const { uuidv7 } = require('uuidv7');
const db = require('./db'); // Ensure your db.js uses pg or similar

const app = express();

app.use(cors());
app.use(express.json());

/**
 * 1. POST /api/profiles
 * Create or Return existing profile
 */
app.post('/api/profiles', async (req, res) => {
    const { name } = req.body;

    // Validation: Missing/Empty (400) or Invalid Type (422)
    if (!name || name.trim() === "") {
        return res.status(400).json({ status: "error", message: "Name is required" });
    }
    if (typeof name !== 'string') {
        return res.status(422).json({ status: "error", message: "Name must be a string" });
    }

    try {
        // Idempotency Check
        const existing = await db.query('SELECT * FROM profiles WHERE LOWER(name) = LOWER($1)', [name.trim()]);
        if (existing.rows.length > 0) {
            return res.status(200).json({
                status: "success",
                message: "Profile already exists",
                data: existing.rows[0]
            });
        }

        // Fetch from 3 APIs
        const [gRes, aRes, nRes] = await Promise.allSettled([
            fetch(`https://api.genderize.io?name=${name}`),
            fetch(`https://api.agify.io?name=${name}`),
            fetch(`https://api.nationalize.io?name=${name}`)
        ]);

        // Specific 502 Error Handling per API
        if (gRes.status === 'rejected') return res.status(502).json({ status: "error", message: "Genderize returned an invalid response" });
        if (aRes.status === 'rejected') return res.status(502).json({ status: "error", message: "Agify returned an invalid response" });
        if (nRes.status === 'rejected') return res.status(502).json({ status: "error", message: "Nationalize returned an invalid response" });

        const gData = await gRes.value.json();
        const aData = await aRes.value.json();
        const nData = await nRes.value.json();

        // Edge Case Logic (502)
        if (!gData.gender || gData.count === 0) return res.status(502).json({ status: "error", message: "Genderize returned an invalid response" });
        if (aData.age === null) return res.status(502).json({ status: "error", message: "Agify returned an invalid response" });
        if (!nData.country || nData.country.length === 0) return res.status(502).json({ status: "error", message: "Nationalize returned an invalid response" });

        // Transformation
        const age = aData.age;
        let ageGroup = 'senior';
        if (age <= 12) ageGroup = 'child';
        else if (age <= 19) ageGroup = 'teenager';
        else if (age <= 59) ageGroup = 'adult';

        const topCountry = nData.country.sort((a, b) => b.probability - a.probability)[0];

        // Store with UUID v7
        const result = await db.query(
            `INSERT INTO profiles (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_probability, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [uuidv7(), name.toLowerCase(), gData.gender, gData.probability, gData.count, age, ageGroup, topCountry.country_id, topCountry.probability, new Date().toISOString()]
        );

        res.status(201).json({ status: "success", data: result.rows[0] });

    } catch (error) {
        res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

/**
 * 2. GET /api/profiles
 * List with filtering
 */
app.get('/api/profiles', async (req, res) => {
    const { gender, country_id, age_group } = req.query;
    let query = 'SELECT * FROM profiles WHERE 1=1';
    const params = [];

    if (gender) {
        params.push(gender.toLowerCase());
        query += ` AND LOWER(gender) = $${params.length}`;
    }
    if (country_id) {
        params.push(country_id.toUpperCase());
        query += ` AND country_id = $${params.length}`;
    }
    if (age_group) {
        params.push(age_group.toLowerCase());
        query += ` AND LOWER(age_group) = $${params.length}`;
    }

    try {
        const result = await db.query(query, params);
        res.status(200).json({
            status: "success",
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

/**
 * 3. GET /api/profiles/:id
 */
app.get('/api/profiles/:id', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM profiles WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ status: "error", message: "Profile not found" });
        res.status(200).json({ status: "success", data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

/**
 * 4. DELETE /api/profiles/:id
 */
app.delete('/api/profiles/:id', async (req, res) => {
    try {
        const result = await db.query('DELETE FROM profiles WHERE id = $1', [req.params.id]);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Stage 1 live on ${PORT}`));
