import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env';
import { getSchema } from '../rag/schemaRetriever';
import { buildSystemPrompt } from '../rag/promptBuilder';
import { prisma } from '../database';

// Initialize the Google Gemini SDK
const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
const MODEL_NAME = 'gemini-2.5-flash';

export class AiService {
  /**
   * Main chat function. Fetches schema, fetches history, builds prompt, calls Gemini, and saves history.
   */
  async chat(prompt: string, connectionId: string, userId: string): Promise<string> {
    // 1. Get Schema Context
    const schema = await getSchema();
    const systemPrompt = buildSystemPrompt(schema);

    // 2. Fetch or Create Conversation
    let conversation = await prisma.aiConversation.findFirst({
      where: { connectionId, userId },
      orderBy: { updatedAt: 'desc' }
    });

    if (!conversation) {
      conversation = await prisma.aiConversation.create({
        data: {
          connectionId,
          userId,
          title: 'Database Chat'
        }
      });
    }

    // 3. Fetch History for Context
    const rawHistory = await prisma.aiChatMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 20 // limit to last 20 messages to avoid context bloat
    });

    // Format for Gemini Chat
    const contents: any[] = [];
    
    // According to new SDK, you can pass a system instruction and history. 
    // We'll pass the system prompt as the first message or use systemInstruction.
    
    for (const msg of rawHistory) {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      });
    }
    
    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });

    // 4. Save User Message to DB
    await prisma.aiChatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: prompt
      }
    });
    
    // Update conversation timestamp
    await prisma.aiConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() }
    });

    // 5. Call Gemini
    try {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.1 // Keep it deterministic for SQL
        }
      });

      const responseText = response.text || 'No response generated.';

      // 6. Save Model Message to DB
      await prisma.aiChatMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'model',
          content: responseText
        }
      });

      return responseText;
    } catch (error: any) {
      console.error('Gemini API Error:', error);
      throw new Error(`Failed to generate response: ${error.message}`);
    }
  }

  async explain(sql: string): Promise<string> {
    const schema = await getSchema();
    const systemPrompt = buildSystemPrompt(schema);
    
    const contents = [
      {
        role: 'user',
        parts: [{ text: `Explain what the following SQL query does, tables used, and possible optimizations:\n\n\`\`\`sql\n${sql}\n\`\`\`` }]
      }
    ];

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents,
      config: { systemInstruction: systemPrompt, temperature: 0.2 }
    });

    return response.text || 'Could not explain the query.';
  }

  async fix(sql: string, errorMsg: string): Promise<string> {
    const schema = await getSchema();
    const systemPrompt = buildSystemPrompt(schema);
    
    const contents = [
      {
        role: 'user',
        parts: [{ text: `The following SQL query produced an error.\n\nQuery:\n\`\`\`sql\n${sql}\n\`\`\`\n\nError:\n${errorMsg}\n\nPlease provide the corrected SQL query and a brief explanation of the fix.` }]
      }
    ];

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents,
      config: { systemInstruction: systemPrompt, temperature: 0.1 }
    });

    return response.text || 'Could not fix the query.';
  }

  async optimize(sql: string): Promise<string> {
    const schema = await getSchema();
    const systemPrompt = buildSystemPrompt(schema);
    
    const contents = [
      {
        role: 'user',
        parts: [{ text: `Optimize the following SQL query for performance. Provide the optimized query and explain why it is better.\n\n\`\`\`sql\n${sql}\n\`\`\`` }]
      }
    ];

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents,
      config: { systemInstruction: systemPrompt, temperature: 0.2 }
    });

    return response.text || 'Could not optimize the query.';
  }
  
  async getHistory(connectionId: string, userId: string) {
    const conversation = await prisma.aiConversation.findFirst({
      where: { connectionId, userId },
      orderBy: { updatedAt: 'desc' }
    });
    
    if (!conversation) return [];
    
    return prisma.aiChatMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' }
    });
  }
  
  async clearHistory(connectionId: string, userId: string) {
    const conversations = await prisma.aiConversation.findMany({
      where: { connectionId, userId }
    });
    
    for (const conv of conversations) {
      await prisma.aiChatMessage.deleteMany({
        where: { conversationId: conv.id }
      });
      await prisma.aiConversation.delete({
        where: { id: conv.id }
      });
    }
  }
}

export const aiService = new AiService();
