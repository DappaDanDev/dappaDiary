import { NextResponse } from 'next/server';
import { 
  initStorachaClient, 
  storeConversation, 
  createNewConversation, 
  addMessageToConversation
} from '@/lib/storacha';

// Store a conversation via API
export async function POST(req: Request) {
  try {
    const { action, data } = await req.json();
    
    let result;
    
    switch (action) {
      case 'createConversation':
        const { title, initialMessage } = data;
        const newConversation = await createNewConversation(title, initialMessage);
        // Ensure messages array is always initialized
        result = {
          ...newConversation,
          messages: newConversation.messages || []
        };
        break;
        
      case 'storeConversation':
        const { conversation } = data;
        const cid = await storeConversation(conversation);
        result = { cid, conversation };
        break;
        
      case 'addMessage':
        const { conversation: existingConversation, message } = data;
        
        // Ensure the conversation has a messages array
        if (!existingConversation.messages) {
          existingConversation.messages = [];
        }
        
        const newCid = await addMessageToConversation(existingConversation, message);
        result = { 
          cid: newCid, 
          conversation: {
            ...existingConversation,
            messages: [...existingConversation.messages, message],
            updatedAt: new Date().toISOString()
          }
        };
        break;
        
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in storage processing:', error);
    return NextResponse.json(
      { error: 'An error occurred during storage processing' }, 
      { status: 500 }
    );
  }
} 