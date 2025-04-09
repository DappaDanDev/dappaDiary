# NotebookLM Recreation - Development Tasks

This document outlines a clear and logical order of tasks for recreating NotebookLM. The plan integrates backend AI agent orchestration, decentralized storage, and a modern UI built with NextJS and shadcn/ui components.

## 1. Project Setup and Infrastructure
- [ ] Set up a NextJS project with TypeScript support.
- [ ] Configure ESLint, Prettier, and set up a testing framework (e.g., Jest).
- [ ] Create a CI/CD pipeline for automated testing and deployment.

## 2. Core Dependencies Integration
- [ ] **LangGraphJS Integration**
  - [ ] Set up LangGraphJS for orchestrating AI agents (Source Analysis, RAG, Content Transformation, Learning, Podcast Generation).
- [ ] **Lilypad LLM Integration**
  - [ ] Configure Lilypad endpoints for LLM operations (e.g., Llama3 8B for text generation and all-MiniLM-L6-v2 for embeddings).
  - [ ] Implement code snippets for query and embedding generation (refer to Lilypad docs).
- [ ] **Kokoro JS for Podcast Generation**
  - [ ] Integrate kokoro-js TTS using a model like onnx-community/Kokoro-82M-v1.0-ONNX.
  - [ ] Develop tasks for generating, saving, and playing podcast audio files.
- [ ] **Storacha Integration**
  - [ ] Implement decentralized file upload using @web3-storage/w3up-client (ensure proper UCAN delegation).
- [ ] **Recall Integration**
  - [ ] Set up Recall for document storage, versioning, and embedding indexing.
- [ ] **LangChain YouTube Loader Integration**
  - [ ] Integrate YouTube transcript extraction for processing video source content.

## 3. Authentication and User Management
- [ ] Implement a user authentication system (e.g., NextAuth.js or similar).
- [ ] Develop user profile management and access control mechanisms.

## 4. Notebook Management
- [ ] Enable notebook creation, renaming, deletion, and archiving.
- [ ] Design and build the notebook listing/navigation UI using shadcn/ui components in NextJS.

## 5. Source Document Upload and Management
- [ ] Develop a document upload interface with file format validation.
- [ ] Implement metadata extraction and document preview functionality.
- [ ] Enable document listing, organization, and deletion within each notebook.

## 6. Retrieval-Augmented Generation (RAG) System and AI Agent Workflows
- [ ] Set up document indexing and dense embedding generation (via Lilypad and Recall).
- [ ] Implement semantic search across uploaded documents for context-aware AI responses.
- [ ] Develop citation generation linking AI responses to specific source document sections.
- [ ] Integrate all AI agents (Source Analysis, RAG, Content Transformation, Learning) using LangGraphJS tasks.

## 7. Chat Interface and Notebook Guide
- [ ] Create a chat interface for user queries and AI responses using NextJS pages.
  - [ ] Utilize shadcn/ui components to design a modern, user-friendly UI.
  - [ ] Distinguish between user messages and AI messages; enable saving responses as notes.
- [ ] Build a Notebook Guide that automatically generates summaries and extracts key topics.
- [ ] Develop pre-created templates (e.g., FAQ, Briefing Document) for quick content generation.

## 8. Podcast Generation Module
- [ ] Integrate the podcast generation feature via Kokoro JS.
- [ ] Build a UI component to trigger podcast generation, play audio, and allow downloads.
- [ ] Support customization options for voice and duration.

## 9. Testing and Quality Assurance
- [ ] Write unit tests covering AI agents, integrations (Lilypad, Kokoro JS, Storacha, Recall), and UI components.
- [ ] Develop integration tests for API endpoints and user workflows.
- [ ] Conduct performance and load testing on document processing and retrieval functions.

## 10. Deployment and Maintenance
- [ ] Prepare the production environment with appropriate scaling and security configurations.
- [ ] Set up monitoring, logging, and regular backups.
- [ ] Document deployment procedures and maintenance tasks.

## 11. Documentation and Remaining Questions
- [ ] Create comprehensive developer documentation for all integrations (Lilypad, Recall, Kokoro JS, LangGraphJS, Storacha).
- [ ] Write user documentation, guides, and troubleshooting resources.
- [ ] **Remaining Questions:**
  - What are the detailed model parameters, latency, and throughput for Lilypad LLM endpoints?
  - How will Recall handle maximum document sizes, versioning, and access control specifics?
  - What TTS voices are supported by Kokoro JS and what are its limitations?
  - How will task scheduling and concurrency management be handled in LangGraphJS?
  - What error handling and logging mechanisms should be implemented for Storacha file uploads?
  - Which specific shadcn/ui components will be used for the NextJS frontend, and what are the UI/UX design considerations for the Notebook and Chat interfaces?

---
*References:*
- [NextJS Documentation](https://nextjs.org/docs)
- [shadcn/ui Components](https://ui.shadcn.com/)
- Lilypad, Recall, Kokoro JS, LangGraphJS, and Storacha documentation as referenced in the technical specs and PRD. 