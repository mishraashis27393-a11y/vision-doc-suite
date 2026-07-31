export type DocTypeDef = {
  id: string;
  label: string;
  emoji: string;
  hint: string;
  fields: string[];
};

export const DOC_TYPES: DocTypeDef[] = [
  { id: "resume", label: "Resume / CV", emoji: "📄", hint: "Professional resume", fields: ["Full name", "Role", "Experience", "Skills", "Education"] },
  { id: "ppt", label: "PPT Presentation", emoji: "📊", hint: "Slide-by-slide deck", fields: ["Topic", "Audience", "Number of slides"] },
  { id: "certificate", label: "Certificate", emoji: "🏅", hint: "Award / completion", fields: ["Recipient", "Achievement", "Issuer", "Date"] },
  { id: "proposal", label: "Business Proposal", emoji: "💼", hint: "Client proposal", fields: ["Company", "Client", "Scope", "Budget"] },
  { id: "company-profile", label: "Company Profile", emoji: "🏢", hint: "About the company", fields: ["Company", "Industry", "Services"] },
  { id: "application", label: "Application Letter", emoji: "✍️", hint: "Job / leave application", fields: ["To", "Purpose", "From"] },
  { id: "letter", label: "Formal Letter", emoji: "📬", hint: "Official letter", fields: ["To", "Subject", "Body points"] },
  { id: "invoice", label: "Invoice", emoji: "🧾", hint: "Billing document", fields: ["Business", "Client", "Items", "Amount"] },
  { id: "quotation", label: "Quotation", emoji: "💰", hint: "Price quote", fields: ["Business", "Client", "Items", "Prices"] },
  { id: "menu", label: "Menu Card", emoji: "🍽️", hint: "Restaurant menu", fields: ["Restaurant", "Dishes", "Prices"] },
  { id: "visiting-card", label: "Visiting Card", emoji: "🪪", hint: "Business card", fields: ["Name", "Role", "Contact"] },
  { id: "flyer", label: "Flyer", emoji: "📢", hint: "Promotional flyer", fields: ["Event / offer", "Date", "Contact"] },
  { id: "poster", label: "Poster", emoji: "🖼️", hint: "Event poster", fields: ["Title", "Details", "Date"] },
  { id: "qr", label: "QR Code", emoji: "🔳", hint: "QR for link / text", fields: ["Link or text"] },
  { id: "aadhaar", label: "Aadhaar Size Layout", emoji: "🆔", hint: "Card size print layout", fields: ["Details"] },
  { id: "passport-photo", label: "Passport Photo Layout", emoji: "📸", hint: "Photo sheet layout", fields: ["Photo count"] },
  { id: "id-card", label: "ID Card", emoji: "🎫", hint: "Organisation ID", fields: ["Name", "Organisation", "ID number"] },
  { id: "report", label: "Report", emoji: "📑", hint: "Formal report", fields: ["Topic", "Sections"] },
  { id: "project-file", label: "Project File", emoji: "📁", hint: "Academic project", fields: ["Title", "Subject", "Chapters"] },
  { id: "notes", label: "Notes", emoji: "🗒️", hint: "Study notes", fields: ["Topic", "Level"] },
  { id: "pdf", label: "PDF Document", emoji: "📕", hint: "Any PDF content", fields: ["What to write"] },
  { id: "docx", label: "DOCX Document", emoji: "📘", hint: "Word style document", fields: ["What to write"] },
  { id: "pptx", label: "PPTX Document", emoji: "📙", hint: "Presentation file", fields: ["Topic", "Slides"] },
];

export function docTypeLabel(id: string) {
  return DOC_TYPES.find((d) => d.id === id)?.label ?? "Document";
}

export function docTypeEmoji(id: string) {
  return DOC_TYPES.find((d) => d.id === id)?.emoji ?? "📄";
}

export function formatBytes(bytes: number) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}