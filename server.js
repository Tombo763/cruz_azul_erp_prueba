const express = require('express');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');

dotenv.config();
const app = express();

// Middleware para procesar formularios
app.use(express.urlencoded({ extended: true }));

// --- CONFIGURACIÓN DE AWS RDS CON PARCHE SSL ---
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: { rejectUnauthorized: false } // Permite la conexión segura obligatoria de AWS RDS
});

// Crear tabla de usuarios automáticamente si no existe en RDS
const inicializarBaseDeDatos = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios_erp (
        id SERIAL PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL
      );
    `);
    console.log('✅ [RDS]: Tabla "usuarios_erp" verificada/creada con éxito.');
  } catch (err) {
    console.error('❌ [RDS ERROR]: No se pudo inicializar la tabla:', err.message);
  }
};
inicializarBaseDeDatos();

// --- CONFIGURACIÓN DE NODEMAILER (GMAIL) ---
const transporreMail = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_EMISOR,
    pass: process.env.EMAIL_PASSWORD_APP,
  },
});

// Base de datos temporal en memoria para validar los códigos MFA activos
const mfaSessions = {}; 

// --- ESTILOS CSS CORPORATIVOS ---
const CSS_STYLE = `
<style>
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f6f9; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
  .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); width: 100%; max-width: 400px; text-align: center; }
  h2 { color: #003399; margin-bottom: 10px; }
  p { color: #666; font-size: 14px; margin-bottom: 25px; }
  .input-group { text-align: left; margin-bottom: 20px; }
  label { display: block; font-weight: 600; margin-bottom: 8px; color: #333; font-size: 14px; }
  input { width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; font-size: 16px; }
  button { background: #003399; color: white; border: none; padding: 14px; width: 100%; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer; transition: background 0.3s; }
  button:hover { background: #002266; }
  .links { margin-top: 20px; font-size: 14px; }
  .links a { color: #003399; text-decoration: none; font-weight: bold; }
  .error { background: #ffe6e6; color: #cc0000; padding: 10px; border-radius: 6px; font-size: 14px; margin-bottom: 15px; text-align: left; border-left: 4px solid #cc0000; }
  .success { background: #e6ffe6; color: #006600; padding: 10px; border-radius: 6px; font-size: 14px; margin-bottom: 15px; border-left: 4px solid #006600; text-align: left; }
</style>
`;

// --- VISTA 1: LOGIN ---
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><title>ERP - Login</title>${CSS_STYLE}</head>
    <body>
      <div class="card">
        <h2>Farmacias Cruz Azul</h2>
        <p>Portal de Autenticación Centralizado (ERP)</p>
        <form action="/login" method="POST">
          <div class="input-group">
            <label>Correo Electrónico</label>
            <input type="email" name="email" placeholder="usuario@correo.com" required>
          </div>
          <div class="input-group">
            <label>Contraseña</label>
            <input type="password" name="password" placeholder="••••••••" required>
          </div>
          <button type="submit">Iniciar Sesión</button>
        </form>
        <div class="links">
          ¿No tienes cuenta? <a href="/register">Regístrate aquí</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// PROCESAR LOGIN CONTRA AWS RDS
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM usuarios_erp WHERE email = $1 AND password = $2', [email, password]);
    
    if (result.rows.length > 0) {
      const codigoOTP = Math.floor(100000 + Math.random() * 900000).toString();
      
      mfaSessions[email] = {
        codigo: codigoOTP,
        loginOk: true,
        mfaOk: false
      };

      const mailOptions = {
        from: process.env.EMAIL_EMISOR,
        to: email, 
        subject: '🔐 Código de Seguridad MFA - ERP Farmacias Cruz Azul',
        html: `
          <div style="font-family: sans-serif; border: 1px solid #eee; padding: 20px; border-radius: 8px; max-width: 500px;">
            <h2 style="color: #003399;">Verificación Multifactor (MFA)</h2>
            <p>Se ha detectado un intento de inicio de sesión en la plataforma ERP corporativa.</p>
            <p>Su código de acceso condicional es:</p>
            <div style="background: #f4f6f9; padding: 15px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 5px; color: #333; border-radius: 6px;">
              ${codigoOTP}
            </div>
            <p style="font-size: 12px; color: #666; margin-top: 20px;">Si no solicitó este código, ignore este correo inmediatamente.</p>
          </div>
        `
      };

      transporreMail.sendMail(mailOptions, (error, info) => {
        if (!error) {
          console.log('📩 Código MFA enviado con éxito a: ' + email);
          res.redirect('/verify-mfa?email=' + encodeURIComponent(email));
        } else {
          console.error('❌ Error enviando email:', error);
          res.send('<h3>Error del servidor al enviar el correo MFA.</h3><a href="/">Volver</a>');
        }
      });

    } else {
      res.send('<script>alert("❌ Credenciales inválidas en AWS RDS."); window.location.href = "/";</script>');
    }
  } catch (err) {
    res.status(500).send('Error en el servidor: ' + err.message);
  }
});

// --- VISTA 2: REGISTRO DE USUARIOS ---
app.get('/register', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><title>ERP - Registro</title>${CSS_STYLE}</head>
    <body>
      <div class="card" style="border-top: 5px solid #003399;">
        <h2>Registro de Personal</h2>
        <p>Dar de alta un nuevo usuario en la base de datos de AWS RDS</p>
        <form action="/register" method="POST">
          <div class="input-group">
            <label>Correo Institucional (Para recibir el MFA)</label>
            <input type="email" name="email" placeholder="tu_correo_real@ejemplo.com" required>
          </div>
          <div class="input-group">
            <label>Contraseña Corporativa</label>
            <input type="password" name="password" placeholder="••••••••" required>
          </div>
          <button type="submit" style="background: #28a745;">Guardar en AWS RDS</button>
        </form>
        <div class="links">
          <a href="/">Volver al Login</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// PROCESAR E INSERTAR REGISTRO EN AWS RDS
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    await pool.query('INSERT INTO usuarios_erp (email, password) VALUES ($1, $2)', [email, password]);
    res.send('<script>alert("✅ Usuario registrado exitosamente en AWS RDS."); window.location.href = "/";</script>');
  } catch (err) {
    if (err.code === '23505') {
      res.send('<script>alert("❌ El correo ya está registrado."); window.location.href = "/register";</script>');
    } else {
      res.status(500).send('Error al registrar: ' + err.message);
    }
  }
});

// --- VISTA 3: PANTALLA DE VERIFICACIÓN MFA ---
app.get('/verify-mfa', (req, res) => {
  const email = req.query.email;
  if (!email || !mfaSessions[email] || !mfaSessions[email].loginOk) {
    return res.redirect('/');
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><title>ERP - Verificación MFA</title>${CSS_STYLE}</head>
    <body>
      <div class="card">
        <h2>Verificación Obligatoria</h2>
        <div class="success">📩 Código enviado a: <strong>${email}</strong></div>
        <p>Revise su bandeja de entrada (o SPAM) e ingrese el código OTP de 6 dígitos.</p>
        <form action="/verify-mfa" method="POST">
          <input type="hidden" name="email" value="${email}">
          <div class="input-group">
            <label>Código de Seguridad (MFA Real)</label>
            <input type="text" name="token" placeholder="••••••" maxlength="6" required style="text-align:center; font-size: 22px; letter-spacing: 5px;">
          </div>
          <button type="submit">Verificar Identidad</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// PROCESAR TOKEN ENVIADO POR CORREO
app.post('/verify-mfa', (req, res) => {
  const { email, token } = req.body;

  if (mfaSessions[email] && mfaSessions[email].codigo === token.trim()) {
    mfaSessions[email].mfaOk = true;
    res.redirect('/dashboard?email=' + encodeURIComponent(email));
  } else {
    res.send(`<script>alert("❌ Código MFA inválido o expirado."); window.location.href = "/verify-mfa?email=${encodeURIComponent(email)}";</script>`);
  }
});

// --- VISTA 4: PANEL PROTEGIDO (DASHBOARD) ---
app.get('/dashboard', (req, res) => {
  const email = req.query.email;

  if (!email || !mfaSessions[email] || !mfaSessions[email].loginOk || !mfaSessions[email].mfaOk) {
    return res.status(403).send(`
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="UTF-8"><title>403 - Acceso Denegado</title>${CSS_STYLE}</head>
      <body>
        <div class="card" style="border-top: 5px solid #cc0000;">
          <h2 style="color:#cc0000;">❌ Acceso Denegado</h2>
          <p><strong>Error 403: Acceso Condicional Incumplido.</strong></p>
          <div class="error">La política de ciberseguridad corporativa exige un inicio de sesión válido y la confirmación de identidad mediante MFA por correo antes de consultar los registros en AWS RDS.</div>
          <a href="/" style="color:#003399; font-weight:bold; text-decoration:none;">Ir al inicio de sesión</a>
        </div>
      </body>
      </html>
    `);
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><title>ERP - Dashboard</title>${CSS_STYLE}</head>
    <body>
      <div class="card" style="max-width: 600px; border-top: 5px solid #006600;">
        <h2>🔐 Conexión Segura Establecida</h2>
        <p>Infraestructura ERP de Producción - Farmacias Cruz Azul</p>
        <div class="success">
          <strong>Usuario Autenticado:</strong> ${email}<br>
          <strong>Base de Datos:</strong> AWS RDS (PostgreSQL 18.3)<br>
          <strong>MFA Token de Validation:</strong> VALIDADO (Canal Correo Real)
        </div>
        <p style="text-align:left; font-size:13px; color:#555;">
          El microservicio montado sobre <strong>Docker (Debian host)</strong> ha completado con éxito la verificación Zero-Trust. El acceso a las tablas relacionales ha sido liberado de forma exclusiva para esta sesión.
        </p>
        <hr style="border:0; border-top:1px solid #eee; margin:20px 0;">
        <button onclick="window.location.href='/logout?email=${encodeURIComponent(email)}'" style="background:#555;">Cerrar Sesión Segura</button>
      </div>
    </body>
    </html>
  `);
});

// CERRAR SESIÓN Y LIMPIAR MEMORIA
app.get('/logout', (req, res) => {
  const email = req.query.email;
  if (email && mfaSessions[email]) {
    delete mfaSessions[email];
  }
  res.redirect('/');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🚀 Servidor corriendo de forma exitosa en el puerto: ' + PORT);
});
