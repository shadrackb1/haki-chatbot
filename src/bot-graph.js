import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

class BotGraph {
  constructor(projectRoot) {
    this.projectRoot = projectRoot || path.join(__dirname, '..');
    this.nodes = new Map();
    this.edges = new Map();
    this.tools = new Map();
    this.folders = new Map();
    this.currentNode = 'root';
    this.path = ['root'];
    this.navigationHistory = [];
    this.scanProjectStructure();
  }

  scanProjectStructure() {
    try {
      this.buildNode('root', { type: 'project', name: 'Haki Agri-Shield', parent: null });
      this.buildNode('src', { type: 'folder', name: 'src', parent: 'root' });
      this.buildNode('data', { type: 'folder', name: 'data', parent: 'root' });
      this.buildNode('config', { type: 'folder', name: 'config', parent: 'root' });
      this.buildNode('test', { type: 'folder', name: 'test', parent: 'root' });
      this.buildNode('docs', { type: 'folder', name: 'docs', parent: 'root' });
      this.buildNode('logs', { type: 'folder', name: 'logs', parent: 'root' });
      this.buildNode('temp', { type: 'folder', name: 'temp', parent: 'root' });

      const srcDir = path.join(this.projectRoot, 'src');
      if (fs.existsSync(srcDir)) {
        fs.readdirSync(srcDir).forEach(file => {
          if (file.endsWith('.js')) {
            const nodePath = `src/${file}`;
            const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
            const exports = this.extractExports(content);
            const requires = this.extractRequires(content);
            const functions = this.extractFunctions(content);

            this.buildNode(nodePath, {
              type: 'module',
              name: file,
              parent: 'src',
              exports,
              requires,
              functions,
              lines: content.split('\n').length,
              size: Buffer.byteLength(content)
            });

            requires.forEach(req => {
              const reqPath = this.resolveRequire(req, 'src');
              if (reqPath) {
                this.addEdge(nodePath, reqPath, 'requires');
              }
            });
          }
        });
      }

      const dataDir = path.join(this.projectRoot, 'data');
      if (fs.existsSync(dataDir)) {
        fs.readdirSync(dataDir).forEach(file => {
          const nodePath = `data/${file}`;
          this.buildNode(nodePath, {
            type: 'data',
            name: file,
            parent: 'data',
            size: fs.statSync(path.join(dataDir, file)).size
          });
        });
      }

      this.buildTool('whatsapp-send', {
        type: 'action',
        name: 'Send WhatsApp Message',
        description: 'Send a message to a WhatsApp user',
        module: 'src/handlers/message.js'
      });
      this.buildTool('whatsapp-media', {
        type: 'action',
        name: 'Send Media',
        description: 'Send image, audio, or document',
        module: 'src/handlers/message.js'
      });
      this.buildTool('voice-transcribe', {
        type: 'process',
        name: 'Voice Transcription',
        description: 'Convert voice message to text',
        module: 'src/services/voice-processor.js'
      });
      this.buildTool('image-analyze', {
        type: 'process',
        name: 'Image Analysis',
        description: 'Analyze image for evidence',
        module: 'src/handlers/image-message.js'
      });
      this.buildTool('llm-query', {
        type: 'process',
        name: 'LLM Query',
        description: 'Query the language model',
        module: 'src/llm-reasoning.js'
      });
      this.buildTool('rag-search', {
        type: 'process',
        name: 'Legal RAG Search',
        description: 'Search legal knowledge base',
        module: 'src/knowledge-retriever.js'
      });
      this.buildTool('violation-classify', {
        type: 'process',
        name: 'Violation Classification',
        description: 'Classify user message for violations',
        module: 'src/violation-classifier.js'
      });
      this.buildTool('history-log', {
        type: 'storage',
        name: 'Conversation History',
        description: 'Log conversation to file',
        module: 'src/handlers/conversation-history.js'
      });
      this.buildTool('health-check', {
        type: 'monitor',
        name: 'Health Check',
        description: 'Check bot health status',
        module: 'src/index.js'
      });
      this.buildTool('qr-display', {
        type: 'display',
        name: 'QR Code Display',
        description: 'Display QR code for authentication',
        module: 'src/index.js'
      });

      this.addEdge('root', 'src', 'contains');
      this.addEdge('root', 'data', 'contains');
      this.addEdge('root', 'config', 'contains');
      this.addEdge('root', 'test', 'contains');
      this.addEdge('root', 'docs', 'contains');
      this.addEdge('root', 'logs', 'contains');

      this.buildNode('welcome-flow', { type: 'flow', name: 'Welcome Flow', parent: 'root' });
      this.buildNode('voice-flow', { type: 'flow', name: 'Voice Flow', parent: 'root' });
      this.buildNode('image-flow', { type: 'flow', name: 'Image Flow', parent: 'root' });
      this.buildNode('text-flow', { type: 'flow', name: 'Text Flow', parent: 'root' });
      this.buildNode('fallback-flow', { type: 'flow', name: 'Fallback Flow', parent: 'root' });
      this.buildNode('violation-flow', { type: 'flow', name: 'Violation Flow', parent: 'root' });

      this.addEdge('welcome-flow', 'src/index.js', 'triggers');
      this.addEdge('voice-flow', 'src/services/voice-processor.js', 'triggers');
      this.addEdge('image-flow', 'src/handlers/image-message.js', 'triggers');
      this.addEdge('text-flow', 'src/handlers/message.js', 'triggers');
      this.addEdge('violation-flow', 'src/violation-classifier.js', 'triggers');
      this.addEdge('violation-flow', 'src/knowledge-retriever.js', 'triggers');
      this.addEdge('violation-flow', 'src/llm-reasoning.js', 'triggers');

    } catch (err) {
      console.error('[BotGraph] Scan error:', err.message);
    }
  }

  buildNode(id, data) {
    this.nodes.set(id, { id, ...data, created: Date.now() });
    if (!this.edges.has(id)) this.edges.set(id, []);
  }

  buildTool(id, data) {
    this.tools.set(id, { id, ...data, created: Date.now() });
  }

  addEdge(from, to, type) {
    if (!this.edges.has(from)) this.edges.set(from, []);
    this.edges.get(from).push({ to, type, created: Date.now() });
  }

  extractExports(content) {
    const exports = [];
    const patterns = [
      /module\.exports\s*=\s*(\w+)/g,
      /exports\.(\w+)\s*=/g,
      /module\.exports\s*=\s*\{([^}]+)\}/g
    ];
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1]) exports.push(match[1].trim());
      }
    });
    return [...new Set(exports)];
  }

  extractRequires(content) {
    const requires = [];
    const pattern = /require\(['"]([^'"]+)['"]\)/g;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      requires.push(match[1]);
    }
    return requires;
  }

  extractFunctions(content) {
    const functions = [];
    const patterns = [
      /function\s+(\w+)\s*\(/g,
      /(\w+)\s*:\s*function\s*\(/g,
      /(\w+)\s*\([^)]*\)\s*\{/g,
      /async\s+function\s+(\w+)/g
    ];
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && !['if', 'for', 'while', 'switch', 'catch', 'require'].includes(match[1])) {
          functions.push(match[1]);
        }
      }
    });
    return [...new Set(functions)];
  }

  resolveRequire(req, fromDir) {
    if (req.startsWith('.')) {
      const resolved = path.join(fromDir, req).replace(/\\/g, '/');
      const candidates = [
        `${resolved}.js`,
        `${resolved}/index.js`,
        resolved
      ];
      for (const c of candidates) {
        if (this.nodes.has(c)) return c;
      }
    }
    return null;
  }

  navigate(nodeId) {
    if (this.nodes.has(nodeId)) {
      this.currentNode = nodeId;
      this.path.push(nodeId);
      this.navigationHistory.push({
        from: this.path[this.path.length - 2],
        to: nodeId,
        timestamp: Date.now()
      });
      return this.nodes.get(nodeId);
    }
    return null;
  }

  navigateUp() {
    if (this.path.length > 1) {
      this.path.pop();
      this.currentNode = this.path[this.path.length - 1];
      return this.nodes.get(this.currentNode);
    }
    return null;
  }

  getCurrentNode() {
    return this.nodes.get(this.currentNode);
  }

  getChildNodes(nodeId) {
    const children = [];
    const edges = this.edges.get(nodeId || this.currentNode) || [];
    edges.forEach(edge => {
      if (this.nodes.has(edge.to)) {
        children.push(this.nodes.get(edge.to));
      }
    });
    return children;
  }

  getParentNode(nodeId) {
    const node = this.nodes.get(nodeId || this.currentNode);
    if (node && node.parent) {
      return this.nodes.get(node.parent);
    }
    return null;
  }

  findNode(query) {
    const q = query.toLowerCase();
    const results = [];
    this.nodes.forEach((node, id) => {
      if (id.toLowerCase().includes(q) ||
          (node.name && node.name.toLowerCase().includes(q)) ||
          (node.type && node.type.toLowerCase().includes(q))) {
        results.push(node);
      }
    });
    return results;
  }

  findTool(query) {
    const q = query.toLowerCase();
    const results = [];
    this.tools.forEach((tool, id) => {
      if (id.toLowerCase().includes(q) ||
          (tool.name && tool.name.toLowerCase().includes(q)) ||
          (tool.description && tool.description.toLowerCase().includes(q))) {
        results.push(tool);
      }
    });
    return results;
  }

  getDependencyGraph(nodeId) {
    const visited = new Set();
    const graph = [];

    const traverse = (id, depth = 0) => {
      if (visited.has(id) || depth > 5) return;
      visited.add(id);

      const edges = this.edges.get(id) || [];
      edges.forEach(edge => {
        if (edge.type === 'requires') {
          graph.push({ from: id, to: edge.to, depth });
          traverse(edge.to, depth + 1);
        }
      });
    };

    traverse(nodeId);
    return graph;
  }

  getReachableTools(nodeId) {
    const reachable = [];
    const visited = new Set();

    const traverse = (id, depth = 0) => {
      if (visited.has(id) || depth > 3) return;
      visited.add(id);

      const edges = this.edges.get(id) || [];
      edges.forEach(edge => {
        if (this.tools.has(edge.to)) {
          reachable.push(this.tools.get(edge.to));
        }
        traverse(edge.to, depth + 1);
      });
    };

    traverse(nodeId);
    return reachable;
  }

  getIntelligentResponse(query) {
    const q = query.toLowerCase();
    const results = {
      nodes: this.findNode(q),
      tools: this.findTool(q),
      suggestions: []
    };

    if (q.includes('navigate') || q.includes('go to') || q.includes('open')) {
      results.suggestions.push('Use navigate() to move between folders');
    }
    if (q.includes('find') || q.includes('search') || q.includes('look')) {
      results.suggestions.push('Use findNode() to search the project structure');
    }
    if (q.includes('tool') || q.includes('use') || q.includes('run')) {
      results.suggestions.push('Use findTool() to locate available tools');
    }
    if (q.includes('depend') || q.includes('require') || q.includes('import')) {
      results.suggestions.push('Use getDependencyGraph() to trace dependencies');
    }
    if (q.includes('what') || q.includes('describe') || q.includes('explain')) {
      const current = this.getCurrentNode();
      results.suggestions.push(`Currently at: ${current?.name || 'root'}`);
    }

    return results;
  }

  getGraphSummary() {
    return {
      totalNodes: this.nodes.size,
      totalEdges: this.edges.size,
      totalTools: this.tools.size,
      currentNode: this.currentNode,
      path: this.path,
      nodeTypes: this.countByType(),
      navigationHistory: this.navigationHistory.slice(-10)
    };
  }

  countByType() {
    const counts = {};
    this.nodes.forEach(node => {
      counts[node.type] = (counts[node.type] || 0) + 1;
    });
    return counts;
  }

  toMermaid() {
    const lines = ['graph TD'];
    this.edges.forEach((edges, from) => {
      edges.forEach(edge => {
        const fromNode = this.nodes.get(from);
        const toNode = this.nodes.get(edge.to);
        if (fromNode && toNode) {
          const fromLabel = (fromNode.name || from).replace(/[^a-zA-Z0-9]/g, '_');
          const toLabel = (toNode.name || edge.to).replace(/[^a-zA-Z0-9]/g, '_');
          lines.push(`  ${fromLabel}-->|${edge.type}|${toLabel}`);
        }
      });
    });
    return lines.join('\n');
  }

  toJSON() {
    const nodesObj = {};
    this.nodes.forEach((v, k) => { nodesObj[k] = v; });

    const edgesObj = {};
    this.edges.forEach((v, k) => { edgesObj[k] = v; });

    const toolsObj = {};
    this.tools.forEach((v, k) => { toolsObj[k] = v; });

    return {
      nodes: nodesObj,
      edges: edgesObj,
      tools: toolsObj,
      current: this.currentNode,
      path: this.path
    };
  }
}

export default BotGraph;
