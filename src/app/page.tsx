'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
// Remove direct import from storacha
// import { createNewConversation, addMessageToConversation } from '@/lib/storacha';

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
      let userMsgResult;
      if (storeUserMessageResponse.ok) {
        userMsgResult = await storeUserMessageResponse.json();
        setCurrentConversation(userMsgResult.conversation);
        setConversationCid(userMsgResult.cid);
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
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
        const updatedConvWithUserMsg = userMsgResult 
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
            <div className="text-center py-10">
              <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">
                Start a conversation with DappaDiary
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mt-2">
                Powered by Lilypad LLM and stored with Storacha
              </p>
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
            placeholder="Type your message..."
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
