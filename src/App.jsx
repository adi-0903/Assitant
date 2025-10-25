import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Volume2, VolumeX, Trash2 } from 'lucide-react';
import Avatar from './components/Avatar';
import './App.css';

function App() {
  // API base URL - works in both development and production
  const API_BASE_URL = process.env.NODE_ENV === 'production' 
    ? '' // In production, API routes are served from same domain
    : 'http://localhost:3001'; // In development, use local server

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [emotion, setEmotion] = useState('neutral');
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [currentSpeakingText, setCurrentSpeakingText] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('male'); // 'male' or 'female'
  const [voiceChangeNotification, setVoiceChangeNotification] = useState('');

  // Clear selected voice when avatar changes to ensure gender-appropriate voice
  const handleAvatarChange = (avatarType) => {
    setSelectedAvatar(avatarType);
    setSelectedVoice(null); // Clear cached voice to force new selection
    
    // Force speech synthesis to refresh voices
    window.speechSynthesis.cancel();
    
    // Clear any voice caching flags
    if (window.voicesLogged) {
      delete window.voicesLogged;
    }
    
    console.log(`Avatar changed to: ${avatarType}`);
    
    // Show voice change notification
    setVoiceChangeNotification(`Switched to ${avatarType} avatar - voice will match on next speech`);
    setTimeout(() => setVoiceChangeNotification(''), 3000);
  };

  const recognitionRef = useRef(null);
  const audioRef = useRef(null);

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = async (event) => {
        const userMessage = event.results[0][0].transcript;
        setTranscript(userMessage);
        setIsListening(false);
        
        // Send to AI
        await handleUserMessage(userMessage);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error !== 'no-speech') {
          setError('Speech recognition error. Please try again.');
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    } else {
      setError('Speech recognition not supported in this browser.');
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const handleUserMessage = async (message) => {
    try {
      setError('');
      
      // Get AI response
      const chatResponse = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      if (!chatResponse.ok) throw new Error('Failed to get response');

      const { response: aiResponse, emotion: detectedEmotion } = await chatResponse.json();
      setResponse(aiResponse);
      setEmotion(detectedEmotion);

      // Generate speech if not muted
      if (!isMuted) {
        await speakResponse(aiResponse, detectedEmotion);
      }

    } catch (err) {
      console.error('Error:', err);
      setError('Failed to communicate with assistant. Make sure the server is running.');
    }
  };

  const speakResponse = async (text, emotionType) => {
    try {
      setIsSpeaking(true);
      setCurrentSpeakingText(text);

      // Get voice settings from server
      const ttsResponse = await fetch(`${API_BASE_URL}/api/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, emotion: emotionType }),
      });

      if (!ttsResponse.ok) throw new Error('Failed to get voice settings');

      const { settings } = await ttsResponse.json();

      // Ensure voices are loaded and refreshed
      let voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) {
        // Wait for voices to load
        await new Promise(resolve => {
          window.speechSynthesis.onvoiceschanged = () => {
            voices = window.speechSynthesis.getVoices();
            resolve();
          };
        });
      }
      
      // Force refresh voices to get latest list
      voices = window.speechSynthesis.getVoices();

      // Use browser's Speech Synthesis API
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = settings.pitch || 1.0;
      utterance.rate = settings.rate || 1.0;
      utterance.volume = settings.volume || 0.9;

      // Gender-based voice selection
      const maleVoicePriority = [
        // Male voices - Premium natural voices (best quality)
        v => v.name.includes('Alex'), // macOS male
        v => v.name.includes('Microsoft David'), // Windows male
        v => v.name.includes('Google US English Male') || v.name.includes('Google UK English Male'),
        v => v.name.includes('Male') && (v.name.includes('Natural') || v.name.includes('Premium')),
        v => v.name.includes('Male') && (v.name.includes('Enhanced') || v.name.includes('Neural')),
        // Common male voice names
        v => v.name.includes('Daniel') || v.name.includes('Mark') || v.name.includes('Paul'),
        v => v.name.includes('Thomas') || v.name.includes('James') || v.name.includes('John'),
        // Fallback to any male English voice
        v => (v.lang === 'en-US' || v.lang === 'en-GB') && v.name.toLowerCase().includes('male'),
        v => v.lang.startsWith('en') && v.name.toLowerCase().includes('male')
      ];

      const femaleVoicePriority = [
        // Female voices - Premium natural voices (best quality)
        v => v.name.includes('Samantha'), // macOS female
        v => v.name.includes('Microsoft Zira') || v.name.includes('Microsoft Hazel'), // Windows female
        v => v.name.includes('Google US English Female') || v.name.includes('Google UK English Female'),
        v => v.name.includes('Female') && (v.name.includes('Natural') || v.name.includes('Premium')),
        v => v.name.includes('Female') && (v.name.includes('Enhanced') || v.name.includes('Neural')),
        // Common female voice names
        v => v.name.includes('Susan') || v.name.includes('Karen') || v.name.includes('Victoria'),
        v => v.name.includes('Sarah') || v.name.includes('Emma') || v.name.includes('Anna'),
        // Fallback to any female English voice
        v => (v.lang === 'en-US' || v.lang === 'en-GB') && v.name.toLowerCase().includes('female'),
        v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female')
      ];

      // Select voice priority based on avatar gender
      const voicePriority = selectedAvatar === 'female' ? femaleVoicePriority : maleVoicePriority;

      // ALWAYS select gender-appropriate voice based on current avatar
      let voiceToUse = null;
      
      console.log(`🎯 Selecting voice for ${selectedAvatar} avatar...`);
      
      if (selectedAvatar === 'female') {
        // Try female voices in order of preference - expanded list
        const femaleSearchTerms = [
          // High priority female voices
          'samantha', 'zira', 'hazel', 'cortana', 'siri',
          // Common female names
          'susan', 'karen', 'victoria', 'sarah', 'emma', 'anna', 'mary', 'linda', 
          'jennifer', 'elizabeth', 'michelle', 'lisa', 'nancy', 'betty', 'helen',
          'sandra', 'donna', 'carol', 'ruth', 'sharon', 'michelle', 'laura',
          // Gender keywords
          'female', 'woman', 'girl', 'lady', 'she', 'her'
        ];
        
        for (const term of femaleSearchTerms) {
          voiceToUse = voices.find(v => 
            v.lang.startsWith('en') && 
            v.name.toLowerCase().includes(term)
          );
          if (voiceToUse) {
            console.log(`✅ Found female voice with term "${term}":`, voiceToUse.name);
            break;
          }
        }
        
        // If still no female voice, try the priority list
        if (!voiceToUse) {
          for (const priorityCheck of femaleVoicePriority) {
            voiceToUse = voices.find(priorityCheck);
            if (voiceToUse) break;
          }
        }
        
        // Last resort for female: find any English voice that's NOT obviously male
        if (!voiceToUse) {
          const maleKeywords = ['alex', 'david', 'daniel', 'mark', 'paul', 'thomas', 'james', 'john', 'male', 'man', 'boy'];
          voiceToUse = voices.find(v => {
            const name = v.name.toLowerCase();
            const isEnglish = v.lang.startsWith('en');
            const isNotObviouslyMale = !maleKeywords.some(keyword => name.includes(keyword));
            return isEnglish && isNotObviouslyMale;
          });
          if (voiceToUse) {
            console.log(`🔄 Using non-male English voice as female fallback:`, voiceToUse.name);
          }
        }
      } else {
        // Try male voices in order of preference
        const maleSearchTerms = [
          'alex', 'david', 'daniel', 'mark', 'paul', 'thomas', 'james', 'john',
          'male', 'man', 'boy'
        ];
        
        for (const term of maleSearchTerms) {
          voiceToUse = voices.find(v => 
            v.lang.startsWith('en') && 
            v.name.toLowerCase().includes(term)
          );
          if (voiceToUse) {
            console.log(`✅ Found male voice with term "${term}":`, voiceToUse.name);
            break;
          }
        }
        
        // If still no male voice, try the priority list
        if (!voiceToUse) {
          for (const priorityCheck of maleVoicePriority) {
            voiceToUse = voices.find(priorityCheck);
            if (voiceToUse) break;
          }
        }
      }
      
      // Final fallback - any English voice
      if (!voiceToUse) {
        voiceToUse = voices.find(v => v.lang === 'en-US' || v.lang === 'en-GB') || 
                     voices.find(v => v.lang.startsWith('en'));
        console.log('⚠️ Using fallback English voice:', voiceToUse?.name);
      }

      // Debug logging for voice selection
      console.log(`\n=== Voice Selection for ${selectedAvatar.toUpperCase()} Avatar ===`);
      console.log('Available voices:', voices.length);
      
      // Log ALL available voices to see what we have
      console.log('ALL VOICES:', voices.map(v => `${v.name} (${v.lang}) [${v.gender || 'unknown gender'}]`));
      
      if (selectedAvatar === 'female') {
        // More comprehensive female voice detection
        const femaleVoices = voices.filter(v => {
          const name = v.name.toLowerCase();
          return name.includes('female') || 
                 name.includes('woman') ||
                 name.includes('samantha') ||
                 name.includes('zira') ||
                 name.includes('hazel') ||
                 name.includes('susan') ||
                 name.includes('karen') ||
                 name.includes('victoria') ||
                 name.includes('sarah') ||
                 name.includes('emma') ||
                 name.includes('anna') ||
                 name.includes('mary') ||
                 name.includes('linda') ||
                 name.includes('jennifer') ||
                 name.includes('elizabeth') ||
                 (v.gender && v.gender.toLowerCase() === 'female');
        });
        console.log('🚺 Female voices found:', femaleVoices.map(v => `${v.name} (${v.lang})`));
      } else {
        const maleVoices = voices.filter(v => {
          const name = v.name.toLowerCase();
          return name.includes('male') || 
                 name.includes('man') ||
                 name.includes('alex') ||
                 name.includes('david') ||
                 name.includes('daniel') ||
                 name.includes('mark') ||
                 name.includes('paul') ||
                 name.includes('thomas') ||
                 name.includes('james') ||
                 name.includes('john') ||
                 (v.gender && v.gender.toLowerCase() === 'male');
        });
        console.log('🚹 Male voices found:', maleVoices.map(v => `${v.name} (${v.lang})`));
      }

      if (voiceToUse) {
        utterance.voice = voiceToUse;
        console.log(`✅ Selected ${selectedAvatar} voice:`, voiceToUse.name);
      } else {
        console.log('❌ No suitable voice found, using default');
      }
      console.log('=== End Voice Selection ===\n');

      utterance.onend = () => {
        setIsSpeaking(false);
        setCurrentSpeakingText('');
      };

      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event);
        setIsSpeaking(false);
        setCurrentSpeakingText('');
      };

      // Cancel any ongoing speech before starting new one
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);

    } catch (err) {
      console.error('TTS Error:', err);
      setIsSpeaking(false);
      setError('Failed to generate speech');
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      setError('');
      setTranscript('');
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (isSpeaking && audioRef.current) {
      audioRef.current.pause();
      setIsSpeaking(false);
    }
  };

  const clearConversation = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      setTranscript('');
      setResponse('');
      setEmotion('neutral');
      setError('');
    } catch (err) {
      console.error('Clear error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-5xl font-bold text-white mb-2">
            Emotionally Expressive Assistant
          </h1>
          <p className="text-purple-200">
            Natural voice conversation with emotional intelligence
          </p>
        </motion.div>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl p-8 border border-white/20"
        >
          {/* Avatar Selection */}
          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-4 bg-white/5 backdrop-blur-sm rounded-full p-2 border border-white/10">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleAvatarChange('male')}
                disabled={isSpeaking || isListening}
                className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all ${
                  selectedAvatar === 'male'
                    ? 'bg-blue-500 text-white shadow-lg'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                } disabled:opacity-50 disabled:cursor-not-allowed`}>
                <span className="text-lg">👨</span>
                Male Avatar
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleAvatarChange('female')}
                disabled={isSpeaking || isListening}
                className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all ${
                  selectedAvatar === 'female'
                    ? 'bg-pink-500 text-white shadow-lg'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <span className="text-lg">👩</span>
                Female Avatar
              </motion.button>
            </div>
          </div>

          {/* Avatar */}
          <div className="flex justify-center mb-6">
            <Avatar emotion={emotion} isSpeaking={isSpeaking} isListening={isListening} currentText={currentSpeakingText} avatarType={selectedAvatar} />
          </div>

          {/* Conversation Display */}
          <div className="mb-6 min-h-[120px]">
            <AnimatePresence>
              {transcript && (
                <motion.div
                  key="user"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="mb-4"
                >
                  <div className="bg-blue-500/20 rounded-2xl p-4 border border-blue-400/30">
                    <p className="text-sm text-blue-200 mb-1">You said:</p>
                    <p className="text-white text-lg">{transcript}</p>
                  </div>
                </motion.div>
              )}

              {response && (
                <motion.div
                  key="assistant"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <div className="bg-purple-500/20 rounded-2xl p-4 border border-purple-400/30">
                    <p className="text-sm text-purple-200 mb-1">
                      Assistant ({emotion}):
                    </p>
                    <p className="text-white text-lg">{response}</p>
                  </div>
                </motion.div>
              )}

              {isListening && (
                <motion.div
                  key="listening"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center"
                >
                  <div className="inline-flex items-center gap-2 bg-green-500/20 rounded-full px-6 py-3 border border-green-400/30">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      className="w-3 h-3 bg-green-400 rounded-full"
                    />
                    <p className="text-green-200 font-medium">Listening...</p>
                  </div>
                </motion.div>
              )}

              {isSpeaking && (
                <motion.div
                  key="speaking"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center mt-4"
                >
                  <div className="inline-flex items-center gap-2 bg-purple-500/20 rounded-full px-6 py-3 border border-purple-400/30">
                    <motion.div
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ repeat: Infinity, duration: 0.8 }}
                      className="w-3 h-3 bg-purple-400 rounded-full"
                    />
                    <p className="text-purple-200 font-medium">Speaking...</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-red-500/20 rounded-2xl p-4 border border-red-400/30"
              >
                <p className="text-red-200">{error}</p>
              </motion.div>
            )}

            {voiceChangeNotification && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-green-500/20 rounded-2xl p-4 border border-green-400/30 mt-4"
              >
                <p className="text-green-200 text-center">✅ {voiceChangeNotification}</p>
              </motion.div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleListening}
              disabled={isSpeaking}
              className={`flex items-center gap-3 px-8 py-4 rounded-full font-semibold text-lg transition-all ${
                isListening
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white'
              } disabled:opacity-50 disabled:cursor-not-allowed shadow-lg`}
            >
              {isListening ? (
                <>
                  <MicOff className="w-6 h-6" />
                  Stop Listening
                </>
              ) : (
                <>
                  <Mic className="w-6 h-6" />
                  Start Talking
                </>
              )}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleMute}
              className="p-4 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all shadow-lg"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={clearConversation}
              className="p-4 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all shadow-lg"
              title="Clear conversation"
            >
              <Trash2 className="w-6 h-6" />
            </motion.button>
          </div>
        </motion.div>

        {/* Audio element */}
        <audio ref={audioRef} className="hidden" />
      </div>
    </div>
  );
}

export default App;
