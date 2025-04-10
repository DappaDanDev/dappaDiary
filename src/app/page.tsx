'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
// Remove direct import from storacha
// import { createNewConversation, addMessageToConversation } from '@/lib/storacha';
import { FileUploadDemo } from '@/components/file-upload-demo';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatConversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export default function Home() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentConversation, setCurrentConversation] = useState<ChatConversation | null>(null);
  const [conversationCid, setConversationCid] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Create a new conversation when the component loads
  useEffect(() => {
    async function createConversation() {
      try {
        const response = await fetch('/api/storage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'createConversation',
            data: {
              title: 'New Conversation',
            }
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to create conversation');
        }

        const conversation = await response.json();
        if (!conversation || typeof conversation !== 'object') {
          throw new Error('Invalid conversation data received');
        }
        
        // Ensure conversation has the required properties
        const validConversation = {
          id: conversation.id || `conv-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          title: conversation.title || 'New Conversation',
          messages: Array.isArray(conversation.messages) ? conversation.messages : [],
          createdAt: conversation.createdAt || new Date().toISOString(),
          updatedAt: conversation.updatedAt || new Date().toISOString()
        };
        
        setCurrentConversation(validConversation);
        console.log('Created new conversation:', validConversation);
      } catch (error) {
        console.error('Error creating conversation:', error);
        // Create a fallback conversation locally if API fails
        const fallbackConversation = {
          id: `conv-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          title: 'New Conversation',
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        setCurrentConversation(fallbackConversation);
      }
    }

    createConversation();
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileUpload = (file: File) => {
    setUploadedFile(file);
    console.log('File uploaded in parent component:', file.name);
    
    // Process the file for RAG
    processFileForRAG(file);
  };

  // Process file for RAG
  const processFileForRAG = async (file: File) => {
    // In a real implementation, this would:
    // 1. Extract text from the file
    // 2. Create embeddings
    // 3. Store the embeddings for retrieval
    
    // For now, we'll just simulate the processing
    console.log(`Processing file for RAG: ${file.name}`);
    
    // Create a FormData object to send the file to the backend (for future implementation)
    const formData = new FormData();
    formData.append('file', file);
    
    // Example of how you might send this to an API endpoint in the future
    /* 
    try {
      const response = await fetch('/api/process-document', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Failed to process document');
      }
      
      const result = await response.json();
      console.log('Document processed:', result);
    } catch (error) {
      console.error('Error processing document:', error);
    }
    */
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !currentConversation) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
    };

    setInput('');
    setIsLoading(true);
    setMessages((prev) => [...prev, userMessage]);

    try {
      // Updated current conversation with user message
      const updatedConversation = {
        ...currentConversation,
        messages: [...(currentConversation.messages || []), userMessage],
        updatedAt: new Date().toISOString()
      };
      
      // Store user message via API
      const storeUserMessageResponse = await fetch('/api/storage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'addMessage',
          data: {
            conversation: currentConversation,
            message: {
              id: userMessage.id,
              role: userMessage.role,
              content: userMessage.content,
              timestamp: new Date().toISOString()
            }
          }
        }),
      });
      
      // Store the response data right away if successful
      let userMsgResult = null;
      if (storeUserMessageResponse.ok) {
        try {
          const responseData = await storeUserMessageResponse.json();
          userMsgResult = responseData;
          setCurrentConversation(responseData.conversation);
          setConversationCid(responseData.cid);
        } catch (e) {
          console.warn('Failed to parse storage response JSON', e);
        }
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          // Include uploaded file information if available
          uploadedFile: uploadedFile ? {
            name: uploadedFile.name,
            type: uploadedFile.type,
            size: uploadedFile.size,
            lastModified: uploadedFile.lastModified
          } : null,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Create a new ID for the assistant message
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
      };

      // Add empty assistant message to show typing indicator
      setMessages((prev) => [...prev, assistantMessage]);

      // Read the stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      let result = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Process the received chunk
        const chunk = new TextDecoder().decode(value);
        result += chunk;

        // Update the assistant message with the received chunk
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? { ...msg, content: msg.content + chunk }
              : msg
          )
        );
      }

      // Store assistant message via API
      try {
        // Use the conversation object we already have instead of trying to parse the response again
        const updatedConvWithUserMsg = userMsgResult && userMsgResult.conversation
          ? userMsgResult.conversation 
          : updatedConversation;
          
        const storeAssistantMessageResponse = await fetch('/api/storage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'addMessage',
            data: {
              conversation: updatedConvWithUserMsg,
              message: {
                id: assistantMessage.id,
                role: assistantMessage.role,
                content: result,
                timestamp: new Date().toISOString()
              }
            }
          }),
        });

        if (storeAssistantMessageResponse.ok) {
          const assistantMsgResult = await storeAssistantMessageResponse.json();
          setCurrentConversation(assistantMsgResult.conversation);
          setConversationCid(assistantMsgResult.cid);
          console.log(`Conversation stored with CID: ${assistantMsgResult.cid}`);
        } else {
          console.warn('Failed to store assistant message');
        }
      } catch (storageError) {
        console.error('Error storing conversation:', storageError);
        // Continue even if storage fails
      }
    } catch (error) {
      console.error('Error:', error);
      // Add error message
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Sorry, there was an error processing your request.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 p-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
            DappaDiary - NotebookLM Recreation
          </h1>
          {conversationCid && (
            <div className="text-xs text-gray-600 dark:text-gray-400">
              CID: {conversationCid.substring(0, 10)}...
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-10 space-y-8">
              <div>
                <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">
                  Start a conversation with DappaDiary
                </h2>
                <p className="text-gray-500 dark:text-gray-400 mt-2">
                  Powered by Lilypad LLM and stored with Storacha
                </p>
              </div>
              
              <div className="mt-6">
                <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-4">
                  Upload a document to get started with RAG
                </h3>
                <FileUploadDemo onFileUpload={handleFileUpload} />
              </div>
              
              {uploadedFile && (
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-700 dark:text-blue-300">RAG Mode Activated</h4>
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    Using document: {uploadedFile.name}
                  </p>
                </div>
              )}
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <footer className="sticky bottom-0 z-10 bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 p-4">
        <form onSubmit={sendMessage} className="max-w-3xl mx-auto flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={uploadedFile ? `Ask about ${uploadedFile.name}...` : "Type your message..."}
            className="flex-1 p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
            disabled={isLoading}
          />
          <button
            type="submit"
            className="bg-blue-500 text-white px-4 py-2 rounded-lg disabled:opacity-50"
            disabled={isLoading}
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </form>
      </footer>
    </div>
  );
}
