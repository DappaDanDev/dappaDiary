# NotebookLM Technical Specification

## 1. Storacha Integration Technical Specification

**Overview**

Our application leverages Storacha's decentralized upload service to store conversation context and document data. Using the delegated integration model, the backend manages a dedicated Space using UCAN delegations, enabling users to upload content directly while ensuring data verifiability via IPFS.

**Key Details:**

1. **API Overview**: 
   - Uses `@web3-storage/w3up-client` for client operations.
   - Methods include client initialization, space creation (`client.addSpace`), setting active space (`client.setCurrentSpace`), delegation creation (`client.createDelegation`), and file uploads (`client.uploadFile` or `client.uploadDirectory`).

2. **Conversation Context Handling**: 
   - Conversation data (e.g., chat logs) is serialized into JSON and uploaded as a file. 
   - The IPFS CID returned ensures the data is retrievable and verifiable.

3. **Performance Considerations**:
   - File chunking and local hashing ensure efficient uploads.
   - Retrieval is subject to decentralized network conditions via IPFS (e.g., using gateways like https://w3s.link/ipfs/<cid>). 

**Example Code Snippet:**

Below is a sample TypeScript implementation illustrating Storacha integration:

```typescript
// storacha-spec.ts
import * as Client from '@web3-storage/w3up-client';
import { StoreMemory } from '@web3-storage/w3up-client/stores/memory';
import * as Proof from '@web3-storage/w3up-client/proof';
import { Signer } from '@web3-storage/w3up-client/principal/ed25519';
import * as DID from '@ipld/dag-ucan/did';

/**
 * Initializes Storacha client, creates a delegation for a given user, and uploads conversation context.
 * @param userDid - The DID of the user to whom upload capabilities are delegated.
 * @param contextData - The conversation context data to be stored (e.g., chat history as JSON).
 * @returns The IPFS CID of the uploaded conversation context.
 */
async function setupStorachaForConversationContext(userDid: string, contextData: object): Promise<string> {
  // Load the client's signing key and create an in-memory store
  const principal = Signer.parse(process.env.STORACHA_KEY!);
  const store = new StoreMemory();
  const client = await Client.create({ principal, store });

  // Parse the UCAN proof from environment variables and add our Space
  const proof = await Proof.parse(process.env.STORACHA_PROOF!);
  const space = await client.addSpace(proof);
  await client.setCurrentSpace(space.did());

  // Create a delegation for the user (delegated approach)
  const audience = DID.parse(userDid);
  const abilities = ['space/blob/add', 'space/index/add', 'upload/add'];
  const expiration = Math.floor(Date.now() / 1000) + 60 * 60 * 24; // 24 hours from now
  const delegation = await client.createDelegation(audience, abilities, { expiration });
  const delegationArchive = await delegation.archive();
  console.log('Delegation created for user:', delegationArchive.ok);

  // Serialize the conversation context data to JSON and create a Blob
  const conversationJson = JSON.stringify(contextData, null, 2);
  const fileBlob = new Blob([conversationJson], { type: 'application/json' });

  // Upload the conversation context file to Storacha
  const cid = await client.uploadFile(fileBlob);
  console.log(`Uploaded conversation context. CID: ${cid}`);
  console.log(`Access via: https://w3s.link/ipfs/${cid}`);
  return cid;
}

// Example usage:
(async () => {
  const userDid = 'did:example:USER123'; // Replace with actual user DID
  const conversationContext = {
    messages: [
      { role: 'user', content: 'Hello, how do I upload my files?' },
      { role: 'assistant', content: 'You can use our upload service powered by Storacha.' }
    ],
    timestamp: new Date().toISOString()
  };
  await setupStorachaForConversationContext(userDid, conversationContext);
})();
```

**References:**

- [Storacha Upload Service on GitHub](https://github.com/storacha/upload-service)
- [Storacha tg-miniapp on GitHub](https://github.com/storacha/tg-miniapp)
- [Storacha Documentation: Architecture Options](https://docs.storacha.network/concepts/architecture-options/)

## 2. Recall Integration Technical Specification

**Overview**

Recall is used for long-term document storage, maintaining a persistent history of documents (such as uploaded sources, chain-of-thought data, and user notes) in a verifiable manner using onchain primitives. This enables agents to audit, share, and improve upon their decision-making processes.

**Key Details:**

1. **Document Versioning and Updates:**  
   - Recall uses immutable onchain records to ensure versioning. Each update to a document creates a new version preserving the change history.

2. **Maximum Document Size and Storage Capacity:**  
   - Document size limits are primarily governed by the underlying bucket storage constraints. Documents larger than the limit can be split into chunks.

3. **Embeddings Storage and Indexing:**  
   - Embedding vectors associated with documents are stored as metadata, indexed for similarity search in RAG pipelines.

**Example Code Snippet:**

```typescript
// recall-spec.ts
import { RecallSDK } from '@recallnet/js-recall';

/**
 * Initializes the Recall SDK with configuration parameters.
 */
function initRecall(): RecallSDK {
  const config = {
    environment: process.env.RECALL_ENV || 'testnet',
    apiKey: process.env.RECALL_API_KEY,
  };
  return new RecallSDK(config);
}

/**
 * Stores a document with associated embedding data in Recall.
 * @param documentId - Unique identifier for the document.
 * @param content - The content of the document.
 * @param embeddings - Array of numbers representing the document's embedding vector.
 * @returns The stored document metadata including the version.
 */
async function storeDocument(documentId: string, content: string, embeddings: number[]): Promise<any> {
  const recall = initRecall();
  const response = await recall.documents.store({
    id: documentId,
    content: content,
    metadata: {
      embeddings: embeddings,
    },
  });
  console.log(`Document stored. Version: ${response.version}`);
  return response;
}

/**
 * Updates an existing document in Recall, creating a new version.
 * @param documentId - Unique identifier for the document.
 * @param newContent - Updated content.
 * @param newEmbeddings - New embedding vector.
 * @returns The updated document metadata.
 */
async function updateDocument(documentId: string, newContent: string, newEmbeddings: number[]): Promise<any> {
  const recall = initRecall();
  const response = await recall.documents.update({
    id: documentId,
    content: newContent,
    metadata: {
      embeddings: newEmbeddings,
    },
  });
  console.log(`Document updated. New version: ${response.version}`);
  return response;
}

// Example usage:
(async () => {
  const docId = 'doc-123';
  const content = 'Original document content.';
  const embeddings = [0.1, 0.2, 0.3, 0.4];
  
  // Store a new document
  await storeDocument(docId, content, embeddings);
  
  // Update the document
  const updatedContent = 'Updated document content.';
  const newEmbeddings = [0.15, 0.25, 0.35, 0.45];
  await updateDocument(docId, updatedContent, newEmbeddings);
})();
```

**References:**

- [Recall.js on GitHub](https://github.com/recallnet/js-recall)
- [Recall Documentation](https://docs.recall.network/)

## 2. Additional Technical Specifications

*Further sections will cover other integrations such as Lilypad for LLM operations, Kokoro JS for audio processing, LangChain YouTube loader for video content processing, and more, following a similar detailed approach.*

## 3. LangGraphJS and Lilypad AI Agents Integration Technical Specification

**Overview**

In NotebookLM, we leverage LangGraphJS to orchestrate AI Agents while delegating LLM operations to Lilypad. Lilypad provides endpoints for both generating embeddings and for generating responses using powerful models like **Llama3 8B**. This integration supports retrieval-augmented generation (RAG) by combining contextual embeddings (using models such as **all-MiniLM-L6-v2**) with response generation from Lilypad.

**Key Details:**

1. **Available LLM Models and Endpoints:**
   - **Llama3 8B:** Used for generating AI-powered responses via the Lilypad API. This endpoint accepts prompts along with context and returns generated text.
   - **all-MiniLM-L6-v2:** Primarily used for generating dense embeddings to enable semantic search in the RAG pipeline.
   - Performance characteristics (latency, throughput) depend on network conditions and the deployed Lilypad instance, but Lilypad is optimized for low-latency AI model calls in supporting AI agents.

2. **Integration with LangGraphJS:**
   - LangGraphJS is used to structure the decision-making and tool-calling workflow of our AI agents. In our integration, we define tasks where, upon receiving a prompt from the user, the agent calls the Lilypad API to generate a response.
   - This integration supports asynchronous streaming of messages and custom retry policies if required.

**Example Code Snippet:**

Below is a TypeScript example demonstrating a LangGraphJS task that calls a custom function to invoke the Lilypad LLM endpoint:

```typescript
// lilypad-integration.ts

/**
 * Calls the Lilypad LLM endpoint to generate a response based on the provided prompt and context.
 * @param query - The combined prompt from agent state (user messages).
 * @param context - Additional context, such as retrieved relevant documents or knowledge base excerpts.
 * @returns The text response generated by the LLM.
 */
async function callLilypadLLM(query: string, context: string): Promise<string> {
  const payload = {
    query, 
    context,
    model: "llama3-8b",
    temperature: 0.7,
    max_tokens: 256
  };

  // The LILYPAD_API_URL and LILYPAD_API_TOKEN are expected to be defined in environment variables
  const response = await fetch(process.env.LILYPAD_API_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.LILYPAD_API_TOKEN}`
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  return result.text || "";
}

// LangGraphJS task to call Lilypad for AI response generation
import { task } from "@langchain/langgraph";

const callLilypadTask = task("callLilypad", async (messages: { content: string }[]) => {
  // Aggregate the messages to form a single prompt
  const prompt = messages.map(m => m.content).join("\n");
  // In a full implementation, additional context could be retrieved from Recall or other sources
  const additionalContext = "Relevant context from the document store or embedding search.";
  const aiResponse = await callLilypadLLM(prompt, additionalContext);
  return { content: aiResponse };
});

export { callLilypadTask };
```

**Explanation:**

- The function `callLilypadLLM` constructs a payload including the prompt, context, and model parameters then sends a POST request to the Lilypad API endpoint.
- The `callLilypadTask` is a LangGraphJS task that aggregates user messages into a prompt and calls our Lilypad API function, returning the response for further processing in our agent workflow.
- This structure allows our AI agents in NotebookLM to dynamically decide which response to generate based on both user input and retrieved context.

**References:**

- [Lilypad Documentation: Use Cases & Agents](https://docs.lilypad.tech/lilypad/use-cases-agents-and-projects/agents/rag-support-agent)
- [LangGraphJS Examples: Stockbroker](https://github.com/bracesproul/langgraphjs-examples/blob/main/stockbroker/README.md)
- [LangGraphJS Examples: Streaming Messages](https://github.com/bracesproul/langgraphjs-examples/blob/main/streaming_messages/README.md)
- [AI Learning Buddy Repository](https://github.com/jamiebones/ai-learning-buddy)

*This integration ensures our AI agents have robust LLM capabilities using Lilypad, enhancing NotebookLM's ability to provide context-aware, verifiable AI responses.*

## 4. Kokoro JS Audio Podcast Generation Technical Specification

**Overview**

In NotebookLM, beyond text-based AI responses, we provide a dynamic audio podcast feature powered by Kokoro JS. This feature transforms summarized content from notebooks into an engaging, AI-generated audio podcast. The integration is orchestrated using LangGraphJS, with a dedicated Podcast Generation Agent that leverages the kokoro-js library to perform text-to-speech synthesis locally.

**Key Details:**

1. **Local TTS Generation:**
   - NotebookLM utilizes the `kokoro-js` library to load a pre-trained TTS model and synthesize speech from combined text input.
   - The TTS model (e.g. `onnx-community/Kokoro-82M-v1.0-ONNX`) performs text-to-speech synthesis locally without relying on an external API.

2. **Integration with LangGraphJS:**
   - The Podcast Generation Agent is implemented as a LangGraphJS task named `generate_podcast`.
   - This agent aggregates user prompts or notebook summaries, synthesizes speech using the kokoro-js library, and saves the generated audio for playback in NotebookLM.

**Example Code Snippet:**

```typescript
// kokoro-podcast-integration.ts

import { KokoroTTS } from "kokoro-js";

/**
 * Generates an audio podcast by synthesizing speech from combined prompt and context.
 * @param prompt - The aggregated prompt or summary for the podcast.
 * @param context - Additional context such as key highlights from NotebookLM content.
 * @param params - Optional parameters, e.g., voice, tone, and duration.
 * @returns The file path of the saved audio podcast.
 */
async function callKokoroPodcastGenerator(prompt: string, context: string, params?: { voice?: string, tone?: string, duration?: number }): Promise<string> {
  const combinedText = prompt + (context ? "\n" + context : "");
  const model_id = "onnx-community/Kokoro-82M-v1.0-ONNX";
  const tts = await KokoroTTS.from_pretrained(model_id, { dtype: "q8", device: "wasm" });
  const voice = params?.voice || "af_heart";
  const audio = await tts.generate(combinedText, { voice });
  
  // Save the generated audio to a local file and return the file path.
  const filePath = "generated_podcast.wav";
  await audio.save(filePath);
  return filePath;
}

// LangGraphJS task for generating an audio podcast.
import { task } from "@langchain/langgraph";

const generatePodcastTask = task("generate_podcast", async (messages: { content: string }[]) => {
  // Aggregate messages to form the podcast script.
  const prompt = messages.map(m => m.content).join("\n");
  const additionalContext = "Additional context or highlights from NotebookLM content.";
  const podcastFilePath = await callKokoroPodcastGenerator(prompt, additionalContext, { duration: 240 });
  return { audioFilePath: podcastFilePath };
});

export { generatePodcastTask };
```

**Explanation:**

- The function `callKokoroPodcastGenerator` combines the prompt and context, loads the Kokoro TTS model using the `kokoro-js` library, synthesizes speech, saves the audio to a file, and returns its file path.
- The LangGraphJS task `generate_podcast` aggregates user messages into a prompt and invokes the TTS function to generate the podcast audio, returning the file path for further processing in NotebookLM.

**References:**

- [Kokoro JS Podcast Maker Example](https://lightning.ai/arkmaster123/studios/kokoro-gradio-podcast-maker?section=featured)
- [LangGraphJS Documentation](https://langchain-ai.github.io/langgraphjs/llms-full.txt)

*This integration empowers NotebookLM with a dynamic audio podcast feature, transforming textual summaries into engaging audio content for enhanced user interaction.*
