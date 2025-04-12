'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
// Remove direct import from storacha
// import { createNewConversation, addMessageToConversation } from '@/lib/storacha';
import { FileUploadDemo } from '@/components/file-upload-demo';
import { PodcastPlayer } from '@/components/podcast-player';
// Remove lazy imports
// const KokoroTtsPlayer = lazy(() => import('@/components/KokoroTtsPlayer').then(mod => ({ 
//   default: mod.KokoroTtsPlayer 
// })));

// Replace with a simpler approach
import dynamic from 'next/dynamic';

// Import Google fonts - adding Quicksand for cute/fun feel
import { Quicksand } from 'next/font/google';

// Configure font
const quicksand = Quicksand({ 
  subsets: ['latin'],
  display: 'swap',
  weight: ['300', '400', '500', '700'],
});

// Only import the TTS player on the client side with no SSR
const SimpleTtsPlayer = dynamic(
  () => import('@/components/SimpleTtsPlayer'),
  { ssr: false }
);

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

interface PodcastInfo {
  id?: string;
  documentId: string;
  audioCid?: string;
  audioUrl?: string;
  script: string;
}

export default function Home() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentConversation, setCurrentConversation] = useState<ChatConversation | null>(null);
  const [conversationCid, setConversationCid] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [isRagMode, setIsRagMode] = useState<boolean>(false);
  const [isPodcastGenerating, setIsPodcastGenerating] = useState<boolean>(false);
  const [podcastInfo, setPodcastInfo] = useState<PodcastInfo | null>(null);
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
  };
  
  const handleDocumentProcessed = (docId: string) => {
    setDocumentId(docId);
    setIsRagMode(true);
    console.log('Document processed for RAG with ID:', docId);
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

      let response;
      
      if (isRagMode && documentId) {
        // Use RAG API for response
        response = await fetch('/api/rag/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            documentId,
            query: input,
            useAgent: true, // Use the LangGraph agent
          }),
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Create a new assistant message with the RAG response
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: result.answer,
        };
        
        // Update messages state
        setMessages((prev) => [...prev, assistantMessage]);
        
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
                  content: assistantMessage.content,
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
      } else {
        // Use standard chat API
        response = await fetch('/api/chat', {
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

  // Generate podcast for the document
  const generatePodcast = async () => {
    if (!documentId) {
      console.error('No document ID available for podcast generation');
      return;
    }

    setIsPodcastGenerating(true);

    try {
      // Call the podcast API
      const response = await fetch('/api/podcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate podcast');
      }

      const data = await response.json();
      console.log('Podcast generated:', data);

      // Set podcast info for browser TTS generation and playback
      setPodcastInfo(data.podcast);
    } catch (error) {
      console.error('Error generating podcast:', error);
      // Show error in chat
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: `Error generating podcast: ${error instanceof Error ? error.message : String(error)}`,
        },
      ]);
    } finally {
      setIsPodcastGenerating(false);
    }
  };

  return (
    <div className={`flex flex-col min-h-screen bg-white ${quicksand.className}`}>
      <header className="sticky top-0 z-10 bg-white border-b border-purple-200 p-4">
        <div className="flex flex-col items-center justify-center text-center py-2">
          <h1 className="text-3xl md:text-4xl font-bold text-purple-600 tracking-tight">
            ✨ DappaDiary ✨
          </h1>
          <p className="text-md md:text-lg text-purple-400 mt-1">Your Own NotebookLM</p>
          
          {/* Status indicators */}
          <div className="flex items-center space-x-3 mt-2">
            {isRagMode && (
              <span className="text-xs bg-purple-100 text-purple-800 px-3 py-1 rounded-full border border-purple-200 shadow-sm">
                🧠 RAG Mode Active
              </span>
            )}
            {conversationCid && (
              <div className="text-xs text-purple-500 px-3 py-1 bg-purple-50 rounded-full border border-purple-200 shadow-sm">
                📝 ID: {conversationCid.substring(0, 10)}...
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-10 space-y-8">
              <div>
                <h2 className="text-xl font-semibold text-purple-600">
                  Start a magical conversation with DappaDiary!
                </h2>
                <p className="text-gray-500 mt-2">
                  Powered by Lilypad LLM and stored with Storacha
                </p>
              </div>
              
              <div className="mt-6">
                <h3 className="text-lg font-medium text-purple-600 mb-4">
                  Drop your precious document here for some AI magic! ✨📚
                </h3>
                <FileUploadDemo 
                  onFileUpload={handleFileUpload} 
                  onDocumentProcessed={handleDocumentProcessed}
                />
              </div>
              
              {uploadedFile && documentId && (
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h4 className="font-medium text-purple-700">RAG Mode Activated</h4>
                  <p className="text-sm text-purple-600">
                    Using document: {uploadedFile.name}
                  </p>
                  <p className="text-xs text-purple-500 mt-1">
                    Document ID: {documentId.substring(0, 8)}...
                  </p>
                  
                  {/* Podcast Button */}
                  <div className="mt-4">
                    <button
                      onClick={generatePodcast}
                      disabled={isPodcastGenerating}
                      className="bg-[#A9C99F] hover:bg-[#95B386] text-white py-2 px-4 rounded-full flex items-center justify-center w-full disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                    >
                      {isPodcastGenerating ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Generating Podcast...
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                          Make a Podcast
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
              
              {/* Podcast Player */}
              {podcastInfo && (
                <div className="mt-8">
                  {podcastInfo.audioUrl ? (
                    <PodcastPlayer
                      audioUrl={podcastInfo.audioUrl}
                      title={`Podcast for ${uploadedFile?.name || 'document'}`}
                      script={podcastInfo.script}
                    />
                  ) : (
                    <div className="mt-4">
                      <SimpleTtsPlayer
                        script={podcastInfo.script || ''}
                        title={`Podcast for ${uploadedFile?.name || 'document'}`}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Show podcast player above messages if available */}
              {podcastInfo && (
                <div className="mb-8">
                  {podcastInfo.audioUrl ? (
                    <PodcastPlayer
                      audioUrl={podcastInfo.audioUrl}
                      title={`Podcast for ${uploadedFile?.name || 'document'}`}
                      script={podcastInfo.script}
                    />
                  ) : (
                    <div className="mt-4">
                      <SimpleTtsPlayer
                        script={podcastInfo.script || ''}
                        title={`Podcast for ${uploadedFile?.name || 'document'}`}
                      />
                    </div>
                  )}
                </div>
              )}
            
              {/* Messages */}
              <div className="space-y-4">
                {messages.map((message) => (
                  <div key={message.id}>
                    {message.role === 'user' ? (
                      <div className="flex justify-end">
                        <div className="rounded-2xl bg-white px-4 py-3 text-purple-700 border-2 border-purple-300 shadow-sm">
                          {message.content}
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-start">
                        <div className="rounded-2xl bg-purple-600 px-4 py-3 text-white shadow-sm">
                          {message.content}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div className="flex items-center space-x-2 text-purple-500">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-purple-400"></div>
                    <div className="h-2 w-2 animate-pulse rounded-full bg-purple-400 delay-75"></div>
                    <div className="h-2 w-2 animate-pulse rounded-full bg-purple-400 delay-150"></div>
                    <span className="text-sm">AI is thinking...</span>
                  </div>
                )}
              </div>
              
              {/* Podcast Button (when in chat mode) */}
              {documentId && !podcastInfo && (
                <div className="flex justify-center my-4">
                  <button
                    onClick={generatePodcast}
                    disabled={isPodcastGenerating}
                    className="bg-[#A9C99F] hover:bg-[#95B386] text-white py-2 px-6 rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                  >
                    {isPodcastGenerating ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Generating Podcast...
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        Make a Podcast
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <footer className="sticky bottom-0 z-10 bg-white border-t border-gray-200 p-4">
        <form onSubmit={sendMessage} className="max-w-3xl mx-auto flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isRagMode && uploadedFile 
              ? `Ask anything about ${uploadedFile.name}...` 
              : "Type your magical question...✨"}
            className="flex-1 p-3 border border-purple-200 rounded-full bg-white text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-300"
            disabled={isLoading}
          />
          <button
            type="submit"
            className="bg-[#A9C99F] hover:bg-[#95B386] text-white px-6 py-3 rounded-full disabled:opacity-50 shadow-md flex items-center"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Working...
              </span>
            ) : (
              <>Send ✨</>
            )}
          </button>
        </form>
      </footer>
    </div>
  );
}
