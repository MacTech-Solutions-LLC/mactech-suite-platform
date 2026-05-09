/**
 * Email template helper — Slice 8.2.
 *
 * Centralizes the visual language for outbound team emails so every
 * Suite email feels like the same product. Pattern lifted from
 * EnclaveWatch's auditor-invitation email, ported to TypeScript:
 *
 *   - Dark hero card on top (eyebrow + title + optional subtitle).
 *   - White content card with the actual body.
 *   - Centered primary-color CTA button linking back to the relevant
 *     dashboard.
 *   - Optional danger/footer card (legal notice, compliance citation).
 *   - Footer line with brand + reply-routing.
 *
 * Hard rules (also from the EnclaveWatch source):
 *   - INLINE STYLES ONLY — no <style> in <head>. Most enterprise mail
 *     clients (Outlook web/desktop, Gmail's stricter modes) strip or
 *     sandbox <style> tags. Inline is the lowest common denominator.
 *   - max-width 640px so it renders comfortably on phones and in
 *     Outlook's narrow reading pane.
 *   - System font stack — no web-font import.
 *   - Tonal palette: #0a0b10 hero (near-black), #fff body card,
 *     #6366f1 CTA (indigo, matches Suite's primary token in dark
 *     mode roughly), #fef2f2 + #fecaca + #991b1b for danger card,
 *     #f5f5f7 page background.
 */

export interface EmailTemplate {
  /** Tiny tag above the hero title (e.g. "Suite · Commit Intelligence"). */
  heroEyebrow: string;
  /** The hero title — one sentence, the subject of the email distilled. */
  heroTitle: string;
  /** Optional one-line context line under the title (recipient name, date, etc.). */
  heroSubtitle?: string;
  /**
   * Body sections rendered in order. Each is a heading + Markdown-ish
   * text. The renderer escapes everything; line breaks become <br>;
   * blank lines become paragraph breaks.
   */
  sections: Array<{
    heading: string;
    body: string;
  }>;
  /** Primary call-to-action button. */
  cta?: {
    label: string;
    href: string;
  };
  /**
   * Optional "danger" card at the bottom — legal / compliance /
   * authorized-use language.
   */
  dangerCard?: string;
  /**
   * Optional footer line under the danger card. Defaults to a
   * standard MacTech reply-routing line.
   */
  footer?: string;
}

const DEFAULT_FOOTER =
  "MacTech Suite · Internal command center · Reply to this email — it routes to the requesting operator.";

export function renderEmailHtml(t: EmailTemplate): string {
  const sections = t.sections
    .map(
      (s) => `
    <div style="margin-top:18px;">
      <h3 style="margin:0 0 6px 0; font-size:13px; text-transform:uppercase; letter-spacing:0.06em; color:#374151;">${esc(s.heading)}</h3>
      <div style="font-size:14px; color:#1f2937; line-height:1.6;">${formatBody(s.body)}</div>
    </div>`,
    )
    .join("\n");

  const cta = t.cta
    ? `
      <div style="text-align:center; margin:24px 0 8px;">
        <a href="${esc(t.cta.href)}"
           style="display:inline-block; background:#6366f1; color:#fff; font-weight:600; font-size:15px; text-decoration:none; padding:12px 28px; border-radius:8px;">
          ${esc(t.cta.label)}
        </a>
        <div style="font-size:12px; color:#6b7280; margin-top:8px;">
          Direct link: <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px;">${esc(t.cta.href)}</span>
        </div>
      </div>`
    : "";

  const danger = t.dangerCard
    ? `
    <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:16px; margin-top:16px;">
      <p style="margin:0; font-size:12px; color:#991b1b; line-height:1.55;">
        ${formatBody(t.dangerCard)}
      </p>
    </div>`
    : "";

  const footer = `
    <div style="font-size:12px; color:#6b7280; margin-top:24px; text-align:center; line-height:1.6;">
      ${formatBody(t.footer ?? DEFAULT_FOOTER)}
    </div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(t.heroTitle)}</title>
</head>
<body style="margin:0; padding:0; background:#f5f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color:#1f2937; line-height:1.55;">
  <div style="max-width:640px; margin:0 auto; padding:32px 24px;">

    <div style="background:#0a0b10; border-radius:12px; padding:24px; color:#e6e6e6;">
      <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.12em; color:#a5b4fc; margin-bottom:6px;">${esc(t.heroEyebrow)}</div>
      <h1 style="margin:0 0 8px 0; font-size:22px; color:#fff; line-height:1.3;">${esc(t.heroTitle)}</h1>
      ${
        t.heroSubtitle
          ? `<p style="margin:0; font-size:14px; color:#cbd5e1;">${formatBody(t.heroSubtitle)}</p>`
          : ""
      }
    </div>

    <div style="background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:24px; margin-top:16px;">
${sections}
${cta}
    </div>

${danger}
${footer}
  </div>
</body>
</html>`;
}

/**
 * Companion plain-text renderer. Some clients strip HTML or audit
 * tools store the text alternative; both should be coherent.
 */
export function renderEmailText(t: EmailTemplate): string {
  const lines: string[] = [];
  lines.push(t.heroEyebrow);
  lines.push("");
  lines.push(t.heroTitle);
  if (t.heroSubtitle) lines.push(t.heroSubtitle.replace(/<br\s*\/?>/gi, "\n"));
  lines.push("");
  for (const s of t.sections) {
    lines.push(s.heading.toUpperCase());
    lines.push(s.body.trim());
    lines.push("");
  }
  if (t.cta) {
    lines.push(`${t.cta.label}: ${t.cta.href}`);
    lines.push("");
  }
  if (t.dangerCard) {
    lines.push(t.dangerCard);
    lines.push("");
  }
  lines.push("--");
  lines.push(t.footer ?? DEFAULT_FOOTER);
  return lines.join("\n");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Light Markdown-ish renderer for body content:
 *   - HTML-escapes everything first.
 *   - Paragraph breaks on blank lines.
 *   - Single line breaks → <br>.
 *   - Inline `code` → <code>.
 *   - **bold** → <strong>.
 *   - Markdown links [text](https://…) → <a>.
 *   - Bullet lines starting with "- " → simple <ul>.
 */
function formatBody(s: string): string {
  const escaped = esc(s);
  // Inline transforms applied first so they live inside paragraphs.
  let inline = escaped
    .replace(/`([^`]+)`/g, '<code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" style="color:#6366f1; text-decoration:underline;">$1</a>',
    );

  // Paragraph + line-break + bullet handling.
  const paragraphs = inline
    .split(/\n{2,}/)
    .map((p) => {
      const lines = p.split(/\n/);
      const isBulletList = lines.every((l) => l.trim().startsWith("- "));
      if (isBulletList && lines.length > 0) {
        const items = lines
          .map((l) => `<li style="margin-bottom:4px;">${l.replace(/^- /, "")}</li>`)
          .join("");
        return `<ul style="margin:8px 0 8px 18px; padding:0;">${items}</ul>`;
      }
      return `<p style="margin:0 0 10px 0;">${lines.join("<br>")}</p>`;
    })
    .join("");

  return paragraphs;
}
