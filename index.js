require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

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
  res.send('Servidor de Botón de Barrio funcionando 🏘️');
});

// Ruta de login
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

// Ruta de registro
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

// Ruta para obtener los datos de un usuario por su correo
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

// Ruta para obtener todos los eventos
app.get('/eventos', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM eventos ORDER BY fecha ASC');
    res.json({ exito: true, eventos: resultado.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ exito: false, mensaje: 'Error en el servidor' });
  }
});

// Ruta para crear un nuevo evento
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

// Ruta para obtener todas las alertas (con el total de comentarios de cada una)
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

// Ruta para crear una nueva alerta
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

// Ruta para agregar o actualizar la descripción y/o la foto de una alerta.
// Solo puede hacerlo quien creó la alerta.
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

// Ruta para obtener los comentarios de una alerta
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

// Ruta para agregar un comentario a una alerta
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

// Ruta para borrar un comentario (solo su autor)
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

// Obtener los números de contacto de emergencia (cualquiera puede verlos)
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

// Listar todos los usuarios (sin la contraseña)
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

// Eliminar un usuario (un administrador no puede eliminarse a sí mismo)
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

// Eliminar una alerta (y sus comentarios, por la relación en cascada)
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

// Listar todos los comentarios, con el tipo de alerta a la que pertenecen
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

// Eliminar un comentario individual, sin borrar toda la alerta
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

// Actualizar un número de contacto de emergencia (solo administrador)
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

// Ruta del asistente de seguridad con IA
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
});