export type MotivationStyle =
  | "straightforward"
  | "supportive"
  | "balanced"
  | "motivation"
  | "zen";

export type OnboardingAnswers = {
  struggles: string;
  goals: string;
  motivationStyle: MotivationStyle;
};

type HealthAnchorSeed = {
  wakeTime: string;
  bedtime: string;
  goals: string;
};

const TWELVE_HOUR_TIME_REGEX =
  /^(0?[1-9]|1[0-2])(?::([0-5]\d))?\s*([AaPp][Mm])$/;
const TWENTY_FOUR_HOUR_TIME_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const formatTimeForDisplay = (value: string | null | undefined): string => {
  if (!value || !TWENTY_FOUR_HOUR_TIME_REGEX.test(value)) {
    return "";
  }

  const [hourString, minute] = value.split(":");
  const hour = Number(hourString);
  const suffix = hour >= 12 ? "PM" : "AM";
  const normalizedHour = hour % 12 || 12;
  return `${normalizedHour}:${minute} ${suffix}`;
};

export const parseTimeInput = (value: string): string | null => {
  const trimmed = value.trim();

  if (TWENTY_FOUR_HOUR_TIME_REGEX.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(TWELVE_HOUR_TIME_REGEX);
  if (!match) {
    return null;
  }

  const [, hourString, minuteString, suffixRaw] = match;
  let hour = Number(hourString);
  const minute = minuteString || "00";
  const suffix = suffixRaw.toUpperCase();

  if (suffix === "AM") {
    hour = hour === 12 ? 0 : hour;
  } else {
    hour = hour === 12 ? 12 : hour + 12;
  }

  return `${String(hour).padStart(2, "0")}:${minute}`;
};

export const buildPlaybookSummary = ({
  struggles,
  goals,
  motivationStyle
}: OnboardingAnswers): string => {
  const label =
    motivationStyle === "straightforward"
      ? "Straightforward"
      : motivationStyle === "supportive"
        ? "Supportive"
        : motivationStyle === "balanced"
          ? "Balanced"
          : motivationStyle === "motivation"
            ? "Motivation"
            : "Zen";

  return [
    `Struggles: ${struggles.trim()}`,
    `Goals: ${goals.trim()}`,
    `Motivation style: ${label}`
  ].join("\n");
};

export const parsePlaybookSummary = (
  value: string
): Partial<OnboardingAnswers> => {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }

  const strugglesMatch = trimmed.match(/(?:^|\n)Struggles:\s*([^\n]+)/i);
  const goalsMatch = trimmed.match(/(?:^|\n)Goals:\s*([^\n]+)/i);
  const motivationMatch = trimmed.match(/(?:^|\n)Motivation style:\s*([^\n]+)/i);

  const motivationText = motivationMatch?.[1]?.trim().toLowerCase();
  const motivationStyle: MotivationStyle | undefined =
    motivationText === "straightforward" ||
    motivationText === "supportive" ||
    motivationText === "balanced" ||
    motivationText === "motivation" ||
    motivationText === "zen"
      ? motivationText
      : undefined;

  return {
    struggles: strugglesMatch?.[1]?.trim(),
    goals: goalsMatch?.[1]?.trim(),
    motivationStyle
  };
};

const firstSentence = (value: string): string => {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  const [sentence] = trimmed.split(/[.!?](?:\s|$)/);
  return sentence || trimmed;
};

export const buildHealthAnchors = ({
  wakeTime,
  bedtime,
  goals
}: HealthAnchorSeed): string[] => {
  const wakeDisplay = formatTimeForDisplay(wakeTime) || wakeTime;
  const bedtimeDisplay = formatTimeForDisplay(bedtime) || bedtime;
  const goalSummary = firstSentence(goals);

  const anchors = [
    wakeDisplay ? `Morning reset around ${wakeDisplay}` : "",
    bedtimeDisplay ? `Night shutdown around ${bedtimeDisplay}` : "",
    goalSummary ? `Daily focus: ${goalSummary}` : ""
  ].filter((item) => item.trim().length > 0);

  return anchors.length > 0 ? anchors : ["Daily consistency check-in"];
};
