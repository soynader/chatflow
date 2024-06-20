require('dotenv').config();
const { createProvider } = require('@bot-whatsapp/bot');
const QRPortalWeb = require('@bot-whatsapp/portal');
const BaileysProvider = require('@bot-whatsapp/provider/baileys');
const mysql = require('mysql2/promise');
const ChatIAClass = require('./chat.ia');

const createBotChatGpt = async ({ provider, database }) => {
  return new ChatIAClass(database, provider);
};

const main = async () => {
  try {
    const connection = await mysql.createConnection({
      host: process.env.MYSQLHOST,
      user: process.env.MYSQLUSER,
      password: process.env.MYSQLPASSWORD,
      database: process.env.MYSQL_DATABASE,
      port: process.env.MYSQLPORT,
      ssl: {
        rejectUnauthorized: false
      }
    });

    const bot = await createBotChatGpt({
      provider: createProvider(BaileysProvider),
      database: connection,
    });

    // Asegurarse de que bot.provider está definido antes de suscribirse a eventos
    if (bot && bot.provider) {
      bot.provider.on('message', async (message) => {
        try {
          await bot.handleMsg(message);
        } catch (error) {
          console.error('Error handling message:', error);
          // Manejar el error enviando un mensaje de error al usuario si es necesario
        }
      });
    } else {
      console.error('Error: No se pudo inicializar correctamente el bot.');
    }

    // Manejadores de errores globales
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
    });

    QRPortalWeb({ port: process.env.BOTIA_PORT || 3001 }) // Iniciar el portal QR para la conexión del bot
  } catch (error) {
    console.error('Error in main:', error);
  }
};

main().catch(error => console.error('Error initializing the bot:', error));
