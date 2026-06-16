const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false } // Requerido para la conexión SSL nativa de AWS RDS
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ [LOG ERROR]: Falló la conexión técnica hacia AWS RDS.');
    } else {
        console.log('✅ [LOG SUCCESS]: Conexión segura establecida con AWS RDS PostgreSQL.');
    }
});

const verificarAccesoCondicional = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || authHeader !== process.env.MFA_TOKEN) {
        return res.status(403).send('<h1>❌ 403 - Acceso Condicional Denegado (MFA Requerido)</h1>');
    }
    next();
};

app.get('/', (req, res) => {
    res.send('<h1>Portal de Autenticación - ERP Farmacias Cruz Azul</h1><p>Esperando Verificación MFA...</p>');
});

app.get('/dashboard', verificarAccesoCondicional, async (req, res) => {
    try {
        const result = await pool.query('SELECT current_database(), version()');
        res.send(`<h1>🔒 ERP - Área Segura</h1><p>Base de Datos: ${result.rows[0].current_database}</p>`);
    } catch (err) {
        res.status(500).send("Error conectando a la BD.");
    }
});

app.listen(process.env.PORT, () => console.log(`🚀 Servidor en puerto ${process.env.PORT}`));