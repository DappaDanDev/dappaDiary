'use client';

import { useState, useEffect } from 'react';

interface SimpleTtsPlayerProps {
  script: string;
  title?: string;
}

export default function SimpleTtsPlayer({ script, title }: SimpleTtsPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  
  // Browser check that runs only on client
  const [isBrowser, setIsBrowser] = useState(false);
  
  // Effect to set isBrowser on mount
  useEffect(() => {
    setIsBrowser(true);
  }, []);

  const playAudio = () => {
    if (!isBrowser || !window.speechSynthesis) {
      setError("Your browser doesn't support speech synthesis");
      return;
    }
    
    try {
      setIsPlaying(true);
      
      // Use browser's built-in TTS
      const utterance = new SpeechSynthesisUtterance(script);
      
      // Configure voice
      utterance.rate = 0.9; // Slightly slower for better understanding
      utterance.pitch = 1.0;
      
      // Set up event handlers
      utterance.onend = () => {
        setIsPlaying(false);
      };
      
      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event);
        setError('Speech synthesis failed');
        setIsPlaying(false);
      };
      
      // Get available voices
      const voices = window.speechSynthesis.getVoices();
      
      // Try to find a good voice
      if (voices && voices.length > 0) {
        // Try to find an English voice
        const englishVoice = voices.find(voice => 
          voice.lang.startsWith('en-') || voice.lang === 'en'
        );
        
        if (englishVoice) {
          utterance.voice = englishVoice;
        }
      }
      
      // Start speaking
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('Error with TTS:', err);
      setError(`Speech synthesis failed: ${err instanceof Error ? err.message : String(err)}`);
      setIsPlaying(false);
    }
  };
  
  const stopSpeaking = () => {
    if (isBrowser && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    }
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isBrowser && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isBrowser]);

  // Server-side render placeholder
  if (!isBrowser) {
    return (
      <div className="rounded-lg border border-purple-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-center h-32">
          <p className="text-purple-500">Loading TTS Player...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-purple-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col space-y-4">
        {title && (
          <h3 className="text-lg font-medium text-purple-700">{title}</h3>
        )}
        
        {error ? (
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="text-red-700">
                <p className="text-sm">{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="mt-2 text-sm font-medium text-red-700 hover:text-red-600"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                {!isPlaying ? (
                  <button
                    onClick={playAudio}
                    className="inline-flex items-center justify-center rounded-full bg-[#A9C99F] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#95B386] focus:outline-none focus:ring-2 focus:ring-[#95B386] focus:ring-offset-2"
                  >
                    Play Audio
                  </button>
                ) : (
                  <button
                    onClick={stopSpeaking}
                    className="inline-flex items-center justify-center rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2"
                  >
                    Stop
                  </button>
                )}
                
                <button
                  onClick={() => setShowTranscript(!showTranscript)}
                  className="ml-2 inline-flex items-center justify-center rounded-full bg-purple-100 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-200"
                >
                  {showTranscript ? 'Hide Transcript' : 'Show Transcript'}
                </button>
              </div>
            </div>

            {isPlaying && (
              <div className="mt-2 flex items-center">
                <div className="animate-pulse mr-2 h-2 w-2 rounded-full bg-purple-500"></div>
                <div className="animate-pulse delay-75 mr-2 h-2 w-2 rounded-full bg-purple-500"></div>
                <div className="animate-pulse delay-150 mr-2 h-2 w-2 rounded-full bg-purple-500"></div>
                <span className="text-sm text-purple-500">Speaking...</span>
              </div>
            )}

            {showTranscript && (
              <div className="mt-4 p-3 bg-purple-50 rounded-lg border border-purple-200 max-h-60 overflow-y-auto">
                <p className="text-sm text-purple-700 whitespace-pre-wrap">{script}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
} 