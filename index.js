const express = require('express');
const cors = require('cors');
const axios = require('axios'); // Add this line
const { uuidv7 } = require('uuidv7');
const db = require('./db');

const app = express();

app.use(cors());
app.use(express.json());

app.post('/api/profiles', async (req, res) => {
    const { name } = req.body;

    if (!name || name.trim() === "") {
        return res.status(400).json({ status: "error", message: "Name is required" });
    }
    if (typeof name !== 'string') {
        return res.status(422).json({ status: "error", message: "Name must be a string" });
    }

    try {
        const existing = await db.query('SELECT * FROM profiles WHERE LOWER(name) = LOWER($1)', [name.trim()]);
        if (existing.rows.length > 0) {
            return res.status(200).json({
                status: "success",
                message: "Profile already exists",
                data: existing.rows[0]
            });
        }

        // Swapped fetch for axios for better compatibility
        const [gRes, aRes, nRes] = await Promise.all([
            axios.get(`https://api.genderize.io?name=${name}`),
            axios.get(`https://api.agify.io?name=${name}`),
            axios.get(`https://api.nationalize.io?name=${name}`)
        ]).catch(() => {
            throw new Error("API_FAILED");
        });

        const gData = gRes.data;
        const aData = aRes.data;
        const nData = nRes.data;

        if (!gData.gender || gData.count === 0) return res.status(502).json({ status: "error", message: "Genderize returned an invalid response" });
        if (aData.age === null) return res.status(502).json({ status: "error", message: "Agify returned an invalid response" });
        if (!nData.country || nData.country.length === 0) return res.status(502).json({ status: "error", message: "Nationalize returned an invalid response" });

        const age = aData.age;
        let ageGroup = 'senior';
        if (age <= 12) ageGroup = 'child';
        else if (age <= 19) ageGroup = 'teenager';
        else if (age <= 59) ageGroup = 'adult';

        const topCountry = nData.country.sort((a, b) => b.probability - a.probability)[0];

        const result = await db.query(
            `INSERT INTO profiles (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_probability, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [uuidv7(), name.toLowerCase(), gData.gender, gData.probability, gData.count, age, ageGroup, topCountry.country_id, topCountry.probability, new Date().toISOString()]
        );

        res.status(201).json({ status: "success", data: result.rows[0] });

    } catch (error) {
        if (error.message === "API_FAILED") {
            return res.status(502).json({ status: "error", message: "External intelligence services returned an invalid response" });
        }
        res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

// ... Keep your app.get and app.delete routes exactly as they are in your code above ...
