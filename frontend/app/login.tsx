import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { useAuth } from "@/src/auth";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { Field } from "@/src/ui";

const HERO = require("../assets/images/vinayaka-icon.png");

export default function Login() {
  const { signIn, register } = useAuth();
  const [busy, setBusy] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const onSubmit = async () => {
    if (!email.trim() || password.length < 6) {
      Alert.alert("Check your details", "Enter an email and a password with at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      if (isRegistering) await register(email, password);
      else await signIn(email, password);
    } catch (error: any) {
      Alert.alert(isRegistering ? "Registration failed" : "Sign in failed", error?.message || "Please try again.");
    } finally { setBusy(false); }
  };

  return (
    <View style={styles.root} testID="login-screen">
      <Image source={HERO} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={["rgba(59,23,27,0.12)", "rgba(59,23,27,0.58)", "rgba(59,23,27,0.96)"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>
        <Text style={styles.mantra}>|| Om Gan Ganapataye Namah ||</Text>
        <Text style={styles.brand}>Vinayaka</Text>
        <Text style={styles.brand2}>Seva</Text>
        <Text style={styles.tag}>A gentle way to run your Ganesh Chaturthi committee — donations, tasks, volunteers & prasadam, all in one place.</Text>

        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" testID="login-email-input" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry testID="login-password-input" />
        <Pressable style={styles.cta} onPress={onSubmit} disabled={busy} testID="login-submit-button">
          {busy ? <ActivityIndicator color={colors.onBrand} />
          : <Text style={styles.ctaText}>{isRegistering ? "Create account" : "Sign in"}</Text>}
        </Pressable>
        <Pressable onPress={() => setIsRegistering(v => !v)} disabled={busy} style={styles.switcher}>
          <Text style={styles.switcherText}>{isRegistering ? "Already have an account? Sign in" : "New here? Create an account"}</Text>
        </Pressable>
        <Text style={styles.footer}>Ganpati Bappa Morya 🌼</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceInverse },
  content: { flex: 1, justifyContent: "flex-end", padding: spacing.xl, paddingBottom: spacing["3xl"] },
  mantra: { color: colors.brandSecondary, fontFamily: fonts.display, fontSize: 14, letterSpacing: 2, marginBottom: spacing.sm },
  brand: { color: "#FFFFFF", fontFamily: fonts.display, fontSize: 64, lineHeight: 68, fontWeight: "600" },
  brand2: { color: colors.brandSecondary, fontFamily: fonts.display, fontSize: 64, lineHeight: 68, fontWeight: "600", marginBottom: spacing.lg },
  tag: { color: "rgba(255,255,255,0.85)", fontSize: 15, lineHeight: 22, marginBottom: spacing["2xl"] },
  cta: { backgroundColor: colors.brandPrimary, paddingVertical: 18, borderRadius: radius.pill, alignItems: "center", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  ctaText: { color: colors.onBrand, fontSize: 17, fontWeight: "700", letterSpacing: 0.3 },
  switcher: { alignItems: "center", paddingVertical: spacing.md },
  switcherText: { color: colors.brandSecondary, fontSize: 14, fontWeight: "600" },
  footer: { color: colors.brandSecondary, textAlign: "center", marginTop: spacing.xl, fontFamily: fonts.display, fontSize: 15, letterSpacing: 1 },
});
