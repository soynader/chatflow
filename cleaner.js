const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// Cargar variables de entorno desde el archivo .env
dotenv.config();

const pool = mysql.createPool({
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    database: process.env.MYSQL_DATABASE,
    password: process.env.MYSQLPASSWORD,
    port: process.env.MYSQLPORT || 3306, // Usa el puerto 3306 por defecto si no se especifica
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const cleanExpiredSessions = async () => {
    const connection = await pool.getConnection();

    try {
        // Obtener la duración de la sesión en horas
        const [welcomeRow] = await connection.query('SELECT session_duration FROM welcome');
        const sessionDurationHours = welcomeRow[0].session_duration;

        // Calcular la fecha y hora límite
        const expirationDate = new Date(Date.now() - sessionDurationHours * 60 * 60 * 1000);

        // Eliminar registros expirados de 'conversations'
        await connection.query('DELETE FROM conversations WHERE last_interaction < ?', [expirationDate]);

        console.log('Sesiones expiradas eliminadas:', new Date());
    } catch (error) {
        console.error('Error al limpiar sesiones expiradas:', error);
    } finally {
        connection.release();
    }
};

// Ejecutar la función cada 5 minutos
setInterval(cleanExpiredSessions, 60 * 60 * 1000);
