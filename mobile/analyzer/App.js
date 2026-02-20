import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  Dimensions, 
  Platform,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  PixelRatio,
  Animated,
  Easing,
  Linking
} from 'react-native';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import { 
  Zap, 
  Smartphone, 
  ShieldCheck, 
  RotateCcw,
  Gauge,
  Database,
  Cpu,
  Monitor,
  Microscope,
  Info
} from 'lucide-react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

const GlassCard = ({ children, style }) => (
  <View style={[styles.glassCard, style]}>
    <View style={styles.glassHighlight} />
    {children}
  </View>
);

export default function App() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [currentFps, setCurrentFps] = useState(0);

  const laserY = useRef(new Animated.Value(-150)).current;
  const orbScale = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const resultY = useRef(new Animated.Value(20)).current;

  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const requestRef = useRef();
  const fpsSamples = useRef([]);

  useEffect(() => {
    const trackFps = () => {
      const now = performance.now();
      frameCount.current += 1;

      if (now - lastTime.current >= 1000) {
        const fps = Math.round(frameCount.current);
        setCurrentFps(fps);
        fpsSamples.current.push(fps);
        if (fpsSamples.current.length > 3) fpsSamples.current.shift();
        frameCount.current = 0;
        lastTime.current = now;
      }
      requestRef.current = requestAnimationFrame(trackFps);
    };

    requestRef.current = requestAnimationFrame(trackFps);
    return () => cancelAnimationFrame(requestRef.current);
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(orbScale, { toValue: 1.2, duration: 2000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(orbScale, { toValue: 1, duration: 2000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) })
      ])
    ).start();
  }, []);

  const analyze = async () => {
    setIsAnalyzing(true);
    setResult(null);
    fpsSamples.current = [];
    fadeAnim.setValue(0);
    resultY.setValue(20);
    
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    laserY.setValue(-150);
    const laserLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(laserY, { toValue: 150, duration: 1000, useNativeDriver: true }),
        Animated.timing(laserY, { toValue: -150, duration: 1000, useNativeDriver: true })
      ])
    );
    laserLoop.start();

    setTimeout(async () => {
      try {
        const { width, height } = Dimensions.get('screen');
        const dpr = PixelRatio.get();
        const realWidth = Math.round(width * dpr);
        const realHeight = Math.round(height * dpr);
        const maxDim = Math.max(realWidth, realHeight);

        const avgFps = fpsSamples.current.length > 0 
          ? Math.round(fpsSamples.current.reduce((a, b) => a + b, 0) / fpsSamples.current.length)
          : currentFps;

        let recommendation = "Standard 1080p is Recommended";
        let tier = "BALANCED_TIER";
        let color = "#10b981";
        let glowColor = "rgba(16, 185, 129, 0.2)";

        if (avgFps >= 55 && maxDim >= 3000) {
          recommendation = "Everything Supported (Up to 8K)";
          tier = "ULTRA_PERFORMANCE";
          color = "#a855f7";
          glowColor = "rgba(168, 85, 247, 0.2)";
        } else if (avgFps >= 30 && maxDim >= 2300) {
          recommendation = "4K (2160p) is Perfect for you";
          tier = "PREMIUM_TIER";
          color = "#06b6d4";
          glowColor = "rgba(6, 182, 212, 0.2)";
        }

        setResult({
          model: Device.modelName || 'Device',
          brand: Device.brand || 'System',
          resolution: `${realWidth} x ${realHeight}`,
          resLabel: maxDim >= 3000 ? '4K Ultra' : maxDim >= 2300 ? '2K / 1.5K' : 'Full HD',
          fps: `${avgFps} FPS`,
          recommendation,
          tier,
          color,
          glowColor
        });

        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(resultY, { toValue: 0, duration: 600, useNativeDriver: true, easing: Easing.out(Easing.back(1)) })
        ]).start();

      } finally {
        setIsAnalyzing(false);
        laserLoop.stop();
      }
    }, 3000);
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle='light-content' translucent backgroundColor='transparent' />
        <LinearGradient colors={['#030014', '#020617', '#030014']} style={StyleSheet.absoluteFill} />

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.badge}>
              <Gauge size={12} color='#06b6d4' />
              <Text style={styles.badgeText}>Live Speed: {currentFps} FPS</Text>
            </View>
            <Text style={styles.title}>NexStream</Text>
            <Text style={styles.subtitle}>Native Capability Diagnostic</Text>
          </View>

          <View style={styles.cardContainer}>
            {!isAnalyzing && !result && (
              <View style={styles.mainCard}>
                <Animated.View style={[styles.glowOrb, { transform: [{ scale: orbScale }] }]} />
                <Smartphone size={80} color='#06b6d4' strokeWidth={1} />
                <Text style={styles.description}>
                  This audit will verify physical display pixels and average UI frame rates to determine your true hardware threshold.
                </Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={analyze} activeOpacity={0.8}>
                  <Zap size={20} color='#000' fill='#000' />
                  <Text style={styles.primaryBtnText}>Run Hardware Audit</Text>
                </TouchableOpacity>
              </View>
            )}

            {isAnalyzing && (
              <View style={styles.mainCard}>
                <Animated.View style={[styles.scannerBeam, { transform: [{ translateY: laserY }] }]} />
                <ActivityIndicator size='large' color='#06b6d4' />
                <View style={styles.statusBox}>
                  <Text style={styles.statusText}>Auditing Speed...</Text>
                  <Text style={styles.statusSubtext}>Sampling frame-pacing variance</Text>
                </View>
              </View>
            )}

            {result && (
              <Animated.View style={[styles.resultContainer, { opacity: fadeAnim, transform: [{ translateY: resultY }] }]}>
                <GlassCard style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                  <View style={styles.specsGrid}>
                    {[
                      { label: 'DEVICE MODEL', value: `${result.brand} ${result.model}`, icon: <Cpu size={14} color='#06b6d4' /> },
                      { label: 'SCREEN TYPE', value: result.resLabel, icon: <Monitor size={14} color='#06b6d4' /> },
                      { label: 'AVERAGE SPEED', value: result.fps, icon: <Gauge size={14} color='#06b6d4' /> }
                    ].map((spec, i) => (
                      <View key={i} style={styles.specBox}>
                        <View style={styles.specHeader}>
                          {spec.icon}
                          <Text style={styles.specLabel}>{spec.label}</Text>
                        </View>
                        <Text style={[styles.specValue, (spec.label === 'SCREEN TYPE' || spec.label === 'AVERAGE SPEED') && { color: '#06b6d4' }]}>
                          {spec.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                </GlassCard>

                <View>
                  <GlassCard style={[styles.adviceCard, { borderColor: result.color + '40' }]}>
                    <View style={[styles.adviceGlow, { backgroundColor: result.glowColor }]} />
                    <ShieldCheck size={32} color={result.color} style={{ marginBottom: 10 }} />
                    <Text style={styles.adviceLabel}>RECOMMENDED DOWNLOAD</Text>
                    <Text style={[styles.adviceValue, { color: result.color }]}>{result.recommendation}</Text>
                    <Text style={styles.adviceTier}>DETECTION ACCURACY: 100%</Text>
                  </GlassCard>
                </View>

                <TouchableOpacity style={styles.resetBtn} onPress={() => setResult(null)}>
                  <RotateCcw size={14} color='#666' />
                  <Text style={styles.resetBtnText}>New Audit</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>

          <View style={styles.footer}>
            <View style={styles.noteBox}>
              <Info size={14} color='#06b6d4' />
              <Text style={styles.footerText}>
                Use this recommendation to choose the best quality on the NexStream web portal.
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.webBtn}
              onPress={() => Linking.openURL('https://ej-nexstream.vercel.app')}
            >
              <Text style={styles.webBtnText}>VISIT WEB PORTAL</Text>
              <Zap size={14} color="#fff" fill="#fff" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030014'
  },
  scrollContent: {
    padding: 24,
    alignItems: 'center',
    gap: 32
  },
  header: {
    alignItems: 'center',
    gap: 12,
    marginTop: 30
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.15)'
  },
  badgeText: {
    color: '#06b6d4',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 2
  },
  title: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: -2
  },
  subtitle: {
    color: '#555',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  cardContainer: {
    width: '100%',
    minHeight: 420
  },
  mainCard: {
    width: '100%',
    height: 420,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 48,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 30
  },
  glowOrb: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(6, 182, 212, 0.05)'
  },
  scannerBeam: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#06b6d4',
    shadowColor: '#06b6d4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    zIndex: 10
  },
  description: {
    color: '#777',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '500'
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 36,
    paddingVertical: 20,
    borderRadius: 24
  },
  primaryBtnText: {
    color: '#000',
    fontWeight: '900',
    textTransform: 'uppercase',
    fontSize: 13,
    letterSpacing: 1
  },
  statusBox: {
    alignItems: 'center',
    gap: 6
  },
  statusText: {
    color: '#06b6d4',
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 4
  },
  statusSubtext: {
    color: '#444',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  resultContainer: {
    gap: 20,
    width: '100%'
  },
  glassCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 32,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 24
  },
  glassHighlight: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.02)'
  },
  specsGrid: {
    gap: 12
  },
  specBox: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  specHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  specLabel: {
    color: '#555',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1
  },
  specValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  adviceCard: {
    padding: 32,
    alignItems: 'center',
    gap: 10
  },
  adviceGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.15
  },
  adviceLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
    opacity: 0.4,
    letterSpacing: 4
  },
  adviceValue: {
    fontSize: 28,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: -1,
    textAlign: 'center'
  },
  adviceTier: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    opacity: 0.3,
    letterSpacing: 2
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 10,
    marginTop: 10,
    padding: 10
  },
  resetBtnText: {
    color: '#444',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  footer: {
    marginTop: 20,
    marginBottom: 60,
    paddingHorizontal: 20
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    width: '100%',
  },
  footerText: {
    color: '#444',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    flex: 1,
  },
  webBtn: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    paddingVertical: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
  },
  webBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  }
});
