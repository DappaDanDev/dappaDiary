import { 
  StateGraph, 
  Annotation
} from "@langchain/langgraph";
import { OpenAI } from "openai";
import { initStorachaClient } from '../storacha';
import { v4 as uuidv4 } from 'uuid';
import { queryRagAgent, createRagAgent } from '../rag/agents/rag-agent';
import { fal } from "@fal-ai/client";

// Configure fal.ai client with API key (will be set as env var in production)
// In production, this will be set as FAL_KEY environment variable
fal.config({
  credentials: process.env.FAL_KEY || "fal-key-placeholder"
});

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
  private scriptGraph: any;
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
    this.scriptGraph = this.buildScriptOnlyGraph();
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
   * Build a graph for script generation only (no audio)
   */
  private buildScriptOnlyGraph() {
    const workflow = new StateGraph(PodcastStateAnnotation)
      .addNode("generateQuestions", this.generateQuestionsNode.bind(this))
      .addNode("askRagAgent", this.askRagAgentNode.bind(this))
      .addNode("generateScript", this.generateScriptNode.bind(this))
      .addEdge("__start__", "generateQuestions")
      .addEdge("generateQuestions", "askRagAgent")
      .addEdge("askRagAgent", "generateScript")
      .addEdge("generateScript", "__end__");

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
      let allPossibleQuestions = [...STANDARD_PODCAST_QUESTIONS];
      
      // Attempt to generate custom questions, but with strict limits
      if (this.context && this.context.length > 0) {
        try {
          const response = await lilypadClient.chat.completions.create({
            model: "deepseek-r1:7b", // Using DeepSeek model as specified
            messages: [
              {
                role: "system",
                content: "You are a podcast host preparing to interview a guest about a document. Generate 2-3 specific, insightful questions based on the document summary provided."
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
            // Add custom questions to the pool of possible questions
            allPossibleQuestions = [...allPossibleQuestions, ...customQuestions];
          }
        } catch (error) {
          console.warn("[PodcastAgent] Error generating custom questions, using standard ones:", error);
          // Continue with standard questions if custom generation fails
        }
      }
      
      // Select exactly 5 questions
      let finalQuestions: string[] = [];
      
      // Always include the first standard question (what is this document about)
      // as it's the most fundamental
      finalQuestions.push(STANDARD_PODCAST_QUESTIONS[0]);
      
      // Remove the first question from the pool to avoid duplication
      const remainingQuestions = allPossibleQuestions.filter(q => q !== STANDARD_PODCAST_QUESTIONS[0]);
      
      // Randomly select the remaining questions to get a total of 5
      // This ensures a mix of standard and custom questions
      while (finalQuestions.length < 5 && remainingQuestions.length > 0) {
        const randomIndex = Math.floor(Math.random() * remainingQuestions.length);
        finalQuestions.push(remainingQuestions[randomIndex]);
        remainingQuestions.splice(randomIndex, 1);
      }
      
      console.log(`[PodcastAgent] Selected ${finalQuestions.length} questions to ask the RAG Agent`);
      return { 
        questions: finalQuestions,
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
      const failedQuestions: number[] = [];
      
      for (let i = 0; i < state.questions.length; i++) {
        const question = state.questions[i];
        console.log(`[PodcastAgent] Asking RAG Agent: "${question}"`);
        
        try {
          const answer = await queryRagAgent(ragAgent, question);
          console.log(`[PodcastAgent] RAG Agent response: "${answer.substring(0, 100)}..."`);
          answers.push(answer);
        } catch (error) {
          console.error(`[PodcastAgent] Error asking RAG Agent: ${error}`);
          // Record that this question failed
          failedQuestions.push(i);
          // Add error message as the answer
          answers.push(`[Error: Could not retrieve information for this question due to: ${error}]`);
        }
      }
      
      if (failedQuestions.length > 0) {
        console.warn(`[PodcastAgent] ${failedQuestions.length}/${state.questions.length} questions failed.`);
      }
      
      console.log(`[PodcastAgent] Received ${answers.length} answers (${failedQuestions.length} had errors)`);
      
      // If all questions failed, treat it as an error
      if (failedQuestions.length === state.questions.length) {
        throw new Error("All RAG queries failed. Cannot proceed with podcast generation.");
      }
      
      return { 
        answers,
        status: failedQuestions.length > 0 
          ? `RAG Agent queried with ${failedQuestions.length} failed questions` 
          : "RAG Agent queried successfully"
      };
    } catch (error) {
      console.error("[PodcastAgent] Error asking RAG Agent:", error);
      return { 
        error: `Error asking RAG Agent: ${error instanceof Error ? error.message : String(error)}`,
        status: "Error querying RAG Agent",
        answers: []
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
        // Remove any <think> blocks from questions and answers
        const cleanQuestion = question.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        const cleanAnswer = answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        return `Q: ${cleanQuestion}\nA: ${cleanAnswer}`;
      }).join("\n\n");
      
      // Use the model to generate a podcast script
      const response = await lilypadClient.chat.completions.create({
        model: "deepseek-r1:7b", // Using DeepSeek model as specified
        messages: [
          {
            role: "system",
            content: `You are a podcast script writer. Create an engaging 3-minute podcast monologue 
about a document, as if delivered by a single knowledgeable host.

The script should be well-structured with a clear introduction, body covering key points, and conclusion.
Make it conversational, informative, and engaging for listeners.

Do NOT include speaker markers like "HOST:". Just provide the monologue text directly.
IMPORTANT: Do NOT include any "<think>" blocks or internal thought processes in the script. Only include the actual monologue.`
          },
          {
            role: "user",
            content: `Create a podcast monologue script based on the following document summary and Q&A:
            
Document Context:
${state.context.substring(0, 1000)}...

Key Points from Q&A (Treat these as information the host knows):
${qaPairs}

Generate a natural-sounding podcast monologue delivered by a single host. Make sure the script is engaging, conversational, and covers the key points derived from the Q&A above. Limit the script to about 3 minutes of speaking time (about 450-500 words).

IMPORTANT: Do NOT include any "<think>" blocks or speaker markers. Output only the monologue text.`
          }
        ],
        temperature: 0.7,
        max_tokens: 2000, // Podcast script shouldn't be too long
      });
      
      const script = response.choices[0]?.message?.content || "";
      
      // Remove any remaining thinking blocks that might be in the generated script
      const cleanScript = script.replace(/<think>[\s\S]*?<\/think>/g, '')
                               .replace(/<think>[\s\S]*/g, '')
                               .trim();
      
      if (cleanScript.length < 50) {
        throw new Error("Generated script is too short or empty");
      }
      
      console.log(`[PodcastAgent] Successfully generated script of length ${cleanScript.length}`);
      console.log(`[PodcastAgent] Script preview: "${cleanScript.substring(0, 200)}..."`);
      
      return { 
        script: cleanScript,
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
   * Uses fal.ai Kokoro TTS to convert text to speech
   */
  private async generateAudioNode(state: PodcastState): Promise<{audioUrl: string; status: string} | {error: string; status: string; audioUrl: null}> {
    console.log("[PodcastAgent] Generating audio using fal.ai Kokoro TTS");
    
    try {
      // Verify we have a script
      if (!state.script || state.script.length === 0) {
        throw new Error("No script available for audio generation");
      }
      
      // Call the fal.ai Kokoro TTS API
      console.log("[PodcastAgent] Sending script to fal.ai Kokoro TTS API");
      try {
        // Using the exact approach from the fal.ai documentation
        // https://fal.ai/models/fal-ai/kokoro/american-english/api
        const result = await fal.subscribe("fal-ai/kokoro/american-english", {
          input: {
            prompt: state.script,
            voice: "am_adam"
          },
          logs: true,
          onQueueUpdate: (update) => {
            console.log(`[PodcastAgent] TTS status: ${update.status}`);
            if (update.status === "IN_PROGRESS" && update.logs) {
              update.logs.forEach(log => {
                console.log(`[PodcastAgent] TTS log: ${log.message}`);
              });
            }
          }
        });
        
        console.log("[PodcastAgent] TTS generation completed, received result:", result.data);
        
        if (!result.data?.audio?.url) {
          throw new Error("No audio URL received from fal.ai");
        }
        
        const audioUrl = result.data.audio.url;
        console.log(`[PodcastAgent] Successfully generated audio at URL: ${audioUrl}`);
        
        return { 
          audioUrl, 
          status: "Audio generated successfully"
        };
      } catch (apiError) {
        console.error("[PodcastAgent] Error calling fal.ai API:", apiError);
        throw new Error(`fal.ai API error: ${apiError instanceof Error ? apiError.message : String(apiError)}`);
      }
    } catch (error) {
      console.error("[PodcastAgent] Error in audio generation:", error);
      return { 
        error: `Error in audio generation: ${error instanceof Error ? error.message : String(error)}`,
        status: "Error in audio generation",
        audioUrl: null
      };
    }
  }
  
  /**
   * Node for storing the generated audio file using Storacha
   * Updated to handle direct URLs from fal.ai
   */
  private async storeAudioNode(state: PodcastState) {
    console.log("[PodcastAgent] Storing audio reference");
    
    try {
      // Verify we have a script and audioUrl
      if (!state.script || state.script.length === 0) {
        throw new Error("No script available for storage");
      }
      
      if (!state.audioUrl) {
        throw new Error("No audio URL available from fal.ai");
      }
      
      // Generate a title from the first 50 characters of the context
      const contextPreview = this.context.substring(0, 50).trim();
      const title = `Podcast: ${contextPreview}${this.context.length > 50 ? '...' : ''}`;
      
      // Use the podcast-storage service to store the audio metadata
      // Modified to work with a URL instead of audio buffer
      const { storePodcastAudioReference } = await import('./podcast-storage');
      
      // Store the audio reference and get the result
      console.log(`[PodcastAgent] Storing audio reference for URL: ${state.audioUrl}`);
      try {
        const result = await storePodcastAudioReference(
          this.documentId,
          state.audioUrl,
          state.script,
          title
        );
        
        console.log(`[PodcastAgent] Successfully stored audio reference with ID: ${result.id}`);
        
        return { 
          audioUrl: state.audioUrl,
          status: "Audio reference stored successfully",
        };
      } catch (storageError) {
        console.error("[PodcastAgent] Error storing audio reference:", storageError);
        // Even if storage fails, we can still return the audio URL
        return {
          audioUrl: state.audioUrl,
          error: `Warning: Audio reference storage failed: ${storageError instanceof Error ? storageError.message : String(storageError)}`,
          status: "Audio generated but reference storage failed"
        };
      }
    } catch (error) {
      console.error("[PodcastAgent] Error in audio storage node:", error);
      return { 
        error: `Error in audio storage: ${error instanceof Error ? error.message : String(error)}`,
        status: "Error in audio storage",
        audioUrl: state.audioUrl // Pass through any existing URL
      };
    }
  }
  
  /**
   * Generate a podcast for the document (script and audio)
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

  /**
   * Generate only the podcast script, no audio
   * @returns The generated script
   */
  async generatePodcastScript() {
    console.log(`[PodcastAgent] Starting podcast script generation for document ${this.documentId}`);
    
    try {
      // Run the script-only graph
      const result = await this.scriptGraph.invoke({
        documentId: this.documentId,
        context: this.context,
        questions: [],
        answers: [],
        script: "",
        audioUrl: null,
        error: null,
        status: "Starting"
      });
      
      console.log(`[PodcastAgent] Podcast script generation complete with status: ${result.status}`);
      
      return {
        documentId: this.documentId,
        script: result.script,
        error: result.error,
        status: result.status
      };
    } catch (error) {
      console.error(`[PodcastAgent] Error in podcast script generation:`, error);
      return {
        documentId: this.documentId,
        script: "",
        error: `Error in podcast script generation: ${error instanceof Error ? error.message : String(error)}`,
        status: "Error"
      };
    }
  }
} 