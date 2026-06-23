export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export type OtpPurpose = "onboarding" | "password_reset";
