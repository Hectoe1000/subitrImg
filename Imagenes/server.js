require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sql = require('mssql');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Configuración de Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configuración de la conexión a la base de datos SQL Server
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT),
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

sql.connect(dbConfig)
  .then(pool => {
    console.log('✅ Conexión exitosa a SQL Server');
    pool.close();
  })
  .catch(err => {
    console.error('❌ Fallo en la conexión:', err);
  });

// Configuración de Multer para almacenamiento en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Conexión a la base de datos
const poolPromise = new sql.ConnectionPool(dbConfig).connect();

// RUTA: Obtener imágenes de productos
app.get('/imagenes', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT id_Producto, imagen FROM producto');

    res.json(result.recordset); // Devuelve las URLs de las imágenes
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al obtener las imágenes');
  }
});

// RUTA: Subir imagen de un producto
app.post('/upload/:id', upload.single('imagen'), async (req, res) => {
  console.log('Solicitud recibida a /upload/:id');

  const idProducto = parseInt(req.params.id);
  console.log('ID recibido:', idProducto);

  if (isNaN(idProducto)) {
    return res.status(400).json({ mensaje: 'ID de producto inválido' });
  }

  if (!req.file) {
    console.log('No se recibió ningún archivo');
    return res.status(400).json({ mensaje: 'No se envió ninguna imagen' });
  }

  try {
    const resultado = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'productos' },
        (error, result) => {
          if (result) resolve(result);
          else reject(error);
        }
      );
      streamifier.createReadStream(req.file.buffer).pipe(stream);
    });

    const urlImagen = resultado.secure_url;
    console.log('URL de imagen subida:', urlImagen);

    await sql.connect(dbConfig);
    const result = await sql.query`
      UPDATE producto
      SET imagen = ${urlImagen}
      WHERE id_Producto = ${idProducto}
    `;

    if (result.rowsAffected[0] > 0) {
      res.json({ mensaje: 'Imagen actualizada con éxito', id_Producto: idProducto });
    } else {
      res.status(404).json({ mensaje: 'Producto no encontrado' });
    }
  } catch (error) {
    console.error('Error al subir imagen:', error);
    res.status(500).json({ mensaje: 'Error al subir imagen', error });
  } finally {
    sql.close();
  }
});


// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
