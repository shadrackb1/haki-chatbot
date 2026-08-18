import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');
const CONVERSATION_LOGS_FILE = path.join(DATA_DIR, 'conversation-logs.json');
const USER_PROFILES_FILE = path.join(DATA_DIR, 'user-profiles.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

class ConversationManager {
    constructor() {
        this.chats = this.loadChats();
        this.conversationLogs = this.loadConversationLogs();
        this.userProfiles = this.loadUserProfiles();
        this.conversationStates = new Map();
    }

    // Load/save methods
    loadChats() {
        try {
            if (fs.existsSync(CHATS_FILE)) {
                return JSON.parse(fs.readFileSync(CHATS_FILE, 'utf8'));
            }
        } catch (e) { console.log('⚠️ Could not load chats'); }
        return {};
    }

    saveChats() {
        try {
            fs.writeFileSync(CHATS_FILE, JSON.stringify(this.chats, null, 2), 'utf8');
        } catch (e) { console.log('⚠️ Could not save chats:', e.message); }
    }

    loadConversationLogs() {
        try {
            if (fs.existsSync(CONVERSATION_LOGS_FILE)) {
                return JSON.parse(fs.readFileSync(CONVERSATION_LOGS_FILE, 'utf8'));
            }
        } catch (e) { console.log('⚠️ Could not load conversation logs'); }
        return {};
    }

    saveConversationLogs() {
        try {
            fs.writeFileSync(CONVERSATION_LOGS_FILE, JSON.stringify(this.conversationLogs, null, 2), 'utf8');
        } catch (e) { console.log('⚠️ Could not save conversation logs:', e.message); }
    }

    loadUserProfiles() {
        try {
            if (fs.existsSync(USER_PROFILES_FILE)) {
                return JSON.parse(fs.readFileSync(USER_PROFILES_FILE, 'utf8'));
            }
        } catch (e) { console.log('⚠️ Could not load user profiles'); }
        return {};
    }

    saveUserProfiles() {
        try {
            fs.writeFileSync(USER_PROFILES_FILE, JSON.stringify(this.userProfiles, null, 2), 'utf8');
        } catch (e) { console.log('⚠️ Could not save user profiles:', e.message); }
    }

    // Clean phone number for consistent key usage
    cleanPhoneNumber(phoneNumber) {
        let cleaned = phoneNumber.replace(/\D/g, '');
        if (!cleaned.startsWith('1') && cleaned.length === 10) {
            cleaned = '1' + cleaned;
        }
        return cleaned;
    }

    // Get chat key (chatId + optional senderId for group participant tracking)
    getChatKey(chatId, senderId = null, isGroup = false) {
        // For groups, we track both the group chat and individual participants
        if (isGroup && senderId) {
            return `${chatId}:participant:${this.cleanPhoneNumber(senderId)}`;
        }
        return chatId;
    }

    // Get or create chat context
    getChat(chatId, options = {}) {
        const { isGroup = false, senderId = null, senderName = null } = options;
        const chatKey = this.getChatKey(chatId, senderId, isGroup);
        
        if (!this.chats[chatKey]) {
            this.chats[chatKey] = {
                chatId,
                isGroup,
                senderId: isGroup ? this.cleanPhoneNumber(senderId) : null,
                senderName,
                isNewChat: true,
                language: 'en',
                conversationCount: 0,
                firstSeen: new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                preferences: {
                    responseLength: 'medium',
                    intellectualDepth: 'adaptive'
                },
                context: {
                    lastIntent: null,
                    lastTopics: [],
                    pendingThread: null,
                    conversationSummary: '',
                    conversationHistory: []
                }
            };
            this.saveChats();
        } else {
            this.chats[chatKey].lastSeen = new Date().toISOString();
            this.chats[chatKey].conversationCount++;
            if (senderName && !this.chats[chatKey].senderName) {
                this.chats[chatKey].senderName = senderName;
            }
            this.saveChats();
        }
        
        return this.chats[chatKey];
    }

    // Get chat context for LLM (enriched with user profile)
    getChatContext(chatId, options = {}) {
        const { isGroup = false, senderId = null, senderName = null } = options;
        const chat = this.getChat(chatId, options);
        const profile = this.getUserProfile(chatId, senderId, isGroup);
        
        return {
            chatId,
            isGroup,
            senderId: isGroup ? this.cleanPhoneNumber(senderId) : null,
            senderName: senderName || chat.senderName || 'friend',
            name: senderName || chat.senderName || profile.name || 'friend',
            language: chat.language,
            isNewChat: chat.isNewChat,
            conversationCount: chat.conversationCount,
            preferences: chat.preferences,
            profile: {
                interests: profile.interests || [],
                communicationStyle: profile.communicationStyle || 'casual',
                knownFacts: profile.knownFacts || [],
                topicsDiscussed: profile.topicsDiscussed || {},
                totalConversations: profile.conversationCount || 0
            },
            context: chat.context
        };
    }

    // Update chat context
    updateChatContext(chatId, updates, options = {}) {
        const { isGroup = false, senderId = null } = options;
        const chatKey = this.getChatKey(chatId, senderId, isGroup);
        if (this.chats[chatKey]) {
            this.chats[chatKey].context = {
                ...this.chats[chatKey].context,
                ...updates
            };
            this.saveChats();
        }
    }

    // Get user profile (global, shared across chats)
    getUserProfile(chatId, senderId = null, isGroup = false) {
        // For groups, try to get participant-specific profile first
        if (isGroup && senderId) {
            const participantKey = `participant:${this.cleanPhoneNumber(senderId)}`;
            if (this.userProfiles[participantKey]) {
                return this.userProfiles[participantKey];
            }
        }
        
        // Fall back to chat-level profile or global
        const chatKey = isGroup ? `group:${chatId}` : chatId;
        return this.userProfiles[chatKey] || this.userProfiles.global || {};
    }

    // Update user profile (called by LLM engine)
    updateUserProfile(chatId, profileUpdates, options = {}) {
        const { isGroup = false, senderId = null } = options;
        
        let profileKey;
        if (isGroup && senderId) {
            profileKey = `participant:${this.cleanPhoneNumber(senderId)}`;
        } else if (isGroup) {
            profileKey = `group:${chatId}`;
        } else {
            profileKey = chatId;
        }
        
        const existing = this.userProfiles[profileKey] || {
            name: null,
            interests: [],
            communicationStyle: 'casual',
            knownFacts: [],
            topicsDiscussed: {},
            conversationCount: 0
        };
        
        this.userProfiles[profileKey] = { ...existing, ...profileUpdates };
        this.saveUserProfiles();
    }

    // Update last seen
    updateLastSeen(chatId, options = {}) {
        const { isGroup = false, senderId = null } = options;
        const chat = this.getChat(chatId, options);
        chat.lastSeen = new Date().toISOString();
        chat.conversationCount++;
        this.saveChats();
    }

    // Mark as returning
    markAsReturning(chatId, options = {}) {
        const { isGroup = false, senderId = null } = options;
        const chat = this.getChat(chatId, options);
        chat.isNewChat = false;
        this.saveChats();
    }

    // Conversation state management
    getState(chatId, options = {}) {
        const { isGroup = false, senderId = null } = options;
        const chatKey = this.getChatKey(chatId, senderId, isGroup);
        return this.conversationStates.get(chatKey) || {
            step: 'active',
            data: {},
            threadTopics: [],
            depth: 'surface'
        };
    }

    setState(chatId, state, options = {}) {
        const { isGroup = false, senderId = null } = options;
        const chatKey = this.getChatKey(chatId, senderId, isGroup);
        this.conversationStates.set(chatKey, state);
    }

    clearState(chatId, options = {}) {
        const { isGroup = false, senderId = null } = options;
        const chatKey = this.getChatKey(chatId, senderId, isGroup);
        this.conversationStates.delete(chatKey);
    }

    // Add to conversation history
    addToHistory(chatId, role, content, options = {}) {
        const { isGroup = false, senderId = null } = options;
        const chat = this.getChat(chatId, options);
        const timestamp = new Date().toISOString();
        
        // Chat-specific history
        if (!chat.context.conversationHistory) {
            chat.context.conversationHistory = [];
        }
        chat.context.conversationHistory.push({ 
            role, 
            content, 
            timestamp,
            senderId: isGroup ? this.cleanPhoneNumber(senderId) : null
        });
        if (chat.context.conversationHistory.length > 50) {
            chat.context.conversationHistory.shift();
        }
        this.saveChats();
        
        // Global conversation logs (for analysis)
        const logKey = this.getChatKey(chatId, senderId, isGroup);
        if (!this.conversationLogs[logKey]) {
            this.conversationLogs[logKey] = [];
        }
        this.conversationLogs[logKey].push({ 
            role, 
            content, 
            timestamp,
            isGroup,
            senderId: isGroup ? this.cleanPhoneNumber(senderId) : null
        });
        if (this.conversationLogs[logKey].length > 100) {
            this.conversationLogs[logKey].shift();
        }
        this.saveConversationLogs();
    }

    // Get conversation history for LLM context
    getConversationHistory(chatId, limit = 30, options = {}) {
        const { isGroup = false, senderId = null } = options;
        const chat = this.getChat(chatId, options);
        
        if (chat && chat.context.conversationHistory) {
            return chat.context.conversationHistory.slice(-limit);
        }
        return [];
    }

    // Get full conversation for analysis
    getFullConversation(chatId, options = {}) {
        const { isGroup = false, senderId = null } = options;
        const logKey = this.getChatKey(chatId, senderId, isGroup);
        return this.conversationLogs[logKey] || [];
    }

    // Generate conversation summary for context
    generateConversationSummary(chatId, options = {}) {
        const { isGroup = false, senderId = null } = options;
        const history = this.getFullConversation(chatId, options);
        if (history.length < 5) return '';
        
        const recentTopics = history
            .slice(-10)
            .filter(h => h.role === 'user')
            .map(h => h.content.substring(0, 100))
            .join('; ');
        
        return `Recent topics: ${recentTopics}`;
    }

    // Get chat stats
    getChatStats(chatId, options = {}) {
        const { isGroup = false, senderId = null } = options;
        const chat = this.getChat(chatId, options);
        const profile = this.getUserProfile(chatId, senderId, isGroup);
        
        return {
            isNewChat: chat.isNewChat,
            conversationCount: chat.conversationCount,
            firstSeen: chat.firstSeen,
            lastSeen: chat.lastSeen,
            messageCount: chat.context.conversationHistory?.length || 0,
            isGroup,
            senderId,
            profile: {
                interests: profile.interests?.length || 0,
                knownFacts: profile.knownFacts?.length || 0,
                topicsTracked: Object.keys(profile.topicsDiscussed || {}).length,
                communicationStyle: profile.communicationStyle
            }
        };
    }

    // Learn from conversation (enhanced)
    async learnFromConversation(chatId, reasoning = null, options = {}) {
        const { isGroup = false, senderId = null } = options;
        const chat = this.getChat(chatId, options);
        const profile = this.getUserProfile(chatId, senderId, isGroup);
        
        if (!chat || !chat.context.conversationHistory) return;
        
        const history = chat.context.conversationHistory;
        const userMessages = history
            .filter(entry => entry.role === 'user')
            .map(entry => entry.content.toLowerCase());
        
        // Track topic frequency
        const topicKeywords = {};
        const allTopics = [
            'science', 'technology', 'philosophy', 'psychology', 'history', 'art', 'music',
            'literature', 'politics', 'economics', 'health', 'fitness', 'travel', 'food',
            'movies', 'books', 'gaming', 'programming', 'ai', 'space', 'biology', 'physics',
            'mathematics', 'language', 'culture', 'society', 'ethics', 'creativity', 'learning',
            'work', 'career', 'relationships', 'family', 'friends', 'hobbies', 'projects',
            'goals', 'dreams', 'fears', 'curiosity', 'wonder', 'meaning', 'purpose'
        ];
        
        userMessages.forEach(message => {
            allTopics.forEach(topic => {
                if (message.includes(topic)) {
                    topicKeywords[topic] = (topicKeywords[topic] || 0) + 1;
                }
            });
        });
        
        // Update profile with learned interests
        const sortedTopics = Object.entries(topicKeywords)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15);
        
        profile.interests = [...new Set([
            ...(profile.interests || []),
            ...sortedTopics.filter(([_, count]) => count > 1).map(([topic]) => topic)
        ])].slice(0, 20);
        
        // Update topics discussed
        sortedTopics.forEach(([topic, count]) => {
            profile.topicsDiscussed[topic] = (profile.topicsDiscussed[topic] || 0) + count;
        });
        
        profile.lastLearningUpdate = new Date().toISOString();
        this.saveUserProfiles();
    }
}

export default ConversationManager;