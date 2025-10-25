import { motion } from 'framer-motion';
import { useEffect, useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';

// 3D Avatar Model Component
function AvatarModel({ emotion, isSpeaking, isListening, currentText, avatarType = 'male' }) {
  const groupRef = useRef();
  const morphTargetMeshes = useRef([]);
  const eyeMeshes = useRef([]);
  const blinkTimeRef = useRef(0);
  const nextBlinkRef = useRef(3);
  const isBlinking = useRef(false);
  const lipSyncRef = useRef({ phase: 0, intensity: 0, phoneme: 'neutral' });
  
  // Load the appropriate avatar based on selection
  const avatarPath = avatarType === 'female' ? '/avatar-female.glb' : '/avatar.glb';
  const { scene } = useGLTF(avatarPath);
  
  // Find all meshes with morph targets and eye meshes on mount
  useEffect(() => {
    morphTargetMeshes.current = [];
    eyeMeshes.current = [];
    
    scene.traverse((child) => {
      if (child.isMesh) {
        // Store meshes with morph targets
        if (child.morphTargetInfluences) {
          morphTargetMeshes.current.push(child);
          // Debug: Log available morph targets
          if (child.morphTargetDictionary) {
            console.log('Available morph targets:', Object.keys(child.morphTargetDictionary));
          }
        }
        
        // Find eye meshes by name
        const name = child.name.toLowerCase();
        if (name.includes('eye') || name.includes('cornea') || name.includes('iris') || name.includes('pupil')) {
          eyeMeshes.current.push(child);
          console.log('Found eye mesh:', child.name);
        }
      }
    });
    
    console.log('Total morph target meshes:', morphTargetMeshes.current.length);
    console.log('Total eye meshes:', eyeMeshes.current.length);
  }, [scene]);

  // Phoneme-based lip sync patterns
  const getPhonemeFromText = (text, timeOffset) => {
    if (!text || !isSpeaking) return 'neutral';
    
    // Simple phoneme detection based on common letter patterns
    const vowels = /[aeiouAEIOU]/;
    const consonants = /[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]/;
    const labials = /[bpmfvBPMFV]/; // Lips together sounds
    const dentals = /[tdnlrTDNLR]/; // Tongue-teeth sounds
    
    // Simulate reading through text over time
    const wordsPerSecond = 3;
    const currentIndex = Math.floor((timeOffset * wordsPerSecond) % text.length);
    const currentChar = text[currentIndex] || '';
    
    if (labials.test(currentChar)) return 'closed';
    if (vowels.test(currentChar)) return 'open';
    if (dentals.test(currentChar)) return 'narrow';
    if (consonants.test(currentChar)) return 'consonant';
    
    return 'neutral';
  };

  // Lip sync morph target mappings
  const lipSyncMorphs = {
    neutral: { mouthOpen: 0, mouthSmile: 0, mouthPucker: 0 },
    open: { mouthOpen: 0.8, mouthSmile: 0, mouthPucker: 0 }, // A, E, I, O, U
    closed: { mouthOpen: 0, mouthSmile: 0, mouthPucker: 0.6 }, // B, P, M
    narrow: { mouthOpen: 0.3, mouthSmile: 0.2, mouthPucker: 0 }, // T, D, N, L
    consonant: { mouthOpen: 0.2, mouthSmile: 0, mouthPucker: 0.2 }, // Other consonants
  };

  // Emotion-based morph target configurations
  const emotionMorphs = {
    excited: { mouthSmile: 0.9, eyesWide: 0.7, browUp: 0.6 },
    joyful: { mouthSmile: 0.8, eyesHappy: 0.6, browUp: 0.3 },
    grateful: { mouthSmile: 0.6, eyesClosed: 0.3, browUp: 0.2 },
    sad: { mouthFrown: 0.7, eyesSad: 0.6, browDown: 0.5 },
    anxious: { mouthOpen: 0.3, eyesWide: 0.5, browUp: 0.6 },
    angry: { mouthFrown: 0.6, eyesAngry: 0.8, browAngry: 0.8 },
    confused: { mouthOpen: 0.2, eyesWide: 0.4, browUp: 0.5 },
    curious: { mouthSmile: 0.3, eyesWide: 0.5, browUp: 0.4 },
    tired: { eyesClosed: 0.6, mouthOpen: 0.2, browDown: 0.3 },
    bored: { eyesClosed: 0.4, mouthFrown: 0.2 },
    proud: { mouthSmile: 0.7, eyesHappy: 0.5, browUp: 0.2 },
    surprised: { mouthOpen: 0.8, eyesWide: 0.9, browUp: 0.8 },
    playful: { mouthSmile: 0.8, eyesWink: 0.5, browUp: 0.3 },
    romantic: { mouthSmile: 0.5, eyesClosed: 0.4, browUp: 0.1 },
    disappointed: { mouthFrown: 0.5, eyesSad: 0.4, browDown: 0.4 },
    helpful: { mouthSmile: 0.5, eyesHappy: 0.4 },
    neutral: {},
  };

  // Emotion-based lighting colors
  const emotionColors = {
    excited: '#ff6b35',
    joyful: '#ffd23f',
    grateful: '#f06292',
    sad: '#5c6bc0',
    anxious: '#9c27b0',
    angry: '#f44336',
    confused: '#9e9e9e',
    curious: '#ba68c8',
    tired: '#78909c',
    bored: '#757575',
    proud: '#ffc107',
    surprised: '#26c6da',
    playful: '#ec407a',
    romantic: '#f48fb1',
    disappointed: '#90a4ae',
    helpful: '#66bb6a',
    neutral: '#7e57c2',
  };

  const currentColor = emotionColors[emotion] || emotionColors.neutral;
  const targetMorphs = emotionMorphs[emotion] || emotionMorphs.neutral;

  // Animation loop
  useFrame((state, delta) => {
    if (groupRef.current) {
      // Very subtle breathing animation
      const breathingScale = 1 + Math.sin(state.clock.elapsedTime * 1.5) * 0.01;
      groupRef.current.scale.set(breathingScale, breathingScale, breathingScale);
      
      // Speaking animation - realistic lip syncing
      if (isSpeaking) {
        // Very subtle head nod
        groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 3) * 0.02;
        
        // Get current phoneme based on text and timing
        const currentPhoneme = getPhonemeFromText(currentText, state.clock.elapsedTime);
        const targetMorphs = lipSyncMorphs[currentPhoneme] || lipSyncMorphs.neutral;
        
        // Add some randomness and smoothing for more natural movement
        const randomFactor = 0.8 + Math.sin(state.clock.elapsedTime * 15) * 0.2;
        const smoothingFactor = 0.15;
        
        // Apply lip sync morphs
        morphTargetMeshes.current.forEach((mesh) => {
          const dict = mesh.morphTargetDictionary;
          if (dict) {
            // Apply phoneme-based mouth shapes
            Object.entries(targetMorphs).forEach(([morphName, targetValue]) => {
              const possibleNames = [
                morphName,
                morphName.toLowerCase(),
                morphName.charAt(0).toUpperCase() + morphName.slice(1),
                // Additional common naming patterns
                morphName.replace('mouth', 'Mouth'),
                morphName.replace('Open', '_Open'),
                morphName.replace('Smile', '_Smile'),
                morphName.replace('Pucker', '_Pucker')
              ];
              
              for (const name of possibleNames) {
                if (dict[name] !== undefined) {
                  const currentValue = mesh.morphTargetInfluences[dict[name]];
                  const adjustedTarget = targetValue * randomFactor;
                  mesh.morphTargetInfluences[dict[name]] = THREE.MathUtils.lerp(
                    currentValue,
                    adjustedTarget,
                    smoothingFactor
                  );
                  break;
                }
              }
            });
            
            // Fallback: Basic jaw movement if no specific morphs found
            if (dict.mouthOpen !== undefined || dict.jawOpen !== undefined) {
              const jawIntensity = Math.abs(Math.sin(state.clock.elapsedTime * 12)) * 0.4 * randomFactor;
              if (dict.mouthOpen !== undefined) {
                mesh.morphTargetInfluences[dict.mouthOpen] = THREE.MathUtils.lerp(
                  mesh.morphTargetInfluences[dict.mouthOpen],
                  jawIntensity,
                  smoothingFactor
                );
              }
              if (dict.jawOpen !== undefined) {
                mesh.morphTargetInfluences[dict.jawOpen] = THREE.MathUtils.lerp(
                  mesh.morphTargetInfluences[dict.jawOpen],
                  jawIntensity,
                  smoothingFactor
                );
              }
            }
          }
        });
      } else if (isListening) {
        // Listening animation - very gentle sway
        groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 1.5) * 0.015;
      } else {
        // Idle animation - minimal movement
        groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.01;
        groupRef.current.rotation.x = 0;
      }

      // Eye blinking animation
      blinkTimeRef.current += delta;
      
      // Check if it's time to blink
      if (blinkTimeRef.current >= nextBlinkRef.current && !isBlinking.current) {
        isBlinking.current = true;
        blinkTimeRef.current = 0;
        nextBlinkRef.current = 2 + Math.random() * 3; // Random interval 2-5 seconds
        
        let blinkApplied = false;
        
        // Method 1: Try morph targets
        morphTargetMeshes.current.forEach((mesh) => {
          const dict = mesh.morphTargetDictionary;
          if (dict) {
            // Try common blink morph target names
            const blinkNames = ['eyesClosed', 'eyeBlinkLeft', 'eyeBlinkRight', 'blink', 'eyeBlink', 
                               'EyesClosed', 'EyeBlinkLeft', 'EyeBlinkRight', 'Blink', 'EyeBlink'];
            blinkNames.forEach(name => {
              if (dict[name] !== undefined) {
                mesh.morphTargetInfluences[dict[name]] = 1;
                blinkApplied = true;
              }
            });
          }
        });
        
        // Method 2: Fallback - Scale eye meshes
        if (!blinkApplied && eyeMeshes.current.length > 0) {
          eyeMeshes.current.forEach(eyeMesh => {
            if (eyeMesh.scale) {
              eyeMesh.scale.y = 0.1; // Close eyes
            }
          });
          blinkApplied = true;
        }
        
        // Reset blink after 150ms
        setTimeout(() => {
          // Reset morph targets
          morphTargetMeshes.current.forEach((mesh) => {
            const dict = mesh.morphTargetDictionary;
            if (dict) {
              const blinkNames = ['eyesClosed', 'eyeBlinkLeft', 'eyeBlinkRight', 'blink', 'eyeBlink',
                                 'EyesClosed', 'EyeBlinkLeft', 'EyeBlinkRight', 'Blink', 'EyeBlink'];
              blinkNames.forEach(name => {
                if (dict[name] !== undefined && mesh.morphTargetInfluences) {
                  mesh.morphTargetInfluences[dict[name]] = 0;
                }
              });
            }
          });
          
          // Reset eye scale
          eyeMeshes.current.forEach(eyeMesh => {
            if (eyeMesh.scale) {
              eyeMesh.scale.y = 1;
            }
          });
          
          isBlinking.current = false;
        }, 150);
      }

      // Apply emotion-based morph targets (but not during blinking)
      if (!isSpeaking && blinkTimeRef.current > 0.2) {
        morphTargetMeshes.current.forEach((mesh) => {
          const dict = mesh.morphTargetDictionary;
          if (dict && mesh.morphTargetInfluences) {
            // Reset all influences
            mesh.morphTargetInfluences.forEach((_, i) => {
              mesh.morphTargetInfluences[i] = THREE.MathUtils.lerp(
                mesh.morphTargetInfluences[i],
                0,
                0.1
              );
            });

            // Apply target emotion morphs
            Object.entries(targetMorphs).forEach(([morphName, value]) => {
              // Try common naming patterns
              const possibleNames = [
                morphName,
                morphName.toLowerCase(),
                morphName.charAt(0).toUpperCase() + morphName.slice(1),
              ];
              
              for (const name of possibleNames) {
                if (dict[name] !== undefined) {
                  mesh.morphTargetInfluences[dict[name]] = THREE.MathUtils.lerp(
                    mesh.morphTargetInfluences[dict[name]],
                    value,
                    0.1
                  );
                  break;
                }
              }
            });
          }
        });
      }
    }
  });

  return (
    <group ref={groupRef} rotation={[0, Math.PI, 0]}>
      <primitive object={scene} scale={2.5} position={[0, -3, 0]} />
      {/* Emotion-based lighting */}
      <pointLight position={[2, 2, 2]} intensity={1} color={currentColor} />
      <pointLight position={[-2, 1, -1]} intensity={0.5} color={currentColor} />
      <pointLight position={[0, 0, 2]} intensity={0.8} color="#ffffff" />
    </group>
  );
}

const Avatar = ({ emotion, isSpeaking, isListening, currentText = '', avatarType = 'male' }) => {
  // Emotion-based glow colors
  const emotionStyles = {
    excited: { glow: 'shadow-orange-500/70', color: '#ff6b35' },
    joyful: { glow: 'shadow-yellow-500/50', color: '#ffd23f' },
    grateful: { glow: 'shadow-pink-500/50', color: '#f06292' },
    sad: { glow: 'shadow-blue-600/40', color: '#5c6bc0' },
    anxious: { glow: 'shadow-purple-500/50', color: '#9c27b0' },
    angry: { glow: 'shadow-red-500/60', color: '#f44336' },
    confused: { glow: 'shadow-gray-500/40', color: '#9e9e9e' },
    curious: { glow: 'shadow-purple-500/50', color: '#ba68c8' },
    tired: { glow: 'shadow-slate-500/30', color: '#78909c' },
    bored: { glow: 'shadow-gray-600/30', color: '#757575' },
    proud: { glow: 'shadow-amber-500/60', color: '#ffc107' },
    surprised: { glow: 'shadow-cyan-500/60', color: '#26c6da' },
    playful: { glow: 'shadow-fuchsia-500/50', color: '#ec407a' },
    romantic: { glow: 'shadow-rose-500/60', color: '#f48fb1' },
    disappointed: { glow: 'shadow-slate-600/40', color: '#90a4ae' },
    helpful: { glow: 'shadow-green-500/50', color: '#66bb6a' },
    neutral: { glow: 'shadow-indigo-500/50', color: '#7e57c2' },
  };

  const style = emotionStyles[emotion] || emotionStyles.neutral;

  return (
    <motion.div
      animate={{
        scale: isListening ? [1, 1.02, 1] : 1,
      }}
      transition={{
        scale: {
          repeat: Infinity,
          duration: 1.5,
          ease: 'easeInOut',
        },
      }}
      className="relative w-full h-[500px]"
    >
      {/* 3D Avatar Container - Full View */}
      <div className="relative w-full h-full rounded-2xl overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-black shadow-2xl">
        <Canvas shadows>
          <Suspense fallback={null}>
            <PerspectiveCamera makeDefault position={[0, 1.2, 2]} fov={45} />
            <ambientLight intensity={0.6} />
            <spotLight 
              position={[5, 5, 5]} 
              angle={0.3} 
              penumbra={1} 
              intensity={1.5}
              castShadow
            />
            <AvatarModel emotion={emotion} isSpeaking={isSpeaking} isListening={isListening} currentText={currentText} avatarType={avatarType} />
            <OrbitControls 
              enableZoom={false} 
              enablePan={false}
              minPolarAngle={Math.PI / 3}
              maxPolarAngle={Math.PI / 1.8}
              target={[0, 1.2, 0]}
            />
          </Suspense>
        </Canvas>

        {/* Listening indicator */}
        {isListening && (
          <motion.div
            className="absolute top-4 right-4 flex items-center gap-2 bg-green-500/20 backdrop-blur-sm rounded-full px-4 py-2 border border-green-400/50"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <motion.div
              className="w-2 h-2 bg-green-400 rounded-full"
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            />
            <span className="text-green-200 text-sm font-medium">Listening</span>
          </motion.div>
        )}

        {/* Speaking indicator */}
        {isSpeaking && (
          <motion.div
            className="absolute top-4 right-4 flex items-center gap-2 bg-purple-500/20 backdrop-blur-sm rounded-full px-4 py-2 border border-purple-400/50"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <motion.div
              className="w-2 h-2 bg-purple-400 rounded-full"
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
            />
            <span className="text-purple-200 text-sm font-medium">Speaking</span>
          </motion.div>
        )}

        {/* Emotion label */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-4 left-4"
        >
          <span 
            className="text-white text-sm font-semibold capitalize px-4 py-2 rounded-full backdrop-blur-sm border"
            style={{
              background: `${style.color}20`,
              borderColor: `${style.color}50`,
            }}
          >
            {emotion}
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
};

// Preload both GLB models
useGLTF.preload('/avatar.glb');
useGLTF.preload('/avatar-female.glb');

export default Avatar;
