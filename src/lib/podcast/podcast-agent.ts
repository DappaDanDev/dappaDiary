import { 
  StateGraph, 
  Annotation
} from "@langchain/langgraph";
import { OpenAI } from "openai";
import { initStorachaClient } from '../storacha';
import { v4 as uuidv4 } from 'uuid';
import { queryRagAgent, createRagAgent } from '../rag/agents/rag-agent';

// Define standard podcast questions
const STANDARD_PODCAST_QUESTIONS = [
  "What is this document about and why is it important?",
  "What are the most exciting aspects of this topic?",
  "What challenges or controversies exist in this area?",
  "How might this topic evolve in the future?",
  "What practical applications or implications does this have for our audience?"
];

// Initialize Lilypad OpenAI client
const lilypadClient = new OpenAI({
  baseURL: 'https://anura-testnet.lilypad.tech/api/v1',
  apiKey: process.env.ANURA_API_KEY || 'placeholder-key',
});

// State definition using Annotations
const PodcastStateAnnotation = Annotation.Root({
  documentId: Annotation<string>(),
  context: Annotation<string>(),
  questions: Annotation<string[]>(),
  answers: Annotation<string[]>(),
  script: Annotation<string>(),
  audioUrl: Annotation<string | null>(),
  error: Annotation<string | null>(),
  status: Annotation<string>(),
});

// Define type for our state
type PodcastState = {
  documentId: string;
  context: string;
  questions: string[];
  answers: string[];
  script: string;
  audioUrl: string | null;
  error: string | null;
  status: string;
};

/**
 * PodcastAgent generates a podcast based on document content
 * using a LangGraphJS workflow.
 */
export class PodcastAgent {
  private graph: any;
  private documentId: string;
  private context: string;

  /**
   * Creates a new podcast agent for a document
   * @param documentId The document ID
   * @param context The document context/summary
   */
  constructor(documentId: string, context: string) {
    this.documentId = documentId;
    this.context = context;
    this.graph = this.buildGraph();
  }

  /**
   * Build the state graph for podcast generation
   */
  private buildGraph() {
    const workflow = new StateGraph(PodcastStateAnnotation)
      .addNode("generateQuestions", this.generateQuestionsNode.bind(this))
      .addNode("askRagAgent", this.askRagAgentNode.bind(this))
      .addNode("generateScript", this.generateScriptNode.bind(this))
      .addNode("generateAudio", this.generateAudioNode.bind(this))
      .addNode("storeAudio", this.storeAudioNode.bind(this))
      .addEdge("__start__", "generateQuestions")
      .addEdge("generateQuestions", "askRagAgent")
      .addEdge("askRagAgent", "generateScript")
      .addEdge("generateScript", "generateAudio")
      .addEdge("generateAudio", "storeAudio")
      .addEdge("storeAudio", "__end__");

    return workflow.compile();
  }

  /**
   * Node for generating podcast questions
   * This generates questions to ask the RAG Agent about the document
   */
  private async generateQuestionsNode(state: PodcastState) {
    console.log("[PodcastAgent] Generating podcast questions");
    
    try {
      // Start with standard questions
      let questions = [...STANDARD_PODCAST_QUESTIONS];
      
      // Add document-specific questions using the model
      if (this.context && this.context.length > 0) {
        try {
          const response = await lilypadClient.chat.completions.create({
            model: "deepseek-r1:7b", // Using DeepSeek model as specified
            messages: [
              {
                role: "system",
                content: "You are a podcast host preparing to interview a guest about a document. Generate 3 additional specific, insightful questions based on the document summary provided."
              },
              {
                role: "user",
                content: `Document summary: ${this.context.substring(0, 2000)}` // Limit context length
              }
            ],
            temperature: 0.7,
          });

          // Extract custom questions from the response
          const customQuestionsText = response.choices[0]?.message?.content || "";
          const customQuestions = customQuestionsText
            .split(/\d+\.\s+/) // Split by numbered list format
            .filter(q => q.trim().length > 10 && q.includes("?")) // Filter out non-questions
            .map(q => q.trim());

          if (customQuestions.length > 0) {
            console.log(`[PodcastAgent] Generated ${customQuestions.length} custom questions`);
            questions = [...questions, ...customQuestions];
          }
        } catch (error) {
          console.warn("[PodcastAgent] Error generating custom questions, using standard ones:", error);
          // Continue with standard questions if custom generation fails
        }
      }
      
      console.log(`[PodcastAgent] Will ask ${questions.length} questions to the RAG Agent`);
      return { 
        questions,
        status: "Questions generated"
      };
    } catch (error) {
      console.error("[PodcastAgent] Error generating questions:", error);
      return { 
        error: `Error generating questions: ${error instanceof Error ? error.message : String(error)}`,
        status: "Error in question generation"
      };
    }
  }
  
  /**
   * Node for asking questions to the RAG Agent
   * This simulates a user querying the RAG Agent about the document
   */
  private async askRagAgentNode(state: PodcastState) {
    console.log("[PodcastAgent] Asking questions to RAG Agent");
    
    try {
      if (!state.questions || state.questions.length === 0) {
        throw new Error("No questions available to ask");
      }
      
      // Create RAG agent for the document
      const ragAgent = createRagAgent(this.documentId);
      
      // Ask each question to the RAG agent
      const answers: string[] = [];
      for (const question of state.questions) {
        console.log(`[PodcastAgent] Asking RAG Agent: "${question}"`);
        try {
          const answer = await queryRagAgent(ragAgent, question);
          console.log(`[PodcastAgent] RAG Agent response: "${answer.substring(0, 100)}..."`);
          answers.push(answer);
        } catch (error) {
          console.error(`[PodcastAgent] Error asking RAG Agent: ${error}`);
          answers.push(`[Error: Could not get an answer for this question due to: ${error}]`);
        }
      }
      
      console.log(`[PodcastAgent] Received ${answers.length} answers from RAG Agent`);
      
      return { 
        answers,
        status: "RAG Agent queried successfully"
      };
    } catch (error) {
      console.error("[PodcastAgent] Error asking RAG Agent:", error);
      return { 
        error: `Error asking RAG Agent: ${error instanceof Error ? error.message : String(error)}`,
        status: "Error querying RAG Agent"
      };
    }
  }
  
  /**
   * Node for generating the podcast script
   * Uses the questions and answers to create an engaging script
   */
  private async generateScriptNode(state: PodcastState) {
    console.log("[PodcastAgent] Generating podcast script");
    
    try {
      // Verify we have questions and answers
      if (!state.questions || state.questions.length === 0 || !state.answers || state.answers.length === 0) {
        throw new Error("Questions or answers are missing for script generation");
      }
      
      // Format Q&A for the script generation
      const qaPairs = state.questions.map((question, index) => {
        const answer = state.answers[index] || "No answer available for this question.";
        return `Q: ${question}\nA: ${answer}`;
      }).join("\n\n");
      
      // Use the model to generate a podcast script
      const response = await lilypadClient.chat.completions.create({
        model: "deepseek-r1:7b", // Using DeepSeek model as specified
        messages: [
          {
            role: "system",
            content: `You are a podcast script writer. Create an engaging 3-minute podcast conversation 
between a HOST and a GUEST about a document. The script should be formatted with 
"HOST:" and "GUEST:" prefixes for each line of dialogue.

The host should be a knowledgeable interviewer who asks insightful questions.
The guest should be an expert on the topic who provides detailed answers.

Format the script exactly like this example:
HOST: Welcome to our podcast! Today we're discussing [topic]. I'm your host, and I'm joined by our expert guest.
GUEST: Thanks for having me! I'm excited to talk about [topic] today.
HOST: [Question]
GUEST: [Answer]

The script should be well-structured with a clear introduction, body with several Q&A exchanges, and conclusion.
Make it conversational, informative, and engaging for listeners.`
          },
          {
            role: "user",
            content: `Create a podcast script based on the following document summary and Q&A:
            
Document Context:
${this.context.substring(0, 1000)}...

Questions and Answers:
${qaPairs}

Generate a natural-sounding podcast script with a HOST and GUEST. Make sure the script is engaging, conversational, and covers the key points from the Q&A above. Limit the script to about 3 minutes of speaking time (about 450-500 words).`
          }
        ],
        temperature: 0.7,
        max_tokens: 2000, // Podcast script shouldn't be too long
      });
      
      const script = response.choices[0]?.message?.content || "";
      
      if (script.length < 50) {
        throw new Error("Generated script is too short or empty");
      }
      
      console.log(`[PodcastAgent] Successfully generated script of length ${script.length}`);
      console.log(`[PodcastAgent] Script preview: "${script.substring(0, 200)}..."`);
      
      return { 
        script,
        status: "Script generated successfully"
      };
    } catch (error) {
      console.error("[PodcastAgent] Error generating script:", error);
      return { 
        error: `Error generating script: ${error instanceof Error ? error.message : String(error)}`,
        status: "Error in script generation"
      };
    }
  }
  
  /**
   * Node for generating audio from the podcast script
   * This uses Kokoro JS for text-to-speech conversion
   */
  private async generateAudioNode(state: PodcastState) {
    console.log("[PodcastAgent] Generating audio from script");
    
    try {
      // Verify we have a script
      if (!state.script || state.script.length === 0) {
        throw new Error("No script available for audio generation");
      }
      
      // Use the kokoro-service to generate audio
      const { generatePodcastAudio } = await import('./kokoro-service');
      
      // Generate audio from the script
      const audioBuffer = await generatePodcastAudio(state.script);
      
      if (!audioBuffer || audioBuffer.length === 0) {
        throw new Error("Failed to generate audio - received empty buffer");
      }
      
      console.log(`[PodcastAgent] Successfully generated audio of size ${audioBuffer.length} bytes`);
      
      return { 
        status: "Audio generated successfully",
      };
    } catch (error) {
      console.error("[PodcastAgent] Error generating audio:", error);
      return { 
        error: `Error generating audio: ${error instanceof Error ? error.message : String(error)}`,
        status: "Error in audio generation",
      };
    }
  }
  
  /**
   * Node for storing the generated audio file using Storacha
   */
  private async storeAudioNode(state: PodcastState) {
    console.log("[PodcastAgent] Storing audio file");
    
    try {
      // Verify we have a script
      if (!state.script || state.script.length === 0) {
        throw new Error("No script available for storage");
      }
      
      // Use the kokoro-service to generate audio if not already done
      const { generatePodcastAudio } = await import('./kokoro-service');
      const audioBuffer = await generatePodcastAudio(state.script);
      
      if (!audioBuffer || audioBuffer.length === 0) {
        throw new Error("Failed to generate audio for storage - received empty buffer");
      }
      
      // Use the podcast-storage service to store the audio
      const { storePodcastAudio } = await import('./podcast-storage');
      
      // Generate a title from the first 50 characters of the context
      const contextPreview = this.context.substring(0, 50).trim();
      const title = `Podcast: ${contextPreview}${this.context.length > 50 ? '...' : ''}`;
      
      // Store the audio and get the CID
      const result = await storePodcastAudio(
        this.documentId,
        audioBuffer,
        state.script,
        title
      );
      
      console.log(`[PodcastAgent] Successfully stored audio with CID: ${result.audioCid}`);
      
      // Get the audio URL
      const audioUrl = `https://w3s.link/ipfs/${result.audioCid}`;
      
      return { 
        audioUrl,
        status: "Audio stored successfully",
      };
    } catch (error) {
      console.error("[PodcastAgent] Error storing audio:", error);
      return { 
        error: `Error storing audio: ${error instanceof Error ? error.message : String(error)}`,
        status: "Error in audio storage",
        audioUrl: null
      };
    }
  }
  
  /**
   * Generate a podcast for the document
   * @returns The generated podcast
   */
  async generatePodcast() {
    console.log(`[PodcastAgent] Starting podcast generation for document ${this.documentId}`);
    
    try {
      // Run the graph
      const result = await this.graph.invoke({
        documentId: this.documentId,
        context: this.context,
        questions: [],
        answers: [],
        script: "",
        audioUrl: null,
        error: null,
        status: "Starting"
      });
      
      console.log(`[PodcastAgent] Podcast generation complete with status: ${result.status}`);
      
      return {
        documentId: this.documentId,
        script: result.script,
        audioUrl: result.audioUrl,
        error: result.error,
        status: result.status
      };
    } catch (error) {
      console.error(`[PodcastAgent] Error in podcast generation:`, error);
      return {
        documentId: this.documentId,
        script: "",
        audioUrl: null,
        error: `Error in podcast generation: ${error instanceof Error ? error.message : String(error)}`,
        status: "Error"
      };
    }
  }
} 