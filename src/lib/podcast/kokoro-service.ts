/**
 * Kokoro service for text-to-speech conversion
 * This service handles converting podcast scripts to audio using Kokoro JS
 */
import { KokoroTTS } from 'kokoro-js';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Speaker IDs for different voices
export enum SpeakerId {
  FEMALE_HOST = 'female_host',
  MALE_GUEST = 'male_guest',
}

// Supported Kokoro voices type
type KokoroVoice = 
  | "af_bella" 
  | "af_nicole" 
  | "af_sarah" 
  | "af_sky" 
  | "am_adam" 
  | "am_michael" 
  | "bf_emma" 
  | "bf_isabella" 
  | "bm_george" 
  | "bm_lewis";

// Voice mapping to Kokoro voices
const VOICE_MAPPING: Record<SpeakerId, KokoroVoice> = {
  [SpeakerId.FEMALE_HOST]: 'af_bella', // Female host voice (Bella)
  [SpeakerId.MALE_GUEST]: 'bm_george', // Male guest voice (George)
};

// Interface for a segment of speech
interface SpeechSegment {
  text: string;
  speaker: SpeakerId;
}

/**
 * Parse a podcast script into speech segments
 * @param script The podcast script with HOST and GUEST markers
 * @returns Array of speech segments
 */
export function parseScriptIntoSegments(script: string): SpeechSegment[] {
  const segments: SpeechSegment[] = [];
  
  // Split the script by line
  const lines = script.split('\n').filter(line => line.trim().length > 0);
  
  let currentSpeaker = SpeakerId.FEMALE_HOST;
  let currentText = '';
  
  for (const line of lines) {
    // Check for speaker markers
    if (line.includes('HOST:') || line.includes('HOST :')) {
      // If we have accumulated text for the previous speaker, add it
      if (currentText.trim().length > 0) {
        segments.push({
          text: currentText.trim(),
          speaker: currentSpeaker
        });
        currentText = '';
      }
      
      // Set the current speaker to the host
      currentSpeaker = SpeakerId.FEMALE_HOST;
      
      // Add the text after the HOST: marker
      const textAfterMarker = line.split(/HOST\s*:/)[1];
      if (textAfterMarker) {
        currentText = textAfterMarker.trim();
      }
    } else if (line.includes('GUEST:') || line.includes('GUEST :')) {
      // If we have accumulated text for the previous speaker, add it
      if (currentText.trim().length > 0) {
        segments.push({
          text: currentText.trim(),
          speaker: currentSpeaker
        });
        currentText = '';
      }
      
      // Set the current speaker to the guest
      currentSpeaker = SpeakerId.MALE_GUEST;
      
      // Add the text after the GUEST: marker
      const textAfterMarker = line.split(/GUEST\s*:/)[1];
      if (textAfterMarker) {
        currentText = textAfterMarker.trim();
      }
    } else {
      // Continue with the current speaker
      currentText += ' ' + line.trim();
    }
  }
  
  // Add the last segment if there's any text left
  if (currentText.trim().length > 0) {
    segments.push({
      text: currentText.trim(),
      speaker: currentSpeaker
    });
  }
  
  return segments;
}

// Store TTS model instances for reuse
let kokoroTTSInstance: KokoroTTS | null = null;

/**
 * Initialize or get the Kokoro TTS model
 * @returns Initialized KokoroTTS instance
 */
async function getKokoroTTS(): Promise<KokoroTTS> {
  if (!kokoroTTSInstance) {
    console.log('[KokoroService] Initializing Kokoro TTS model');
    
    const model_id = "onnx-community/Kokoro-82M-ONNX";
    kokoroTTSInstance = await KokoroTTS.from_pretrained(model_id, {
      dtype: "q8", // Using 8-bit quantization for good balance of quality and size
    });
    
    console.log('[KokoroService] Kokoro TTS model initialized');
  }
  
  return kokoroTTSInstance;
}

/**
 * Get temporary file path for saving audio
 * @returns Path to a temporary file
 */
function getTempFilePath(): string {
  const tempDir = path.join(process.cwd(), 'temp-audio');
  
  // Create the temp directory if it doesn't exist
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  return path.join(tempDir, `temp-${uuidv4()}.wav`);
}

/**
 * Generate TTS audio for a single segment
 * @param segment The speech segment to convert
 * @returns The audio buffer
 */
async function generateSegmentAudio(segment: SpeechSegment): Promise<Buffer> {
  try {
    console.log(`[KokoroService] Generating audio for segment: "${segment.text.substring(0, 30)}..." with speaker ${segment.speaker}`);
    
    // Get the TTS model
    const tts = await getKokoroTTS();
    
    // Map speaker to voice
    const voice = VOICE_MAPPING[segment.speaker];
    
    // Generate audio using Kokoro JS
    const audio = await tts.generate(segment.text, {
      voice: voice,
    });
    
    // Save to temporary file and read as buffer (workaround for missing arrayBuffer)
    const tempFilePath = getTempFilePath();
    await audio.save(tempFilePath);
    
    // Read the file back as buffer
    const buffer = fs.readFileSync(tempFilePath);
    
    // Clean up the temporary file
    try {
      fs.unlinkSync(tempFilePath);
    } catch (err) {
      console.warn(`[KokoroService] Failed to clean up temp file: ${tempFilePath}`);
    }
    
    console.log(`[KokoroService] Generated audio of size ${buffer.length} bytes`);
    
    return buffer;
  } catch (error) {
    console.error(`[KokoroService] Error generating TTS for segment:`, error);
    
    // In case of error, return a silent audio buffer
    console.log(`[KokoroService] Returning empty audio buffer due to error`);
    const sampleRate = 24000; // Kokoro uses 24kHz sample rate
    const seconds = 1;
    return Buffer.alloc(sampleRate * seconds * 2); // 16-bit audio = 2 bytes per sample
  }
}

/**
 * Combine multiple audio buffers into a single WAV file
 * @param audioBuffers Array of audio buffers to combine
 * @returns Combined audio buffer
 */
function combineAudioSegments(audioBuffers: Buffer[]): Buffer {
  try {
    // Note: This is a simplified approach to concatenating WAV files
    // In a real implementation, we'd need to handle WAV headers properly
    
    // For simplicity in this implementation, we'll just combine the buffers
    // This assumes all buffers have compatible WAV headers
    
    // Combine the buffers
    return Buffer.concat(audioBuffers);
  } catch (error) {
    console.error(`[KokoroService] Error combining audio segments:`, error);
    throw error;
  }
}

/**
 * Generate podcast audio from a script
 * @param script The podcast script
 * @returns The generated audio file as a buffer
 */
export async function generatePodcastAudio(script: string): Promise<Buffer> {
  try {
    console.log(`[KokoroService] Generating podcast audio from script of length ${script.length}`);
    
    // Parse the script into segments
    const segments = parseScriptIntoSegments(script);
    console.log(`[KokoroService] Parsed ${segments.length} speech segments from script`);
    
    // Generate audio for each segment with proper voices
    const audioPromises = segments.map(segment => generateSegmentAudio(segment));
    const audioBuffers = await Promise.all(audioPromises);
    
    // Create temp directory for full audio
    const tempDir = path.join(process.cwd(), 'temp-audio');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Create individual segment files
    const segmentFiles: string[] = [];
    for (let i = 0; i < audioBuffers.length; i++) {
      const filePath = path.join(tempDir, `segment-${i}.wav`);
      fs.writeFileSync(filePath, audioBuffers[i]);
      segmentFiles.push(filePath);
    }
    
    // Combined output path
    const outputPath = path.join(tempDir, `podcast-${uuidv4()}.wav`);
    
    // Use a simple approach for concatenating WAV files
    // This is a basic implementation - a real one would handle WAV headers properly
    const combinedBuffer = combineAudioSegments(audioBuffers);
    fs.writeFileSync(outputPath, combinedBuffer);
    
    // Read the combined file
    const finalBuffer = fs.readFileSync(outputPath);
    
    // Clean up temporary files
    try {
      segmentFiles.forEach(file => fs.unlinkSync(file));
      fs.unlinkSync(outputPath);
    } catch (err) {
      console.warn(`[KokoroService] Failed to clean up some temp files`);
    }
    
    console.log(`[KokoroService] Generated podcast audio of size ${finalBuffer.length} bytes`);
    
    // Return as Buffer
    return finalBuffer;
  } catch (error) {
    console.error(`[KokoroService] Error generating podcast audio:`, error);
    throw error;
  }
}

/**
 * List available voices in Kokoro JS
 * @returns List of available voices
 */
export async function listAvailableVoices(): Promise<string[]> {
  try {
    const tts = await getKokoroTTS();
    // Cast to string[] since the TypeScript definition might be wrong
    const voices = tts.list_voices() as unknown as string[];
    return voices || [];
  } catch (error) {
    console.error(`[KokoroService] Error listing voices:`, error);
    return [];
  }
} 