import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: [
    'http://localhost:5173', 
    'http://localhost:3000',
    /^https:\/\/.*\.vercel\.app$/  // Allow any Vercel domain
  ],
  credentials: true
}));
app.use(express.json());

// OpenRouter client for chat completions
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': process.env.VERCEL_URL || 'http://localhost:5173',
    'X-Title': 'Emotionally Expressive Assistant',
  },
});

// Conversation history for context
const conversationHistory = new Map();

// Advanced emotion detection with scoring system
function detectEmotion(text) {
  const lowerText = text.toLowerCase();
  
  // Emotion patterns with weights
  const emotionPatterns = {
    excited: {
      patterns: [
        /\b(excited|thrilled|ecstatic|pumped|stoked|hyped|can't wait|omg|wow|yay|woohoo)\b/,
        /!{2,}/,  // Multiple exclamation marks
        /\b(finally|yes|awesome|incredible|amazing|fantastic)\b/
      ],
      weight: 3
    },
    joyful: {
      patterns: [
        /\b(happy|joy|joyful|delighted|pleased|glad|cheerful|wonderful|great|good|nice)\b/,
        /\b(love|loving|adore|enjoy|enjoyed|fun|smile|smiling|laugh|laughing)\b/,
        /😊|😄|😃|🙂|😁|🎉|❤️/
      ],
      weight: 2
    },
    grateful: {
      patterns: [
        /\b(thank|thanks|grateful|appreciate|appreciated|blessing|blessed|fortunate|lucky)\b/,
        /\b(thankful|gratitude|kind of you|helped me|you're the best)\b/,
        /🙏|💖/
      ],
      weight: 2
    },
    sad: {
      patterns: [
        /\b(sad|unhappy|depressed|miserable|heartbroken|devastated|crying|tears)\b/,
        /\b(lonely|alone|isolated|empty|hopeless|lost|broken)\b/,
        /😢|😭|💔|😞/
      ],
      weight: 3
    },
    anxious: {
      patterns: [
        /\b(anxious|worried|nervous|scared|afraid|fear|fearful|terrified|panic|stress|stressed)\b/,
        /\b(anxiety|concern|concerned|uneasy|tense|overwhelmed|freaking out)\b/,
        /😰|😨|😟/
      ],
      weight: 3
    },
    angry: {
      patterns: [
        /\b(angry|mad|furious|pissed|rage|hate|annoyed|irritated|frustrated)\b/,
        /\b(infuriated|outraged|livid|fed up|sick of|can't stand)\b/,
        /😠|😡|🤬/
      ],
      weight: 3
    },
    confused: {
      patterns: [
        /\b(confused|confusing|don't understand|unclear|lost|puzzled|baffled)\b/,
        /\b(what do you mean|huh|wait what|makes no sense|not sure)\b/,
        /\?{2,}/,  // Multiple question marks
        /😕|🤔/
      ],
      weight: 2
    },
    curious: {
      patterns: [
        /\b(curious|wonder|wondering|interested|interesting|fascinated|intrigued)\b/,
        /\b(how does|why does|what if|tell me more|explain|could you)\b/,
        /^(how|what|why|when|where|who|which)/
      ],
      weight: 1
    },
    tired: {
      patterns: [
        /\b(tired|exhausted|drained|worn out|sleepy|fatigue|weary|beat)\b/,
        /\b(can't anymore|too much|give up|no energy)\b/,
        /😴|🥱/
      ],
      weight: 2
    },
    bored: {
      patterns: [
        /\b(bored|boring|dull|uninteresting|monotonous|tedious|nothing to do)\b/,
        /\b(meh|whatever|don't care|so what)\b/,
        /😑|🙄/
      ],
      weight: 2
    },
    proud: {
      patterns: [
        /\b(proud|accomplished|achieved|achievement|success|successful|nailed it)\b/,
        /\b(did it|made it|completed|finished|won|victory)\b/,
        /💪|🏆|🎯/
      ],
      weight: 2
    },
    surprised: {
      patterns: [
        /\b(surprised|shocking|shocked|unexpected|didn't expect|can't believe|unbelievable)\b/,
        /\b(wow|whoa|omg|seriously|no way|really)\b/,
        /😮|😲|🤯/
      ],
      weight: 2
    },
    playful: {
      patterns: [
        /\b(haha|lol|lmao|hehe|funny|hilarious|joke|kidding|teasing)\b/,
        /\b(playful|silly|goofy|fun|entertaining)\b/,
        /😂|🤣|😜|😝/
      ],
      weight: 2
    },
    romantic: {
      patterns: [
        /\b(love you|miss you|thinking of you|care about you|special|beautiful|gorgeous)\b/,
        /\b(romantic|romance|date|kiss|hug|sweetheart|darling|honey)\b/,
        /❤️|💕|💖|😍|🥰|💋/
      ],
      weight: 3
    },
    disappointed: {
      patterns: [
        /\b(disappointed|let down|expected more|not what i|underwhelming|failed)\b/,
        /\b(sucks|bummer|unfortunate|too bad|shame)\b/,
        /😞|😔/
      ],
      weight: 2
    }
  };

  // Score each emotion
  const scores = {};
  
  for (const [emotion, config] of Object.entries(emotionPatterns)) {
    let score = 0;
    for (const pattern of config.patterns) {
      if (pattern.test(lowerText)) {
        score += config.weight;
      }
    }
    if (score > 0) {
      scores[emotion] = score;
    }
  }

  // Return emotion with highest score
  if (Object.keys(scores).length > 0) {
    const topEmotion = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    return topEmotion;
  }

  // Check for question patterns (help-seeking)
  if (lowerText.match(/^(how|what|why|when|where|can you|could you|would you|help|assist)/)) {
    return 'helpful';
  }

  return 'neutral';
}

// Generate emotionally appropriate response
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId = 'default' } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get or create conversation history
    if (!conversationHistory.has(sessionId)) {
      conversationHistory.set(sessionId, []);
    }
    const history = conversationHistory.get(sessionId);

    // Detect user emotion
    const userEmotion = detectEmotion(message);

    // Build system prompt based on detected emotion
    const emotionPrompts = {
      excited: "The user is SUPER excited! Match their high energy with enthusiasm and celebration. Use exclamations naturally!",
      joyful: "The user is happy and content. Be warm, cheerful, and share in their positive mood.",
      grateful: "The user is expressing gratitude. Be humble, warm, and acknowledge their appreciation genuinely.",
      sad: "The user is feeling down or sad. Be gentle, empathetic, and supportive. Offer comfort without being dismissive.",
      anxious: "The user is worried or anxious. Be calming, reassuring, and patient. Help them feel safe and understood.",
      angry: "The user is frustrated or angry. Stay calm, validate their feelings, and be understanding without escalating.",
      confused: "The user is confused or uncertain. Be clear, patient, and helpful. Break things down simply.",
      curious: "The user is curious and exploring. Be engaging, thoughtful, and encourage their curiosity.",
      tired: "The user is exhausted or drained. Be gentle, understanding, and don't overwhelm them with information.",
      bored: "The user seems bored. Be more engaging, interesting, and try to spark their interest.",
      proud: "The user accomplished something! Celebrate with them, be encouraging and acknowledge their achievement.",
      surprised: "The user is surprised or shocked. Match their energy and help them process the unexpected.",
      playful: "The user is being playful or humorous. Be light-hearted, fun, and match their playful energy.",
      romantic: "The user is expressing romantic feelings. Be warm, sweet, and emotionally supportive.",
      disappointed: "The user is disappointed. Be empathetic, validating, and gently encouraging.",
      helpful: "The user needs assistance. Be clear, informative, and genuinely helpful.",
      neutral: "Maintain a friendly, conversational tone. Be natural and approachable."
    };

    const systemPrompt = `You are an emotionally intelligent virtual assistant having a natural spoken conversation.

CRITICAL RULES:
- Keep responses to 1-2 sentences unless asked for details
- Speak naturally as if talking face-to-face with a friend
- ${emotionPrompts[userEmotion]}
- Never describe actions (don't say "I smile" or "I nod")
- Don't read out punctuation, symbols, or emojis
- Add natural speech patterns like "hmm", "well", "you know" ONLY when it feels natural
- Avoid robotic or overly formal language
- Focus on emotional tone and natural pacing

Current emotional context: ${userEmotion}`;

    // Add user message to history
    history.push({ role: 'user', content: message });

    // Keep only last 10 messages for context
    const recentHistory = history.slice(-10);

    // Get AI response
    const completion = await openai.chat.completions.create({
      model: 'openai/gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        ...recentHistory
      ],
      temperature: 0.8,
      max_tokens: 150,
    });

    const assistantMessage = completion.choices[0].message.content;
    history.push({ role: 'assistant', content: assistantMessage });

    res.json({
      response: assistantMessage,
      emotion: userEmotion,
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

// Text-to-speech settings (browser-based TTS)
app.post('/api/speak', async (req, res) => {
  try {
    const { text, emotion = 'neutral' } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Return voice settings for browser-based TTS (more natural ranges)
    const voiceSettings = {
      excited: { pitch: 1.15, rate: 1.1, volume: 1.0 },
      joyful: { pitch: 1.08, rate: 1.0, volume: 0.95 },
      grateful: { pitch: 1.02, rate: 0.92, volume: 0.9 },
      sad: { pitch: 0.92, rate: 0.88, volume: 0.85 },
      anxious: { pitch: 1.05, rate: 1.08, volume: 0.9 },
      angry: { pitch: 0.95, rate: 1.05, volume: 0.95 },
      confused: { pitch: 1.03, rate: 0.92, volume: 0.9 },
      curious: { pitch: 1.06, rate: 0.98, volume: 0.95 },
      tired: { pitch: 0.88, rate: 0.85, volume: 0.8 },
      bored: { pitch: 0.96, rate: 0.88, volume: 0.85 },
      proud: { pitch: 1.1, rate: 0.98, volume: 0.95 },
      surprised: { pitch: 1.12, rate: 1.08, volume: 1.0 },
      playful: { pitch: 1.08, rate: 1.05, volume: 0.95 },
      romantic: { pitch: 0.98, rate: 0.9, volume: 0.85 },
      disappointed: { pitch: 0.94, rate: 0.92, volume: 0.85 },
      helpful: { pitch: 1.0, rate: 0.95, volume: 0.95 },
      neutral: { pitch: 1.0, rate: 0.95, volume: 0.9 }
    };

    const settings = voiceSettings[emotion] || voiceSettings.neutral;

    res.json({
      text,
      emotion,
      settings
    });

  } catch (error) {
    console.error('TTS error:', error);
    res.status(500).json({ error: 'Failed to generate speech settings' });
  }
});

// Clear conversation history
app.post('/api/clear', (req, res) => {
  const { sessionId = 'default' } = req.body;
  conversationHistory.delete(sessionId);
  res.json({ success: true });
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🎙️  Emotionally Expressive Assistant Server running on port ${PORT}`);
  });
}

// Export for Vercel serverless functions
export default app;
