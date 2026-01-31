import { GoogleGenAI } from '@google/genai';
import mainGenresData from '../main-genres.json';
import subGenresData from '../sub-genres.json';

interface GeminiAgentOptions {
  model?: string;
  temperature?: number;
  includeGenreData?: boolean;
}

export class GeminiAgent {
  private ai: GoogleGenAI;
  private model: string;
  private temperature: number;
  private systemInstruction: string;
  private includeGenreData: boolean;
  private chatHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  constructor(apiKey: string, options: GeminiAgentOptions = {}) {
    this.ai = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
    this.model = options.model || 'gemini-2.5-flash';
    this.temperature = options.temperature ?? 0.7;
    this.includeGenreData = options.includeGenreData ?? false;
    this.systemInstruction = 'You are a helpful AI assistant for music production and DJing.';
    
    if (this.includeGenreData) {
      this.reloadGenreData(this.systemInstruction);
    }
  }

  getSystemInstruction(): string {
    return this.systemInstruction;
  }

  setSystemInstruction(instruction: string): void {
    this.systemInstruction = instruction;
    if (this.includeGenreData) {
      this.reloadGenreData(instruction);
    }
  }

  reloadGenreData(baseInstruction?: string): void {
    const instruction = baseInstruction || this.systemInstruction;
    
    // Build genre data string
    const mainGenres = mainGenresData as Array<{ id: string; name: string; prompt: string }>;
    const genreList = mainGenres.map(g => `- ${g.name} (ID: ${g.id}): ${g.prompt}`).join('\n');
    
    // Build sub-genre data string
    const subGenresObj = subGenresData as Record<string, Array<{ name: string; prompt: string }>>;
    let subGenreList = '';
    for (const [mainGenreId, subGenres] of Object.entries(subGenresObj)) {
      if (subGenres && subGenres.length > 0) {
        subGenreList += `\n\nSub-genres for ${mainGenreId}:\n`;
        subGenreList += subGenres.map(sg => `  - ${sg.name}: ${sg.prompt}`).join('\n');
      }
    }
    
    this.systemInstruction = `${instruction}

You have access to the following music genres and sub-genres:

Main Genres:
${genreList}${subGenreList}

Use this information to help users with music production, DJing, and genre-related questions.`;
  }

  clearHistory(): void {
    this.chatHistory = [];
  }

  async sendMessage(message: string): Promise<string> {
    try {
      // Add user message to history
      this.chatHistory.push({
        role: 'user',
        parts: [{ text: message }]
      });

      // Get the chat model
      const model = this.ai.getGenerativeModel({
        model: this.model,
        systemInstruction: this.systemInstruction,
        generationConfig: {
          temperature: this.temperature,
        },
      });

      // Build conversation history
      const history = this.chatHistory.slice(0, -1).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: msg.parts,
      }));

      // Start chat with history if available
      const chat = history.length > 0 
        ? model.startChat({ history })
        : model.startChat();

      // Send the current message
      const result = await chat.sendMessage(message);
      const response = await result.response;
      const responseText = response.text();

      // Add model response to history
      this.chatHistory.push({
        role: 'model',
        parts: [{ text: responseText }]
      });

      return responseText;
    } catch (error) {
      console.error('Error sending message to Gemini:', error);
      throw error;
    }
  }
}
