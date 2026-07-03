import { maskPiiInText } from "@/lib/domain/pii";

/**
 * Email port (ARCHITECTURE.md §1.1): services and auth config depend on this
 * interface, never on a provider. Resend in production; console in dev.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<{ providerMessageId: string | null }>;
}

class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage) {
    // Dev only. Mask anything phone-shaped; log lines are not a PII sink.
    console.log(
      `[email:dev] to=${message.to} subject=${maskPiiInText(message.subject)}\n${maskPiiInText(message.text)}`,
    );
    return { providerMessageId: null };
  }
}

class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Resend send failed (${response.status}): ${maskPiiInText(body)}`,
      );
    }
    const data = (await response.json()) as { id?: string };
    return { providerMessageId: data.id ?? null };
  }
}

let sender: EmailSender | null = null;

export function getEmailSender(): EmailSender {
  if (sender) return sender;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  sender =
    apiKey && from
      ? new ResendEmailSender(apiKey, from)
      : new ConsoleEmailSender();
  return sender;
}
