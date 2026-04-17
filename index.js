const express = require('express');
const cors = require('cors');
const { uuidv7 } = require('uuidv7');
const db = require('./db');

const app = express(); 

app.use(cors());
app.use(express.json());

app.post('/api/profiles', async (req, res) => {
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
        return res.status(400).json({ status: "error", message: "A valid name is required" });
    }

    try {
        // 1. Check if profile exists
        const existing = await db.query(
            'SELECT * FROM profiles WHERE LOWER(name) = LOWER($1)',
            [name.trim()]
        );

        if (existing.rows.length > 0) {
            return res.status(200).json({
                status: "success",
                message: 'Profile already exists',
                data: existing.rows[0]
            });
        }

        // 2. Fetch from External APIs (Fixed: Added commas and correct scoping)
        const [gRes, aRes, nRes] = await Promise.all([
            fetch(`https://api.genderize.io?name=${name}`),
            fetch(`https://api.agify.io?name=${name}`),
            fetch(`https://api.nationalize.io?name=${name}`)
        ]);

        const gData = await gRes.json();
        const aData = await aRes.json();
        const nData = await nRes.json();

        // 3. Validation (502 Rule)
        if (!gData.gender || aData.age === null || !nData.country || nData.country.length === 0) {
            return res.status(502).json({
                status: "error",
                message: "External intelligence services could not provide complete data"
            });
        }

        // 4. Transformation (Fixed: age should come from aData, not nData)
        const age = aData.age;
        let ageGroup = 'senior';
        if (age <= 12) ageGroup = 'child';
        else if (age <= 19) ageGroup = 'teenager';
        else if (age <= 59) ageGroup = 'adult';

        const topCountry = nData.country.sort((a, b) => b.probability - a.probability)[0];

        // 5. Insert into Database
        const newId = uuidv7();
        const insertSql = `
            INSERT INTO profiles (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_probability)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *;
        `;
        const values = [
            newId, name, gData.gender, gData.probability, gData.count,
            age, ageGroup, topCountry.country_id, topCountry.probability
        ];

        const result = await db.query(insertSql, values);

        // 6. Success
        res.status(201).json({
            status: "success",
            data: result.rows[0]
        });

    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

// Added: GET /api/profiles route so you can see all data
app.get('/api/profiles', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM profiles ORDER BY created_at DESC');
        res.status(200).json({ status: "success", data: result.rows });
    } catch (error) {
        res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Profile Intelligence Service is live on port ${PORT}`);
});
