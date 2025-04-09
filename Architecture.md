# NotebookLM Recreation Architecture

## System Overview

This architecture document outlines the design for recreating NotebookLM using decentralized storage and AI model infrastructure. The system leverages multiple AI agents, decentralized storage solutions, and specialized services to provide a comprehensive research and note-taking experience.

## Core Components

### 1. AI Agent System (LangGraphJS)

The application will use LangGraphJS to create multiple AI agents, each responsible for specific features of NotebookLM:

- **Source Analysis Agent**: Analyzes uploaded documents to identify type, key topics, and suggest relevant follow-up questions.
- **RAG Agent**: Handles retrieval-augmented generation for contextually relevant responses.
- **Content Transformation Agent**: Transforms selected sources into specific output formats.
- **Podcast Generation Agent**: Coordinates with Kokoro JS to create audio content.
- **Learning Agent**: Generates study guides and suggests related concepts based on user interactions.

These agents will communicate with each other through a structured workflow defined in LangGraphJS, enabling complex multi-agent interactions.

### 2. LLM Infrastructure (Lilypad)

Lilypad will provide the LLM infrastructure for:
- Chat experience
- Embedding generation for RAG
- Content summarization
- Key topic extraction
- Template generation

### 3. Audio Generation (Kokoro JS)

Kokoro JS will be used to:
- Generate AI-powered audio discussions (podcasts)
- Create conversational audio content with multiple AI speakers
- Support customization of audio parameters (tone, audience, focus areas)

### 4. Conversation Storage (Storacha)

Storacha will be used to store:
- Short-term conversation context
- User interactions with the AI
- Session-specific data

### 5. Document Storage and Long-term Memory (Recall)

Recall will be used for:
- Long-term document storage
- Storing indexed representations for RAG
- Maintaining long-term conversation history
- Storing user notes and generated content

### 6. YouTube Integration (LangChain)

LangChain's YouTube loader will be used to:
- Extract transcripts from YouTube videos
- Retrieve metadata from videos
- Process video content for inclusion in notebooks

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           User Interface                                 │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           LangGraphJS Orchestration                      │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
┌───────────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│   Source Analysis     │   │   RAG Agent     │   │  Content        │
│       Agent           │   │                 │   │  Transformation │
└───────────────────────┘   └─────────────────┘   │     Agent       │
                    │               │             └─────────────────┘
                    │               │                     │
                    ▼               ▼                     ▼
┌───────────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│    Learning Agent     │   │  Podcast Gen    │   │  Template Gen   │
└───────────────────────┘   │     Agent       │   │     Agent       │
                    │       └─────────────────┘   └─────────────────┘
                    │               │                     │
                    ▼               ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Lilypad LLM Infrastructure                     │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Kokoro JS Audio Generation                     │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
┌───────────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│      Storacha         │   │     Recall      │   │   LangChain     │
│  (Conversation Storage)│   │  (Document &    │   │  YouTube Loader │
└───────────────────────┘   │   Long-term     │   └─────────────────┘
                            │   Memory)        │
                            └─────────────────┘
```

## Data Flow

1. **Document Upload Flow**:
   - User uploads documents or provides YouTube URLs
   - Source Analysis Agent processes the content
   - Documents are stored in Recall
   - Embeddings are generated using Lilypad and stored in Recall

2. **Query Processing Flow**:
   - User submits a query
   - RAG Agent retrieves relevant content from Recall
   - LLM generates a response using Lilypad
   - Response is stored in Storacha for conversation context

3. **Content Generation Flow**:
   - User requests specific content (podcast, summary, etc.)
   - Content Transformation Agent coordinates with specialized agents
   - For podcasts, Podcast Generation Agent works with Kokoro JS
   - Generated content is stored in Recall

4. **Learning Flow**:
   - Learning Agent analyzes user interactions
   - Generates personalized content (study guides, flashcards)
   - Stores generated content in Recall

## Integration Points

### LangGraphJS and Lilypad
- LangGraphJS agents will call Lilypad for LLM operations
- Structured output schemas will be used for agent communication

### LangGraphJS and Kokoro JS
- Podcast Generation Agent will coordinate with Kokoro JS
- Audio parameters will be passed from the agent to Kokoro JS

### LangGraphJS and Storacha
- Conversation context will be stored and retrieved from Storacha
- Agents will access conversation history for context

### LangGraphJS and Recall
- Document storage and retrieval will use Recall
- Long-term memory and user notes will be stored in Recall

### LangGraphJS and LangChain YouTube Loader
- Source Analysis Agent will use LangChain to process YouTube content
- Transcripts and metadata will be stored in Recall

## Open Questions

1. **Storacha Integration**:
   - What is the specific API for Storacha? How does it handle conversation context?
   - What are the performance characteristics for storing and retrieving conversation data?

2. **Recall Integration**:
   - How does Recall handle document versioning and updates?
   - What is the maximum document size and storage capacity?
   - How are embeddings stored and indexed in Recall?

3. **Kokoro JS**:
   - What are the capabilities and limitations of Kokoro JS for podcast generation?
   - How customizable are the AI speakers and conversation styles?
   - What is the maximum length of generated audio content?

4. **Lilypad**:
   - What LLM models are available through Lilypad?
   - What are the performance characteristics and latency for LLM operations?
   - How are embeddings generated and what models are used?

5. **LangGraphJS**:
   - How are agents scheduled and coordinated?
   - What is the maximum number of concurrent agents?
   - How are agent states persisted between sessions?

6. **YouTube Integration**:
   - Are there rate limits for YouTube transcript extraction?
   - How are videos with disabled captions handled?
   - What is the maximum video length that can be processed?

7. **Security and Privacy**:
   - How is user data protected in the decentralized storage systems?
   - What encryption mechanisms are in place for sensitive documents?
   - How are access controls implemented for shared notebooks?

8. **Scalability**:
   - How does the system handle a large number of concurrent users?
   - What are the bottlenecks in the current architecture?
   - How can the system be scaled horizontally?
