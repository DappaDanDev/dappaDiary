import OpenAI from 'openai';

// Initialize the OpenAI client with Lilypad/Anura endpoint
const lilypadClient = new OpenAI({
  baseURL: 'https://anura-testnet.lilypad.tech/api/v1',
  apiKey: process.env.ANURA_API_KEY || 'placeholder-key', // Use environment variable in production
});

// Parse SSE data and extract assistant content
async function* parseSSEResponse(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          
          if (content !== null && content !== undefined) {
            yield content;
          }
        } catch (e) {
          console.error('Error parsing SSE data:', e);
        }
      }
    }
  }
}

// Main chat processing function
export async function POST(req: Request) {
  try {
    const { messages, uploadedFile } = await req.json();
    
    // Remove any system messages from the input as we'll add our own
    const userMessages = messages.filter((message: any) => message.role !== 'system');
    
    // Create system message content based on whether a file is uploaded
    let systemContent = 'You are DappaDiary, a helpful AI assistant that helps users manage their notebook content based on the NotebookLM project. You can retrieve information from documents, generate summaries, and help organize content effectively.';
    
    // If file is uploaded, add RAG context to the system message
    if (uploadedFile) {
      systemContent += `\n\nThe user has uploaded a document: "${uploadedFile.name}" (${uploadedFile.type}, ${(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB).
      Whenever the user asks questions, assume they might be asking about this document.
      
      You are operating in a real Retrieval-Augmented Generation (RAG) system. In this mode, you should:
      1. Use the provided context to answer questions accurately.
      2. Acknowledge that you understand they're asking about their document.
      3. Use specific details from the document chunks to support your answers.
      4. Avoid making up information or providing hypothetical answers.
      
      Your goal is to provide accurate and context-based answers using the document content.`;
    }
    
    // Process with Lilypad LLM API
    const systemMessage = { 
      role: 'system', 
      content: systemContent
    };
    
    const allMessages = [systemMessage, ...userMessages];
    
    // Create completion with streaming
    const response = await fetch('https://anura-testnet.lilypad.tech/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ANURA_API_KEY || 'placeholder-key'}`,
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        model: 'llama3.1:8b',
        messages: allMessages,
        stream: true,
        temperature: 0.7
      })
    });
    
    // Check if the response is ok
    if (!response.ok) {
      throw new Error(`API call failed with status: ${response.status}`);
    }
    
    // Create a transformed stream that only includes the assistant's content
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is null');
    }

    const transformedStream = new ReadableStream({
      async start(controller) {
        try {
          const parser = parseSSEResponse(reader);
          for await (const content of parser) {
            controller.enqueue(new TextEncoder().encode(content));
          }
          controller.close();
        } catch (error) {
          console.error('Stream processing error:', error);
          controller.error(error);
        }
      }
    });
    
    // Return the transformed stream with proper headers
    return new Response(transformedStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error in chat processing:', error);
    return new Response(JSON.stringify({ error: 'An error occurred during chat processing' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
} 