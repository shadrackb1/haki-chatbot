import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const KNOWLEDGE_BASE_FILE = path.join(DATA_DIR, 'personal-knowledge-base.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

class PersonalKnowledgeBase {
    constructor() {
        this.knowledgeBase = this.loadKnowledgeBase();
    }

    loadKnowledgeBase() {
        try {
            if (fs.existsSync(KNOWLEDGE_BASE_FILE)) {
                return JSON.parse(fs.readFileSync(KNOWLEDGE_BASE_FILE, 'utf8'));
            }
        } catch (error) {
            console.log('⚠️ Could not load knowledge base, using defaults');
        }
        return this.getDefaultKnowledgeBase();
    }

    saveKnowledgeBase() {
        try {
            fs.writeFileSync(KNOWLEDGE_BASE_FILE, JSON.stringify(this.knowledgeBase, null, 2), 'utf8');
        } catch (error) {
            console.log('⚠️ Could not save knowledge base:', error.message);
        }
    }

    getDefaultKnowledgeBase() {
        return {
            "profile": {
                "name": "You",
                "bio": "Add your bio in data/personal-knowledge-base.json",
                "occupation": "Your profession",
                "contact": {
                    "email": "your.email@example.com",
                    "phone": "+1234567890",
                    "preferred_contact_method": "WhatsApp"
                },
                "interests": [],
                "values": [],
                "projects": [],
                "background": ""
            },
            "preferences": {
                "response_style": "thoughtful",
                "intellectual_depth": "adaptive",
                "conversation_mode": "intellectual_companion",
                "topics_to_explore": [],
                "boundaries": []
            }
        };
    }

    getProfile() {
        return this.knowledgeBase.profile || {};
    }

    updateProfile(profileData) {
        this.knowledgeBase.profile = { ...this.knowledgeBase.profile, ...profileData };
        this.saveKnowledgeBase();
    }

    getPreferences() {
        return this.knowledgeBase.preferences || {};
    }

    updatePreferences(prefs) {
        this.knowledgeBase.preferences = { ...this.knowledgeBase.preferences, ...prefs };
        this.saveKnowledgeBase();
    }
}

export default PersonalKnowledgeBase;