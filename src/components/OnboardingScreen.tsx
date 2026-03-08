import { Keyboard, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";

import type { MotivationStyle } from "../lib/onboarding";

type OnboardingScreenProps = {
  onboardingWakeTime: string;
  onboardingBedtime: string;
  onboardingStruggles: string;
  onboardingGoals: string;
  onboardingMotivationStyle: MotivationStyle;
  onboardingFormValid: boolean;
  onboardingSaving: boolean;
  onboardingStatus: string;
  setOnboardingWakeTime: (value: string) => void;
  setOnboardingBedtime: (value: string) => void;
  setOnboardingStruggles: (value: string) => void;
  setOnboardingGoals: (value: string) => void;
  setOnboardingMotivationStyle: (value: MotivationStyle) => void;
  onCompleteOnboarding: () => void;
};

const motivationOptions: Array<{ value: MotivationStyle; label: string }> = [
  { value: "straightforward", label: "Straightforward" },
  { value: "supportive", label: "Supportive" },
  { value: "balanced", label: "Balanced" },
  { value: "motivation", label: "Motivation" },
  { value: "zen", label: "Zen" },
];

export const OnboardingScreen = ({
  onboardingWakeTime,
  onboardingBedtime,
  onboardingStruggles,
  onboardingGoals,
  onboardingMotivationStyle,
  onboardingFormValid,
  onboardingSaving,
  onboardingStatus,
  setOnboardingWakeTime,
  setOnboardingBedtime,
  setOnboardingStruggles,
  setOnboardingGoals,
  setOnboardingMotivationStyle,
  onCompleteOnboarding,
}: OnboardingScreenProps) => {
  return (
    <SafeAreaView style={styles.standaloneScreen}>
      <StatusBar barStyle="dark-content" backgroundColor="#f3f5f7" />

      <View style={styles.authShell}>
        <View style={styles.authHeader}>
          <Text style={styles.authEyebrow}>Intentive setup</Text>
          <Text style={styles.authTitle}>Quick setup before chat</Text>
          <Text style={styles.authSubtitle}>
            Finish this once, then you land in the main chat and thread screen.
          </Text>
        </View>

        <View style={styles.authCard}>
          <KeyboardAvoidingView
            style={styles.onboardingKeyboardArea}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <ScrollView
              contentContainerStyle={styles.onboardingPane}
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Pressable onPress={Keyboard.dismiss} style={styles.onboardingDismissArea}>
                <View style={styles.onboardingField}>
                  <Text style={styles.onboardingLabel}>When do you usually wake up?</Text>
                  <TextInput
                    value={onboardingWakeTime}
                    onChangeText={setOnboardingWakeTime}
                    placeholder="7:30 AM"
                    placeholderTextColor="#7f8a97"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    style={styles.onboardingInput}
                  />
                  <Text style={styles.onboardingHelperText}>
                    Use a time with AM or PM, like 7:30 AM.
                  </Text>
                </View>

                <View style={styles.onboardingField}>
                  <Text style={styles.onboardingLabel}>When do you usually go to bed?</Text>
                  <TextInput
                    value={onboardingBedtime}
                    onChangeText={setOnboardingBedtime}
                    placeholder="11:30 PM"
                    placeholderTextColor="#7f8a97"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    style={styles.onboardingInput}
                  />
                  <Text style={styles.onboardingHelperText}>Example: 11:30 PM.</Text>
                </View>

                <View style={styles.onboardingField}>
                  <Text style={styles.onboardingLabel}>
                    What struggles do you face most as a person with ADHD?
                  </Text>
                  <TextInput
                    value={onboardingStruggles}
                    onChangeText={setOnboardingStruggles}
                    placeholder="Example: I freeze when I have too many tasks and avoid starting."
                    placeholderTextColor="#7f8a97"
                    multiline
                    style={[styles.onboardingInput, styles.onboardingMultiline]}
                  />
                </View>

                <View style={styles.onboardingField}>
                  <Text style={styles.onboardingLabel}>What goals are you working toward right now?</Text>
                  <TextInput
                    value={onboardingGoals}
                    onChangeText={setOnboardingGoals}
                    placeholder="Example: finish my most important work earlier and stay consistent."
                    placeholderTextColor="#7f8a97"
                    multiline
                    style={[styles.onboardingInput, styles.onboardingMultiline]}
                  />
                </View>

                <View style={styles.onboardingField}>
                  <Text style={styles.onboardingLabel}>
                    What personality works best for you?
                  </Text>
                  <View style={styles.motivationOptions}>
                    {motivationOptions.map((option) => (
                      <Pressable
                        key={option.value}
                        onPress={() => {
                          Keyboard.dismiss();
                          setOnboardingMotivationStyle(option.value);
                        }}
                        style={[
                          styles.motivationOption,
                          onboardingMotivationStyle === option.value && styles.motivationOptionActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.motivationOptionText,
                            onboardingMotivationStyle === option.value &&
                              styles.motivationOptionTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    onCompleteOnboarding();
                  }}
                  disabled={!onboardingFormValid || onboardingSaving}
                  style={[
                    styles.onboardingButton,
                    (!onboardingFormValid || onboardingSaving) && styles.onboardingButtonDisabled,
                  ]}
                >
                  <Text style={styles.onboardingButtonText}>
                    {onboardingSaving ? "Saving..." : "Save and continue"}
                  </Text>
                </Pressable>

                <Text style={styles.onboardingHint}>
                  {onboardingStatus === "completed"
                    ? "Profile is already completed."
                    : "Add your sleep times, struggles, goals, and preferred motivation style to continue."}
                </Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
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
    flex: 1,
    minHeight: 320,
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
  onboardingKeyboardArea: {
    flex: 1,
  },
  onboardingDismissArea: {
    flex: 1,
  },
  onboardingField: {
    marginBottom: 10,
  },
  onboardingLabel: {
    color: "#0f1720",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  onboardingHelperText: {
    marginTop: 5,
    color: "#6d7784",
    fontSize: 12,
  },
  onboardingInput: {
    borderWidth: 1,
    borderColor: "#c9d2dd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0f1720",
    backgroundColor: "#ffffff",
  },
  onboardingMultiline: {
    minHeight: 74,
    textAlignVertical: "top",
  },
  motivationOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  motivationOption: {
    borderWidth: 1,
    borderColor: "#c9d2dd",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "#ffffff",
  },
  motivationOptionActive: {
    borderColor: "#0f1720",
    backgroundColor: "#0f1720",
  },
  motivationOptionText: {
    color: "#0f1720",
    fontWeight: "600",
  },
  motivationOptionTextActive: {
    color: "#ffffff",
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
