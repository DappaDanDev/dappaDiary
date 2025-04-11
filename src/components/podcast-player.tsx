'use client';

import { useState, useRef, useEffect } from 'react';

interface PodcastPlayerProps {
  audioUrl: string;
  title: string;
  script?: string;
}

export function PodcastPlayer({ audioUrl, title, script }: PodcastPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Initialize audio when URL changes
  useEffect(() => {
    // Clean up previous audio element
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }

    // Create new audio element
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    
    // Set up event listeners
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
      setIsLoading(false);
    });
    audio.addEventListener('playing', () => setIsPlaying(true));
    audio.addEventListener('pause', () => setIsPlaying(false));
    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });
    audio.addEventListener('error', (e) => {
      console.error('Audio error:', e);
      setError('Error loading audio. Please try again later.');
      setIsLoading(false);
    });
    
    // Start loading audio
    setIsLoading(true);
    audio.load();
    
    // Clean up event listeners on unmount
    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('loadedmetadata', () => {});
      audio.removeEventListener('playing', () => {});
      audio.removeEventListener('pause', () => {});
      audio.removeEventListener('ended', () => {});
      audio.removeEventListener('error', () => {});
      audio.pause();
      audio.src = '';
    };
  }, [audioUrl]);
  
  // Update progress bar
  const updateProgress = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };
  
  // Handle play/pause
  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play()
          .catch(error => {
            console.error('Playback error:', error);
            setError('Error playing audio. Please try again.');
          });
      }
    }
  };
  
  // Handle seeking
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (progressBarRef.current && audioRef.current) {
      const progressBar = progressBarRef.current;
      const bounds = progressBar.getBoundingClientRect();
      const percent = (e.clientX - bounds.left) / bounds.width;
      const newTime = percent * duration;
      
      // Update audio time
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };
  
  // Format time in MM:SS
  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };
  
  // Calculate progress percentage
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  
  return (
    <div className="w-full rounded-lg border border-gray-200 bg-white p-4 shadow-md dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-white">
        {title}
      </h3>
      
      {/* Display error if any */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-100 p-3 text-sm text-red-700 dark:bg-red-200 dark:text-red-800">
          {error}
        </div>
      )}
      
      {/* Audio controls */}
      <div className="my-4">
        {/* Play/pause button */}
        <button
          onClick={togglePlayPause}
          disabled={isLoading || !!error}
          className="mr-2 inline-flex items-center rounded-lg bg-blue-700 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:bg-gray-400 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
        >
          {isLoading ? (
            <span>Loading...</span>
          ) : isPlaying ? (
            <>
              <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"></path>
              </svg>
              Pause
            </>
          ) : (
            <>
              <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"></path>
              </svg>
              Play
            </>
          )}
        </button>
        
        {/* Time display */}
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
      
      {/* Progress bar */}
      <div 
        ref={progressBarRef}
        onClick={handleSeek}
        className="mb-4 h-2 w-full cursor-pointer rounded-full bg-gray-200 dark:bg-gray-700"
      >
        <div 
          className="h-2 rounded-full bg-blue-600 dark:bg-blue-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      
      {/* Script display (togglable) */}
      {script && (
        <div className="mt-4">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-gray-900 dark:text-white">
              Show Podcast Script
            </summary>
            <div className="mt-2 max-h-60 overflow-y-auto rounded-lg bg-gray-50 p-4 text-sm text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              <pre className="whitespace-pre-wrap font-sans">{script}</pre>
            </div>
          </details>
        </div>
      )}
    </div>
  );
} 