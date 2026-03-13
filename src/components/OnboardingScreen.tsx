import { Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";

type OnboardingScreenProps = {
  onboardingStatus: string;
  onboardingStarting: boolean;
  onStartOnboarding: () => void;
};

export const OnboardingScreen = ({
  onboardingStatus,
  onboardingStarting,
  onStartOnboarding,
}: OnboardingScreenProps) => {
  return (
    <SafeAreaView style={styles.standaloneScreen}>
      <StatusBar barStyle="dark-content" backgroundColor="#f3f5f7" />

      <View style={styles.authShell}>
        <View style={styles.authHeader}>
          <Text style={styles.authEyebrow}>Intentive setup</Text>
          <Text style={styles.authTitle}>Start onboarding chat</Text>
          <Text style={styles.authSubtitle}>
            Save and continue to begin day-one onboarding with the assistant.
          </Text>
        </View>

        <View style={styles.authCard}>
          <View style={styles.onboardingPane}>
            <Pressable
              onPress={onStartOnboarding}
              disabled={onboardingStarting}
              style={[
                styles.onboardingButton,
                onboardingStarting && styles.onboardingButtonDisabled,
              ]}
            >
              <Text style={styles.onboardingButtonText}>
                {onboardingStarting ? "Starting..." : "Save and continue"}
              </Text>
            </Pressable>

            <Text style={styles.onboardingHint}>
              {onboardingStatus === "pending"
                ? "We will collect wake and bedtime in chat."
                : `Current onboarding state: ${onboardingStatus}`}
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  standaloneScreen: {
    flex: 1,
    backgroundColor: "#f3f5f7",
  },
  authShell: {
    flex: 1,
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 20,
    justifyContent: "flex-start",
    alignItems: "center",
  },
  authHeader: {
    width: "100%",
    maxWidth: 720,
    marginBottom: 16,
  },
  authEyebrow: {
    color: "#59636f",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  authTitle: {
    marginTop: 8,
    color: "#0f1720",
    fontSize: 28,
    fontWeight: "800",
  },
  authSubtitle: {
    marginTop: 8,
    color: "#59636f",
    fontSize: 15,
    lineHeight: 22,
  },
  authCard: {
    width: "100%",
    maxWidth: 720,
    minHeight: 220,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d8e0ea",
    overflow: "hidden",
  },
  onboardingPane: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  onboardingButton: {
    marginTop: 10,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#0f1720",
    alignItems: "center",
    justifyContent: "center",
  },
  onboardingButtonDisabled: {
    backgroundColor: "#7f8a97",
  },
  onboardingButtonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  onboardingHint: {
    marginTop: 8,
    color: "#6d7784",
    fontSize: 12,
  },
});
