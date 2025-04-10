import { pipeline, env } from '@xenova/transformers';

// Skip local model check
env.allowLocalModels = false;

// Use the Singleton pattern for the embedding pipeline
class EmbeddingPipelineSingleton {
  static model = 'sentence-transformers/all-MiniLM-L6-v2';
  static instance = null;

  static async getInstance(progress_callback = null) {
    if (this.instance === null) {
      // Create a new feature-extraction pipeline with the specified model
      this.instance = pipeline('feature-extraction', this.model, { progress_callback });
    }
    return this.instance;
  }
}

// Listen for messages from the main thread
self.addEventListener('message', async (event) => {
  try {
    // Get the texts to embed from the event data
    const { texts, batchId } = event.data;
    
    // Report loading status
    self.postMessage({
      status: 'loading',
      message: `Loading embedding model: ${EmbeddingPipelineSingleton.model}`,
      batchId
    });

    // Initialize the pipeline (will load model on first call)
    const extractor = await EmbeddingPipelineSingleton.getInstance(progress => {
      self.postMessage({
        status: 'progress',
        message: `Loading model: ${progress.status}`,
        progress,
        batchId
      });
    });

    // Process texts in batches if needed
    const embeddings = [];
    let processedCount = 0;

    // Process each text and generate embeddings
    for (const text of texts) {
      // Generate embedding
      const output = await extractor(text, { pooling: 'mean', normalize: true });
      
      // Extract the embedding data (assuming it's in the expected format)
      if (output && output.data) {
        embeddings.push(Array.from(output.data));
      } else {
        throw new Error('Unexpected output format from embedding model');
      }
      
      // Report progress
      processedCount++;
      self.postMessage({
        status: 'processing',
        message: `Processed ${processedCount}/${texts.length} texts`,
        progress: { processed: processedCount, total: texts.length },
        batchId
      });
    }

    // Send the embeddings back to the main thread
    self.postMessage({
      status: 'complete',
      embeddings,
      batchId
    });
  } catch (error) {
    // Report any errors back to the main thread
    self.postMessage({
      status: 'error',
      error: error.message,
      batchId: event.data.batchId
    });
  }
}); 