import { Clock, Smartphone, Check } from "lucide-react";
import { C } from "../tokens";

const ITEMS = [
  { icon: Clock, label: "Invoice in minutes, not spreadsheets" },
  { icon: Smartphone, label: "Get paid the M-Pesa way" },
  { icon: Check, label: "Every shilling on record" },
];

/** Slim band under the hero — outcome statements, not fake logos. */
export function ProofStrip() {
  return (
    <section
      style={{
        background: C.alt,
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "28px 32px",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "16px 64px",
          fontSize: 15,
          fontWeight: 500,
          color: C.ink,
        }}
      >
        {ITEMS.map(({ icon: Icon, label }) => (
          <span
            key={label}
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <Icon size={17} strokeWidth={2} color={C.green600} />
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}
