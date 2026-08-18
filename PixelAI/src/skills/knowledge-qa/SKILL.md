# Knowledge Q&A Skill

Simple RAG (Retrieval-Augmented Generation) over local documents. Answers user questions grounded in uploaded `.txt`, `.md`, `.json`, and `.csv` files.

## Overview

| Property     | Value                                                                        |
| ------------ | ---------------------------------------------------------------------------- |
| **Name**     | `knowledge-qa`                                                               |
| **Triggers** | from my docs, in my notes, based on, according to my, what do my docs say, search my files, in my documents, from my knowledge |
| **Requires** | Documents in `data/knowledge-base/`; `LLM_API_KEY` for AI-powered answers   |
| **LLM**      | NVIDIA NIM (`meta/llama-3.1-8b-instruct` by default)                        |

## Examples

| User message                                  | Response                                          |
| --------------------------------------------- | ------------------------------------------------- |
| `What do my docs say about project deadlines` | RAG answer grounded in relevant excerpts          |
| `Based on my notes, what is the dosage`       | Answer from matching document chunks              |
| `According to my docs, when is the deadline`  | Answer with source attribution                    |
| `What docs do I have`                         | Lists all files in `data/knowledge-base/`         |
| `List my documents`                           | Lists all files in `data/knowledge-base/`         |
| `From my knowledge, explain X`                | RAG answer if X exists in documents               |

## Setup

1. Place documents in `data/knowledge-base/`:
   ```
   data/knowledge-base/
   ├── project-notes.md
   ├── meeting-notes.txt
   ├── data-export.json
   └── contacts.csv
   ```
2. Supported formats: `.txt`, `.md`, `.json`, `.csv`
3. Set `LLM_API_KEY` in `.env` for AI-powered answers (optional — raw excerpts shown without it)

## How It Works

1. **Document loading** — reads all supported files from `data/knowledge-base/`
2. **Query extraction** — strips trigger phrases (`from my docs`, `in my notes`, etc.) to isolate the actual question
3. **Chunking** — splits documents into 500-character chunks with 100-character overlap, respecting paragraph boundaries
4. **Keyword retrieval** — extracts meaningful keywords (stop words removed), scores each chunk by keyword match density, returns top 3
5. **LLM synthesis** — sends the top chunks as context to NVIDIA NIM with a system prompt that constrains answers to the provided excerpts
6. **Attribution** — appends source file names to the response

## Retrieval Details

- **Chunk size**: 500 characters
- **Overlap**: 100 characters
- **Scoring**: keyword match count / total words in chunk
- **Top K**: 3 most relevant chunks
- **Stop words**: common English words + skill-specific terms (`docs`, `notes`, `files`, etc.)
- **Exact match**: uses word-boundary regex for precise keyword matching

## Listing Documents

Any of these phrases will list all files in the knowledge base:
- `what docs do I have`
- `list my documents`
- `what files are there`
- `show my notes`

## Response Format

### With LLM configured

```
[AI answer grounded in document excerpts]

📄 _Sources: project-notes.md, meeting-notes.txt_
```

### Without LLM (raw excerpts)

```
📄 *Relevant excerpts from your documents:*

--- Excerpt 1 (project-notes.md) ---
[chunk text]

--- Excerpt 2 (meeting-notes.txt) ---
[chunk text]

_LLM not configured — showing raw excerpts. Set LLM_API_KEY for AI-powered answers._
```

## Error Handling

| Condition                 | Message                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| Empty knowledge base      | "Your knowledge base is empty. Add files to `data/knowledge-base/`" |
| No relevant chunks found  | "I couldn't find relevant information in your documents..."        |
| Empty query               | Prompts the user to ask a specific question                        |
| LLM API failure           | Falls back to showing raw excerpts                                 |
| Missing `LLM_API_KEY`     | Shows raw excerpts with setup hint                                 |
| Directory doesn't exist   | Treats as empty knowledge base                                     |

## Environment Variables

| Variable       | Required | Default                                      | Description                   |
| -------------- | -------- | -------------------------------------------- | ----------------------------- |
| `LLM_API_KEY`  | No*      | —                                            | NVIDIA NIM API key            |
| `LLM_API_URL`  | No       | `https://integrate.api.nvidia.com/v1/chat/completions` | LLM endpoint       |
| `LLM_MODEL`    | No       | `meta/llama-3.1-8b-instruct`                | Model to use for answers      |

*Required for AI-powered answers. Raw excerpts are shown without it.

## Limitations

- Keyword-based retrieval (no embeddings or vector search) — works well for exact terms, may miss semantic similarity
- 500-character chunks may split sentences; overlap helps but isn't perfect
- Large files (>100 KB) are fully loaded into memory
- No incremental indexing — documents are read fresh on each query
- JSON files are stringified for chunking; deeply nested structures may not chunk well
