import OpenAI from 'openai';

// Initialize the OpenAI client with Lilypad/Anura endpoint
const lilypadClient = new OpenAI({
  baseURL: 'https://anura-testnet.lilypad.tech/api/v1',
  apiKey: process.env.ANURA_API_KEY || 'placeholder-key', // Use environment variable in production
});

// Main chat processing function
export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    
    // Remove any system messages from the input as we'll add our own
    const userMessages = messages.filter((message: any) => message.role !== 'system');
    
    // Process with Lilypad LLM API
    const systemMessage = { 
      role: 'system', 
      content: 'You are DappaDiary, a helpful AI assistant that helps users manage their notebook content based on the NotebookLM project. You can retrieve information from documents, generate summaries, and help organize content effectively.' 
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
    
    // Check if the response is ok and forward the stream
    if (!response.ok) {
      throw new Error(`API call failed with status: ${response.status}`);
    }
    
    // Pass through the response directly
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
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