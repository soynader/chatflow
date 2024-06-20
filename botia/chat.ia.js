require('dotenv').config();
const { CoreClass } = require('@bot-whatsapp/bot');
const Groq = require('groq-sdk');

class ChatIAClass extends CoreClass {
  queue = [];
  optionsGPT = { model: "mixtral-8x7b-32768" };
  groqClient = undefined;
  db = undefined;

  constructor(_database, _provider) {
    super(null, _database, _provider);
    this.db = _database;
    this.init().then();
  }

  /**
   * Esta función inicializa el cliente de Groq
   */
  init = async () => {
    try {
      this.groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    } catch (error) {
      console.error('Error initializing Groq client:', error);
    }
  };

  /**
   * Manejar el mensaje entrante
   */
  handleMsg = async (ctx) => {
    const { from, body } = ctx;

    try {
      // Fetch active prompts from the database
      const [rows] = await this.db.query(`
        SELECT botias.prompt 
        FROM botias 
        JOIN chatias ON botias.chatias_id = chatias.id 
        WHERE chatias.estado = 'activo'
      `);
      const prompts = rows.map(row => row.prompt);

      if (prompts.length > 0) {
        // Include the prompts in the messages array
        const messages = [
          ...prompts.map(prompt => ({ role: 'system', content: prompt })),
          { role: 'user', content: body }
        ];

        const interaccionChatGPT = await this.groqClient.chat.completions.create({
          messages: messages,
          model: this.optionsGPT.model,
          temperature: 0.5,
          max_tokens: 1024,
          top_p: 1,
          stream: false,
          stop: null,
        });

        const content = interaccionChatGPT.choices[0]?.message?.content || '';
        console.log('Response content:', content);

        this.queue.push({ id: interaccionChatGPT.id, conversationId: interaccionChatGPT.conversationId });
        const parseMessage = {
          ...interaccionChatGPT,
          answer: content
        };

        this.sendFlowSimple([parseMessage], from);
      } else {
        // If no active prompts, send a default message
        this.sendFlowSimple([{ text: 'Lo siento, en este momento no puedo procesar tu solicitud.' }], from);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      this.sendFlowSimple([{ text: 'Lo siento, hubo un error al procesar tu solicitud.' }], from);
    }
  };
}

module.exports = ChatIAClass;
