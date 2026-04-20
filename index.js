const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { uuidv7 } = require('uuidv7');
const db = require('./db');

const app = express();

// Requirement: CORS header: Access-Control-Allow-Origin: *
app.use(cors());
app.use(express.json());

// 1. POST /api/profiles
app.post('/api/profiles', async (req, res) => {
    const { name } = req.body;

    // Requirement: 400 Bad Request for missing/empty name
    if (!name || name.trim() === "") {
        return res.status(400).json({ status: "error", message: "Name is required" });
    }
    // Requirement: 422 Unprocessable Entity for invalid type
    if (typeof name !== 'string') {
        return res.status(422).json({ status: "error", message: "Name must be a string" });
    }

    try {
        const cleanName = name.trim().toLowerCase();
        
        // Requirement: Idempotency (Check if exists)
        const existing = await db.query('SELECT * FROM profiles WHERE name = $1', [cleanName]);
        if (existing.rows.length > 0) {
            return res.status(200).json({
                status: "success",
                message: "Profile already exists",
                data: existing.rows[0]
            });
        }

        // Requirement: Integrate with Genderize, Agify, Nationalize
        const [gRes, aRes, nRes] = await Promise.all([
            axios.get(`https://api.genderize.io?name=${cleanName}`),
            axios.get(`https://api.agify.io?name=${cleanName}`),
            axios.get(`https://api.nationalize.io?name=${cleanName}`)
        ]).catch(() => { throw new Error("UPSTREAM_ERROR"); });

        const gData = gRes.data;
        const aData = aRes.data;
        const nData = nRes.data;

        // Requirement: Edge Case Handling (502 errors)
        if (!gData.gender || gData.count === 0) {
            return res.status(502).json({ status: "error", message: "Genderize returned an invalid response" });
        }
        if (aData.age === null) {
            return res.status(502).json({ status: "error", message: "Agify returned an invalid response" });
        }
        if (!nData.country || nData.country.length === 0) {
            return res.status(502).json({ status: "error", message: "Nationalize returned an invalid response" });
        }

        // Requirement: age_group classification
        const age = aData.age;
        let ageGroup;
        if (age <= 12) ageGroup = 'child';
        else if (age <= 19) ageGroup = 'teenager';
        else if (age <= 59) ageGroup = 'adult';
        else ageGroup = 'senior';

        // Requirement: Pick country with highest probability
        const topCountry = nData.country.sort((a, b) => b.probability - a.probability)[0];

        // Requirement: UUID v7 and UTC timestamp
        const result = await db.query(
            `INSERT INTO profiles (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_probability, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [uuidv7(), cleanName, gData.gender, gData.probability, gData.count, age, ageGroup, topCountry.country_id, topCountry.probability, new Date().toISOString()]
        );

        res.status(201).json({ status: "success", data: result.rows[0] });

    } catch (error) {
        res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

// 2. GET /api/profiles/{id}
app.get('/api/profiles/:id', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM profiles WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ status: "error", message: "Profile not found" });
        }
        res.status(200).json({ status: "success", data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

// 3. GET /api/profiles (With Filtering)
app.get('/api/profiles', async (req, res) => {
    try {
        const { gender, country_id, age_group } = req.query;
        let queryText = 'SELECT * FROM profiles';
        let values = [];
        let conditions = [];

        if (gender) {
            values.push(gender.toLowerCase());
            conditions.push(`LOWER(gender) = $${values.length}`);
        }
        if (country_id) {
            values.push(country_id.toUpperCase());
            conditions.push(`country_id = $${values.length}`);
        }
        if (age_group) {
            values.push(age_group.toLowerCase());
            conditions.push(`age_group = $${values.length}`);
        }

        if (conditions.length > 0) {
            queryText += ' WHERE ' + conditions.join(' AND ');
        }

        const result = await db.query(queryText, values);
        res.status(200).json({
            status: "success",
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

// 4. DELETE /api/profiles/{id}
app.delete('/api/profiles/:id', async (req, res) => {
    try {
        const result = await db.query('DELETE FROM profiles WHERE id = $1', [req.params.id]);
        // Requirement: 204 No Content on success
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
