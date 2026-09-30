# Botón de Barrio — Backend

API REST desarrollada en Node.js y Express para **Botón de Barrio**, una aplicación móvil de seguridad comunitaria pensada para vecinos en Ecuador. Permite activar un botón de pánico con ubicación y foto, reportar problemas del barrio, comentar alertas de otros vecinos, consultar contactos de emergencia y administrar el contenido desde un panel de administrador.

## Tecnologías utilizadas

- **Node.js** — entorno de ejecución del servidor.
- **Express** — framework para definir las rutas de la API REST.
- **PostgreSQL** — motor de base de datos relacional, elegido por ser de código abierto, gratuito, y por usar SQL estándar (SELECT, INSERT, UPDATE, DELETE), el mismo lenguaje visto en la materia de Administración de Bases de Datos.
- **pg** — librería de conexión entre Node.js y PostgreSQL, usada para ejecutar las consultas SQL desde el código.
- **Google Gemini** (`gemini-3.6-flash`), a través del paquete `@google/generative-ai` — modelo de inteligencia artificial generativa usado en el asistente de seguridad. Se eligió por su capa gratuita para desarrolladores y su integración sencilla en Node.js.
- **cors** — habilita que la app móvil (un origen distinto) pueda hacer peticiones al servidor.
- **dotenv** — carga las variables de entorno sensibles (claves y contraseñas) desde un archivo `.env`, que nunca se sube al repositorio.

## Base de datos: PostgreSQL

La base de datos se llama `boton_barrio` y contiene las siguientes tablas:

- **`usuarios`** — id, nombre, apellido, correo, password, fecha_registro, rol (`usuario` o `administrador`).
- **`alertas`** — id, tipo, mensaje, latitud, longitud, creado_por, foto, fecha. Cada alerta puede ser un reporte manual o provenir del botón de pánico.
- **`comentarios`** — id, alerta_id (referencia a `alertas`), autor, texto, fecha. Permite que otros vecinos aporten, confirmen o corrijan información sobre una alerta.
- **`eventos`** — id, titulo, descripcion, fecha, lugar. Actividades comunitarias del barrio.
- **`contactos_emergencia`** — tipo (policía, bomberos, ambulancia) y número. Editable únicamente por un administrador, para actualizar el número cuando cambia el personal del retén policial.

Las consultas se hacen con SQL parametrizado (usando `$1`, `$2`, etc.) para evitar inyección SQL.

## Cómo se guardan las imágenes

Las fotos **no se guardan como archivos** en el servidor ni en un servicio externo de almacenamiento (como Amazon S3 o Firebase Storage). El flujo es el siguiente:

1. En la app, cuando el usuario toma una foto (con el botón de pánico o al reportar un problema), la imagen se convierte a **base64**, un formato de texto que representa los bytes de la imagen como una cadena de caracteres.
2. Esa cadena de texto se envía al backend dentro del cuerpo JSON de la petición, junto con el resto de los datos de la alerta.
3. El backend guarda ese texto directamente en la columna `foto` de la tabla `alertas`, de tipo texto.
4. Cuando la app pide las alertas, recibe ese texto largo y lo decodifica de nuevo a imagen para mostrarla en pantalla.

Es una solución simple, adecuada para el tamaño de este proyecto. Su limitación es que, si se acumulan muchas fotos, la base de datos crece más rápido de lo que crecería guardando solo archivos, porque el texto en base64 pesa alrededor de un 33% más que la imagen original. Una mejora futura sería mover las fotos a un servicio de almacenamiento de archivos y guardar solo el enlace en la base de datos.

## Inteligencia artificial: Google Gemini

El endpoint `/asistente` recibe una pregunta o situación de seguridad escrita por el usuario y la envía al modelo `gemini-3.6-flash` de Google. Antes de la pregunta del usuario, se le da al modelo un contexto fijo en el *prompt*, indicándole que es un asistente de seguridad comunitaria para vecinos en Ecuador y que debe responder de forma breve (4 a 5 líneas) y práctica. Esto asegura que las respuestas siempre estén enfocadas al propósito de la app, sin importar cómo se formule la pregunta.

## Seguridad y roles

- Las alertas solo pueden ser modificadas por el usuario que las creó (verificado por su correo).
- Los comentarios solo pueden ser eliminados por su propio autor.
- Existe un sistema de **roles**: los usuarios normales solo pueden crear y comentar; los administradores pueden, además, eliminar usuarios, alertas, comentarios, y modificar los números de contacto de emergencia. Esto se controla con un middleware (`exigirAdmin`) que verifica el rol en la base de datos antes de permitir la acción.
- Las claves sensibles (la clave de la API de Gemini y la contraseña de PostgreSQL) se guardan en un archivo `.env`, excluido del repositorio mediante `.gitignore`.

## Endpoints principales

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/login` | Inicio de sesión |
| POST | `/registro` | Registro de un nuevo usuario |
| GET | `/usuario/:correo` | Datos de un usuario específico |
| GET | `/eventos` | Lista de eventos comunitarios |
| POST | `/eventos` | Crear un evento |
| GET | `/alertas` | Lista todas las alertas, con el conteo de comentarios |
| POST | `/alertas` | Crea una alerta nueva (pánico o reporte manual) |
| PUT | `/alertas/:id` | Actualiza descripción o foto (solo el creador) |
| GET | `/alertas/:id/comentarios` | Lista los comentarios de una alerta |
| POST | `/alertas/:id/comentarios` | Agrega un comentario |
| DELETE | `/alertas/:id/comentarios/:comentarioId` | Elimina un comentario propio |
| GET | `/contactos-emergencia` | Números de emergencia actuales |
| GET | `/admin/usuarios` | Panel de administrador: lista de usuarios |
| DELETE | `/admin/usuarios/:correo` | Panel de administrador: eliminar usuario |
| DELETE | `/admin/alertas/:id` | Panel de administrador: eliminar alerta |
| GET | `/admin/comentarios` | Panel de administrador: lista de comentarios |
| DELETE | `/admin/comentarios/:id` | Panel de administrador: eliminar comentario |
| PUT | `/admin/contactos-emergencia/:tipo` | Panel de administrador: cambiar un número de emergencia |
| POST | `/asistente` | Pregunta al asistente de IA |

## Cómo ejecutarlo

1. Instalar las dependencias: