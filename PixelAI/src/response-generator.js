class ResponseGenerator {
    constructor() {
        // Response templates for different intents and languages
        this.responseTemplates = {
            en: {
                greeting: [
                    "Hello! I'm Pixel AI, your personal assistant. How can I help you today?",
                    "Hi there! I'm Pixel AI. What do you need help with?",
                    "Hey! I'm your personal AI assistant. How can I assist you?"
                ],
                help: [
                    "I'm Pixel AI, your personal WhatsApp assistant. Here's what I can help you with:\n\n" +
                    "• Ask about me: 'Who are you?' or 'What do you do?'\n" +
                    "• Check my schedule: 'When are you available?'\n" +
                    "• Get my contact info: 'How can I contact you?'\n" +
                    "• Just chat with me naturally!\n\n" +
                    "Try asking me something!",
                    "I can help you with information about me, my schedule, and how to contact me. Just ask!"
                ],
                profile_query: [
                    "I'm {name}, a {occupation} passionate about helping people stay connected and informed. {bio}",
                    "My name is {name}. I work as a {occupation}. {bio}",
                    "I'm {name}, working in {occupation}. {bio}"
                ],
                schedule_inquiry: [
                    "I'm typically available {working_hours} in the {timezone} timezone. {availability_details}",
                    "My regular schedule is {working_hours} ({timezone}). {availability_details}",
                    "I'm usually free during {working_hours} {timezone}. {availability_details}"
                ],
                contact_request: [
                    "You can reach me via:\n• Email: {email}\n• Phone: {phone}\n• WhatsApp: You're already talking to me! 😊",
                    "Best ways to contact me:\n📧 Email: {email}\n📞 Phone: {phone}\n💬 WhatsApp: This chat!",
                    "Here's how to get in touch:\nEmail: {email}\nPhone: {phone}\nWhatsApp: You're doing it right now!"
                ],
                status_check: [
                    "I'm doing great! Ready to help you with whatever you need. How about you?",
                    "I'm doing well and here to assist you. How's your day going?",
                    "All systems operational! How can I help you today?"
                ],
                general_chat: [
                    "That's interesting! Could you tell me more about that?",
                    "I see. What aspect of that would you like to discuss?",
                    "Thanks for sharing. Is there a particular question you have about that?",
                    "I'm here to help. What would you like to explore together?"
                ],
                default: "I'm not sure I understand. Could you rephrase that or ask something else?"
            }
        };
    }

    // Generate greeting response
    async generateGreeting(language, userContext) {
        const templates = this.responseTemplates[language] || this.responseTemplates.en;
        const greetingTemplates = templates.greeting;
        const randomIndex = Math.floor(Math.random() * greetingTemplates.length);
        let response = greetingTemplates[randomIndex];
        
        // Personalize with user context if available
        if (userContext && userContext.userName) {
            response = response.replace('there', userContext.userName);
        }
        
        return response;
    }

    // Generate help response
    async generateHelp(language, userContext) {
        const templates = this.responseTemplates[language] || this.responseTemplates.en;
        const helpTemplates = templates.help;
        const randomIndex = Math.floor(Math.random() * helpTemplates.length);
        return helpTemplates[randomIndex];
    }

    // Generate profile info response
    async generateProfileInfo(language, userContext, knowledgeBase) {
        const profile = knowledgeBase.getProfile();
        const templates = this.responseTemplates[language] || this.responseTemplates.en;
        const profileTemplates = templates.profile_query;
        const randomIndex = Math.floor(Math.random() * profileTemplates.length);
        let response = profileTemplates[randomIndex];
        
        // Replace placeholders with actual data
        response = response.replace('{name}', profile.name || '[Your Name]');
        response = response.replace('{occupation}', profile.occupation || '[Your Occupation]');
        response = response.replace('{bio}', profile.bio || '[Your Bio]');
        
        return response;
    }

    // Generate schedule info response
    async generateScheduleInfo(language, userContext, calendarIntegration) {
        const schedule = knowledgeBase.getSchedule ? knowledgeBase.getSchedule() : {};
        const templates = this.responseTemplates[language] || this.responseTemplates.en;
        const scheduleTemplates = templates.schedule_inquiry;
        const randomIndex = Math.floor(Math.random() * scheduleTemplates.length);
        let response = scheduleTemplates[randomIndex];
        
        // Replace placeholders with actual data
        response = response.replace('{working_hours}', schedule.working_hours || '9:00-18:00');
        response = response.replace('{timezone}', schedule.timezone || 'UTC');
        
        // Generate availability details
        let availabilityDetails = '';
        if (schedule.typical_availability) {
            const today = new Date();
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayName = dayNames[today.getDay()].toLowerCase();
            
            if (schedule.typical_availability[dayName] && schedule.typical_availability[dayName].length > 0) {
                availabilityDetails = `Today (${dayName.charAt(0).toUpperCase() + dayName.slice(1)}), I'm available during: ${schedule.typical_availability[dayName].join(' and ')}.`;
            } else {
                availabilityDetails = `I don't have regular availability scheduled for today.`;
            }
        }
        
        response = response.replace('{availability_details}', availabilityDetails);
        
        return response;
    }

    // Generate contact info response
    async generateContactInfo(language, userContext, knowledgeBase) {
        const profile = knowledgeBase.getProfile();
        const contact = profile.contact || {};
        const templates = this.responseTemplates[language] || this.responseTemplates.en;
        const contactTemplates = templates.contact_request;
        const randomIndex = Math.floor(Math.random() * contactTemplates.length);
        let response = contactTemplates[randomIndex];
        
        // Replace placeholders with actual data
        response = response.replace('{email}', contact.email || 'your.email@example.com');
        response = response.replace('{phone}', contact.phone || '+1234567890');
        
        return response;
    }

    // Generate status info response
    async generateStatusInfo(language, userContext) {
        const templates = this.responseTemplates[language] || this.responseTemplates.en;
        const statusTemplates = templates.status_check;
        const randomIndex = Math.floor(Math.random() * statusTemplates.length);
        return statusTemplates[randomIndex];
    }

    // Handle learning feedback
    async handleLearningFeedback(message, language, userContext, conversationManager) {
        // Store the feedback for future use
        // For now, just acknowledge it
        const templates = this.responseTemplates[language] || this.responseTemplates.en;
        const feedbackResponses = [
            "Thanks for letting me know! I'll remember that for next time.",
            "I appreciate the feedback. I'll try to do better moving forward.",
            "Got it! I'll keep that in mind for future conversations.",
            "Thanks for telling me. I'm always learning and improving."
        ];
        const randomIndex = Math.floor(Math.random() * feedbackResponses.length);
        return feedbackResponses[randomIndex];
    }

    // Generate general response
    async generateGeneralResponse(message, language, userContext, knowledgeBase) {
        // First, try to find a matching FAQ
        const faqMatch = knowledgeBase.getBestFAQMatch ? knowledgeBase.getBestFAQMatch(message) : null;
        
        if (faqMatch) {
            return faqMatch.answer;
        }
        
        // If no FAQ match, generate a general response
        const templates = this.responseTemplates[language] || this.responseTemplates.en;
        const generalTemplates = templates.general_chat;
        const randomIndex = Math.floor(Math.random() * generalTemplates.length);
        return generalTemplates[randomIndex];
    }

    // Generate a response that engages with a specific topic
    async generateTopicResponse(topic, language, userContext, knowledgeBase) {
        // First, try to see if the topic matches any FAQs
        const faqMatch = knowledgeBase.getBestFAQMatch ? knowledgeBase.getBestFAQMatch(topic) : null;
        
        if (faqMatch) {
            return faqMatch.answer;
        }
        
        // If no specific FAQ match, generate a response that engages with the topic
        const templates = this.responseTemplates[language] || this.responseTemplates.en;
        
        // Topic-specific response templates
        const topicResponses = [
            `That's an interesting topic: "${topic}". What would you like to know about it?`,
            `I'd be happy to discuss "${topic}" with you. What specific aspects interest you?`,
            `"${topic}" is a great subject to explore. What questions do you have about it?`,
            `Let's talk about "${topic}". What would you like to discuss regarding this topic?`,
            `I find "${topic}" fascinating. What would you like to explore about it?`
        ];
        
        const randomIndex = Math.floor(Math.random() * topicResponses.length);
        return topicResponses[randomIndex];
    }

    // Add custom response template
    addResponseTemplate(language, intent, template) {
        if (!this.responseTemplates[language]) {
            this.responseTemplates[language] = {};
        }
        if (!this.responseTemplates[language][intent]) {
            this.responseTemplates[language][intent] = [];
        }
        this.responseTemplates[language][intent].push(template);
    }
}

export default ResponseGenerator;