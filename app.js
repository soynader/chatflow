const { createBot, createProvider, createFlow, addKeyword } = require('@bot-whatsapp/bot');
const QRPortalWeb = require('@bot-whatsapp/portal');
const BaileysProvider = require('@bot-whatsapp/provider/baileys');
const MySQLAdapter = require('@bot-whatsapp/database/mysql');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const EVENTS = require("@bot-whatsapp/bot").EVENTS;

// Cargar variables de entorno desde el archivo .env
dotenv.config();

const pool = mysql.createPool({
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    database: process.env.MYSQLDATABASE,
    password: process.env.MYSQLPASSWORD,
    port: process.env.MYSQLPORT || 37289, // Usa el puerto 3306 por defecto si no se especifica
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const removeAccents = (str) => {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

const getFlowsFromDatabase = async () => {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(`
            SELECT f.keyword, f.answer, f.media_url, f.chatbots_id
            FROM flows f
            JOIN chatbots c ON f.chatbots_id = c.id
        `);
        return rows;
    } finally {
        connection.release(); 
    }
};

const getWelcomesMessage = async () => {
    const connection = await pool.getConnection();
    try {
        const [welcomesRow] = await connection.query('SELECT welcomereply FROM welcomes');
        const welcomeMessage = welcomesRow[0]?.welcomereply || '';
        return welcomeMessage.trim(); // Trimming to handle any accidental spaces
    } finally {
        connection.release();
    }
};

const getDefaultReply = async () => {
    const connection = await pool.getConnection();
    try {
        const [defaultReplyRow] = await connection.query('SELECT defaultreply FROM welcomes');
        const defaultReply = defaultReplyRow[0]?.defaultreply || '';
        return defaultReply.trim(); // Trimming to handle any accidental spaces
    } finally {
        connection.release();
    }
};

const hasReceivedWelcomes = async (phoneNumber) => {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('SELECT received_welcome FROM closesessions WHERE phone_number = ?', [phoneNumber]);
        return rows.length > 0 && rows[0].received_welcome;
    } finally {
        connection.release();
    }
};

const setWelcomesSent = async (phoneNumber) => {
    const connection = await pool.getConnection();
    try {
        await connection.query('INSERT INTO closesessions (phone_number, received_welcome) VALUES (?, ?) ON DUPLICATE KEY UPDATE received_welcome = ?', [phoneNumber, true, true]);
    } finally {
        connection.release();
    }
};

const getChatbotState = async (chatbots_id) => {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('SELECT estado FROM chatbots WHERE id = ?', [chatbots_id]);
        return rows.length > 0 ? rows[0].estado : 'inactivo';
    } finally {
        connection.release();
    }
};

const handleMessage = async (message, adapterProvider) => {
    console.log("Mensaje entrante recibido:", message); 
    const { from: sender, body } = message;
    const phoneNumber = sender.split("@")[0];

    if (!(await hasReceivedWelcomes(phoneNumber))) {
        const welcomesMessage = await getWelcomesMessage();
        if (welcomesMessage) { // Only send welcome message if it's not empty
            await adapterProvider.sendMessage(phoneNumber, welcomesMessage, { options: {} });
            await setWelcomesSent(phoneNumber);
        }
    } else {
        const flows = await getFlowsFromDatabase();  // Obtener los flujos desde la base de datos
        const defaultReply = await getDefaultReply();  // Obtener el mensaje por defecto desde la base de datos

        let matched = false;
        const cleanedBody = removeAccents(body.toLowerCase());
        const words = cleanedBody.split(/\s+/);  // Convertir a minúsculas y dividir en palabras

        // Verificar el mensaje contra las palabras clave en la base de datos
        for (const flow of flows) {
            const keyword = removeAccents(flow.keyword.toLowerCase());
            if (words.includes(keyword)) {
                const chatbotState = await getChatbotState(flow.chatbots_id);
                if (chatbotState === 'inactivo') {
                    console.log(`El chatbot con ID ${flow.chatbots_id} está inactivo.`);
                    return;
                }

                const messageOptions = {};
                if (flow.media_url) {
                    messageOptions.media = flow.media_url;
                }
                try {
                    await adapterProvider.sendMessage(phoneNumber, flow.answer, { options: messageOptions });
                } catch (error) {
                    console.error(`Error al enviar el mensaje con media: ${flow.media_url}`, error);
                    // Si hay un error con el media, enviar solo el texto
                    await adapterProvider.sendMessage(phoneNumber, flow.answer, { options: {} });
                }
                matched = true;
                break;
            }
        }
        // Si no hubo coincidencia, enviar el mensaje por defecto
        if (!matched) {
            const chatbotState = await getChatbotState(flows[0].chatbots_id); // Verifica el estado del chatbot del primer flujo
            if (chatbotState === 'activo' && defaultReply) { // Only send default reply if it's not empty
                await adapterProvider.sendMessage(phoneNumber, defaultReply, { options: {} });
            } else {
                console.log('El chatbot está inactivo o el mensaje por defecto está vacío y no se enviará el mensaje por defecto.');
            }
        }
    }
};

const main = async () => {
    const adapterDB = new MySQLAdapter({
        host: process.env.MYSQLHOST,
        user: process.env.MYSQLUSER,
        database: process.env.MYSQLDATABASE,
        password: process.env.MYSQLPASSWORD,
        port: process.env.MYSQLPORT || 37289,
    });

    const adapterFlow = createFlow([]);  // No agregar flujos estáticos, se manejarán dinámicamente
    const adapterProvider = createProvider(BaileysProvider);

    const bot = createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    });

    // Listen for messages and handle welcomes message
    adapterProvider.on('message', async (message) => {
        await handleMessage(message, adapterProvider);
    });

    QRPortalWeb();
};

main();
