import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../context/AuthContext';
import { useColors } from '../../context/ThemeContext';
import { Radius, Shadow } from '../../constants/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});

  const validate = () => {
    const e: typeof errors = {};
    if (!identifier.trim()) e.identifier = 'Email address is required';
    if (!password) e.password = 'Password is required';
    else if (password.length < 6) e.password = 'Password must be at least 6 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    const result = await login(identifier.trim(), password);
    setLoading(false);
    if (!result.success) {
      Alert.alert('Login Failed', result.error ?? 'Invalid credentials. Please check your email/code and password.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={C.background === '#0F172A' ? 'light' : 'dark'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.logoCircle}>
              <Image source={require('../../../assets/logo.jpg')} style={styles.logo} resizeMode="contain" />
            </View>
            <Text style={styles.appName}>TimeLogic</Text>
            <Text style={styles.subtitle}>Sign in with your credentials provided by your administrator</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Welcome Back</Text>
            <Text style={styles.cardSubtitle}>
              Enter the email address and password your company administrator provided you.
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Work Email Address</Text>
              <View style={[styles.inputWrap, errors.identifier ? styles.inputError : null]}>
                <Ionicons name="mail-outline" size={20} color={C.gray400} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="your.email@company.com"
                  placeholderTextColor={C.gray300}
                  value={identifier}
                  onChangeText={(t) => { setIdentifier(t); setErrors((p) => ({ ...p, identifier: undefined })); }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>
              {errors.identifier ? <Text style={styles.errorText}>{errors.identifier}</Text> : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={[styles.inputWrap, errors.password ? styles.inputError : null]}>
                <Ionicons name="lock-closed-outline" size={20} color={C.gray400} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Enter your password"
                  placeholderTextColor={C.gray300}
                  value={password}
                  onChangeText={(t) => { setPassword(t); setErrors((p) => ({ ...p, password: undefined })); }}
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
              </View>
              {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
            </View>

            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="log-in-outline" size={20} color="#fff" />
                  <Text style={styles.loginBtnText}>Sign In</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.hint}>
              <Ionicons name="information-circle-outline" size={14} color={C.gray400} />
              <Text style={styles.hintText}>
                Your login credentials are provided by your company administrator. Contact them if you need help.
              </Text>
            </View>
          </View>

          <Text style={styles.footer}>© {new Date().getFullYear()} TimeLogic · v1.0.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(C: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.primaryBg },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
    header: { alignItems: 'center', marginBottom: 32 },
    logoCircle: { width: 80, height: 80, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 12, ...Shadow.lg },
    logo: { width: 60, height: 60 },
    appName: { fontSize: 26, fontWeight: '800', color: C.text, letterSpacing: 0.5 },
    subtitle: { fontSize: 13, color: C.textMuted, marginTop: 6, textAlign: 'center', lineHeight: 18, paddingHorizontal: 10 },
    card: { backgroundColor: C.card, borderRadius: 20, padding: 24, ...Shadow.md },
    cardTitle: { fontSize: 20, fontWeight: '700', color: C.text, marginBottom: 6 },
    cardSubtitle: { fontSize: 13, color: C.textMuted, marginBottom: 24, lineHeight: 18 },
    fieldGroup: { marginBottom: 16 },
    label: { fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6 },
    inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: C.inputBorder, borderRadius: Radius.md, backgroundColor: C.inputBg, paddingHorizontal: 12, height: 50 },
    inputError: { borderColor: C.danger },
    inputIcon: { marginRight: 8 },
    input: { flex: 1, fontSize: 15, color: C.text },
    errorText: { fontSize: 12, color: C.danger, marginTop: 4 },
    loginBtn: { backgroundColor: C.primary, borderRadius: Radius.md, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, ...Shadow.lg },
    loginBtnDisabled: { opacity: 0.7 },
    loginBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
    hint: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 16 },
    hintText: { fontSize: 12, color: C.gray400, flex: 1, lineHeight: 16 },
    footer: { textAlign: 'center', fontSize: 11, color: C.gray400, marginTop: 24 },
  });
}
