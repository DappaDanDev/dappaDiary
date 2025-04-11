/**
 * Test file for Kokoro JS integration
 * Run with: npx ts-node src/lib/podcast/test-kokoro.ts
 */

import { KokoroTTS } from 'kokoro-js';
import fs from 'fs';
import path from 'path';

async function testKokoroVoices() {
  try {
    console.log('Initializing Kokoro TTS...');
    const model_id = "onnx-community/Kokoro-82M-ONNX";
    const tts = await KokoroTTS.from_pretrained(model_id, {
      dtype: "q8", // Using 8-bit quantization for good balance of quality and size
    });

    console.log('Available voices:');
    // Cast to string[] to handle TypeScript type mismatch
    const voices = tts.list_voices() as unknown as string[];
    console.log(voices);

    // Test female host voice
    const femaleText = "Hello, I'm Bella, your podcast host. Welcome to DappaDiary, where we explore fascinating topics!";
    console.log(`Generating female host voice (af_bella) for text: "${femaleText}"`);
    const femaleAudio = await tts.generate(femaleText, {
      voice: "af_bella",
    });

    // Test male guest voice
    const maleText = "Thanks for having me, Bella. I'm George, and I'm excited to share my expertise on this topic.";
    console.log(`Generating male guest voice (bm_george) for text: "${maleText}"`);
    const maleAudio = await tts.generate(maleText, {
      voice: "bm_george",
    });

    // Create test directory if it doesn't exist
    const testDir = path.join(process.cwd(), 'test-audio');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Save audio files
    console.log('Saving test audio files...');
    await femaleAudio.save(path.join(testDir, 'host-bella.wav'));
    await maleAudio.save(path.join(testDir, 'guest-george.wav'));

    console.log('Done! Audio files saved to:');
    console.log(`- ${path.join(testDir, 'host-bella.wav')}`);
    console.log(`- ${path.join(testDir, 'guest-george.wav')}`);
    
    // Test loading a file and saving to a different path
    console.log('Testing file loading and saving...');
    const femaleFile = path.join(testDir, 'host-bella.wav');
    const femaleBuffer = fs.readFileSync(femaleFile);
    console.log(`Loaded file of size: ${femaleBuffer.length} bytes`);
    
    // Save to a new location to verify it works
    const newPath = path.join(testDir, 'host-copy.wav');
    fs.writeFileSync(newPath, femaleBuffer);
    console.log(`File copied to: ${newPath}`);
    
  } catch (error) {
    console.error('Error testing Kokoro voices:', error);
  }
}

// Execute the test function
(async () => {
  console.log('Starting Kokoro voice test...');
  await testKokoroVoices();
  console.log('Test completed!');
})(); 