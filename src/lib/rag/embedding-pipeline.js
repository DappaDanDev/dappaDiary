import { pipeline, env } from "@huggingface/transformers";

// Skip local model check and force usage of onnxruntime-node
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;

// Use the Singleton pattern to enable lazy construction of the pipeline.
// NOTE: We wrap the class in a function to prevent code duplication.
const P = () => class EmbeddingPipelineSingleton {
    // feature-extraction is the correct task for generating embeddings in Transformers.js
    static task = 'feature-extraction';
    static model = 'sentence-transformers/all-MiniLM-L6-v2';
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            console.log(`Loading embedding model: ${this.model}`);
            try {
                this.instance = pipeline(this.task, this.model, { 
                    progress_callback,
                    // Use pooling to get a single vector for the entire text
                    pooling: 'mean',
                    // Normalize embeddings for better similarity search
                    normalize: true
                });
                console.log(`Embedding model loaded successfully`);
            } catch (error) {
                console.error(`Error loading embedding model: ${error}`);
                throw error;
            }
        }
        return this.instance;
    }
}

let EmbeddingPipelineSingleton;

if (process.env.NODE_ENV !== 'production') {
    // When running in development mode, attach the pipeline to the
    // global object so that it's preserved between hot reloads.
    if (!global.EmbeddingPipelineSingleton) {
        global.EmbeddingPipelineSingleton = P();
    }
    EmbeddingPipelineSingleton = global.EmbeddingPipelineSingleton;
} else {
    EmbeddingPipelineSingleton = P();
}

export default EmbeddingPipelineSingleton; 