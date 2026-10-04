require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Configuración de Swagger (documentación interactiva de la API)
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Botón de Barrio API',
      version: '1.0.0',
      description:
        'API REST para Botón de Barrio, una app de seguridad comunitaria. Permite reportar emergencias, gestionar alertas, comentarios y administración del sistema.',
    },
    servers: [{ url: 'http://localhost:3001', description: 'Servidor local' }],
  },
  apis: ['./index.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Conexión a la base de datos boton_barrio
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'boton_barrio',
  password: process.env.DB_PASSWORD,
  port: 5432,
});

// Ruta de prueba, para saber si el servidor está vivo
app.get('/', (req, res) => {
  res.send(
    'Servidor de Botón de Barrio funcionando 🏘️ — Documentación de la API disponible en <a href="/api-docs">/api-docs</a>'
  );
});
/**
 * @openapi
 * /login:
 *   post:
 *     summary: Inicia sesión con correo y contraseña
 *     tags: [Autenticación]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               correo:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login exitoso, devuelve los datos del usuario
 *       401:
 *         description: Correo o contraseña incorrectos
 */
app.post('/login', async (req, res) => {
  const { correo, password } = req.body;

  try {
    const resultado = await pool.query(
      'SELECT * FROM usuarios WHERE correo = $1 AND password = $2',
      [correo, password]
    );

    if (resultado.rows.length > 0) {
      res.json({ exito: true, usuario: resultado.rows[0] });
    } else {
      res.status(401).json({ exito: false, mensaje: 'Correo o contraseña incorrectos' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ exito: false, mensaje: 'Error en el servidor' });
  }
});

/**
 * @openapi
 * /registro:
 *   post:
 *     summary: Registra un nuevo usuario
 *     tags: [Autenticación]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:
 *                 type: string
 *               apellido:
 *                 type: string
 *               correo:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Usuario registrado correctamente
 *       400:
 *         description: El correo ya está registrado
 */
app.post('/registro', async (req, res) => {
  const { nombre, apellido, correo, password } = req.body;

  try {
    const existe = await pool.query('SELECT id FROM usuarios WHERE correo = $1', [correo]);

    if (existe.rows.length > 0) {
      return res.status(400).json({ exito: false, mensaje: 'Ese correo ya está registrado' });
    }

    const resultado = await pool.query(
      'INSERT INTO usuarios (nombre, apellido, correo, password) VALUES ($1, $2, $3, $4) RETURNING id, nombre, apellido, correo',
      [nombre, apellido, correo, password]
    );

    res.json({ exito: true, usuario: resultado.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ exito: false, mensaje: 'Error en el servidor' });
  }
});

/**
 * @openapi
 * /usuario/{correo}:
 *   get:
 *     summary: Obtiene los datos de un usuario por su correo
 *     tags: [Usuarios]
 *     parameters:
 *       - in: path
 *         name: correo
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Datos del usuario
 *       404:
 *         description: Usuario no encontrado
 */
app.get('/usuario/:correo', async (req, res) => {
  const { correo } = req.params;

  try {
    const resultado = await pool.query(
      'SELECT id, nombre, apellido, correo, fecha_registro FROM usuarios WHERE correo = $1',
      [correo]
    );

    if (resultado.rows.length > 0) {
      res.json({ exito: true, usuario: resultado.rows[0] });
    } else {
      res.status(404).json({ exito: false, mensaje: 'Usuario no encontrado' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ exito: false, mensaje: 'Error en el servidor' });
  }
});

/**
 * @openapi
 * /eventos:
 *   get:
 *     summary: Lista todos los eventos comunitarios
 *     tags: [Eventos]
 *     responses:
 *       200:
 *         description: Lista de eventos
 */
app.get('/eventos', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM eventos ORDER BY fecha ASC');
    res.json({ exito: true, eventos: resultado.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ exito: false, mensaje: 'Error en el servidor' });
  }
});

/**
 * @openapi
 * /eventos:
 *   post:
 *     summary: Crea un nuevo evento comunitario
 *     tags: [Eventos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               titulo:
 *                 type: string
 *               descripcion:
 *                 type: string
 *               fecha:
 *                 type: string
 *               lugar:
 *                 type: string
 *     responses:
 *       200:
 *         description: Evento creado
 */
app.post('/eventos', async (req, res) => {
  const { titulo, descripcion, fecha, lugar } = req.body;

  try {
    const resultado = await pool.query(
      'INSERT INTO eventos (titulo, descripcion, fecha, lugar) VALUES ($1, $2, $3, $4) RETURNING *',
      [titulo, descripcion, fecha, lugar]
    );
    res.json({ exito: true, evento: resultado.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ exito: false, mensaje: 'Error en el servidor' });
  }
});

/**
 * @openapi
 * /alertas:
 *   get:
 *     summary: Lista todas las alertas, con el total de comentarios de cada una
 *     tags: [Alertas]
 *     responses:
 *       200:
 *         description: Lista de alertas
 */
app.get('/alertas', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT a.*,
              (SELECT COUNT(*) FROM comentarios c WHERE c.alerta_id = a.id)::int AS total_comentarios
       FROM alertas a
       ORDER BY a.fecha DESC`
    );
    res.json({ exito: true, alertas: resultado.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ exito: false, mensaje: 'Error en el servidor' });
  }
});

/**
 * @openapi
 * /alertas:
 *   post:
 *     summary: Crea una nueva alerta (botón de pánico o reporte manual)
 *     tags: [Alertas]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tipo:
 *                 type: string
 *               mensaje:
 *                 type: string
 *               latitud:
 *                 type: number
 *               longitud:
 *                 type: number
 *               creado_por:
 *                 type: string
 *               foto:
 *                 type: string
 *                 description: Imagen codificada en base64 (opcional)
 *     responses:
 *       200:
 *         description: Alerta creada
 */
app.post('/alertas', async (req, res) => {
  const { tipo, mensaje, latitud, longitud, creado_por, foto } = req.body;

  try {
    const resultado = await pool.query(
      'INSERT INTO alertas (tipo, mensaje, latitud, longitud, creado_por, foto) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [tipo, mensaje, latitud, longitud, creado_por, foto]
    );
    res.json({ exito: true, alerta: resultado.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ exito: false, mensaje: 'Error en el servidor' });
  }
});

/**
 * @openapi
 * /alertas/{id}:
 *   put:
 *     summary: Actualiza la descripción y/o la foto de una alerta (solo el creador)
 *     tags: [Alertas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mensaje:
 *                 type: string
 *               foto:
 *                 type: string
 *               creado_por:
 *                 type: string
 *     responses:
 *       200:
 *         description: Alerta actualizada
 *       403:
 *         description: Solo quien creó la alerta puede modificarla
 */
app.put('/alertas/:id', async (req, res) => {
  const { id } = req.params;
  const { mensaje, foto, creado_por } = req.body;

  if (!creado_por) {
    return res.status(400).json({ exito: false, mensaje: 'Falta el usuario que modifica la alerta' });
  }

  const tieneMensaje = typeof mensaje === 'string' && mensaje.trim() !== '';
  const tieneFoto = typeof foto === 'string' && foto !== '';

  if (!tieneMensaje && !tieneFoto) {
    return res.status(400).json({ exito: false, mensaje: 'Envía una descripción o una foto' });
  }

  try {
    const resultado = await pool.query(
      `UPDATE alertas
       SET mensaje = COALESCE($1, mensaje),
           foto = COALESCE($2, foto)
       WHERE id = $3 AND creado_por = $4
       RETURNING id, tipo, mensaje, latitud, longitud, creado_por, fecha`,
      [tieneMensaje ? mensaje.trim() : null, tieneFoto ? foto : null, id, creado_por]
    );

    if (resultado.rows.length === 0) {
      return res.status(403).json({ exito: false, mensaje: 'Solo quien creó la alerta puede modificarla' });
    }

    res.json({ exito: true, alerta: resultado.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ exito: false, mensaje: 'Error en el servidor' });
  }
});

/**
 * @openapi
 * /alertas/{id}/comentarios:
 *   get:
 *     summary: Lista los comentarios de una alerta
 *     tags: [Comentarios]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: correo
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de comentarios
 */
app.get('/alertas/:id/comentarios', async (req, res) => {
  const alertaId = parseInt(req.params.id, 10);
  const correo = req.query.correo || '';

  if (Number.isNaN(alertaId)) {
    return res.status(400).json({ exito: false, mensaje: 'Alerta inválida' });
  }

  try {
    const resultado = await pool.query(
      `SELECT c.id,
              c.texto,
              c.fecha,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.nombre, u.apellido)), ''), 'Vecino') AS nombre,
              (c.autor = $2) AS es_mio
       FROM comentarios c
       LEFT JOIN usuarios u ON u.correo = c.autor
       WHERE c.alerta_id = $1
       ORDER BY c.fecha ASC`,
      [alertaId, correo]
    );
    res.json({ exito: true, comentarios: resultado.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ exito: false, mensaje: 'Error en el servidor' });
  }
});

/**
 * @openapi
 * /alertas/{id}/comentarios:
 *   post:
 *     summary: Agrega un comentario a una alerta
 *     tags: [Comentarios]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               correo:
 *                 type: string
 *               texto:
 *                 type: string
 *     responses:
 *       200:
 *         description: Comentario creado
 */
app.post('/alertas/:id/comentarios', async (req, res) => {
  const alertaId = parseInt(req.params.id, 10);
  const { correo, texto } = req.body;
  const contenido = typeof texto === 'string' ? texto.trim() : '';

  if (Number.isNaN(alertaId)) {
    return res.status(400).json({ exito: false, mensaje: 'Alerta inválida' });
  }
  if (!correo) {
    return res.status(400).json({ exito: false, mensaje: 'Falta el usuario' });
  }
  if (contenido === '') {
    return res.status(400).json({ exito: false, mensaje: 'El comentario no puede estar vacío' });
  }
  if (contenido.length > 300) {
    return res.status(400).json({ exito: false, mensaje: 'El comentario es muy largo (máximo 300 caracteres)' });
  }

  try {
    const usuario = await pool.query('SELECT id FROM usuarios WHERE correo = $1', [correo]);
    if (usuario.rows.length === 0) {
      return res.status(401).json({ exito: false, mensaje: 'Usuario no válido' });
    }

    const alerta = await pool.query('SELECT id FROM alertas WHERE id = $1', [alertaId]);
    if (alerta.rows.length === 0) {
      return res.status(404).json({ exito: false, mensaje: 'Alerta no encontrada' });
    }

    const resultado = await pool.query(
      'INSERT INTO comentarios (alerta_id, autor, texto) VALUES ($1, $2, $3) RETURNING id',
      [alertaId, correo, contenido]
    );

    res.json({ exito: true, id: resultado.rows[0].id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ exito: false, mensaje: 'Error en el servidor' });
  }
});

/**
 * @openapi
 * /alertas/{id}/comentarios/{comentarioId}:
 *   delete:
 *     summary: Elimina un comentario (solo su propio autor)
 *     tags: [Comentarios]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: comentarioId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: correo
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Comentario eliminado
 *       403:
 *         description: Solo puedes borrar tus propios comentarios
 */
app.delete('/alertas/:id/comentarios/:comentarioId', async (req, res) => {
  const alertaId = parseInt(req.params.id, 10);
  const comentarioId = parseInt(req.params.comentarioId, 10);
  const correo = req.query.correo || '';

  if (Number.isNaN(alertaId) || Number.isNaN(comentarioId)) {
    return res.status(400).json({ exito: false, mensaje: 'Datos inválidos' });
  }

  try {
    const resultado = await pool.query(
      'DELETE FROM comentarios WHERE id = $1 AND alerta_id = $2 AND autor = $3 RETURNING id',
      [comentarioId, alertaId, correo]
    );

    if (resultado.rows.length === 0) {
      return res.status(403).json({ exito: false, mensaje: 'Solo puedes borrar tus propios comentarios' });
    }

    res.json({ exito: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ exito: false, mensaje: 'Error en el servidor' });
  }
});

/**
 * @openapi
 * /contactos-emergencia:
 *   get:
 *     summary: Obtiene los números de contacto de emergencia (policía, bomberos, ambulancia)
 *     tags: [Emergencias]
 *     responses:
 *       200:
 *         description: Números actuales
 */
app.get('/contactos-emergencia', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT tipo, numero FROM contactos_emergencia');
    const contactos = {};
    resultado.rows.forEach(fila => {
      contactos[fila.tipo] = fila.numero;
    });
    res.json({ exito: true, contactos });
  } catch (error) {
    console.error(error);
    res.status(500).json({ exito: false, mensaje: 'Error en el servidor' });
  }
});

// ------------------- PANEL DE ADMINISTRADOR -------------------

// Middleware: exige que el correo enviado pertenezca a un administrador
async function exigirAdmin(req, res, next) {
  const correo = (req.body && req.body.correo_admin) || req.query.correo_admin;

  if (!correo) {
    return res.status(400).json({ exito: false, mensaje: 'Falta el correo del administrador' });
  }

  try {
    const resultado = await pool.query('SELECT rol FROM usuarios WHERE correo = $1', [correo]);

    if (resultado.rows.length === 0 || resultado.rows[0].rol !== 'administrador') {
      return res.status(403).json({ exito: false, mensaje: 'No tienes permisos de administrador' });
    }

    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ exito: false, mensaje: 'Error en el servidor' });
  }
}

/**
 * @openapi
 * /admin/usuarios:
 *   get:
 *     summary: Lista todos los usuarios (solo administradores)
 *     tags: [Administrador]
 *     parameters:
 *       - in: query
 *         name: correo_admin
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de usuarios
 *       403:
 *         description: No tienes permisos de administrador
 */
app.get('/admin/usuarios', exigirAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      'SELECT id, nombre, apellido, correo, rol, fecha_registro FROM usuarios ORDER BY fecha_registro DESC'
    );
    res.json({ exito: true, usuarios: resultado.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ exito: false, mensaje: 'Error en el servidor' });
  }
});

/**
 * @openapi
 * /admin/usuarios/{correo}:
 *   delete:
 *     summary: Elimina un usuario (solo administradores; no puede eliminarse a sí mismo)
 *     tags: [Administrador]
 *     parameters:
 *       - in: path
 *         name: correo
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: correo_admin
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Usuario eliminado
 */
app.delete('/admin/usuarios/:correo', exigirAdmin, async (req, res) => {
  const { correo } = req.params;
  const correoAdmin = req.query.correo_admin;

  if (correo === correoAdmin) {
    return res.status(400).json({ exito: false, mensaje: 'No puedes eliminar tu propia cuenta' });
  }

  try {
    const resultado = await pool.query('DELETE FROM usuarios WHERE correo = $1 RETURNING correo', [correo]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({ exito: false, mensaje: 'Usuario no encontrado' });
    }

    res.json({ exito: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ exito: false, mensaje: 'Error en el servidor' });
  }
});

/**
 * @openapi
 * /admin/alertas/{id}:
 *   delete:
 *     summary: Elimina una alerta y sus comentarios (solo administradores)
 *     tags: [Administrador]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: correo_admin
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Alerta eliminada
 */
app.delete('/admin/alertas/:id', exigirAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const resultado = await pool.query('DELETE FROM alertas WHERE id = $1 RETURNING id', [id]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({ exito: false, mensaje: 'Alerta no encontrada' });
    }

    res.json({ exito: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ exito: false, mensaje: 'Error en el servidor' });
  }
});

/**
 * @openapi
 * /admin/comentarios:
 *   get:
 *     summary: Lista todos los comentarios con el tipo de alerta (solo administradores)
 *     tags: [Administrador]
 *     parameters:
 *       - in: query
 *         name: correo_admin
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de comentarios
 */
app.get('/admin/comentarios', exigirAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT c.id, c.texto, c.autor, c.fecha, c.alerta_id, a.tipo AS alerta_tipo
       FROM comentarios c
       JOIN alertas a ON a.id = c.alerta_id
       ORDER BY c.fecha DESC`
    );
    res.json({ exito: true, comentarios: resultado.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ exito: false, mensaje: 'Error en el servidor' });
  }
});

/**
 * @openapi
 * /admin/comentarios/{id}:
 *   delete:
 *     summary: Elimina un comentario individual (solo administradores)
 *     tags: [Administrador]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: correo_admin
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Comentario eliminado
 */
app.delete('/admin/comentarios/:id', exigirAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const resultado = await pool.query('DELETE FROM comentarios WHERE id = $1 RETURNING id', [id]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({ exito: false, mensaje: 'Comentario no encontrado' });
    }

    res.json({ exito: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ exito: false, mensaje: 'Error en el servidor' });
  }
});

/**
 * @openapi
 * /admin/contactos-emergencia/{tipo}:
 *   put:
 *     summary: Actualiza un número de contacto de emergencia (solo administradores)
 *     tags: [Administrador]
 *     parameters:
 *       - in: path
 *         name: tipo
 *         required: true
 *         schema:
 *           type: string
 *           enum: [policia, bomberos, ambulancia]
 *       - in: query
 *         name: correo_admin
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               numero:
 *                 type: string
 *     responses:
 *       200:
 *         description: Número actualizado
 */
app.put('/admin/contactos-emergencia/:tipo', exigirAdmin, async (req, res) => {
  const { tipo } = req.params;
  const { numero } = req.body;

  const tiposValidos = ['policia', 'bomberos', 'ambulancia'];
  if (!tiposValidos.includes(tipo)) {
    return res.status(400).json({ exito: false, mensaje: 'Tipo de contacto no válido' });
  }

  if (!numero || typeof numero !== 'string' || numero.trim() === '') {
    return res.status(400).json({ exito: false, mensaje: 'El número no puede estar vacío' });
  }

  try {
    const resultado = await pool.query(
      'UPDATE contactos_emergencia SET numero = $1 WHERE tipo = $2 RETURNING *',
      [numero.trim(), tipo]
    );
    res.json({ exito: true, contacto: resultado.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ exito: false, mensaje: 'Error en el servidor' });
  }
});

/**
 * @openapi
 * /asistente:
 *   post:
 *     summary: Envía una pregunta al asistente de seguridad con IA (Google Gemini)
 *     tags: [Asistente IA]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pregunta:
 *                 type: string
 *     responses:
 *       200:
 *         description: Respuesta generada por el modelo
 */
app.post('/asistente', async (req, res) => {
  const { pregunta } = req.body;

  try {
    const modelo = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

    const prompt = `Eres un asistente de seguridad comunitaria para una app llamada "Botón de Barrio", usada por vecinos en Ecuador. Responde de forma breve, clara y práctica (máximo 4-5 líneas) a la siguiente pregunta o situación de seguridad: ${pregunta}`;

    const resultado = await modelo.generateContent(prompt);
    const respuestaTexto = resultado.response.text();

    res.json({ exito: true, respuesta: respuestaTexto });
  } catch (error) {
    console.error(error);
    res.status(500).json({ exito: false, mensaje: 'Error al contactar al asistente de IA' });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Documentación de la API disponible en http://localhost:${PORT}/api-docs`);
});